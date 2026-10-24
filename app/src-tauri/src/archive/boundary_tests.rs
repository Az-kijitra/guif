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
const UNSAFE_ALLOWED_FILES: &[&str] =
    &["src/archive/win_fs.rs", "src/fs/win_drives.rs", "src/fs_ops/clipboard/clipboard_win.rs"];

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
    // SPEC-0200-0001 §3.16.15 MUST-142 (b): `external_apps` joins the list.
    let forbidden = ["fs_ops", "fs", "config", "keymap", "external_apps"];
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
    // SPEC-0200-0001 §3.12.8 (g) / MINOR-12: `viewer` joins the list (`shared/abs_path.rs` is also called from viewer/).
    // SPEC-0200-0001 §3.16.15 MUST-142 (b): `external_apps` joins the list (`shared/schema/external_apps.rs` is RAW DATA, it imports nothing).
    let forbidden = ["fs_ops", "fs", "config", "keymap", "archive", "viewer", "external_apps", "settings_file", "config_bridge"];
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

// ============================================================ Phase 11: clipboard isolation
//
// TDD (unit-test-writer, 2026-10-03). SPEC-0300-0011 R-18-11 / AC-06-12,
// SPEC-0200-0001 §3.10.11 + §3.10.17.7 (SHOULD-175). RED until code-generator
// adds `fs_ops/clipboard/clipboard_win.rs` and the three `windows-sys` features.
// Win32 names and `windows_sys` are assembled at RUN TIME so this file never
// contains them (self-detection avoidance).

const CLIPBOARD_WIN: &str = "src/fs_ops/clipboard/clipboard_win.rs";

/// Upper bound for `unsafe` blocks in `clipboard_win.rs` (one to a few per thin Win32
/// wrapper; a jump past this must be a conscious, reviewed change).
const CLIPBOARD_WIN_MAX_UNSAFE_BLOCKS: usize = 24;

fn win32_clipboard_api_names() -> Vec<String> {
    vec![
        ["Open", "Clipboard"].concat(),
        ["SetClipboard", "Data"].concat(),
        ["GetClipboard", "Data"].concat(),
        ["Empty", "Clipboard"].concat(),
        ["Global", "Alloc"].concat(),
        ["DragQuery", "FileW"].concat(),
    ]
}

fn windows_sys_word() -> String {
    ["windows", "_sys"].concat()
}

// 1. a SAFETY comment per unsafe block, an upper bound, and the opt-out of the crate-level deny.
#[test]
fn clipboard_win_has_a_safety_comment_per_unsafe_block_and_opts_out_of_the_deny() {
    let text = fs::read_to_string(manifest_dir().join(CLIPBOARD_WIN))
        .unwrap_or_else(|e| panic!("{CLIPBOARD_WIN} must exist (R-18-11): {e}"));
    let code = code_only(&text);
    let needle = unsafe_word();
    let blocks = count_word(&code, &needle);
    let safety = text.matches("SAFETY:").count();
    assert!(blocks >= 1, "clipboard_win.rs is the Win32 wrapper: it must contain `{needle}` blocks");
    assert!(blocks <= CLIPBOARD_WIN_MAX_UNSAFE_BLOCKS, "{blocks} `{needle}` blocks exceed the cap {CLIPBOARD_WIN_MAX_UNSAFE_BLOCKS}");
    assert!(safety >= blocks, "every `{needle}` block needs a `// SAFETY:` comment ({safety} comments for {blocks} blocks)");
    assert!(code.contains("allow(unsafe_code)"), "clipboard_win.rs must opt out of the crate-level deny");
}

// 2. only clipboard_win.rs names the Win32 clipboard APIs (and it does name them).
#[test]
fn clipboard_win_is_the_only_file_naming_the_win32_clipboard_apis() {
    let names = win32_clipboard_api_names();
    let win = fs::read_to_string(manifest_dir().join(CLIPBOARD_WIN)).unwrap_or_default();
    for n in &names {
        assert!(code_only(&win).contains(n.as_str()), "{CLIPBOARD_WIN} must call {n}");
    }
    let mut offenders = Vec::new();
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src"), &mut files);
    for path in files {
        if rel(&path) == CLIPBOARD_WIN {
            continue;
        }
        let code = code_only(&fs::read_to_string(&path).unwrap());
        for n in &names {
            if code.contains(n.as_str()) {
                offenders.push(format!("{}: {n}", rel(&path)));
            }
        }
    }
    assert!(offenders.is_empty(), "Win32 clipboard API named outside {CLIPBOARD_WIN}: {offenders:?}");
}

