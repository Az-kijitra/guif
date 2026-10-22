//! The ONE reader of the process environment for config handling (SPEC-0200-0001 §3.17.1 / §3.17.15, MUST-142 (a) as rewritten;
//! SHOULD-180 (a): a third reader besides `config/paths.rs` and `shared/e2e_scope.rs`; `lib.rs` reads nothing any more).
//!
//! Thin wrappers over `std::env::var_os`: `external_apps/` and `settings_file/` receive these values as arguments and never read
//! the environment themselves.

use std::ffi::OsString;

/// The `%NAME%` lookup for an external app's `program` (SPEC-0300-0021 R-1540-1).
pub fn lookup(name: &str) -> Option<OsString> {
    std::env::var_os(name)
}

/// The `PATH` snapshot handed to `Registry::from_raw` (R-1542).
pub fn path_var() -> Option<OsString> {
    std::env::var_os("PATH")
}

/// Where VS Code is looked for (SPEC-0300-0022 R-1602).
pub fn local_app_data() -> Option<OsString> {
    std::env::var_os("LOCALAPPDATA")
}
