//! TDD (unit-test-writer, 2026-10-20): `settings_file/editor.rs` -- where VS Code is looked for (SPEC-0300-0022 R-1602, 確定 #2 / T-11,
//! AC-1603; SPEC-0200-0001 §3.17.3). The candidate is ONE path derived from `LOCALAPPDATA`; whether a file is there is decided later
//! by `external_apps::open_file::open_file_with` with a probe (see `external_apps/open_file_tests.rs` for AC-1603 (i)/(iv)).
//!
//! ```ignore
//! pub const VSCODE_RELATIVE: &str = r"Programs\Microsoft VS Code\Code.exe";
//! pub fn vscode_candidate(local_app_data: Option<&OsStr>) -> Option<PathBuf>;
//! ```
//! `None` when the variable is undefined, empty, or not an absolute path (a relative value would make the candidate depend on the
//! current folder; `program::resolve` refuses relative paths anyway). Nothing else is ever a candidate: not `%ProgramFiles%`
//! (AC-1603 (ii)), not `PATH`'s `code` / `code.cmd` (iii), not the `external_apps` registrations. The environment is read by
//! `config_bridge/env.rs`, not here (this function takes the value).
//! The consistency with `external_apps/defaults.rs` (the "VS Codeで開く" default) is checked in `config_bridge/template_consistency_tests.rs`.

use std::ffi::OsStr;
use std::path::PathBuf;

use super::editor::{vscode_candidate, VSCODE_RELATIVE};

#[test]
fn ac1603_i_the_candidate_is_under_local_app_data_programs() {
    let got = vscode_candidate(Some(OsStr::new(r"C:\Users\u\AppData\Local")));
    assert_eq!(got, Some(PathBuf::from(r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe")));
    assert_eq!(VSCODE_RELATIVE, r"Programs\Microsoft VS Code\Code.exe");
}

#[test]
fn ac1603_v_an_undefined_or_unusable_local_app_data_gives_no_candidate() {
    assert_eq!(vscode_candidate(None), None);
    assert_eq!(vscode_candidate(Some(OsStr::new(""))), None);
    assert_eq!(vscode_candidate(Some(OsStr::new("AppData\\Local"))), None, "relative: never resolved against the current folder");
}

// AC-1603 (ii)(iii): there is no second candidate to fall back to.
#[test]
fn ac1603_ii_iii_only_the_per_user_location_is_ever_proposed() {
    let got = vscode_candidate(Some(OsStr::new(r"D:\Data\Local"))).unwrap();
    let text = got.to_string_lossy().to_lowercase();
    assert!(text.starts_with(r"d:\data\local\"), "{text}");
    assert!(!text.contains("program files") && !text.contains("code.cmd") && !text.contains("\\bin\\"), "{text}");
    assert!(text.ends_with("code.exe"));
}

// A trailing separator in the variable must not produce a doubled one.
#[test]
fn a_trailing_separator_is_tolerated() {
    let got = vscode_candidate(Some(OsStr::new(r"C:\Users\u\AppData\Local\"))).unwrap();
    assert_eq!(got, PathBuf::from(r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe"));
}
