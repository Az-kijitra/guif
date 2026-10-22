//! Where VS Code is looked for (SPEC-0300-0022 R-1602, 確定 #2 / T-11; SPEC-0200-0001 §3.17.3).
//!
//! ONE candidate: `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`, the per-user install -- the same place as the default
//! "VS Codeで開く" of `external_apps/defaults.rs` (`config_bridge/template_consistency_tests.rs` checks that they do not drift).
//! Not `%ProgramFiles%`, not `PATH`'s `code` / `code.cmd`, not the `external_apps` registrations. Whether a file is there is
//! decided at launch time by `external_apps::open_file::open_file_with`; the environment is read by `config_bridge/env.rs`.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::shared::abs_path;

/// Under `%LOCALAPPDATA%`.
pub const VSCODE_RELATIVE: &str = r"Programs\Microsoft VS Code\Code.exe";

/// `None` when `LOCALAPPDATA` is undefined, empty or not an absolute path (a relative value would depend on the current folder; the one judgement is `shared::abs_path`, SPEC-0300-0011 R-89-6).
pub fn vscode_candidate(local_app_data: Option<&OsStr>) -> Option<PathBuf> {
    let base = Path::new(local_app_data?);
    abs_path::is_absolute_path_buf(base).then(|| base.join(VSCODE_RELATIVE))
}
