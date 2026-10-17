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

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use super::navigation::{self, NavigationLoadResult};
use super::paths;
use crate::shared::schema::navigation::NavigationData;

// SPEC-0200-0001 §3.6.1/§3.6.11.3/§3.6.11.11 (SHOULD-117): `UiStateIoLock`
// lives HERE (not in `config/ui_state.rs`), matching the existing
// `NavigationIoLock` placement precedent (the two prior traceability.md
// mentions of `config/ui_state.rs` for this lock were a documentation
// inconsistency the guardian flagged; this file is the single source of
// truth for IoLock types).
use super::config_toml::{self, ConfigTomlLoadResult, KeymapParseError, KeymapRawLoadResult};
use super::ui_state::{self, UiStateLoadResult};
use crate::shared::schema::external_apps::ExternalAppsRaw;
use crate::shared::schema::ui_state::UiStateData;
use crate::shared::schema::ui_theme::{interpret_ui_theme, ThemeResolution, ThemeSetting, UiThemeRaw};

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
// SPEC-0300-0010 R-45 / SPEC-0300-0017 R-917 (SPEC-0200-0001 §3.6.1/§3.11.2/§3.11.4): `config.toml` is
// read ONCE at startup (`StartupConfig::load`, R-917-8), read-only; `config_load_keymap` serves that
// snapshot. No IoLock (nothing is written and nothing re-reads the file).
// ---------------------------------------------------------------------

/// The start-up snapshot of `config.toml` (`.manage()`d by `lib.rs` after the one and only read).
/// Changes made to the file while the app runs are not applied until a restart (R-917-2), and a page
/// reload does not read the file again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartupConfig {
    pub loaded: ConfigTomlLoadResult,
    pub theme: ThemeResolution,
}

impl StartupConfig {
    /// The single place that resolves the `config.toml` path (SHOULD-183 (a)); the path goes to
    /// `from_path` and nowhere else (SHOULD-183 (c)). A path-resolution failure is handled like an
    /// unreadable file (R-917-5 (2)); an invalid `REFLEXFILES_CONFIG_DIR` was already rejected by `lib.rs`.
    pub fn load(app: &AppHandle) -> Self {
        match paths::config_path(app) {
            Ok(path) => Self::from_path(&path),
            Err(e) => Self::unreadable(e.to_string()),
        }
    }

    pub fn from_path(path: &Path) -> Self {
        Self::from_loaded(config_toml::load(path))
    }

    pub fn from_loaded(loaded: ConfigTomlLoadResult) -> Self {
        let theme = interpret_ui_theme(&loaded.ui_theme);
        Self { loaded, theme }
    }

    /// R-917-5 (2) without a file read: the whole file counts as unreadable and the theme follows the OS.
    pub fn unreadable(message: String) -> Self {
        Self::from_loaded(ConfigTomlLoadResult {
            keymap: KeymapRawLoadResult {
                entries: Vec::new(),
                parse_error: Some(KeymapParseError { message, line: None, whole_file: true }),
            },
            ui_theme: UiThemeRaw::Missing,
            external_apps: ExternalAppsRaw::Missing,
        })
    }

