//! TDD (unit-test-writer, 2026-09-27): source-level guard rails for Phase 5.
//!
//! * `unsafe` only in `archive/win_fs.rs` (2 functions, each with `// SAFETY:`),
//!   `lib.rs` carries `#![deny(unsafe_code)]`, and `win_fs.rs` never asks
//!   `MoveFileExW` to replace (MUST-66) — SPEC-0200-0001 §3.4.13-7 (MUST-72),
//!   §3.4.14 C2, §3.4.13-2.
//! * Rust feature-boundary check: `archive/**` never `use`s `fs_ops` / `fs` /
//!   `config` / `keymap`; `shared/**` never `use`s any feature module —
//!   SPEC-0200-0001 §3.4.1, §3.4.10 (boundary), §4.2.
//! * AC-361 (SPEC-0300-0014 R-390-1): no forbidden words anywhere under `app/`'s
//!   sources. The words are assembled at RUN TIME (`concat!`), so this file does
//!   not contain them (the scan would otherwise find itself).
//! * Dependency shape (§3.4.14): `zip` without default features (and no optional
//!   codec / encryption crates in the lock), no `crc32fast` direct dependency.
//!
//! These are text scans (no `regex`/`walkdir` dependency): a tiny recursive walk
//! over `CARGO_MANIFEST_DIR`.

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

fn all_rust_files_under(sub: &str) -> Vec<PathBuf> {
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src").join(sub), &mut files);
    files.sort();
    assert!(!files.is_empty(), "no sources found under src/{sub}");
    files
}

/// Removes `//` comments (line and doc) -- good enough for these scans.
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

/// Occurrences of `word` as a whole identifier.
fn count_word(text: &str, word: &str) -> usize {
    text.match_indices(word)
        .filter(|(i, _)| {
            let before = text[..*i].chars().last();
            let after = text[*i + word.len()..].chars().next();
            !before.map_or(false, is_ident_char) && !after.map_or(false, is_ident_char)
        })
        .count()
}

