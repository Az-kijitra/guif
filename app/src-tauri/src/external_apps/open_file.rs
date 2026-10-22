//! "Open ONE file with an executable at an absolute path", independent of any registration (SPEC-0300-0022 R-1602 / R-1603 /
//! R-1681; SPEC-0200-0001 §3.17.2 (e), §3.17.3, H-3). It is the VS Code launch of "設定ファイルを開く".
//!
//! Nothing new creates a process: `program::resolve` finds the file (a folder, a missing file, a non-`.exe` and a bare name are
//! "not found"; `PATH` is never searched, so `code.cmd` is never started, R-1602) and `launch::spawn` (injected, so the single
//! process-creation site stays `launch.rs`) starts it with the file as the ONLY argument and the settings folder as the working
//! folder. The E2E scope is checked here too, before `spawn`, so that a caller that forgot its own check still fails closed
//! (design S-3; the same shape as `guarded.rs`).

use std::io;
use std::path::Path;

use super::exists::Probe;
use super::launch::LaunchPlan;
use super::program;
use crate::shared::e2e_scope;

#[derive(Debug)]
pub enum OpenFile {
    /// The program is not a usable file (the caller falls back to the OS association, R-1604).
    NotFound,
    Started,
    /// The E2E scope is active (R-1681): nothing was started. Not an error of the OS, so not `Failed`.
    OutOfScope,
    /// The process could not be created; the OS error, unchanged (R-1603 T-13: no fallback).
    Failed(io::Error),
}

/// `program` -> resolve (`probe`) -> E2E scope -> `LaunchPlan { exe, args: [file], cwd }` -> `spawn`.
/// A `program` that is not valid UTF-8 is `NotFound` (`program::resolve` takes text; the caller then uses the association).
pub fn open_file_with(
    program: &Path,
    file: &Path,
    cwd: &Path,
    probe: &dyn Fn(&Path) -> Probe,
    spawn: impl FnOnce(&LaunchPlan) -> io::Result<()>,
) -> OpenFile {
    let Some(program) = program.to_str() else { return OpenFile::NotFound };
    let Some(exe) = program::resolve(program, None, probe) else { return OpenFile::NotFound };
    if e2e_scope::check_external_launch(exe.path()).is_err() {
        return OpenFile::OutOfScope;
    }
    let plan = LaunchPlan { exe, args: vec![file.as_os_str().to_os_string()], cwd: cwd.to_path_buf() };
    match spawn(&plan) {
        Ok(()) => OpenFile::Started,
        Err(e) => OpenFile::Failed(e),
    }
}