// 3. `windows_sys` is used only by the isolation files (same list as the unsafe allow-list).
#[test]
fn the_win32_binding_crate_is_used_only_by_the_three_isolation_files() {
    assert_eq!(UNSAFE_ALLOWED_FILES.len(), 3, "the allow-list is exactly the three isolation files");
    let needle = windows_sys_word();
    let mut offenders = Vec::new();
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src"), &mut files);
    for path in files {
        // this file names the crate in test/function names (the token is also assembled at run time)
        if UNSAFE_ALLOWED_FILES.contains(&rel(&path).as_str()) || rel(&path) == "src/archive/boundary_tests.rs" {
            continue;
        }
        if code_only(&fs::read_to_string(&path).unwrap()).contains(needle.as_str()) {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "`{needle}` outside {UNSAFE_ALLOWED_FILES:?}: {offenders:?}");
    let win = fs::read_to_string(manifest_dir().join(CLIPBOARD_WIN)).unwrap_or_default();
    assert!(code_only(&win).contains(needle.as_str()), "{CLIPBOARD_WIN} must be built on windows-sys");
}

// 4. fs_ops/clipboard depends on shared/ (and itself / fs_ops siblings) only.
#[test]
fn fs_ops_clipboard_does_not_use_other_feature_modules() {
    let forbidden = ["archive", "fs", "config", "viewer", "keymap", "external_apps"];
    let mut offenders = Vec::new();
    for path in all_rust_files_under("fs_ops/clipboard") {
        let code = code_only(&fs::read_to_string(&path).unwrap());
        for used in crate_uses(&code) {
            if forbidden.contains(&used.as_str()) {
                offenders.push(format!("{}: crate::{used}", rel(&path)));
            }
        }
    }
    assert!(offenders.is_empty(), "fs_ops/clipboard must depend on shared/ only:\n  {}", offenders.join("\n  "));
}

// 5. the windows-sys feature set is pinned (a needed extra feature must show up as a deliberate diff here).
#[test]
fn cargo_toml_windows_sys_features_are_exactly_the_approved_five() {
    let toml = cargo_toml();
    let line = toml.lines().find(|l| l.trim_start().starts_with("windows-sys") && l.contains('=')).expect("a `windows-sys = ...` line");
    let listed = line.rsplit("features = ").next().unwrap_or("");
    let mut names: Vec<&str> = listed.split('"').skip(1).step_by(2).filter(|s| s.starts_with("Win32_")).collect();
    names.sort();
    assert_eq!(
        names,
        [
            "Win32_Foundation",
            "Win32_Storage_FileSystem",
            "Win32_System_DataExchange",
            "Win32_System_Memory",
            "Win32_UI_Shell"
        ],
        "{line}"
    );
}

// ============================================================ Phase 11: E2E scope (static checks)
//
// SPEC-0400-0001 R-10 / R-10-5 / R-10-6, AC-10; SPEC-0200-0001 §3.10.17.6 /
// §3.10.17.6-2 (MUST-123, SHOULD-178..180). The variable name is assembled at run time.

fn e2e_scope_var() -> String {
    ["REFLEXFILES_E2E", "_FS_SCOPE"].concat()
}

fn env_var_call() -> String {
    ["env", "::var"].concat()
}

fn is_test_source(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    name.ends_with("_tests.rs") || name == "test_support.rs" || name == "boundary_tests.rs"
}

// SHOULD-180 (a): `env::var` / `var_os` is called only by config/paths.rs and shared/e2e_scope.rs.
// SPEC-0200-0001 §3.16.15 MUST-142 (a) (SPEC-0300-0021): and `lib.rs` (the bootstrap), which reads the start-up `PATH` and the environment
// lookup it injects into `external_apps::registry::Registry::from_raw`. `external_apps/` itself reads nothing (it is NOT in this list);
// that lib.rs reads ONLY inside that one call is pinned by `external_apps_structure_tests.rs`.
#[test]
fn env_var_is_read_only_by_config_paths_and_the_e2e_scope_module() {
    let needle = env_var_call();
    // SPEC-0200-0001 §3.17.15 (SPEC-0300-0022): the third reader moved from `lib.rs` to `config_bridge/env.rs`; `lib.rs` reads nothing.
    let allowed = ["src/config/paths.rs", "src/shared/e2e_scope.rs", "src/config_bridge/env.rs"];
    let mut offenders = Vec::new();
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src"), &mut files);
    for path in files {
        if is_test_source(&path) || allowed.contains(&rel(&path).as_str()) {
            continue;
        }
        if code_only(&fs::read_to_string(&path).unwrap()).contains(needle.as_str()) {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "`{needle}` outside {allowed:?}: {offenders:?}");
    assert!(manifest_dir().join(allowed[1]).is_file(), "{} must exist", allowed[1]);
    // the allow-list entry must be used (no stale permission): config_bridge/env.rs really reads the environment
    let env_rs = code_only(&fs::read_to_string(manifest_dir().join(allowed[2])).unwrap_or_else(|e| panic!("{}: {e}", allowed[2])));
    assert!(env_rs.contains("var_os("), "config_bridge/env.rs is the reader of the environment for the registry / VS Code (MUST-142 as rewritten); it must do so");
    let lib = code_only(&fs::read_to_string(manifest_dir().join("src/lib.rs")).unwrap());
    assert!(!lib.contains(needle.as_str()) && !lib.contains("var_os("), "lib.rs must not read the environment any more (§3.17.15)");
}

/// Lines (0-based, inclusive) of `#[cfg(debug_assertions)] mod imp { ... }` in rustfmt layout
/// (the closing brace is the next line that is exactly `}`).
fn imp_block(code_lines: &[&str]) -> Option<(usize, usize)> {
    let start = code_lines.iter().position(|l| l.trim_start().starts_with("mod imp"))?;
    if start == 0 || code_lines[start - 1].trim() != "#[cfg(debug_assertions)]" {
        return None;
    }
    let end = code_lines[start..].iter().position(|l| *l == "}")? + start;
    Some((start, end))
}

// SHOULD-180 (b): the variable name (and any env read) appears in the production code only inside
// `#[cfg(debug_assertions)] mod imp` of shared/e2e_scope.rs.
#[test]
fn the_e2e_scope_variable_is_only_referenced_inside_the_debug_only_imp_module() {
    let var = e2e_scope_var();
    let env_call = env_var_call();
    let mut files = Vec::new();
    rust_sources(&manifest_dir().join("src"), &mut files);
    for path in files {
        if is_test_source(&path) {
            continue;
        }
        let text = fs::read_to_string(&path).unwrap();
        let code = code_only(&text);
        if rel(&path) != "src/shared/e2e_scope.rs" {
            assert!(!code.contains(var.as_str()), "{} must not name {var}", rel(&path));
            continue;
        }
        let lines: Vec<&str> = code.lines().collect();
        let (start, end) = imp_block(&lines).unwrap_or_else(|| panic!("e2e_scope.rs needs `#[cfg(debug_assertions)]` + `mod imp {{ ... }}` (closing `}}` alone on a line)"));
        let mut seen_var = false;
        for (i, line) in lines.iter().enumerate() {
            let inside = i >= start && i <= end;
            if line.contains(var.as_str()) {
                seen_var = true;
                assert!(inside, "line {}: {var} outside `mod imp`: {line}", i + 1);
            }
            if line.contains(env_call.as_str()) {
                assert!(inside, "line {}: env read outside `mod imp`: {line}", i + 1);
            }
        }
        assert!(seen_var, "e2e_scope.rs must read {var}");
    }
}


// R-10-1 / §3.10.17.6: an invalid value stops start-up, right after the config override check.
#[test]
fn lib_rs_initialises_the_e2e_scope_after_the_config_override_and_propagates_the_error() {
    let lib = code_only(&fs::read_to_string(manifest_dir().join("src/lib.rs")).unwrap());
    let cfg = lib.find("config_dir_override()?").expect("config_dir_override()?");
    let init = lib.find("e2e_scope::init_from_env()?").expect("`shared::e2e_scope::init_from_env()?` in .setup");
    assert!(init > cfg, "init_from_env must come right after config_dir_override");
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

// ============================================================ Phase 12 (dark theme)
//
// Phase 12 tests (unit-test-writer, 2026-10-06). Source-text guard rails: they read the sources, not any API.
// Specs: SPEC-0300-0017 R-917-6 / R-917-8 / AC-960 (config.toml is read once and
// never written), R-919-1; SPEC-0300-0010 R-45 / AC-63; SPEC-0200-0001 §3.11.3, §3.11.12 (5),
// §3.11.16 SHOULD-181 / SHOULD-182 / SHOULD-183.

/// Production text of a source file: comments removed and everything from an inline `mod tests {` on dropped.
fn production_code(path: &Path) -> String {
    let text = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let head = match text.find("mod tests {") {
        Some(at) => &text[..at],
        None => &text[..],
    };
    code_only(head)
}

/// Non-test production sources: every `.rs` under `src/` except `*_tests.rs` / `test_support.rs`.
fn production_files() -> Vec<PathBuf> {
    all_rust_files_under("")
        .into_iter()
        .filter(|p| {
            let n = p.file_name().unwrap().to_string_lossy().into_owned();
            !n.ends_with("_tests.rs") && n != "test_support.rs"
        })
        .collect()
}

// H-1 / §3.11.3: keymap.rs was renamed to config_toml.rs (the sole reader of config.toml).
#[test]
fn h1_config_keymap_rs_is_renamed_to_config_toml_rs() {
    assert!(manifest_dir().join("src/config/config_toml.rs").is_file(), "config/config_toml.rs must exist");
    assert!(!manifest_dir().join("src/config/keymap.rs").exists(), "config/keymap.rs must be renamed away (git mv)");
    let mod_rs = code_only(&fs::read_to_string(manifest_dir().join("src/config/mod.rs")).unwrap());
    assert!(mod_rs.contains("mod config_toml"), "config/mod.rs must declare `config_toml`");
    assert!(!mod_rs.contains("mod keymap"), "config/mod.rs must no longer declare `keymap`");
}

// §3.11.3: the comments that named `config/keymap.rs` are updated.
#[test]
fn h1_no_source_still_names_config_keymap_rs() {
    let mut offenders = Vec::new();
    for path in production_files() {
        let text = fs::read_to_string(&path).unwrap();
        if text.contains("config/keymap.rs") {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "these files still mention `config/keymap.rs`:\n  {}", offenders.join("\n  "));
}

// SHOULD-183 (a), rewritten by SPEC-0200-0001 §3.17.15 (SPEC-0300-0022 M-1): `config_path(` is called from exactly one place,
// `config::startup_config::locate` (config/startup_config.rs). `StartupConfig::load`, `config_bridge/open.rs` and
// `config_bridge/sample_startup.rs` all go through `locate`. `config_load_keymap` serves the snapshot and never opens the path (R-917-8).
#[test]
fn should183_a_config_path_is_called_in_exactly_one_place_startup_config_locate() {
    let mut calls: Vec<(String, usize)> = Vec::new();
    for path in production_files() {
        let code = production_code(&path);
        let n = code.lines().filter(|l| l.contains("config_path(") && !l.contains("fn config_path(")).count();
        if n > 0 {
            calls.push((rel(&path), n));
        }
    }
    let total: usize = calls.iter().map(|(_, n)| n).sum();
    assert_eq!(total, 1, "`config_path(` must be called exactly once in production code: {calls:?}");
    assert!(calls[0].0.ends_with("config/startup_config.rs"), "the one call must be in config/startup_config.rs: {calls:?}");

    let startup = production_code(&manifest_dir().join("src/config/startup_config.rs"));
    let locate_at = startup.find("pub fn locate(").expect("config/startup_config.rs must define `pub fn locate(app: &AppHandle) -> io::Result<PathBuf>`");
    let call_at = startup.find("config_path(").unwrap();
    assert!(call_at > locate_at, "the `config_path(` call must be inside `locate`");
    let rest = &startup[locate_at + "pub fn locate(".len()..];
    let body = &rest[..rest.find("fn ").unwrap_or(rest.len())];
    assert!(body.contains("config_path("), "the `config_path(` call must be in the body of `locate`, not of a later fn");
    // `StartupConfig::load` resolves the path only through `locate`
    let load_at = startup.find("fn load(").expect("StartupConfig::load must exist");
    let load_rest = &startup[load_at + "fn load(".len()..];
    let load_body = &load_rest[..load_rest.find("fn ").unwrap_or(load_rest.len())];
    assert!(load_body.contains("locate("), "StartupConfig::load must call locate(..)");
    for file in ["src/config_bridge/open.rs", "src/config_bridge/sample_startup.rs"] {
        let code = production_code(&manifest_dir().join(file));
        assert!(code.contains("locate("), "{file} must resolve the config folder through config::startup_config::locate");
        assert!(!code.contains("config_path(") && !code.contains("app_config_dir"), "{file} must not resolve the path itself");
    }
}

// SHOULD-183 (b): config_toml.rs has no way to write.
#[test]
fn should183_b_config_toml_rs_has_no_write_api() {
    let code = production_code(&manifest_dir().join("src/config/config_toml.rs"));
    for token in ["fs::write", "File::create", "OpenOptions", "rename", "atomic::", "remove_file", "set_permissions"] {
        assert!(!code.contains(token), "config/config_toml.rs must not contain `{token}` (config.toml is read-only, R-917-6)");
    }
    assert!(code.contains("fs::read"), "config_toml.rs must read the file with fs::read (sanity: the scan saw the real file)");
}

// SHOULD-183 (c), rewritten by §3.17.15: `StartupConfig` now lives in config/startup_config.rs; `load` hands the path to
// `config_toml::load` (via `from_path`) and to nothing else.
#[test]
fn should183_c_startup_config_load_passes_the_path_only_to_config_toml_load() {
    assert!(!production_code(&manifest_dir().join("src/config/commands.rs")).contains("impl StartupConfig"), "StartupConfig moved out of config/commands.rs");
    let commands = production_code(&manifest_dir().join("src/config/startup_config.rs"));
    let impl_at = commands.find("impl StartupConfig").expect("impl StartupConfig must exist in config/startup_config.rs");
    let load_at = impl_at + commands[impl_at..].find("fn load(").expect("StartupConfig::load must exist");
    // The body of `load`: up to the next `fn ` item of the impl (or the end of the production text).
    let rest = &commands[load_at + "fn load(".len()..];
    let body = &rest[..rest.find("fn ").unwrap_or(rest.len())];
    assert!(body.contains("from_path(") || body.contains("config_toml::load("), "StartupConfig::load must go through config_toml::load");
    for token in ["fs::", "File::", "read_to_string", "OpenOptions", "write("] {
        assert!(!body.contains(token), "StartupConfig::load must not touch the file itself (`{token}`)");
    }
}

// R-917-8: `config_load_keymap` serves the start-up snapshot (State<StartupConfig>), it does not read the file.
#[test]
fn r917_8_config_load_keymap_reads_the_snapshot_not_the_file() {
    let commands = production_code(&manifest_dir().join("src/config/commands.rs"));
    let at = commands.find("fn config_load_keymap(").expect("config_load_keymap must exist");
    let rest = &commands[at..];
    let body = &rest[..rest.find("#[tauri::command").unwrap_or(rest.len())];
    assert!(body.contains("StartupConfig"), "config_load_keymap must take State<StartupConfig>");
    assert!(!body.contains("config_toml::load"), "config_load_keymap must not re-read config.toml");
    assert!(!body.contains("config_path"), "config_load_keymap must not resolve the config.toml path");
}

// SHOULD-181: `shared/` may name `tauri` in window_theme.rs only; it never uses Manager / State / path resolution.
#[test]
fn should181_shared_references_tauri_only_in_window_theme_rs() {
    let mut offenders = Vec::new();
    for path in all_rust_files_under("shared") {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        if name == "window_theme.rs" || name == "window_theme_tests.rs" || name == "window_paint_tests.rs" {
            continue;
        }
        let code = code_only(&fs::read_to_string(&path).unwrap());
        if code.contains("tauri::") || code.contains("use tauri") || code.contains("tauri_") {
            offenders.push(rel(&path));
        }
    }
    assert!(offenders.is_empty(), "only shared/window_theme.rs may reference tauri:\n  {}", offenders.join("\n  "));
}

#[test]
fn should181_window_theme_rs_is_a_thin_window_helper() {
    let path = manifest_dir().join("src/shared/window_theme.rs");
    assert!(path.is_file(), "shared/window_theme.rs must exist (§3.11.5)");
    let code = production_code(&path);
    let feature_uses: Vec<String> = ["config", "viewer", "fs_ops", "archive"].iter().map(|m| format!("{}::{m}", "crate")).collect();
    for token in ["Manager", "State<", "config::paths"].iter().map(|t| t.to_string()).chain(feature_uses) {
        assert!(!code.contains(&token), "shared/window_theme.rs must not use `{token}` (SHOULD-181)");
    }
    assert!(!code.contains(&unsafe_word()), "no unsafety is added for the theme (§3.11.0)");
}

fn lib_rs_code() -> String {
    production_code(&manifest_dir().join("src/lib.rs"))
}

// §3.11.2 / S-6: `set_theme(` has ONE call site (lib.rs), never `None`, and it sits between build() and run().
#[test]
fn s6_set_theme_is_called_once_in_lib_rs_and_never_with_none() {
    let mut sites = Vec::new();
    for path in production_files() {
        let n = production_code(&path).matches("set_theme(").count();
        if n > 0 {
            sites.push((rel(&path), n));
        }
    }
    assert_eq!(sites.len(), 1, "set_theme( must appear in one file only: {sites:?}");
    assert!(sites[0].0.ends_with("lib.rs") && sites[0].1 == 1, "exactly one set_theme( call, in lib.rs: {sites:?}");
    let lib = lib_rs_code();
    assert!(!lib.replace(' ', "").contains("set_theme(None"), "set_theme(None) is never called (following the OS is the default)");
}

#[test]
fn s6_lib_rs_builds_then_sets_the_theme_then_runs() {
    let lib = lib_rs_code();
    let build = lib.find(".build(tauri::generate_context!())").expect("lib.rs must call `.build(tauri::generate_context!())`");
    let theme = lib.find("set_theme(").expect("lib.rs must call set_theme(");
    let run = lib.rfind(".run(").expect("lib.rs must call app.run(...)");
    assert!(build < theme && theme < run, "order must be build() -> set_theme() -> run()");
    assert!(!lib.contains(".run(tauri::generate_context!())"), "Builder::run(ctx) is replaced by build() + run()");
    // SPEC-0300-0023 R-1741 (SPEC-0200-0001 §3.18.5): the theme is requested ALWAYS, only through the pure mapping, and only the
    // start-up snapshot (the resolved brightness of the bg) decides it. The OS-following branch (`requested_theme`) is gone.
    assert!(lib.contains("theme_for("), "set_theme must be driven by shared::window_theme::theme_for(appearance.dark)");
    assert!(!lib.contains("requested_theme("), "the OS-following branch is gone (R-1749)");
    // §3.17.15: the start-up config and the registry are made by the ONE shared function `config_bridge::snapshot(`
    // (`StartupConfig::load` is called inside `config_bridge/evaluate.rs`, not by lib.rs; R-1651).
    assert!(!lib.contains("StartupConfig::load("), "lib.rs goes through config_bridge::snapshot(..) now");
    let load = lib.find("config_bridge::snapshot(").expect("the start-up config is read via config_bridge::snapshot (R-917-8, R-1651)");
    assert!(build < load && load < theme, "config_bridge::snapshot runs after build() and before set_theme()");
}

// SHOULD-182 (2): `.setup` always shows the (initially hidden) main window; show() is not behind a condition.
#[test]
fn should182_setup_shows_the_main_window_unconditionally() {
    let lib = lib_rs_code();
    let setup = lib.find(".setup(|app|").expect("lib.rs must have `.setup(|app|`");
    let body_open = setup + lib[setup..].find('{').unwrap();
    let anchor = body_open + lib[body_open..].find("config_dir_override()").expect("setup keeps the config_dir_override check");
    let show = body_open
        + lib[body_open..].find(".show()").expect("`.setup` must call `.show()` on the main window (visible: false in tauri.conf.json)");
    let depth_at = |upto: usize| -> i32 {
        lib[body_open..upto].chars().fold(0, |d, c| match c {
            '{' => d + 1,
            '}' => d - 1,
            _ => d,
        })
    };
    assert_eq!(depth_at(show), depth_at(anchor), "`.show()` must be at the closure's top statement level (not inside if / match / a nested closure)");
    let line_start = lib[..show].rfind('\n').map_or(0, |i| i + 1);
    let line = &lib[line_start..show];
    assert!(!line.contains("if ") && !line.contains("match ") && !line.contains("&&"), "the `.show()` statement must not be conditional: `{line}`");
    // The main window is obtained with `expect` (a hidden, never-shown process must not be created).
    let get = lib.find("get_webview_window(\"main\")").expect("setup must get the main window");
    assert!(lib[get..(get + 80).min(lib.len())].contains(".expect("), "get_webview_window(\"main\") must be followed by .expect(...)");
}

// SHOULD-182 (2): background-colour failures never stop show(): `let _ = apply_background(..)`.
#[test]
fn should182_apply_background_failure_is_ignored_and_runs_before_show() {
    let lib = lib_rs_code();
    let bg = lib.find("apply_background(").expect("lib.rs .setup must call apply_background(..) for the main window");
    let line_start = lib[..bg].rfind('\n').map_or(0, |i| i + 1);
    assert!(lib[line_start..bg].contains("let _ ="), "apply_background's result must be ignored (`let _ = ...`) so show() always runs");
    let show = lib.find(".show()").expect("show");
    assert!(bg < show, "the background colour is set before show() (R-919-1)");
}

// SPEC-0300-0023 R-1742 / R-1749 (SPEC-0200-0001 §3.18.5): the background is the resolved bg and nothing follows an OS theme change any
// more; the viewer sets it before show().
#[test]
fn r919_1_windows_apply_the_background_and_follow_no_theme_change() {
    let lib = lib_rs_code();
    assert!(!lib.contains("ThemeChanged"), "lib.rs no longer handles WindowEvent::ThemeChanged (the theme is fixed by set_theme(Some(..)), R-1749)");
    let viewer = production_code(&manifest_dir().join("src/viewer/window.rs"));
    assert!(!viewer.contains("ThemeChanged"), "viewer/window.rs no longer handles ThemeChanged");
    // Order on the NEW-window path: `.build()` -> `apply_background(..)` -> `window.show()`. (The reuse branch's
    // `existing.show()` comes earlier in the file and is deliberately not part of this order.)
    let build = viewer.find(".build()").expect("viewer/window.rs must build the viewer window with .build()");
    let after_build = &viewer[build..];
    let bg = after_build.find("apply_background(").expect("viewer/window.rs must call apply_background(..) after build()");
    let show = after_build.find("window.show()").expect("the new viewer window is shown with window.show() after build()");
    assert!(bg < show, "the viewer's background colour is set after build() and before it is shown");
}

// R-919-2 / AC-962: no new command, capability or dependency (belt and braces; the git diff check is a manual step).
#[test]
fn ac962_no_new_command_or_capability_for_the_theme() {
    let lib = lib_rs_code();
    assert!(!lib.contains("config_load_startup"), "no new command: config_load_keymap keeps its name (§3.11.4)");
    let cap = fs::read_to_string(manifest_dir().join("capabilities/default.json")).unwrap();
    assert!(!cap.contains("core:window:allow-show"), "Rust shows the main window; no core:window:allow-show is granted (§3.11.5)");
    let cargo = fs::read_to_string(manifest_dir().join("Cargo.toml")).unwrap();
    assert!(!cargo.contains("tauri-plugin-theme") && !cargo.contains("dark-light"), "no theme crate may be added");
}
