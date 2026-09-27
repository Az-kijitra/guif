//! TDD (unit-test-writer, 2026-09-27): source-level guard rails for Phase 6,
//! mirroring `archive/boundary_tests.rs`.
//!
//! * `viewer/**` never `use`s `crate::{config, fs, fs_ops, archive, keymap}`
//!   (SPEC-0200-0001 §3.5.12.1 MUST-73: the DI pattern for
//!   `config::viewer_window` -- fn-value injection, no direct import).
//! * No `unsafe` anywhere under `viewer/` (R-523, `#![deny(unsafe_code)]`
//!   already covers this at the compiler level; this is an extra, readable
//!   guard for reviewers, same as SPEC-0200-0001 §3.5.12.1 SHOULD-109).
//!
//! These tests are expected to PASS as soon as the crate compiles at all
//! (unlike most of `viewer/`'s other TDD tests, this one does not pin
//! not-yet-written behavior -- it pins a STRUCTURAL property of whatever
//! code-generator writes).

use std::fs;
use std::path::{Path, PathBuf};

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn rust_sources(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap_or_else(|e| panic!("read_dir {}: {e}", dir.display())) {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            rust_sources(&path, out);
        } else if path.extension().map_or(false, |e| e == "rs") {
            out.push(path);
        }
    }
}

fn viewer_rust_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src").join("viewer"), &mut files);
    files.sort();
    assert!(!files.is_empty(), "no sources found under src/viewer");
    files
}

fn code_only(text: &str) -> String {
    text.lines()
        .map(|line| match line.find("//") {
            Some(at) => &line[..at],
            None => line,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn crate_uses(code: &str) -> Vec<String> {
    let mut used = Vec::new();
    for (i, _) in code.match_indices("crate::") {
        let rest = &code[i + "crate::".len()..];
        if let Some(group) = rest.strip_prefix('{') {
            let end = group.find('}').unwrap_or(group.len());
            for part in group[..end].split(',') {
                let name: String = part.trim().chars().take_while(|c| is_ident_char(*c)).collect();
                if !name.is_empty() {
                    used.push(name);
                }
            }
        } else {
            let name: String = rest.chars().take_while(|c| is_ident_char(*c)).collect();
            used.push(name);
        }
    }
    used
}

fn rel(path: &Path) -> String {
    path.strip_prefix(manifest_dir()).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

// §3.5.12.1 MUST-73: `viewer/` depends on `shared/` only, never directly on
// another feature module (config included -- the DI fn-value pattern).
#[test]
fn viewer_does_not_use_other_feature_modules_directly() {
    let forbidden = ["fs_ops", "fs", "config", "keymap", "archive"];
    let mut offenders = Vec::new();
    for path in viewer_rust_files() {
        let code = code_only(&fs::read_to_string(&path).unwrap());
        for used in crate_uses(&code) {
            if forbidden.contains(&used.as_str()) {
                offenders.push(format!("{}: crate::{used}", rel(&path)));
            }
        }
    }
    assert!(offenders.is_empty(), "viewer/ must depend on shared/ only:\n  {}", offenders.join("\n  "));
}

// R-523: no `unsafe` anywhere under viewer/ (the token is assembled so this
// file itself never contains it, same trick as archive/boundary_tests.rs).
fn unsafe_word() -> String {
    ["uns", "afe"].concat()
}

fn count_word(text: &str, word: &str) -> usize {
    text.match_indices(word)
        .filter(|(i, _)| {
            let before = text[..*i].chars().last();
            let after = text[*i + word.len()..].chars().next();
            !before.map_or(false, is_ident_char) && !after.map_or(false, is_ident_char)
        })
        .count()
}

#[test]
fn r523_no_unsafe_code_anywhere_under_viewer() {
    let needle = unsafe_word();
    let mut offenders = Vec::new();
    for path in viewer_rust_files() {
        let text = fs::read_to_string(&path).unwrap();
        if count_word(&code_only(&text), &needle) > 0 {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "`{needle}` found under viewer/: {offenders:?}");
}
