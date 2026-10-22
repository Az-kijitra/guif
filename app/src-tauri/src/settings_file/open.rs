//! The order of "設定ファイルを開く", with every outside effect injected (SPEC-0300-0022 R-1600 .. R-1607, R-1610, R-1613, R-1623,
//! R-1681; SPEC-0200-0001 §3.17.3). Pure control flow: it starts nothing itself, so a test passes closures.
//!
//! The order (R-1600):
//!
//! 1. the sample (a failure is kept in `sample_error` and the open goes on, R-1623);
//! 2. the scaffold when `config.toml` is missing (a failure ends it: `TemplateFailed`, R-1613);
//! 3. `config.toml` must be a regular file after following links (`NotAFile`, R-1603-1);
//! 4. the E2E scope (refused: `OutOfScope`, NOTHING after this is called, R-1681);
//! 5. VS Code, when there is a candidate (`Failed` does NOT fall back, T-13);
//! 6. the OS association.

use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::editor::vscode_candidate;
use super::scaffold::{create_template_if_missing, Scaffold};
use super::source::{render, Kind};
use crate::shared::e2e_scope::ScopeViolation;

/// The three paths the open works on; the backend decides them, never the screen (R-1605).
pub struct Paths {
    /// The settings folder (the sample goes here; the working folder of VS Code).
    pub dir: PathBuf,
    /// `config.toml`.
    pub config: PathBuf,
    /// The value of `LOCALAPPDATA`, read by `config_bridge/env.rs`.
    pub local_app_data: Option<OsString>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditorLaunch {
    NotFound,
    Started,
    OutOfScope,
    /// The process could not be created: the OS wording (W-A5 `詳細:`).
    Failed(String),
}

/// The outside effects.
pub struct OpenIo<'a> {
    /// `(folder, contents of the sample)`: `write_sample_if_stale` under the lock, with the atomic writer.
    pub write_sample: &'a dyn Fn(&Path, &str) -> io::Result<()>,
    /// `(candidate Code.exe, config.toml, working folder)`.
    pub launch_editor: &'a dyn Fn(&Path, &Path, &Path) -> EditorLaunch,
    pub open_by_association: &'a dyn Fn(&Path) -> Result<(), String>,
    pub scope_check: &'a dyn Fn(&Path) -> Result<(), ScopeViolation>,
    /// The E2E launch record: `"refused"` | `"vscode"` | `"association"` (AC-1608).
    pub observe: &'a dyn Fn(&str),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenResult {
    VsCode,
    Association,
    /// R-1603-1 (W-AD).
    NotAFile,
    /// R-1681 (W-A7).
    OutOfScope,
    /// W-A5, with the OS wording.
    OpenFailed(String),
    /// W-A6, with the OS wording.
    TemplateFailed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenOutcome {
    /// W-A4: this call created `config.toml`.
    pub template_created: bool,
    /// W-A8: the sample could not be written (OS wording).
    pub sample_error: Option<String>,
    pub result: OpenResult,
}

pub fn open_settings_file(paths: &Paths, version: &str, io: &OpenIo) -> OpenOutcome {
    let sample_error = (io.write_sample)(&paths.dir, &render(Kind::Sample, version)).err().map(|e| e.to_string());
    let template_created = match create_template_if_missing(&paths.config, &render(Kind::Template, version)) {
        Ok(scaffold) => scaffold == Scaffold::Created,
        Err(e) => return OpenOutcome { template_created: false, sample_error, result: OpenResult::TemplateFailed(e.to_string()) },
    };
    let outcome = |result| OpenOutcome { template_created, sample_error: sample_error.clone(), result };

    if !fs::metadata(&paths.config).is_ok_and(|m| m.is_file()) {
        return outcome(OpenResult::NotAFile);
    }
    if (io.scope_check)(&paths.config).is_err() {
        (io.observe)("refused");
        return outcome(OpenResult::OutOfScope);
    }
    if let Some(candidate) = vscode_candidate(paths.local_app_data.as_deref()) {
        (io.observe)("vscode");
        match (io.launch_editor)(&candidate, &paths.config, &paths.dir) {
            EditorLaunch::Started => return outcome(OpenResult::VsCode),
            EditorLaunch::Failed(message) => return outcome(OpenResult::OpenFailed(message)),
            EditorLaunch::OutOfScope => return outcome(OpenResult::OutOfScope),
            EditorLaunch::NotFound => {}
        }
    }
    (io.observe)("association");
    match (io.open_by_association)(&paths.config) {
        Ok(()) => outcome(OpenResult::Association),
        Err(message) => outcome(OpenResult::OpenFailed(message)),
    }
}
