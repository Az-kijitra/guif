//! TDD (unit-test-writer, 2026-10-20): `config_bridge/env.rs` -- the ONE reader of the process environment for config handling
//! (SPEC-0200-0001 §3.17.1 "環境変数の読み手", §3.17.3; SHOULD-180 (a) / MUST-142 (a) as rewritten by §3.17.15; SPEC-0300-0021 R-1540-1,
//! SPEC-0300-0022 R-1602). `lib.rs` no longer reads the environment. These are thin wrappers, so the tests only pin that they ARE the
//! process environment (read-only: no `set_var`).
//!
//! ```ignore
//! pub fn lookup(name: &str) -> Option<OsString>;      // std::env::var_os(name): the `%NAME%` expansion of an external app's `program`
//! pub fn path_var() -> Option<OsString>;              // std::env::var_os("PATH") (the start-up snapshot handed to Registry::from_raw)
//! pub fn local_app_data() -> Option<OsString>;        // std::env::var_os("LOCALAPPDATA") (the VS Code location, R-1602)
//! ```

use super::env::{local_app_data, lookup, path_var};

#[test]
fn lookup_is_the_process_environment() {
    assert_eq!(lookup("PATH"), std::env::var_os("PATH"));
    assert_eq!(lookup("SystemRoot"), std::env::var_os("SystemRoot"));
    assert_eq!(lookup("GUIF_SURELY_UNDEFINED_VARIABLE_0022"), None);
}

#[test]
fn path_var_and_local_app_data_are_the_named_variables() {
    assert_eq!(path_var(), std::env::var_os("PATH"));
    assert_eq!(local_app_data(), std::env::var_os("LOCALAPPDATA"));
}
