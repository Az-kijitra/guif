//! TDD (unit-test-writer, 2026-09-27): the Tauri command layer of `archive/`.
//!
//! Specs (SPEC-0300-0014): R-386 (event name, shared cancel mechanism), R-387 /
//! R-387-2 / R-387-3 (operation id, early cancel, isolation), R-388 (all commands
//! `#[tauri::command(async)]`), R-371 (one shared validation), R-352 (result
//! shape), R-395-1 (error struct `{ code, message, entryPath }`), AC-358-2,
//! AC-358-3; SPEC-0200-0001 §3.4.2 (five commands, DTOs, camelCase), §3.4.1
//! (`archive_cancel` = one-line delegation to `shared::cancel`).
//!
//! The 3-way registration (lib.rs `generate_handler!`, build.rs, capabilities) is
//! checked in `acl_consistency.rs`. Most checks here are SOURCE inspections
//! (like the existing MUST-64 test) because constructing a Tauri `State` /
//! `AppHandle` needs a running app; the behaviour behind the commands is covered
//! by `create_tests` / `extract_tests` / `extract_plan_tests`.

use super::commands::*;
use super::error::{ArchiveError, ArchiveErrorCode as Code};
use super::extract::{ExtractOutcome, ExtractResult, Resolution};
use crate::shared::cancel::CancelRegistry;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

const COMMANDS_RS: &str = include_str!("commands.rs");
const EXTRACT_RS: &str = include_str!("extract.rs");
const CREATE_RS: &str = include_str!("create.rs");

const COMMANDS: [&str; 5] =
    ["archive_check_create", "archive_create", "archive_detect_conflicts", "archive_extract", "archive_cancel"];

fn strip_line_comments(text: &str) -> String {
    text.lines()
        .map(|line| match line.find("//") {
            Some(at) => &line[..at],
            None => line,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Text of `pub fn <name>(...) { ... }` (signature + body up to the closing `}` at column 0).
fn fn_text<'a>(source: &'a str, name: &str) -> &'a str {
    let start = source.find(&format!("pub fn {name}(")).unwrap_or_else(|| panic!("`pub fn {name}` not found"));
    let rest = &source[start..];
    let end = rest.find("\n}\n").map(|i| i + 3).unwrap_or(rest.len());
    &rest[..end]
}

/// Text of a `pub(crate) fn <name>(` helper.
fn crate_fn_text<'a>(source: &'a str, name: &str) -> &'a str {
    let start = source.find(&format!("pub(crate) fn {name}(")).unwrap_or_else(|| panic!("`pub(crate) fn {name}` not found"));
    let rest = &source[start..];
    let end = rest.find("\n}\n").map(|i| i + 3).unwrap_or(rest.len());
    &rest[..end]
}

// ------------------------------------------------------------- R-388

// R-388: every command is declared `#[tauri::command(async)]` (not a plain sync command,
// which would run on the WebView2 main thread and freeze the UI).
#[test]
fn r388_every_archive_command_is_declared_with_the_async_option() {
    let code = strip_line_comments(COMMANDS_RS);
    for name in COMMANDS {
        let at = code.find(&format!("pub fn {name}(")).unwrap_or_else(|| panic!("`pub fn {name}` not found in archive/commands.rs"));
        let before = &code[..at];
        let attr = before.rfind("#[tauri::command").unwrap_or_else(|| panic!("{name} has no #[tauri::command] attribute"));
        let between = &before[attr..];
        assert!(between.starts_with("#[tauri::command(async)]"), "{name} must use #[tauri::command(async)] (R-388), found: {}", between.lines().next().unwrap_or(""));
        assert!(!between.contains("fn "), "{name}: the attribute must belong to this fn");
    }
    assert_eq!(code.matches("#[tauri::command").count(), COMMANDS.len(), "exactly the five commands carry the attribute");
    assert_eq!(code.matches("#[tauri::command(async)]").count(), COMMANDS.len());
}

// ------------------------------------------------------------- IPC argument names

// The IPC argument names ARE the Rust parameter names (Tauri maps snake_case <-> camelCase),
// so they must be exactly the specified ones and never `_`-prefixed.
#[test]
fn ipc_argument_names_are_the_specified_ones_and_not_underscore_prefixed() {
    let code = strip_line_comments(COMMANDS_RS);
    let expect: [(&str, &[&str]); 5] = [
        ("archive_check_create", &["items", "output_path", "base_dir"]),
        ("archive_create", &["operation_id", "items", "output_path", "base_dir", "overwrite"]),
        ("archive_detect_conflicts", &["zip_path", "destination", "base_dir"]),
        ("archive_extract", &["operation_id", "zip_path", "destination", "base_dir", "resolutions"]),
        ("archive_cancel", &["operation_id"]),
    ];
    for (name, args) in expect {
        let full = fn_text(&code, name);
        let signature = full.split('{').next().unwrap_or(full);
        for arg in args {
            let needle = format!("{arg}:");
            let ok = signature.match_indices(&needle).any(|(i, _)| {
                let prev = signature[..i].chars().last().unwrap_or('(');
                prev == '(' || prev.is_whitespace()
            });
            assert!(ok, "{name}: parameter `{arg}` missing (or `_`-prefixed) in\n{signature}");
        }
    }
}

