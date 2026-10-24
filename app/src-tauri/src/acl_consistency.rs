//! TDD (unit-test-writer, 2026-09-26): MUST-64 (REQUIRED) three-way wiring
//! consistency test between
//!   1. `lib.rs`  `tauri::generate_handler![ ... ]`  (the commands the app serves),
//!   2. `build.rs` `AppManifest::commands(&[ ... ])`  (generates `allow-*`/`deny-*`),
//!   3. `capabilities/default.json` `permissions` (`allow-<command-with-dashes>`).
//!
//! Why: once `AppManifest::commands` is used, an app command with no ACL
//! permission is rejected at run time ("Command ... not allowed by ACL"), and
//! a command missing from `build.rs` has no permission to reference at all.
//! Phase 2 shipped 7 `fs_ops_*` commands in the handler but in neither of the
//! other two, so every one failed from the UI (SPEC-0200-0001 §3.3.1 #2/#3,
//! §3.3.7, §16 MUST-64). Phase 4's `config_*` needed the same manual triple
//! edit. This test makes a future omission a test failure.
//!
//! Specs: SPEC-0300-0011 R-48 (commands actually usable from the UI),
//! AC-34-1 prerequisite; SPEC-0200-0001 §3.3.7, §16 MUST-64.
//!
//! Text analysis only (no `serde_json` dev-dependency): the three files are
//! embedded with `include_str!`, so a change to any of them re-runs the test.
//! Covers ALL app commands (`fs_list_dir`, `config_*`, `fs_ops_*`), not only
//! `fs_ops_*`, and stays generic so that future commands are checked too.

use std::collections::BTreeSet;

pub(crate) const LIB_RS: &str = include_str!("lib.rs");
pub(crate) const BUILD_RS: &str = include_str!("../build.rs");
pub(crate) const CAPABILITY_JSON: &str = include_str!("../capabilities/default.json");
// Phase 6 (SPEC-0300-0015 R-432; SPEC-0200-0001 §3.5.2, §3.5.12.5): the
// viewer window's own capability file, separate from `default.json`
// (`windows: ["viewer"]`). MUST-77/SHOULD-111 additions below.
pub(crate) const VIEWER_CAPABILITY_JSON: &str = include_str!("../capabilities/viewer.json");

/// Commands that MUST be wired today (extend when adding a command; the
/// generic consistency check below catches omissions even if this list is not
/// updated, this list additionally guards against commands being dropped).
const REQUIRED_COMMANDS: &[&str] = &[
    "fs_list_dir",
    // Phase 8 (SPEC-0300-0016 R-780/R-784; SPEC-0200-0001 §3.7.1): drive
    // enumeration for the tree's top level -- a NEW command in `fs/`
    // (§3.7.9: "新規コマンドを追加せず既存fs/モジュールに" means a new
    // MODULE is not created, not that the command itself is unchanged).
    "fs_list_drives",
    "config_load_navigation",
    "config_save_navigation",
    // Phase 7 (SPEC-0300-0009/0010; SPEC-0200-0001 §3.6.1/§3.6.11.11
    // SHOULD-115): config.toml keymap read + ui-state.toml load/save.
    "config_load_keymap",
    "ui_state_load",
    "ui_state_save",
    "fs_ops_copy",
    "fs_ops_move",
    "fs_ops_cancel",
    "fs_ops_delete_trash",
    "fs_ops_delete_permanently",
    "fs_ops_rename",
    "fs_ops_create",
    "fs_ops_detect_conflicts", // new in Phase 2 wiring (SPEC-0200-0001 §3.3.7)
    // Phase 5 (SPEC-0300-0014 R-371 / R-386 / R-387 / R-388; SPEC-0200-0001 §3.4.2):
    "archive_check_create",
    "archive_create",
    "archive_detect_conflicts",
    "archive_extract",
    "archive_cancel",
    // Phase 11 (SPEC-0300-0011 R-18, CB-12; SPEC-0200-0001 §3.10.6):
    "clipboard_set_files",
    "clipboard_get_files",
    "clipboard_clear_if_unchanged",
    // SPEC-0300-0021 (external-app launch; SPEC-0200-0001 §3.16.2 / §3.16.5): main window only (R-1555).
    "external_apps_load",
    "external_app_launch",
    // SPEC-0300-0022 (SPEC-0200-0001 §3.17.6): "設定ファイルを開く" / "設定ファイルのチェック", main window only, no path / program / argument parameter.
    "settings_file_open",
    "settings_file_check",
    // SPEC-0300-0023 (SPEC-0200-0001 §3.18.3 / §3.18.15 MUST-2): the resolved appearance for the main window; `appearance/commands.rs`.
    "appearance_load",
];

