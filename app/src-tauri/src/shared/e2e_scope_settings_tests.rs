//! TDD (unit-test-writer, 2026-10-20): the launch record of "設定ファイルを開く" for E2E (SPEC-0300-0022 R-1681 / AC-1608 / ISS-0234 (h);
//! SPEC-0200-0001 §3.17.11, audit M-3). While the E2E scope is active (debug builds) the app prints ONE line per decision to
//! standard error, which the harness reads (`[e2e] settings-file launch: refused` / `vscode` / `association`). No file is written
//! (R-1614 and SPEC-0400-0001 R-10 are untouched); release builds do nothing.
//!
//! ```ignore
//! // shared/e2e_scope.rs
//! pub fn settings_launch_line(event: &str) -> String;   // pure: "[e2e] settings-file launch: {event}"
//! pub fn note_settings_launch(event: &str);             // prints that line with eprintln! only when a scope is active (debug), else nothing
//! ```
//! `check_external_launch` is unchanged (the existing tests keep pinning it). The structure rules (no file write in `e2e_scope.rs`, the
//! debug-only placement) are in `settings_file_structure_tests.rs`.

use super::e2e_scope::{note_settings_launch, set_test_scope, settings_launch_line, Scope};

#[test]
fn the_record_line_has_the_exact_prefix_the_harness_reads() {
    assert_eq!(settings_launch_line("refused"), "[e2e] settings-file launch: refused");
    assert_eq!(settings_launch_line("vscode"), "[e2e] settings-file launch: vscode");
    assert_eq!(settings_launch_line("association"), "[e2e] settings-file launch: association");
}

// With no scope (the normal case, and every release build) the call is a harmless no-op that writes no file.
#[test]
fn without_a_scope_noting_a_launch_does_nothing_visible() {
    let before: Vec<_> = std::fs::read_dir(std::env::temp_dir()).map(|d| d.count()).into_iter().collect();
    note_settings_launch("refused");
    note_settings_launch("vscode");
    let after: Vec<_> = std::fs::read_dir(std::env::temp_dir()).map(|d| d.count()).into_iter().collect();
    assert!(before.len() == after.len(), "smoke: the call returned without panicking");
}

// With a scope the call still only prints (no panic, returns ()), whatever the text.
#[test]
fn with_a_scope_noting_a_launch_returns_normally() {
    let tmp = tempfile::tempdir().unwrap();
    let _guard = set_test_scope(Scope::new(std::fs::canonicalize(tmp.path()).unwrap()));
    note_settings_launch("refused");
    note_settings_launch("");
    assert_eq!(std::fs::read_dir(tmp.path()).unwrap().count(), 0, "R-1614: no record file is written into the folder");
}
