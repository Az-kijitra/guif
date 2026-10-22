//! Tauri commands `config_load_navigation` / `config_save_navigation`
//! (SPEC-0300-0013 R-240, R-253-1; SPEC-0200-0001 §3.2.2, MUST-48(c)).
//! Planned API (not yet implemented, TDD):
//!
//! ```ignore
//! pub struct NavigationIoLock(pub std::sync::Mutex<()>);   // + Default
//! #[serde(rename_all = "camelCase")] pub struct NavigationDataDto { visit_history, jump_list, search_history }
//! #[serde(rename_all = "camelCase")] pub struct NavigationLoadResultDto { data: NavigationDataDto, recovered_from_corruption: bool }
//! impl From<NavigationData> for NavigationDataDto (and reverse); impl From<NavigationLoadResult> for NavigationLoadResultDto
//! ```
//! The `#[tauri::command]` fns themselves need an AppHandle/State and are not
//! unit-testable here without new dev-dependencies; the tests below cover the
//! lock type, the DTO mapping, and the lock+save serialization pattern the
//! commands are specified to use.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use super::navigation::{self, NavigationLoadResult};
use super::paths;
use super::startup_config::{KeymapLoadResultDto, StartupConfig};
use super::ui_state::{self, UiStateLoadResult};
use crate::shared::schema::navigation::NavigationData;
use crate::shared::schema::ui_state::UiStateData;

// SPEC-0200-0001 §3.6.1/§3.6.11.3/§3.6.11.11 (SHOULD-117): `UiStateIoLock`
// lives HERE (not in `config/ui_state.rs`), matching the existing
// `NavigationIoLock` placement precedent (the two prior traceability.md
// mentions of `config/ui_state.rs` for this lock were a documentation
// inconsistency the guardian flagged; this file is the single source of
// truth for IoLock types).

/// Serializes navigation.toml load/save (MUST-48(c)).
pub struct NavigationIoLock(pub Mutex<()>);

impl Default for NavigationIoLock {
    fn default() -> Self {
        Self(Mutex::new(()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationDataDto {
    pub visit_history: Vec<String>,
    pub jump_list: Vec<String>,
    pub search_history: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationLoadResultDto {
    pub data: NavigationDataDto,
    pub recovered_from_corruption: bool,
}

impl From<NavigationData> for NavigationDataDto {
    fn from(d: NavigationData) -> Self {
        Self {
            visit_history: d.visit_history,
            jump_list: d.jump_list,
            search_history: d.search_history,
        }
    }
}

impl From<NavigationDataDto> for NavigationData {
    fn from(d: NavigationDataDto) -> Self {
        Self {
            visit_history: d.visit_history,
            jump_list: d.jump_list,
            search_history: d.search_history,
        }
    }
}

impl From<NavigationLoadResult> for NavigationLoadResultDto {
    fn from(r: NavigationLoadResult) -> Self {
        Self { data: r.data.into(), recovered_from_corruption: r.recovered_from_corruption }
    }
}

#[tauri::command]
pub fn config_load_navigation(
    lock: State<NavigationIoLock>,
    app: AppHandle,
) -> Result<NavigationLoadResultDto, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = paths::navigation_path(&app).map_err(|e| e.to_string())?;
    navigation::load(&path).map(Into::into).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_save_navigation(
    lock: State<NavigationIoLock>,
    app: AppHandle,
    data: NavigationDataDto,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = paths::navigation_path(&app).map_err(|e| e.to_string())?;
    navigation::save(&path, &data.into()).map_err(|e| e.to_string())
}
// ---------------------------------------------------------------------
// SPEC-0300-0010 R-45 / SPEC-0300-0017 R-917 (SPEC-0200-0001 §3.6.1/§3.11.2/§3.11.4): `config.toml` is read ONCE at startup
// (`StartupConfig::load`, R-917-8; `StartupConfig` and its DTOs moved to `config/startup_config.rs` by SPEC-0200-0001 §3.17.3),
// read-only; `config_load_keymap` serves that snapshot. No IoLock (nothing is written and nothing re-reads the file).
// ---------------------------------------------------------------------

// Serves the snapshot taken at startup; it never opens `config.toml` (R-917-8).
#[tauri::command(async)]
pub fn config_load_keymap(startup: State<StartupConfig>) -> Result<KeymapLoadResultDto, String> {
    Ok(startup.to_dto())
}

// ---------------------------------------------------------------------
// SPEC-0300-0009 R-77 (SPEC-0200-0001 §3.6.1/§3.6.11.11 SHOULD-117):
// `ui-state.toml` load/save. `UiStateIoLock` lives here, matching
// `NavigationIoLock`'s placement (not in `config/ui_state.rs`).
// ---------------------------------------------------------------------

/// Serializes `ui-state.toml` load/save (same role as `NavigationIoLock`).
pub struct UiStateIoLock(pub Mutex<()>);

impl Default for UiStateIoLock {
    fn default() -> Self {
        Self(Mutex::new(()))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiStateDataDto {
    pub ui_show_hidden: bool,
    pub ui_show_size: bool,
    pub ui_show_time: bool,
    pub ui_show_tree: bool,
    pub sort_key: String,
    pub sort_order: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiStateLoadResultDto {
    pub data: UiStateDataDto,
    pub recovered_from_corruption: bool,
}

impl From<UiStateData> for UiStateDataDto {
    fn from(d: UiStateData) -> Self {
        Self {
            ui_show_hidden: d.ui_show_hidden,
            ui_show_size: d.ui_show_size,
            ui_show_time: d.ui_show_time,
            ui_show_tree: d.ui_show_tree,
            sort_key: d.sort_key,
            sort_order: d.sort_order,
        }
    }
}

impl From<UiStateDataDto> for UiStateData {
    fn from(d: UiStateDataDto) -> Self {
        Self {
            ui_show_hidden: d.ui_show_hidden,
            ui_show_size: d.ui_show_size,
            ui_show_time: d.ui_show_time,
            ui_show_tree: d.ui_show_tree,
            sort_key: d.sort_key,
            sort_order: d.sort_order,
        }
    }
}

impl From<UiStateLoadResult> for UiStateLoadResultDto {
    fn from(r: UiStateLoadResult) -> Self {
        Self { data: r.data.into(), recovered_from_corruption: r.recovered_from_corruption }
    }
}

#[tauri::command(async)]
pub fn ui_state_load(lock: State<UiStateIoLock>, app: AppHandle) -> Result<UiStateLoadResultDto, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = paths::ui_state_path(&app).map_err(|e| e.to_string())?;
    ui_state::load(&path).map(Into::into).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn ui_state_save(lock: State<UiStateIoLock>, app: AppHandle, data: UiStateDataDto) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = paths::ui_state_path(&app).map_err(|e| e.to_string())?;
    ui_state::save(&path, &data.into()).map_err(|e| e.to_string())
}