// ------------------------------------------------------------- R-386 / R-387

// R-386 / SPEC-0200-0001 §3.4.1: the SHARED registry, no second implementation in archive/.
#[test]
fn r386_the_commands_use_the_shared_cancel_registry() {
    assert!(COMMANDS_RS.contains("crate::shared::cancel::CancelRegistry"));
    let code = strip_line_comments(COMMANDS_RS);
    assert!(!code.contains("struct CancelRegistry"), "archive/ must not define its own registry");
    assert!(!code.contains("Mutex<HashMap"), "archive/ must not re-implement the registry");
}

// R-387-2: `archive_cancel` is a one-line delegation to `CancelRegistry::request_cancel`.
#[test]
fn r387_2_archive_cancel_delegates_to_the_shared_registry() {
    let code = strip_line_comments(COMMANDS_RS);
    let command = fn_text(&code, "archive_cancel");
    assert!(command.contains("cancel_operation(") || command.contains("request_cancel("), "archive_cancel must delegate:\n{command}");
    let helper = crate_fn_text(&code, "cancel_operation");
    assert!(helper.contains("request_cancel("), "cancel_operation must call CancelRegistry::request_cancel:\n{helper}");
}

// AC-358-2 / AC-358-3 at the delegation level: cancel-before-register survives, ids are isolated.
#[test]
fn ac358_2_ac358_3_cancel_operation_records_early_and_isolates_ids() {
    let registry = CancelRegistry::default();
    cancel_operation(&registry, "op-a");
    let a = registry.register("op-a");
    let b = registry.register("op-b");
    assert!(a.load(Ordering::Relaxed), "a cancel that arrived before registration must not be lost");
    assert!(!b.load(Ordering::Relaxed), "another operation must be unaffected");
    cancel_operation(&registry, "op-b");
    assert!(b.load(Ordering::Relaxed));
}

// R-387-1 / R-387: `archive_create` / `archive_extract` register the caller's operation id
// (and unregister on exit) and poll the flag.
#[test]
fn r387_the_long_running_commands_register_and_poll_the_operation_flag() {
    let code = strip_line_comments(COMMANDS_RS);
    for name in ["archive_create", "archive_extract"] {
        let body = fn_text(&code, name);
        assert!(body.contains("operation_id"), "{name} takes the caller-minted operation id");
        assert!(body.contains("register(") || body.contains("CancelGuard"), "{name} must register the id:\n{body}");
        assert!(body.contains("should_cancel"), "{name} must wire the cancel flag into the run:\n{body}");
        assert!(body.contains("emit("), "{name} must emit archive://progress:\n{body}");
    }
}

// R-386: the event name.
#[test]
fn r386_the_progress_event_name_is_archive_progress() {
    assert_eq!(PROGRESS_EVENT_NAME, "archive://progress");
}

// ------------------------------------------------------------- R-371 one validation

// R-371 / SPEC-0200-0001 §3.4.4: `archive_detect_conflicts` and the extraction run share `build_plan`.
#[test]
fn r371_detect_and_extract_call_the_same_build_plan() {
    let code = strip_line_comments(COMMANDS_RS);
    assert!(fn_text(&code, "archive_detect_conflicts").contains("build_plan("), "detect must call build_plan");
    let extract_code = strip_line_comments(EXTRACT_RS);
    assert!(extract_code.contains("build_plan("), "extract::extract must re-run build_plan right before writing");
}

// Thin wrappers over the tested functions.
#[test]
fn the_commands_are_thin_wrappers_over_create_and_extract() {
    let code = strip_line_comments(COMMANDS_RS);
    assert!(fn_text(&code, "archive_check_create").contains("check_create("));
    assert!(fn_text(&code, "archive_create").contains("create_zip("));
    assert!(fn_text(&code, "archive_extract").contains("extract("));
    // the creation / extraction modules do not know about Tauri
    for (label, src) in [("create.rs", CREATE_RS), ("extract.rs", EXTRACT_RS)] {
        assert!(!strip_line_comments(src).contains("tauri"), "{label} must stay framework-agnostic");
    }
}

