//! The command `settings_file_open`: "設定ファイルを開く" (SPEC-0300-0022 R-1600 .. R-1607, R-1665, R-1681; SPEC-0200-0001
//! §3.17.3 / §3.17.6, H-2).
//!
//! The backend decides everything: the command takes the calling window and the app handle and NOTHING else -- no path, no program,
//! no argument (R-1605 / AC-1606). The path comes from `config::startup_config::locate` (the one path resolution, M-1). This file
//! builds the REAL `OpenIo` for `settings_file::open::open_settings_file`:
//!
//! - the sample: `write_sample_if_stale` with `config::atomic::atomic_write` handed over as a function value (R-1622), under
//!   `SettingsFileLock` (the start-up write may be running);
//! - VS Code: `external_apps::open_file::open_file_with` with `exists::probe` and `launch::spawn` (the only process-creation site);
//! - the association: the same `tauri_plugin_opener::open_path` as `viewer_os_open_path`, after its own scope check (S-3);
//! - the E2E scope and the launch record: `e2e_scope::check_external_launch` / `note_settings_launch`.
//!
//! The backend builds no Japanese sentence (SPEC-0300-0019 R-1201 (2)): the result is a code plus the OS wording.

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager, Window};

use crate::config::atomic::atomic_write;
use crate::config::startup_config::locate;
use crate::external_apps::commands::check_main_window;
use crate::external_apps::exists;
use crate::external_apps::launch;
use crate::external_apps::open_file::{open_file_with, OpenFile};
use crate::settings_file::open::{open_settings_file, EditorLaunch, OpenIo, OpenOutcome, OpenResult, Paths};
use crate::settings_file::sample::{write_sample_if_stale, SettingsFileLock};
use crate::shared::e2e_scope;

use super::env;

/// `result.kind`: `"vscode" | "association" | "not_a_file" | "out_of_scope" | "open_failed" | "template_failed"`.
/// `message` (the OS wording, verbatim) only for the two failures.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsFileOpenDto {
    /// W-A4: this run created `config.toml`.
    pub template_created: bool,
    /// W-A8: the OS wording of why `config.sample.toml` could not be written.
    pub sample_error: Option<String>,
    pub result: OpenResultDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OpenResultDto {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl From<OpenOutcome> for SettingsFileOpenDto {
    fn from(outcome: OpenOutcome) -> Self {
        let (kind, message) = match outcome.result {
            OpenResult::VsCode => ("vscode", None),
            OpenResult::Association => ("association", None),
            OpenResult::NotAFile => ("not_a_file", None),
            OpenResult::OutOfScope => ("out_of_scope", None),
            OpenResult::OpenFailed(message) => ("open_failed", Some(message)),
            OpenResult::TemplateFailed(message) => ("template_failed", Some(message)),
        };
        Self { template_created: outcome.template_created, sample_error: outcome.sample_error, result: OpenResultDto { kind, message } }
    }
}

/// S-3: the association function closes on its own too (`viewer::guarded::os_open_guarded` does the same): a caller whose own scope
/// check was skipped still cannot open a program while an E2E scope is active.
fn open_by_association(file: &Path) -> Result<(), String> {
    e2e_scope::check_external_launch(file).map_err(|violation| violation.0)?;
    tauri_plugin_opener::open_path(file, None::<&str>).map_err(|e| e.to_string())
}

fn launch_editor(candidate: &Path, file: &Path, cwd: &Path) -> EditorLaunch {
    match open_file_with(candidate, file, cwd, &exists::probe, launch::spawn) {
        OpenFile::NotFound => EditorLaunch::NotFound,
        OpenFile::Started => EditorLaunch::Started,
        OpenFile::OutOfScope => EditorLaunch::OutOfScope,
        OpenFile::Failed(e) => EditorLaunch::Failed(e.to_string()),
    }
}

/// R-1555 / R-1673: the main window only. `async`: the screen is not blocked (R-1606).
#[tauri::command(async)]
pub fn settings_file_open(window: Window, app: AppHandle) -> Result<SettingsFileOpenDto, String> {
    check_main_window(window.label()).map_err(|_| "the calling window is not allowed".to_string())?;
    let config = locate(&app).map_err(|e| e.to_string())?;
    let dir = config.parent().ok_or_else(|| "the settings folder cannot be determined".to_string())?.to_path_buf();
    let paths = Paths { dir, config, local_app_data: env::local_app_data() };

    let lock = app.state::<SettingsFileLock>();
    let write_sample = |dir: &Path, contents: &str| {
        let _guard = lock.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        write_sample_if_stale(dir, contents, &atomic_write).map(|_| ())
    };
    let io = OpenIo {
        write_sample: &write_sample,
        launch_editor: &launch_editor,
        open_by_association: &open_by_association,
        scope_check: &e2e_scope::check_external_launch,
        observe: &e2e_scope::note_settings_launch,
    };
    Ok(open_settings_file(&paths, env!("CARGO_PKG_VERSION"), &io).into())
}
