//! TDD (unit-test-writer, 2026-10-20): the three-place wiring of the two new commands (SPEC-0300-0022 R-1605 / AC-1606;
//! SPEC-0200-0001 §3.17.4 (8), §3.17.6, MUST-64 / MUST-77 / SHOULD-111). New tests live in this file, NOT in `acl_consistency.rs`
//! (already 651 lines, §3.17.13); the helpers are shared (`pub(crate)` there). `REQUIRED_COMMANDS` and the exact-match list
//! `must77_default_json_…` of `acl_consistency.rs` were extended by the same task.
//!
//! RED until code-generator adds `config_bridge/{check,open}.rs`, registers `config_bridge::check::settings_file_check` /
//! `config_bridge::open::settings_file_open` in `generate_handler!` (`lib.rs`), `build.rs` and `capabilities/default.json`
//! (`allow-settings-file-open` / `allow-settings-file-check`, main window only; NOT `viewer.json`).

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use super::acl_consistency::{all_permissions, capability_allows, handler_commands, manifest_commands, strip_line_comments, BUILD_RS, CAPABILITY_JSON, LIB_RS, VIEWER_CAPABILITY_JSON};

const NEW_COMMANDS: [&str; 2] = ["settings_file_open", "settings_file_check"];

fn bridge_sources() -> Vec<(String, String)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/config_bridge");
    let entries = fs::read_dir(&dir).unwrap_or_else(|e| panic!("src/config_bridge/ does not exist yet (RED until implemented): {e}"));
    let mut files: Vec<(String, String)> = entries
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "rs"))
        .filter(|p| !p.file_name().unwrap().to_string_lossy().ends_with("_tests.rs"))
        .map(|p| (p.file_name().unwrap().to_string_lossy().into_owned(), fs::read_to_string(&p).unwrap()))
        .collect();
    files.sort();
    files
}

/// Names of the `#[tauri::command…]` functions in the production part of `config_bridge/*.rs`.
fn defined_commands() -> BTreeSet<String> {
    let mut defined = BTreeSet::new();
    for (_, source) in bridge_sources() {
        let production = source.split("#[cfg(test)]").next().unwrap_or(&source).to_string();
        let cleaned = strip_line_comments(&production);
        let mut parts = cleaned.split("#[tauri::command");
        parts.next();
        for chunk in parts {
            let after_attr = chunk.split(']').nth(1).unwrap_or("");
            if let Some(at) = after_attr.find("fn ") {
                defined.insert(after_attr[at + 3..].chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect());
            }
        }
    }
    defined
}

fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

// MUST-64: `config_bridge/` defines exactly the two commands, and each is in `generate_handler!` (and nothing stale is registered).
#[test]
fn must64_every_tauri_command_defined_in_config_bridge_is_registered() {
    let defined = defined_commands();
    assert_eq!(defined, set(&NEW_COMMANDS), "config_bridge/ must define exactly settings_file_open and settings_file_check");
    let handler = handler_commands(LIB_RS);
    let unregistered: Vec<&String> = defined.iter().filter(|n| !handler.contains(*n)).collect();
    assert!(unregistered.is_empty(), "defined but not in generate_handler!: {unregistered:?}");
}

// The registered paths go through `config_bridge::` (the commands are not re-homed into another module).
#[test]
fn the_handler_entries_name_their_config_bridge_modules() {
    let lib = strip_line_comments(LIB_RS);
    assert!(lib.contains("config_bridge::open::settings_file_open"), "generate_handler! must list config_bridge::open::settings_file_open");
    assert!(lib.contains("config_bridge::check::settings_file_check"), "generate_handler! must list config_bridge::check::settings_file_check");
}

// MUST-64: build.rs and the main capability grant both; the permission names follow the existing `allow-<kebab>` rule.
#[test]
fn must64_build_rs_and_the_main_capability_know_both_commands() {
    let manifest = manifest_commands(BUILD_RS);
    let allows = capability_allows(CAPABILITY_JSON);
    for command in NEW_COMMANDS {
        assert!(manifest.contains(command), "{command}: missing from build.rs AppManifest::commands");
    }
    for permission in ["allow-settings-file-open", "allow-settings-file-check"] {
        assert!(allows.contains(permission), "{permission}: missing from capabilities/default.json");
    }
}

// R-1605 / AC-1606 / SPEC-0300-0015 R-432 style: main only. The viewer window has no entrance to the settings file.
#[test]
fn sh214_the_settings_file_permissions_are_main_only() {
    let viewer = all_permissions(VIEWER_CAPABILITY_JSON);
    let default = all_permissions(CAPABILITY_JSON);
    for permission in ["allow-settings-file-open", "allow-settings-file-check"] {
        assert!(!viewer.contains(permission), "{permission} must not be in viewer.json (R-1673)");
        assert!(default.contains(permission), "{permission} must be granted by default.json (windows: [main])");
    }
}

// R-1605 / AC-1606: still no opener / shell permission anywhere -- the screen cannot start a program (the backend does, by itself).
#[test]
fn ac1606_no_capability_gains_an_opener_or_shell_permission() {
    for (what, json) in [("default.json", CAPABILITY_JSON), ("viewer.json", VIEWER_CAPABILITY_JSON)] {
        for permission in all_permissions(json) {
            assert!(!permission.starts_with("opener:") && !permission.starts_with("shell:") && !permission.contains("execute"), "{what}: {permission}");
        }
    }
}

// The new commands raise the counts by exactly two in every place (a drift here is a forgotten registration).
#[test]
fn the_three_places_agree_on_the_command_count() {
    let handler = handler_commands(LIB_RS);
    assert_eq!(handler.len(), 34, "generate_handler! has 34 commands (32 + the two settings_file commands)");
    assert_eq!(manifest_commands(BUILD_RS), handler, "build.rs lists exactly the handler's commands");
}