// ------------------------------------------------------------- DTO shapes (camelCase)

fn toml_of<T: serde::Serialize>(value: &T) -> String {
    toml::to_string(value).expect("serialize")
}

#[test]
fn dto_check_create_uses_camel_case() {
    let t = toml_of(&CheckCreateDto { output_path: "C:\\w\\out.zip".into(), overwrite_required: true });
    assert!(t.contains("outputPath ="), "{t}");
    assert!(t.contains("overwriteRequired = true"), "{t}");
    assert!(!t.contains("output_path") && !t.contains("overwrite_required"), "{t}");
}

#[test]
fn dto_create_result_uses_camel_case() {
    let t = toml_of(&CreateResultDto { output_path: "x.zip".into(), entries: 3, skipped_links: 1 });
    for key in ["outputPath =", "entries = 3", "skippedLinks = 1"] {
        assert!(t.contains(key), "{key} in\n{t}");
    }
}

#[test]
fn dto_detect_conflicts_uses_camel_case() {
    let t = toml_of(&DetectConflictsDto {
        destination: "C:\\w\\a".into(),
        total_entries: 4,
        conflicts: vec![ConflictEntryDto { entry_path: "docs/a.txt".into() }],
    });
    for key in ["destination =", "totalEntries = 4", "entryPath = \"docs/a.txt\""] {
        assert!(t.contains(key), "{key} in\n{t}");
    }
    assert!(!t.contains("total_entries") && !t.contains("entry_path"), "{t}");
}

#[test]
fn dto_extract_result_uses_camel_case_and_nests_the_error_struct() {
    let dto = ExtractResultDto {
        extracted: 2,
        skipped: 1,
        total: 5,
        destination: "C:\\w\\a".into(),
        outcome: "failed".into(),
        error: Some(super::error::ArchiveErrorDto { code: "zip_corrupt".into(), message: "bad crc".into(), entry_path: Some("b.txt".into()) }),
    };
    let t = toml_of(&dto);
    for key in ["extracted = 2", "skipped = 1", "total = 5", "outcome = \"failed\"", "code = \"zip_corrupt\"", "message = \"bad crc\"", "entryPath = \"b.txt\""] {
        assert!(t.contains(key), "{key} in\n{t}");
    }
}

// R-352: `ExtractResult` -> DTO keeps every field and spells the outcome as specified.
#[test]
fn r352_extract_result_maps_to_the_dto() {
    let base = |outcome, error| ExtractResult { extracted: 2, skipped: 1, total: 5, destination: PathBuf::from("C:\\w\\a"), outcome, error };
    let done = ExtractResultDto::from(base(ExtractOutcome::Completed, None));
    assert_eq!((done.extracted, done.skipped, done.total), (2, 1, 5));
    assert_eq!(done.outcome, "completed");
    assert!(done.error.is_none());
    assert_eq!(done.destination, "C:\\w\\a");

    let failed = ExtractResultDto::from(base(ExtractOutcome::Failed, Some(ArchiveError::new(Code::ZipCorrupt, "bad crc").with_entry("b.txt"))));
    assert_eq!(failed.outcome, "failed");
    let e = failed.error.expect("error");
    assert_eq!((e.code.as_str(), e.message.as_str(), e.entry_path.as_deref()), ("zip_corrupt", "bad crc", Some("b.txt")));

    let canceled = ExtractResultDto::from(base(ExtractOutcome::Canceled, Some(ArchiveError::new(Code::Canceled, "canceled"))));
    assert_eq!(canceled.outcome, "canceled");
    assert_eq!(canceled.error.map(|e| e.code), Some("canceled".to_string()));
}

// ------------------------------------------------------------- resolutions on the wire

// SPEC-0200-0001 §3.4.2: unknown values are ignored (= unresolved); keys are kept verbatim.
#[test]
fn resolutions_from_wire_maps_known_values_and_drops_unknown_ones() {
    assert!(resolutions_from_wire(None).is_empty());
    let wire: HashMap<String, String> = [
        ("a.txt", "overwrite"),
        ("dir/b.txt", "skip"),
        ("c.txt", "reject"),
        ("d.txt", "OVERWRITE"),
        ("e.txt", ""),
    ]
    .iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect();
    let got = resolutions_from_wire(Some(wire));
    assert_eq!(got.get("a.txt"), Some(&Resolution::Overwrite));
    assert_eq!(got.get("dir/b.txt"), Some(&Resolution::Skip));
    for dropped in ["c.txt", "d.txt", "e.txt"] {
        assert!(!got.contains_key(dropped), "{dropped}: an unknown value is an unresolved conflict");
    }
    assert_eq!(got.len(), 2);
}
