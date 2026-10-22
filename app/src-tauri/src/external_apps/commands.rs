//! `external_apps/commands.rs` (SPEC-0300-0021 R-1501 / R-1555 / R-1581; SPEC-0200-0001 §3.16.2, §3.16.3, §3.16.5).
//! The two Tauri commands, both main-window only (the viewer window has no entrance, R-1555):
//!
//! - `external_apps_load()`: the start-up snapshot of the registrations (a read-only copy of the managed `Registry`; the file is
//!   not read again, R-1501).
//! - `external_app_launch(index, path, kind)`: starts the registration numbered `index` on `path`. There is NO parameter that names
//!   a program or arguments (R-1581 / AC-1524); the checks live in `guarded.rs`.

use serde::Serialize;
use tauri::{State, Window};

use super::error::{ExternalAppErrorDto, LaunchError};
use super::guarded::launch_guarded;
use super::launch;
use super::registry::{InvalidReason, Registry};
use super::target::Kind;

const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppDto {
    pub index: usize,
    pub default_no: Option<u8>,
    pub name: Option<String>,
    pub key: Option<String>,
    pub key_invalid: bool,
    /// R-1642: the line of this registration's `key` in `config.toml` (`None` for the default four).
    pub key_line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidRegistrationDto {
    pub position: usize,
    pub name: Option<String>,
    pub reason: &'static str,
    /// R-1642: the line of the failing field (or the element's header).
    pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAppsDto {
    pub apps: Vec<ExternalAppDto>,
    pub invalid: Vec<InvalidRegistrationDto>,
    pub type_error: bool,
    /// R-1642 (W-9B): the line of `external_apps` when `type_error`.
    pub type_error_line: Option<u32>,
}

/// Why a call was refused before anything happened.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CallerNotAllowed;

/// R-1555: only the main window may call.
pub fn check_main_window(label: &str) -> Result<(), CallerNotAllowed> {
    if label == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err(CallerNotAllowed)
    }
}

/// Pure: the registrations as the screen needs them (numbers, names, keys; never a program or arguments, R-1581).
pub fn registry_dto(registry: &Registry) -> ExternalAppsDto {
    ExternalAppsDto {
        apps: registry
            .apps
            .iter()
            .enumerate()
            .map(|(index, app)| ExternalAppDto {
                index,
                default_no: app.default_no,
                name: app.name.clone(),
                key: app.key.clone(),
                key_invalid: app.key_invalid,
                key_line: app.key_line,
            })
            .collect(),
        invalid: registry
            .invalid
            .iter()
            .map(|i| InvalidRegistrationDto {
                position: i.position,
                name: i.name.clone(),
                reason: match i.reason {
                    InvalidReason::Invalid => "invalid",
                    InvalidReason::Limit => "limit",
                },
                line: i.line,
            })
            .collect(),
        type_error: registry.type_error,
        type_error_line: registry.type_error_line,
    }
}

fn guard(window: &Window) -> Result<(), ExternalAppErrorDto> {
    check_main_window(window.label())
        .map_err(|_| LaunchError::Os { message: "the calling window is not allowed".to_string() }.into())
}

#[tauri::command(async)]
pub fn external_apps_load(window: Window, registry: State<'_, Registry>) -> Result<ExternalAppsDto, ExternalAppErrorDto> {
    guard(&window)?;
    Ok(registry_dto(&registry))
}

#[tauri::command(async)]
pub fn external_app_launch(
    window: Window,
    registry: State<'_, Registry>,
    index: usize,
    path: String,
    kind: Kind,
) -> Result<(), ExternalAppErrorDto> {
    guard(&window)?;
    launch_guarded(&registry, index, &path, kind, launch::spawn).map_err(ExternalAppErrorDto::from)
}
