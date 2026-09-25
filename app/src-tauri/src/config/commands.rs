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
use crate::shared::schema::navigation::NavigationData;

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
}
