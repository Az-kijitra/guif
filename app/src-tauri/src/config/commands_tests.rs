//! The unit tests of `config/commands.rs` (navigation / ui-state IoLocks and DTOs) and of the `config_load_keymap` DTO.
//! Moved unchanged out of the inline `mod tests` of `commands.rs` (SPEC-0200-0001 §3.17.13: `commands.rs` stays under 300 lines
//! after `StartupConfig` and its DTOs moved to `startup_config.rs`); only the imports and the new DTO fields differ.

use super::commands::*;
use super::config_toml::{ConfigTomlLoadResult, KeymapParseError, KeymapRawLoadResult};
use super::navigation::{self, NavigationLoadResult};
use super::ui_state::UiStateLoadResult;
use super::startup_config::{KeymapLoadResultDto, KeymapParseErrorDto, KeymapRawEntryDto, StartupConfig};
use crate::shared::schema::external_apps::ExternalAppsRaw;
use crate::shared::schema::navigation::NavigationData;
use crate::shared::schema::ui_state::UiStateData;
use crate::shared::schema::ui_theme::UiThemeRaw;
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
    let dto = StartupConfig::from_loaded(ConfigTomlLoadResult { keymap: r, ui_theme: UiThemeRaw::Missing, external_apps: ExternalAppsRaw::Missing, ..ConfigTomlLoadResult::default() }).to_dto();
    assert_eq!(dto.entries.len(), 2);
    assert_eq!(dto.entries[0], KeymapRawEntryDto { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()), line: None });
    assert_eq!(dto.entries[1], KeymapRawEntryDto { action_id: "sort_menu".into(), value: None, line: None });
    assert!(dto.parse_error.is_none());
}

#[test]
fn keymap_dto_carries_the_parse_error_with_its_line_number() {
    let r = KeymapRawLoadResult { entries: vec![], parse_error: Some(KeymapParseError { message: "bad toml".into(), line: Some(3), whole_file: true }) };
    let dto = StartupConfig::from_loaded(ConfigTomlLoadResult { keymap: r, ui_theme: UiThemeRaw::Missing, external_apps: ExternalAppsRaw::Missing, ..ConfigTomlLoadResult::default() }).to_dto();
    assert_eq!(dto.parse_error, Some(KeymapParseErrorDto { message: "bad toml".into(), line: Some(3), whole_file: true }));
}

// Wire format is camelCase (shared/ipc/config.ts's configLoadKeymap()).
#[test]
fn keymap_dto_serializes_with_camel_case_keys() {
    let dto = KeymapLoadResultDto {
        entries: vec![KeymapRawEntryDto { action_id: "toggle_hidden".into(), value: Some("Ctrl+Alt+H".into()), line: None }],
        parse_error: Some(KeymapParseErrorDto { message: "x".into(), line: None, whole_file: false }),
        ui_theme: "system".into(),
        ui_theme_invalid: false,
        ui_theme_line: None,
        present: true,
        unknown_settings: vec![],
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