/// Removes `// ...` line comments (good enough for the three files here).
pub(crate) fn strip_line_comments(text: &str) -> String {
    text.lines()
        .map(|line| match line.find("//") {
            Some(at) => &line[..at],
            None => line,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Text between the first `open` after `anchor` and its closing `]`.
fn bracket_body<'a>(text: &'a str, anchor: &str) -> Option<&'a str> {
    let start = text.find(anchor)? + anchor.len();
    let rest = &text[start..];
    let end = rest.find(']')?;
    Some(&rest[..end])
}

pub(crate) fn quoted_strings(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut parts = text.split('"');
    parts.next(); // text before the first quote
    while let Some(inside) = parts.next() {
        out.push(inside.to_string());
        parts.next(); // text between quotes
    }
    out
}

/// Command names listed in `tauri::generate_handler![...]` (last path segment).
pub(crate) fn handler_commands(lib_rs: &str) -> BTreeSet<String> {
    let cleaned = strip_line_comments(lib_rs);
    let body = bracket_body(&cleaned, "generate_handler![").expect("lib.rs must contain generate_handler![ ... ]");
    body.split(',')
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
        .map(|entry| entry.rsplit("::").next().unwrap_or(entry).trim().to_string())
        .collect()
}

/// Command names listed in `AppManifest::new().commands(&[ ... ])`.
pub(crate) fn manifest_commands(build_rs: &str) -> BTreeSet<String> {
    let cleaned = strip_line_comments(build_rs);
    let body = bracket_body(&cleaned, ".commands(&[").expect("build.rs must contain .commands(&[ ... ])");
    quoted_strings(body).into_iter().collect()
}

/// `allow-*` permission identifiers (app-command permissions carry no `:`
/// plugin/core prefix) listed in the capability's `permissions` array.
pub(crate) fn capability_allows(capability_json: &str) -> BTreeSet<String> {
    let body = bracket_body(capability_json, "\"permissions\": [")
        .or_else(|| bracket_body(capability_json, "\"permissions\":["))
        .expect("capability must contain a \"permissions\" array");
    quoted_strings(body)
        .into_iter()
        .filter(|p| p.starts_with("allow-") && !p.contains(':'))
        .collect()
}

pub(crate) fn permission_for(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
}

/// Phase 6 (MUST-77/SHOULD-111): EVERY permission string in a capability's
/// `permissions` array, unfiltered (unlike `capability_allows`, which drops
/// anything containing `:` — that filtering is exactly why the existing
/// checker could not have caught a stray `opener:*` or `core:default` entry).
pub(crate) fn all_permissions(capability_json: &str) -> BTreeSet<String> {
    let body = bracket_body(capability_json, "\"permissions\": [")
        .or_else(|| bracket_body(capability_json, "\"permissions\":["))
        .expect("capability must contain a \"permissions\" array");
    quoted_strings(body).into_iter().collect()
}

/// Human-readable list of every inconsistency between the three sources.
fn wiring_problems(
    handler: &BTreeSet<String>,
    manifest: &BTreeSet<String>,
    allows: &BTreeSet<String>,
) -> Vec<String> {
    let mut problems = Vec::new();
    for command in handler {
        if !manifest.contains(command) {
            problems.push(format!("`{command}` is in generate_handler! but NOT in build.rs AppManifest::commands"));
        }
        let permission = permission_for(command);
        if !allows.contains(&permission) {
            problems.push(format!("`{command}` is in generate_handler! but capabilities/default.json lacks `{permission}`"));
        }
    }
    for command in manifest {
        if !handler.contains(command) {
            problems.push(format!("`{command}` is in build.rs AppManifest::commands but NOT in generate_handler!"));
        }
    }
    let expected_permissions: BTreeSet<String> = manifest.iter().map(|c| permission_for(c)).collect();
    for permission in allows {
        if !expected_permissions.contains(permission) {
            problems.push(format!(
                "capabilities/default.json has `{permission}` but no matching command in build.rs AppManifest::commands"
            ));
        }
    }
    problems
}

// ---------------------------------------------------------------------
// The real files
// ---------------------------------------------------------------------

// MUST-64 (REQUIRED): the three sources agree for every app command.
//
// Phase 6 correction (code-generator, 2026-09-27): `wiring_problems`'s
// "every handler command has a capability permission" check pre-dates the
// two-capability split (R-432). With a single `default.json` this reduced to
// "does default.json grant it"; now that the 4 viewer-only commands are
// deliberately granted ONLY by `capabilities/viewer.json` (and deliberately
// ABSENT from `default.json`, enforced by `r432_the_four_viewer_only_commands_
// never_appear_in_default_json` below), checking `default.json` alone would
// make this test and that one mutually unsatisfiable. The fix generalizes the
// check to the UNION of every capability file's `allow-*` permissions --
// still failing if a command is missing from EVERY capability (the original
// intent), while the per-file separation stays independently enforced by the
// `r432_*`/`must77_*` tests. This is a test-suite fix, not a weakening: no
// assertion here becomes easier to satisfy in a way that would let a real
// wiring omission slip through.
#[test]
fn must64_generate_handler_build_rs_and_capability_are_consistent() {
    let handler = handler_commands(LIB_RS);
    let manifest = manifest_commands(BUILD_RS);
    let allows: BTreeSet<String> =
        capability_allows(CAPABILITY_JSON).union(&capability_allows(VIEWER_CAPABILITY_JSON)).cloned().collect();

    let problems = wiring_problems(&handler, &manifest, &allows);

    assert!(problems.is_empty(), "ACL wiring is inconsistent:\n  {}", problems.join("\n  "));
}

// Guard against commands silently disappearing / never being added: every
// required command (incl. the new `fs_ops_detect_conflicts`) is served by
// `generate_handler!`, declared in build.rs and allowed by the capability.
#[test]
fn must64_all_required_commands_are_wired_in_all_three_places() {
    let handler = handler_commands(LIB_RS);
    let manifest = manifest_commands(BUILD_RS);
    let allows = capability_allows(CAPABILITY_JSON);
    let mut missing = Vec::new();
    for command in REQUIRED_COMMANDS {
        if !handler.contains(*command) {
            missing.push(format!("{command}: not in generate_handler!"));
        }
        if !manifest.contains(*command) {
            missing.push(format!("{command}: not in build.rs AppManifest::commands"));
        }
        if !allows.contains(&permission_for(command)) {
            missing.push(format!("{command}: capability lacks {}", permission_for(command)));
        }
    }
    assert!(missing.is_empty(), "required commands are not fully wired:\n  {}", missing.join("\n  "));
}

// Every `fs_ops_*` command actually defined in `fs_ops/commands.rs` (a
// `#[tauri::command]` fn) is in generate_handler! -- catches "defined but never
// registered" for future fs_ops additions.
#[test]
fn must64_every_tauri_command_defined_in_fs_ops_commands_is_registered() {
    let source = include_str!("fs_ops/commands.rs");
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let mut parts = production_part.split("#[tauri::command");
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("");
        if let Some(at) = after_attr.find("fn ") {
            let name: String =
                after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            // doc comments may mention `#[tauri::command]` in prose; only real
            // command fns (`fs_ops_*`) count.
            if name.starts_with("fs_ops_") {
                defined.insert(name);
            }
        }
    }
    assert!(!defined.is_empty(), "no #[tauri::command] found in fs_ops/commands.rs (parser broken?)");
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// Phase 5: the same "defined but never registered" guard for `archive/commands.rs`
// (`archive_*` commands; SPEC-0200-0001 §3.4.2 last bullet).
#[test]
fn must64_every_tauri_command_defined_in_archive_commands_is_registered() {
    let source = include_str!("archive/commands.rs");
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let mut parts = strip_line_comments(production_part).split("#[tauri::command").map(str::to_string).collect::<Vec<_>>().into_iter();
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("").to_string();
        if let Some(at) = after_attr.find("fn ") {
            let name: String =
                after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if name.starts_with("archive_") {
                defined.insert(name);
            }
        }
    }
    assert_eq!(defined.len(), 5, "archive/commands.rs must define the five archive_* commands, found {defined:?}");
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// Phase 8 (SPEC-0200-0001 §3.7.10.9 SHOULD-139(b)): the same "defined but
// never registered" guard for `fs/commands.rs` -- `fs_ops`/`archive`/
// `config`/`viewer` already had this; `fs` was the one module missing it.
// Also pins the count at 2 (`fs_list_dir` + the new `fs_list_drives`, R-784).
#[test]
fn must64_every_tauri_command_defined_in_fs_commands_is_registered() {
    let source = include_str!("fs/commands.rs");
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let mut parts = strip_line_comments(production_part).split("#[tauri::command").map(str::to_string).collect::<Vec<_>>().into_iter();
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("").to_string();
        if let Some(at) = after_attr.find("fn ") {
            let name: String =
                after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if name.starts_with("fs_list") {
                defined.insert(name);
            }
        }
    }
    assert_eq!(
        defined.len(),
        2,
        "fs/commands.rs must define exactly fs_list_dir and fs_list_drives (R-784), found {defined:?}"
    );
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// ---------------------------------------------------------------------
// Phase 6 (SPEC-0300-0015 R-432, R-432-3, R-432-4, R-405-1; SPEC-0200-0001
// §3.5.2, §3.5.12.5 MUST-77, SHOULD-99, SHOULD-111): two-capability ACL.
// TDD (unit-test-writer, 2026-09-27) -- expected to fail until code-generator
// wires the 7 viewer commands into all three places AND fills in
// `capabilities/viewer.json` (currently a placeholder, `permissions: []`).
// ---------------------------------------------------------------------

// MUST-77/SHOULD-111: `capabilities/viewer.json` must be EXACTLY these 7
// permission strings (no `core:default`, no extra scope creep) -- the
// completeness check covers `core:` entries too, unlike `capability_allows`.
#[test]
fn must77_viewer_capability_is_exactly_the_specified_seven_permissions() {
    let expected: BTreeSet<String> = [
        "allow-viewer-take-pending",
        "allow-viewer-read-text",
        "allow-viewer-read-image",
        "allow-viewer-navigate",
        "core:event:allow-listen",
        "core:event:allow-unlisten",
        "core:window:allow-close",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    assert_eq!(all_permissions(VIEWER_CAPABILITY_JSON), expected);
}

// §3.5.12.5(a)/SHOULD-99, extended by Phase 7 (SPEC-0200-0001 §3.6.1,
// §3.6.11.11 SHOULD-115) and by Phase 8 (SPEC-0300-0016 R-784;
// SPEC-0200-0001 §3.7.1, §3.7.10.9 SHOULD-139(a)):
// `capabilities/default.json`'s app-command permissions become the existing
// 16 (Phase 1/2/5) PLUS the 3 main-only viewer commands
// (`viewer_classify_path`/`viewer_open`/`viewer_os_open_path`) PLUS the 3
// Phase 7 config commands (`config_load_keymap`/`ui_state_load`/
// `ui_state_save`) PLUS the 1 Phase 8 drive-enumeration command
// (`fs_list_drives`) -- 23 total.
//
// Test revision (unit-test-writer, 2026-09-30, SHOULD-139(a)): the design
// proposal's claim that "the existing generic check catches this
// automatically, no test update needed" (§3.7.1/§3.7.10.9) was corrected by
// architecture-guardian's 16th audit -- THIS exact-match test enumerates
// every expected permission by name and therefore DOES need the new entry
// added explicitly, or it fails the moment `allow-fs-list-drives` appears in
// `capabilities/default.json` (an extra, unlisted permission). Adding it
// here now makes the test RED until code-generator adds the permission
// (rather than the test staying green today and breaking unexpectedly
// later).
#[test]
fn must77_default_json_app_commands_are_the_existing_16_plus_viewer_main_plus_phase7_config_plus_phase8_drives_plus_phase11_clipboard_plus_external_apps_plus_settings_file() {
    let expected: BTreeSet<String> = [
        "allow-fs-list-dir",
        "allow-fs-list-drives",
        "allow-config-load-navigation",
        "allow-config-save-navigation",
        "allow-fs-ops-copy",
        "allow-fs-ops-move",
        "allow-fs-ops-cancel",
        "allow-fs-ops-delete-trash",
        "allow-fs-ops-delete-permanently",
        "allow-fs-ops-rename",
        "allow-fs-ops-create",
        "allow-fs-ops-detect-conflicts",
        "allow-archive-check-create",
        "allow-archive-create",
        "allow-archive-detect-conflicts",
        "allow-archive-extract",
        "allow-archive-cancel",
        "allow-viewer-classify-path",
        "allow-viewer-open",
        "allow-viewer-os-open-path",
        "allow-config-load-keymap",
        "allow-ui-state-load",
        "allow-ui-state-save",
        // Phase 11 (SPEC-0300-0011 R-18; SPEC-0200-0001 §3.10.6): 23 -> 26.
        "allow-clipboard-set-files",
        "allow-clipboard-get-files",
        "allow-clipboard-clear-if-unchanged",
        // SPEC-0300-0021 (SPEC-0200-0001 §3.16.5): 26 -> 28. NO shell / execute permission is ever granted (AC-1526).
        "allow-external-apps-load",
        "allow-external-app-launch",
        // SPEC-0300-0022 (SPEC-0200-0001 §3.17.6): 28 -> 30. Still NO opener / shell permission (AC-1606).
        "allow-settings-file-open",
        "allow-settings-file-check",
        // SPEC-0300-0023 (SPEC-0200-0001 §3.18.3): 30 -> 31, main window only. Still NO opener / shell permission.
        "allow-appearance-load",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    assert_eq!(capability_allows(CAPABILITY_JSON), expected);
}

// SPEC-0200-0001 §3.6.11.11 SHOULD-115 / §3.6.1: every `#[tauri::command]`
// defined in `config/commands.rs` is registered in `generate_handler!` --
// same "defined but never registered" guard as the fs_ops/archive/viewer
// analogs above. Also pins the count: exactly the 5 commands of Phase 4 + 7
// (`config_load_navigation`/`config_save_navigation`/`config_load_keymap`/
// `ui_state_load`/`ui_state_save`).
#[test]
fn must64_every_tauri_command_defined_in_config_commands_is_registered() {
    let source = include_str!("config/commands.rs");
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let cleaned = strip_line_comments(production_part);
    let mut parts = cleaned.split("#[tauri::command").map(str::to_string).collect::<Vec<_>>().into_iter();
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("").to_string();
        if let Some(at) = after_attr.find("fn ") {
            let name: String =
                after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if name.starts_with("config_") || name.starts_with("ui_state_") {
                defined.insert(name);
            }
        }
    }
    assert_eq!(
        defined.len(),
        5,
        "config/commands.rs must define exactly 5 config_*/ui_state_* commands, found {defined:?}"
    );
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// SPEC-0200-0001 §3.6.11.9 MUST-92: `config/io.rs` (the old `config.toml`
// read/write module) must stay deleted -- `config/mod.rs` must never declare
// it again. This test is a regression guard (expected to be green as soon as
// the deletion lands, unlike the RED-until-implemented tests above).
#[test]
fn must92_config_mod_no_longer_declares_the_deleted_io_module() {
    let mod_rs = include_str!("config/mod.rs");
    let cleaned = strip_line_comments(mod_rs);
    assert!(
        !cleaned.contains("mod io"),
        "config/io.rs must stay deleted (MUST-92, config.toml is read-only): {mod_rs}"
    );
}

// R-405-1: neither capability may grant an `opener:*` permission (the
// backend calls `tauri-plugin-opener`'s free function directly WITHOUT
// registering the plugin, so no `opener:*` ACL entry should ever be needed).
#[test]
fn should111_no_capability_grants_any_opener_prefixed_permission() {
    for (name, json) in [("default.json", CAPABILITY_JSON), ("viewer.json", VIEWER_CAPABILITY_JSON)] {
        let bad: Vec<String> =
            all_permissions(json).into_iter().filter(|p| p.starts_with("opener:")).collect();
        assert!(bad.is_empty(), "{name} must not grant opener:* permissions (R-405-1): {bad:?}");
    }
}

// R-432 (capability separation): the 3 main-only viewer commands must never
// leak into `viewer.json`, and the 4 viewer-only commands must never leak
// into `default.json` -- each capability grants only what its own window
// needs (mutual absence, both directions).
#[test]
fn r432_the_three_main_only_viewer_commands_never_appear_in_viewer_json() {
    let viewer_perms = all_permissions(VIEWER_CAPABILITY_JSON);
    for p in ["allow-viewer-classify-path", "allow-viewer-open", "allow-viewer-os-open-path"] {
        assert!(!viewer_perms.contains(p), "{p} must be main-only (default.json), not in viewer.json");
    }
}

#[test]
fn r432_the_four_viewer_only_commands_never_appear_in_default_json() {
    let default_perms = all_permissions(CAPABILITY_JSON);
    for p in ["allow-viewer-take-pending", "allow-viewer-read-text", "allow-viewer-read-image", "allow-viewer-navigate"]
    {
        assert!(!default_perms.contains(p), "{p} must be viewer-only (viewer.json), not in default.json");
    }
}

// Every `viewer_*` command actually defined (as a `#[tauri::command]` fn) in
// `viewer/commands.rs` is registered in `generate_handler!` -- same
// "defined but never registered" guard as the fs_ops/archive analogs above.
// Also pins the count: exactly the 7 commands of SPEC-0200-0001 §3.5.2.
#[test]
fn must64_every_tauri_command_defined_in_viewer_commands_is_registered() {
    let source = include_str!("viewer/commands.rs");
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let cleaned = strip_line_comments(production_part);
    let mut parts = cleaned.split("#[tauri::command").map(str::to_string).collect::<Vec<_>>().into_iter();
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("").to_string();
        if let Some(at) = after_attr.find("fn ") {
            let name: String =
                after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if name.starts_with("viewer_") {
                defined.insert(name);
            }
        }
    }
    assert_eq!(defined.len(), 7, "viewer/commands.rs must define the seven viewer_* commands, found {defined:?}");
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// ---------------------------------------------------------------------
// Phase 11 (SPEC-0300-0011 R-18, CB-12; SPEC-0200-0001 §3.10.6): the three
// clipboard commands. TDD (unit-test-writer, 2026-10-03) -- RED until
// code-generator adds `fs_ops/clipboard/commands.rs` commands and wires the
// three places. They are main-window only (never in viewer.json: the viewer's
// text copy is the WebView's own feature, R-464).
// ---------------------------------------------------------------------

#[test]
fn must64_every_tauri_command_defined_in_clipboard_commands_is_registered() {
    let source = include_str!("fs_ops/clipboard/commands.rs");
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let cleaned = strip_line_comments(production_part);
    let mut parts = cleaned.split("#[tauri::command").map(str::to_string).collect::<Vec<_>>().into_iter();
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("").to_string();
        if let Some(at) = after_attr.find("fn ") {
            let name: String =
                after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if name.starts_with("clipboard_") {
                defined.insert(name);
            }
        }
    }
    let expected = set(&["clipboard_set_files", "clipboard_get_files", "clipboard_clear_if_unchanged"]);
    assert_eq!(defined, expected, "fs_ops/clipboard/commands.rs must define exactly the three clipboard_* commands");
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

#[test]
fn phase11_the_three_clipboard_permissions_never_appear_in_viewer_json() {
    let viewer_perms = all_permissions(VIEWER_CAPABILITY_JSON);
    for p in ["allow-clipboard-set-files", "allow-clipboard-get-files", "allow-clipboard-clear-if-unchanged"] {
        assert!(!viewer_perms.contains(p), "{p} must be main-only (default.json), not in viewer.json");
        assert!(all_permissions(CAPABILITY_JSON).contains(p), "{p} must be granted by default.json");
    }
}

// ---------------------------------------------------------------------
// SPEC-0300-0021 (external-app launch; SPEC-0200-0001 §3.16.5, §3.16.15 SHOULD-214). TDD (unit-test-writer, 2026-10-17) -- RED until
// code-generator adds `external_apps/commands.rs` and wires the two commands into the three places. Read at RUN time (not
// `include_str!`) so that a missing file is a failing test, not a build error of the whole test crate.
// ---------------------------------------------------------------------

#[test]
fn must64_every_tauri_command_defined_in_external_apps_commands_is_registered() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/external_apps/commands.rs");
    let source = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(&source);
    let handler = handler_commands(LIB_RS);
    let mut defined = BTreeSet::new();
    let cleaned = strip_line_comments(production_part);
    let mut parts = cleaned.split("#[tauri::command").map(str::to_string).collect::<Vec<_>>().into_iter();
    parts.next();
    for chunk in parts {
        let after_attr = chunk.split(']').nth(1).unwrap_or("").to_string();
        if let Some(at) = after_attr.find("fn ") {
            let name: String = after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
            if name.starts_with("external_app") {
                defined.insert(name);
            }
        }
    }
    assert_eq!(defined, set(&["external_apps_load", "external_app_launch"]), "external_apps/commands.rs must define exactly the two commands");
    let unregistered: Vec<&String> = defined.iter().filter(|name| !handler.contains(*name)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// R-1555: the viewer window has no entrance to the external apps -- the two permissions are main-only, in both directions.
#[test]
fn sh214_the_two_external_app_permissions_are_main_only() {
    let viewer_perms = all_permissions(VIEWER_CAPABILITY_JSON);
    let default_perms = all_permissions(CAPABILITY_JSON);
    for p in ["allow-external-apps-load", "allow-external-app-launch"] {
        assert!(!viewer_perms.contains(p), "{p} must be main-only (default.json), not in viewer.json");
        assert!(default_perms.contains(p), "{p} must be granted by default.json");
    }
}

// ---------------------------------------------------------------------
// Self-tests of the checker (fixtures): the check really detects omissions.
// ---------------------------------------------------------------------

fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn checker_accepts_a_consistent_fixture() {
    let problems = wiring_problems(
        &set(&["fs_ops_copy", "config_load_navigation"]),
        &set(&["fs_ops_copy", "config_load_navigation"]),
        &set(&["allow-fs-ops-copy", "allow-config-load-navigation"]),
    );
    assert!(problems.is_empty(), "{problems:?}");
}

#[test]
fn checker_detects_a_command_missing_from_build_rs() {
    let problems = wiring_problems(&set(&["fs_ops_copy"]), &set(&[]), &set(&["allow-fs-ops-copy"]));
    assert!(problems.iter().any(|p| p.contains("fs_ops_copy") && p.contains("build.rs")), "{problems:?}");
}

#[test]
fn checker_detects_a_command_missing_from_the_capability() {
    let problems = wiring_problems(&set(&["fs_ops_copy"]), &set(&["fs_ops_copy"]), &set(&[]));
    assert!(problems.iter().any(|p| p.contains("allow-fs-ops-copy")), "{problems:?}");
}

#[test]
fn checker_detects_a_command_missing_from_the_handler() {
    let problems = wiring_problems(&set(&[]), &set(&["fs_ops_copy"]), &set(&["allow-fs-ops-copy"]));
    assert!(problems.iter().any(|p| p.contains("NOT in generate_handler!")), "{problems:?}");
}

#[test]
fn checker_detects_a_stale_capability_entry() {
    let problems = wiring_problems(&set(&[]), &set(&[]), &set(&["allow-fs-ops-old"]));
    assert!(problems.iter().any(|p| p.contains("allow-fs-ops-old")), "{problems:?}");
}

#[test]
fn parsers_handle_paths_comments_and_core_permissions() {
    let lib = "fn run(){ tauri::generate_handler![\n a::b::fs_one, // trailing note\n    // fs_commented_out,\n c::config_two,\n ] }";
    assert_eq!(handler_commands(lib), set(&["fs_one", "config_two"]));

    let build = "x.app_manifest(AppManifest::new().commands(&[\n \"fs_one\", // note\n \"config_two\",\n ]))";
    assert_eq!(manifest_commands(build), set(&["fs_one", "config_two"]));

    let json = r#"{ "permissions": [ "core:default", "allow-fs-one", "core:window:allow-close", "allow-config-two" ] }"#;
    assert_eq!(capability_allows(json), set(&["allow-fs-one", "allow-config-two"]));
}