fn rel(path: &Path) -> String {
    path.strip_prefix(manifest_dir()).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

// ============================================================ unsafe

// The token is assembled so that this file itself never contains it.
fn unsafe_word() -> String {
    ["uns", "afe"].concat()
}

// §3.4.13-7 / §3.4.14 C2, extended by SPEC-0300-0016 R-785 / SPEC-0200-0001
// §3.7.1 (architecture-guardian 16th audit, ISS-0161): `unsafe` exists ONLY
// in this fixed allow-list of isolation modules. `fs/win_drives.rs` was
// added to the list alongside the pre-existing `archive/win_fs.rs` -- this
// widens WHERE `unsafe` is tolerated, it never removes a check (a stray
// `unsafe` anywhere else in the crate still fails this test).
const UNSAFE_ALLOWED_FILES: &[&str] = &["src/archive/win_fs.rs", "src/fs/win_drives.rs"];

#[test]
fn unsafe_code_exists_only_in_the_isolated_modules() {
    let needle = unsafe_word();
    let mut offenders = Vec::new();
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src"), &mut files);
    for path in files {
        if UNSAFE_ALLOWED_FILES.contains(&rel(&path).as_str()) {
            continue;
        }
        let text = fs::read_to_string(&path).unwrap();
        if count_word(&code_only(&text), &needle) > 0 {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "`{needle}` outside {UNSAFE_ALLOWED_FILES:?}: {offenders:?}");
}

// SPEC-0300-0016 R-785 / SPEC-0200-0001 §3.7.1: `fs/win_drives.rs`'s ONLY
// `unsafe` surface is the single `GetLogicalDrives` call, documented with a
// `// SAFETY:` comment, and the file opts out of the crate-level deny.
// RED until code-generator implements `list_logical_drives` (the current
// TDD stub, fs/win_drives.rs, contains zero `unsafe` blocks and no
// `GetLogicalDrives` text at all).
#[test]
fn win_drives_contains_exactly_one_win32_call_with_a_safety_comment() {
    let text = fs::read_to_string(manifest_dir().join("src/fs/win_drives.rs")).unwrap();
    let code = code_only(&text);
    let needle = unsafe_word();
    let blocks = count_word(&code, &needle);
    let safety = text.matches("SAFETY:").count();
    assert!(code.contains("GetLogicalDrives"), "list_logical_drives must be built on GetLogicalDrives (R-785)");
    assert_eq!(blocks, 1, "fs/win_drives.rs must contain exactly one `{needle}` block (the GetLogicalDrives call)");
    assert!(safety >= blocks, "the `{needle}` block needs a `// SAFETY:` comment ({safety} comments for {blocks} block)");
    assert!(code.contains("allow(unsafe_code)"), "win_drives.rs must opt out of the crate-level deny");
}

// §3.4.14 C2: crate-level deny, so a stray block anywhere else fails to compile.
#[test]
fn lib_rs_denies_unsafe_code() {
    let lib = fs::read_to_string(manifest_dir().join("src/lib.rs")).unwrap();
    assert!(code_only(&lib).contains("#![deny(unsafe_code)]"), "lib.rs must carry #![deny(unsafe_code)]");
}

// §3.4.13-7: the unsafe surface is the two calls, each documented with `// SAFETY:`.
#[test]
fn win_fs_contains_the_two_win32_calls_each_with_a_safety_comment_and_nothing_else() {
    let text = fs::read_to_string(manifest_dir().join("src/archive/win_fs.rs")).unwrap();
    let code = code_only(&text);
    let needle = unsafe_word();
    let blocks = count_word(&code, &needle);
    let safety = text.matches("SAFETY:").count();
    assert!(code.contains("MoveFileExW"), "move_no_replace must be built on MoveFileExW (MUST-66)");
    assert!(code.contains("GetDiskFreeSpaceExW"), "free_space must be built on GetDiskFreeSpaceExW (L-3)");
    assert!(blocks <= 2, "at most two `{needle}` blocks (one per Win32 call), found {blocks}");
    assert!(safety >= blocks, "every `{needle}` block needs a `// SAFETY:` comment ({safety} comments for {blocks} blocks)");
    assert!(code.contains("allow(unsafe_code)"), "win_fs.rs must opt out of the crate-level deny");
}

// MUST-66: the no-replace commit must NEVER pass MOVEFILE_REPLACE_EXISTING (comments are ignored).
#[test]
fn win_fs_never_uses_move_file_replace_existing() {
    let text = fs::read_to_string(manifest_dir().join("src/archive/win_fs.rs")).unwrap();
    assert!(
        !code_only(&text).contains("MOVEFILE_REPLACE_EXISTING"),
        "move_no_replace must call MoveFileExW WITHOUT MOVEFILE_REPLACE_EXISTING"
    );
}

// ============================================================ boundaries

/// Modules named by `crate::<name>` (also inside `crate::{a, b}` groups) in `code`.
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

// §3.4.10 / §4.2: `archive/` may use `shared/` only (and itself).
#[test]
fn archive_does_not_use_other_feature_modules() {
    let forbidden = ["fs_ops", "fs", "config", "keymap"];
    let mut offenders = Vec::new();
    for path in all_rust_files_under("archive") {
        let code = code_only(&fs::read_to_string(&path).unwrap());
        for used in crate_uses(&code) {
            if forbidden.contains(&used.as_str()) {
                offenders.push(format!("{}: crate::{used}", rel(&path)));
            }
        }
        if code.contains(["super", "::", "super", "::"].concat().as_str()) {
            offenders.push(format!("{}: parent-of-parent module path", rel(&path)));
        }
    }
    assert!(offenders.is_empty(), "archive/ must depend on shared/ only:\n  {}", offenders.join("\n  "));
}

// §3.4.1 / §3.4.10: `shared/` is below every feature.
#[test]
fn shared_does_not_use_any_feature_module() {
    let forbidden = ["fs_ops", "fs", "config", "keymap", "archive"];
    let mut offenders = Vec::new();
    for path in all_rust_files_under("shared") {
        let code = code_only(&fs::read_to_string(&path).unwrap());
        for used in crate_uses(&code) {
            if forbidden.contains(&used.as_str()) {
                offenders.push(format!("{}: crate::{used}", rel(&path)));
            }
        }
    }
    assert!(offenders.is_empty(), "shared/ must not use a feature module:\n  {}", offenders.join("\n  "));
}

// The moved parts really live in shared/ now (one implementation, §3.4.1).
#[test]
fn cancel_registry_and_identity_are_defined_in_shared_not_in_fs_ops() {
    let fs_ops_commands = code_only(&fs::read_to_string(manifest_dir().join("src/fs_ops/commands.rs")).unwrap());
    assert!(!fs_ops_commands.contains("pub struct CancelRegistry"), "CancelRegistry must be moved to shared/cancel.rs");
    assert!(fs_ops_commands.contains("crate::shared::cancel::CancelRegistry"), "fs_ops must `use` the shared registry");
    assert!(!manifest_dir().join("src/fs_ops/identity.rs").exists(), "fs_ops/identity.rs must be moved to shared/identity.rs");
    for file in ["transfer.rs", "preflight.rs"] {
        let code = code_only(&fs::read_to_string(manifest_dir().join("src/fs_ops").join(file)).unwrap());
        assert!(code.contains("crate::shared::identity"), "fs_ops/{file} must use crate::shared::identity");
    }
}

// ============================================================ AC-361

fn forbidden_words() -> [String; 4] {
    [
        concat!("ZIP_BAD_", "PASSWORD").to_string(),
        concat!("aes-", "crypto").to_string(),
        concat!("with_aes_", "encryption").to_string(),
        concat!("by_index_", "decrypt").to_string(),
    ]
}

fn scan_text_files(dir: &Path, words: &[String], hits: &mut Vec<String>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for entry in read.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if name == "node_modules" || name == "target" || name == ".svelte-kit" || name == "gen" {
                continue;
            }
            scan_text_files(&path, words, hits);
        } else if let Ok(text) = fs::read_to_string(&path) {
            for w in words {
                if text.contains(w.as_str()) {
                    hits.push(format!("{}: {w}", path.display()));
                }
            }
        }
    }
}

