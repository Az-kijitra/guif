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

const LIB_RS: &str = include_str!("lib.rs");
const BUILD_RS: &str = include_str!("../build.rs");
const CAPABILITY_JSON: &str = include_str!("../capabilities/default.json");

/// Commands that MUST be wired today (extend when adding a command; the
/// generic consistency check below catches omissions even if this list is not
/// updated, this list additionally guards against commands being dropped).
const REQUIRED_COMMANDS: &[&str] = &[
    "fs_list_dir",
    "config_load_navigation",
    "config_save_navigation",
    "fs_ops_copy",
    "fs_ops_move",
    "fs_ops_cancel",
    "fs_ops_delete_trash",
    "fs_ops_delete_permanently",
    "fs_ops_rename",
    "fs_ops_create",
    "fs_ops_detect_conflicts", // new in Phase 2 wiring (SPEC-0200-0001 §3.3.7)
];

/// Removes `// ...` line comments (good enough for the three files here).
fn strip_line_comments(text: &str) -> String {
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

fn quoted_strings(text: &str) -> Vec<String> {
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
fn handler_commands(lib_rs: &str) -> BTreeSet<String> {
    let cleaned = strip_line_comments(lib_rs);
    let body = bracket_body(&cleaned, "generate_handler![").expect("lib.rs must contain generate_handler![ ... ]");
    body.split(',')
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
        .map(|entry| entry.rsplit("::").next().unwrap_or(entry).trim().to_string())
        .collect()
}

/// Command names listed in `AppManifest::new().commands(&[ ... ])`.
fn manifest_commands(build_rs: &str) -> BTreeSet<String> {
    let cleaned = strip_line_comments(build_rs);
    let body = bracket_body(&cleaned, ".commands(&[").expect("build.rs must contain .commands(&[ ... ])");
    quoted_strings(body).into_iter().collect()
}

/// `allow-*` permission identifiers (app-command permissions carry no `:`
/// plugin/core prefix) listed in the capability's `permissions` array.
fn capability_allows(capability_json: &str) -> BTreeSet<String> {
    let body = bracket_body(capability_json, "\"permissions\": [")
        .or_else(|| bracket_body(capability_json, "\"permissions\":["))
        .expect("capability must contain a \"permissions\" array");
    quoted_strings(body)
        .into_iter()
        .filter(|p| p.starts_with("allow-") && !p.contains(':'))
        .collect()
}

fn permission_for(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
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
#[test]
fn must64_generate_handler_build_rs_and_capability_are_consistent() {
    let handler = handler_commands(LIB_RS);
    let manifest = manifest_commands(BUILD_RS);
    let allows = capability_allows(CAPABILITY_JSON);

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