    /// What `config_load_keymap` returns: a copy of the snapshot, no file access.
    pub fn to_dto(&self) -> KeymapLoadResultDto {
        let keymap = &self.loaded.keymap;
        KeymapLoadResultDto {
            entries: keymap
                .entries
                .iter()
                .map(|e| KeymapRawEntryDto { action_id: e.action_id.clone(), value: e.value.clone() })
                .collect(),
            parse_error: keymap.parse_error.as_ref().map(|e| KeymapParseErrorDto {
                message: e.message.clone(),
                line: e.line,
                whole_file: e.whole_file,
            }),
            ui_theme: match self.theme.setting {
                ThemeSetting::System => "system",
                ThemeSetting::Light => "light",
                ThemeSetting::Dark => "dark",
            }
            .to_string(),
            ui_theme_invalid: self.theme.invalid,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapRawEntryDto {
    pub action_id: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapParseErrorDto {
    pub message: String,
    pub line: Option<u32>,
    pub whole_file: bool,
}

/// The command keeps its name (§3.11.4) although it now carries the whole `config.toml` snapshot.
/// `ui_theme` is the interpreted value, a public value for verification only (the screen's brightness is
/// decided by CSS, not by this).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapLoadResultDto {
    pub entries: Vec<KeymapRawEntryDto>,
    pub ui_theme: String,
    pub ui_theme_invalid: bool,
    pub parse_error: Option<KeymapParseErrorDto>,
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::navigation::{self, NavigationLoadResult};
    use crate::shared::schema::navigation::NavigationData;
    use std::sync::Arc;
    use std::thread;

    // MUST-48(c): concurrent saves under NavigationIoLock leave exactly one
    // complete write (never a torn/mixed file).
    #[test]
    fn concurrent_saves_under_the_lock_yield_one_complete_write() {
        let dir = tempfile::tempdir().unwrap();
        let path = Arc::new(dir.path().join("navigation.toml"));
        let lock = Arc::new(NavigationIoLock::default());

        let datasets: Vec<NavigationData> = (0..8)
            .map(|t| NavigationData {
                visit_history: (0..50).map(|i| format!("C:\\thread{t}\\dir{i}")).collect(),
                jump_list: (0..20).map(|i| format!("C:\\thread{t}\\jump{i}")).collect(),
                search_history: (0..20).map(|i| format!("t{t}-q{i}")).collect(),
            })
            .collect();

        let handles: Vec<_> = datasets
            .iter()
            .cloned()
            .map(|data| {
                let (path, lock) = (path.clone(), lock.clone());
                thread::spawn(move || {
                    for _ in 0..10 {
                        let _g = lock.0.lock().expect("lock");
                        navigation::save(&path, &data).expect("save");
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }

        let r = navigation::load(&path).expect("final file must parse");
        assert!(!r.recovered_from_corruption);
        assert!(datasets.contains(&r.data), "final content must equal exactly one thread's dataset");
    }

    // Load and save share one lock: holding it blocks a second acquirer.
    #[test]
    fn lock_is_exclusive() {
        let lock = NavigationIoLock::default();
        let g = lock.0.lock().unwrap();
        assert!(lock.0.try_lock().is_err());
        drop(g);
        assert!(lock.0.try_lock().is_ok());
    }

    // IPC DTO mapping keeps all three lists.
    #[test]
    fn dto_conversion_preserves_the_three_lists_both_ways() {
        let data = NavigationData {
            visit_history: vec!["a".into()],
            jump_list: vec!["b".into()],
            search_history: vec!["c".into()],
        };
        let dto: NavigationDataDto = data.clone().into();
        assert_eq!(dto.visit_history, vec!["a".to_string()]);
        assert_eq!(dto.jump_list, vec!["b".to_string()]);
        assert_eq!(dto.search_history, vec!["c".to_string()]);
        let back: NavigationData = dto.into();
        assert_eq!(back, data);
    }

    #[test]
    fn load_result_dto_carries_recovered_flag() {
        let r = NavigationLoadResult { data: NavigationData::default(), recovered_from_corruption: true };
        let dto: NavigationLoadResultDto = r.into();
        assert!(dto.recovered_from_corruption);
    }

    // Wire format is camelCase (shared/ipc/config.ts). Checked through the
    // already-available `toml` serializer since rename_all is format-agnostic
    // (serde_json is not a dependency; adding it needs approval).
    #[test]
    fn dto_serializes_with_camel_case_keys() {
        let dto = NavigationLoadResultDto {
            data: NavigationDataDto {
                visit_history: vec!["a".into()],
                jump_list: vec![],
                search_history: vec![],
            },
            recovered_from_corruption: false,
        };
        let s = toml::to_string(&dto).expect("serialize");
        assert!(s.contains("visitHistory"));
        assert!(s.contains("jumpList"));
        assert!(s.contains("searchHistory"));
        assert!(s.contains("recoveredFromCorruption"));
        assert!(!s.contains("visit_history"));
    }

    // ---------------------------------------------------------------
    // SPEC-0300-0010 R-45 / SPEC-0200-0001 §3.6.11.3: config_load_keymap DTO.
    // ---------------------------------------------------------------

    #[test]
    fn keymap_dto_conversion_preserves_entries_and_maps_non_string_values_to_none() {
        use crate::config::config_toml::RawKeymapEntry;
        let r = KeymapRawLoadResult {
            entries: vec![
                RawKeymapEntry { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()) },
                RawKeymapEntry { action_id: "sort_menu".into(), value: None },
            ],
            parse_error: None,
        };
        let dto = StartupConfig::from_loaded(ConfigTomlLoadResult { keymap: r, ui_theme: UiThemeRaw::Missing, external_apps: ExternalAppsRaw::Missing }).to_dto();
        assert_eq!(dto.entries.len(), 2);
        assert_eq!(dto.entries[0], KeymapRawEntryDto { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()) });
        assert_eq!(dto.entries[1], KeymapRawEntryDto { action_id: "sort_menu".into(), value: None });
        assert!(dto.parse_error.is_none());
    }

    #[test]
    fn keymap_dto_carries_the_parse_error_with_its_line_number() {
        let r = KeymapRawLoadResult { entries: vec![], parse_error: Some(KeymapParseError { message: "bad toml".into(), line: Some(3), whole_file: true }) };
        let dto = StartupConfig::from_loaded(ConfigTomlLoadResult { keymap: r, ui_theme: UiThemeRaw::Missing, external_apps: ExternalAppsRaw::Missing }).to_dto();
        assert_eq!(dto.parse_error, Some(KeymapParseErrorDto { message: "bad toml".into(), line: Some(3), whole_file: true }));
    }

    // Wire format is camelCase (shared/ipc/config.ts's configLoadKeymap()).
    #[test]
    fn keymap_dto_serializes_with_camel_case_keys() {
        let dto = KeymapLoadResultDto {
            entries: vec![KeymapRawEntryDto { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()) }],
            parse_error: Some(KeymapParseErrorDto { message: "x".into(), line: None, whole_file: false }),
            ui_theme: "system".into(),
            ui_theme_invalid: false,
        };
        let s = toml::to_string(&dto).expect("serialize");
        assert!(s.contains("actionId"));
        assert!(s.contains("parseError"));
        assert!(!s.contains("action_id"));
        assert!(!s.contains("parse_error"));
    }

    // ---------------------------------------------------------------
    // SPEC-0300-0009 R-77 / SPEC-0200-0001 §3.6.11.11 SHOULD-117: UiStateIoLock
    // and the ui_state_load/ui_state_save DTOs (same shape as Navigation's).
    // ---------------------------------------------------------------

    #[test]
    fn ui_state_io_lock_is_exclusive() {
        let lock = UiStateIoLock::default();
        let g = lock.0.lock().unwrap();
        assert!(lock.0.try_lock().is_err());
        drop(g);
        assert!(lock.0.try_lock().is_ok());
    }

    #[test]
    fn ui_state_dto_conversion_preserves_all_six_fields_both_ways() {
        let data = UiStateData {
            ui_show_hidden: true,
            ui_show_size: false,
            ui_show_time: true,
            ui_show_tree: false,
            sort_key: "size".to_string(),
            sort_order: "desc".to_string(),
        };
        let dto: UiStateDataDto = data.clone().into();
        assert!(dto.ui_show_hidden);
        assert!(!dto.ui_show_size);
        assert_eq!(dto.sort_key, "size");
        let back: UiStateData = dto.into();
        assert_eq!(back, data);
    }

    #[test]
    fn ui_state_load_result_dto_carries_recovered_flag() {
        let r = UiStateLoadResult { data: UiStateData::default(), recovered_from_corruption: true };
        let dto: UiStateLoadResultDto = r.into();
        assert!(dto.recovered_from_corruption);
    }

    #[test]
    fn ui_state_dto_serializes_with_camel_case_keys() {
        let data: UiStateDataDto = UiStateData::default().into();
        let dto = UiStateLoadResultDto { data, recovered_from_corruption: false };
        let s = toml::to_string(&dto).expect("serialize");
        assert!(s.contains("uiShowHidden"));
        assert!(s.contains("uiShowSize"));
        assert!(s.contains("uiShowTime"));
        assert!(s.contains("uiShowTree"));
        assert!(s.contains("sortKey"));
        assert!(s.contains("sortOrder"));
        assert!(s.contains("recoveredFromCorruption"));
        assert!(!s.contains("ui_show_hidden"));
    }
}