// AC-361 / R-390-1: 0 hits under app/src, app/src-tauri/src and app/src-tauri/Cargo.toml
// (plus build.rs and the capability file, which are part of the same crate).
#[test]
fn ac361_no_forbidden_words_anywhere_in_the_app_sources() {
    let words = forbidden_words();
    let mut hits = Vec::new();
    let app = manifest_dir().join("..");
    scan_text_files(&app.join("src"), &words, &mut hits);
    scan_text_files(&manifest_dir().join("src"), &words, &mut hits);
    scan_text_files(&manifest_dir().join("capabilities"), &words, &mut hits);
    for file in ["Cargo.toml", "build.rs"] {
        if let Ok(text) = fs::read_to_string(manifest_dir().join(file)) {
            for w in &words {
                if text.contains(w.as_str()) {
                    hits.push(format!("{file}: {w}"));
                }
            }
        }
    }
    assert!(hits.is_empty(), "AC-361 violated:\n  {}", hits.join("\n  "));
}

// The scan really covers the frontend tree (guards against a path typo making AC-361 vacuous).
#[test]
fn ac361_the_scan_reaches_the_frontend_sources() {
    let app_src = manifest_dir().join("..").join("src");
    assert!(app_src.is_dir(), "{} must exist", app_src.display());
    let mut count = 0;
    fn count_files(dir: &Path, count: &mut usize) {
        for entry in fs::read_dir(dir).unwrap().flatten() {
            let p = entry.path();
            if p.is_dir() {
                count_files(&p, count);
            } else {
                *count += 1;
            }
        }
    }
    count_files(&app_src, &mut count);
    assert!(count > 10, "app/src has only {count} files?");
}

// ============================================================ dependency shape

fn cargo_toml() -> String {
    fs::read_to_string(manifest_dir().join("Cargo.toml")).unwrap()
}

// §3.4.14 C1 / C5 / AC-361: `zip` with default features OFF and exactly deflate + time.
#[test]
fn cargo_toml_declares_zip_without_default_features_and_only_deflate_and_time() {
    let toml = cargo_toml();
    let line = toml.lines().find(|l| l.trim_start().starts_with("zip") && l.contains('=')).expect("a `zip = ...` dependency line");
    assert!(line.contains("default-features = false"), "{line}");
    assert!(line.contains("\"deflate\"") && line.contains("\"time\""), "{line}");
    let listed = line.rsplit("features = ").next().unwrap_or("");
    let names: Vec<&str> = listed.split('"').skip(1).step_by(2).collect();
    assert_eq!(names, ["deflate", "time"], "no other zip feature may be enabled: {line}");
}

// §3.4.14 C4: `crc32fast` is NOT a direct dependency (the zip crate's own CRC check is relied on).
#[test]
fn cargo_toml_does_not_add_crc32fast() {
    let toml = cargo_toml();
    assert!(!toml.lines().any(|l| l.trim_start().starts_with("crc32fast")), "crc32fast must not be a direct dependency (C4 rejected)");
}

// §3.4.14 C2: windows-sys is a Windows-only direct dependency.
#[test]
fn cargo_toml_declares_windows_sys_for_windows_only() {
    let toml = cargo_toml();
    let at = toml.find("windows-sys").expect("windows-sys dependency");
    let header = toml[..at].rfind('[').map(|i| &toml[i..]).unwrap_or("");
    assert!(header.starts_with("[target.'cfg(windows)'.dependencies]"), "windows-sys must sit under [target.'cfg(windows)'.dependencies]");
}

// R-390-1 / AC-361 in spirit: with the zip crate's optional features off, no optional codec or
// encryption crate may appear in the lock file.
#[test]
fn cargo_lock_has_no_optional_codec_or_encryption_crates() {
    let lock = fs::read_to_string(manifest_dir().join("Cargo.lock")).unwrap();
    assert!(lock.contains("name = \"zip\""), "zip must be in the lock file");
    for name in ["aes", "bzip2", "zstd", "lzma-rust2", "pbkdf2", "hmac", "sha1", "deflate64", "ppmd-rust"] {
        assert!(!lock.contains(&format!("name = \"{name}\"")), "`{name}` is in Cargo.lock: an optional zip feature is enabled");
    }
}
