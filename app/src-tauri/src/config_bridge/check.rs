//! The command `settings_file_check`: the backend of "設定ファイルのチェック" (SPEC-0300-0022 R-1650 .. R-1654, R-1656;
//! SPEC-0200-0001 §3.17.3 / §3.17.6).
//!
//! It reads `config.toml` AGAIN through the same function as start-up (`evaluate::snapshot`, R-1651) and returns the same two DTOs
//! the start-up commands serve (`config_load_keymap`, `external_apps_load`), so the screen builds the same sentences. It is a
//! non-reflecting read (R-1652): it `.manage()`s nothing, so the keymap, the theme, the registrations and the menu stay as they
//! were at start-up. It creates, writes and renames nothing (R-1653) -- no scaffold, no sample.

use std::ffi::OsString;
use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Window};

use super::evaluate::{snapshot, snapshot_at};
use crate::appearance::dto::{appearance_dto, AppearanceDto};
use crate::config::startup_config::KeymapLoadResultDto;
use crate::external_apps::commands::{check_main_window, registry_dto, ExternalAppsDto};

/// `keymap` is what `config_load_keymap` returns; `external_apps` what `external_apps_load` returns (camelCase on the wire).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigCheckDto {
    pub keymap: KeymapLoadResultDto,
    pub external_apps: ExternalAppsDto,
    pub appearance: AppearanceDto,
}

/// The pure core of the command, on an explicit path and environment.
pub fn check_at(path: &Path, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> ConfigCheckDto {
    let (startup, registry, appearance) = snapshot_at(path, env, path_var);
    ConfigCheckDto { keymap: startup.to_dto(), external_apps: registry_dto(&registry), appearance: appearance_dto(&appearance) }
}

/// R-1555 / R-1673: the main window only. No parameter names a path, a program or an argument (R-1605).
#[tauri::command(async)]
pub fn settings_file_check(window: Window, app: AppHandle) -> Result<ConfigCheckDto, String> {
    check_main_window(window.label()).map_err(|_| "the calling window is not allowed".to_string())?;
    let (startup, registry, appearance) = snapshot(&app);
    Ok(ConfigCheckDto { keymap: startup.to_dto(), external_apps: registry_dto(&registry), appearance: appearance_dto(&appearance) })
}
