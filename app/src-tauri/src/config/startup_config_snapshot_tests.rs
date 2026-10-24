//! TDD (unit-test-writer, 2026-10-24): `config/startup_config.rs` after the removal of `ui_theme` -- `StartupConfig { loaded }` and the
//! `config_load_keymap` DTO (SPEC-0300-0023 R-1748 / R-1821 / R-1700-1; AC-1748 / AC-1756; SPEC-0300-0022 R-1642 / R-1643 / R-1654; SPEC-0300-0010
//! R-45; SPEC-0200-0001 §3.18.3 last paragraph, §3.18.4). This file REPLACES `startup_config_tests.rs` and the `ui_theme` tests of
//! `startup_config_lines_tests.rs` (their theme tests are gone with `ThemeSetting` / `ThemeResolution`; the others are carried over here).
//!
//! Contract:
//!
//! ```ignore
//! pub struct StartupConfig { pub loaded: ConfigTomlLoadResult }          // `theme` is REMOVED (the brightness is `Appearance::dark`)
//! impl StartupConfig { pub fn from_path(&Path) -> Self; pub fn from_loaded(ConfigTomlLoadResult) -> Self; pub fn unreadable(String) -> Self; pub fn to_dto(&self) -> KeymapLoadResultDto; }
//! pub struct KeymapLoadResultDto { pub entries: Vec<KeymapRawEntryDto>, pub parse_error: Option<KeymapParseErrorDto>, pub present: bool,
//!                                  pub unknown_settings: Vec<UnknownSettingDto> }   // `ui_theme`, `ui_theme_invalid`, `ui_theme_line` are REMOVED
//! pub struct UnknownSettingDto { pub kind: &'static str /* "key" | "appField" | "tableKey" */, pub name: String,
//!                                pub table: Option<String> /* tableKey only */, pub position: Option<usize> /* appField only */, pub line: Option<u32> }
//! ```

use std::fs;
use std::path::PathBuf;

use super::startup_config::{KeymapParseErrorDto, StartupConfig, UnknownSettingDto};
use crate::shared::schema::appearance_raw::RawAppearance;
use crate::shared::schema::config_lines::UnknownSetting;

fn from_text(body: &str) -> (tempfile::TempDir, PathBuf, StartupConfig) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, body).unwrap();
    let cfg = StartupConfig::from_path(&path);
    (dir, path, cfg)
}

// ------------------------------------------------------------------ present / unreadable

#[test]
fn r1644_a_missing_file_gives_present_false_and_nothing_else() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = StartupConfig::from_path(&dir.path().join("config.toml"));
    assert_eq!(cfg.loaded.appearance, RawAppearance::default());
    let dto = cfg.to_dto();
    assert!(!dto.present);
    assert!(dto.unknown_settings.is_empty() && dto.entries.is_empty() && dto.parse_error.is_none());
}

#[test]
fn r1654_an_unreadable_file_is_present_and_has_nothing_written() {
    let (_d, _p, cfg) = from_text("this is = = not toml\n");
    assert!(cfg.to_dto().present);
    assert_eq!(cfg.loaded.appearance, RawAppearance::default(), "R-1707: everything default");
    let unreadable = StartupConfig::unreadable("cannot resolve the config folder".to_string());
    let dto = unreadable.to_dto();
    assert!(dto.present, "a path-resolution failure is W-31, never 'no file'");
    let err = dto.parse_error.expect("a notice is required");
    assert!(err.whole_file && err.message.contains("cannot resolve the config folder"));
    assert_eq!(unreadable.loaded.appearance, RawAppearance::default());
}

// ------------------------------------------------------------------ the keymap part keeps working

#[test]
fn entries_flow_through_the_snapshot_unvalidated_with_their_lines() {
    let (_d, _p, cfg) = from_text("# c\n[theme]\npreset = \"light\"\n[input_keymap_custom]\ntoggle_time = \"Ctrl+Alt+T\"\nsort_menu = 123\n");
    let mut entries = cfg.to_dto().entries;
    entries.sort_by(|a, b| a.action_id.cmp(&b.action_id));
    assert_eq!(entries.len(), 2);
    assert_eq!((entries[0].action_id.as_str(), entries[0].value.clone(), entries[0].line), ("sort_menu", None, Some(6)));
    assert_eq!((entries[1].action_id.as_str(), entries[1].value.as_deref(), entries[1].line), ("toggle_time", Some("Ctrl+Alt+T"), Some(5)));
}

#[test]
fn w_30_2_a_non_table_keymap_keeps_a_valid_appearance_and_has_its_line() {
    let (_d, _p, cfg) = from_text("theme = \"dark\"\ninput_keymap_custom = \"x\"\n");
    let err = cfg.to_dto().parse_error.expect("W-30-2");
    assert_eq!((err.whole_file, err.line), (false, Some(2)));
    assert_ne!(cfg.loaded.appearance, RawAppearance::default(), "the theme is still read (R-917-5 case 3)");
}

#[test]
fn w_31_a_syntax_error_has_its_line_and_no_unknown_settings_or_entries() {
    let (_d, _p, cfg) = from_text("theme = \"dark\"\nthis is = = not toml\n");
    let dto = cfg.to_dto();
    let err = dto.parse_error.expect("W-31");
    assert_eq!((err.whole_file, err.line), (true, Some(2)));
    assert!(dto.unknown_settings.is_empty() && dto.entries.is_empty());
}

// ------------------------------------------------------------------ AC-1748 / AC-1756: the unknown settings on the wire

#[test]
fn ac1748_ui_theme_reaches_the_screen_as_an_unknown_key_with_its_line() {
    let (_d, _p, cfg) = from_text("# c\nui_theme = \"light\"\n");
    assert_eq!(cfg.to_dto().unknown_settings, vec![UnknownSettingDto { kind: "key", name: "ui_theme".into(), table: None, position: None, line: Some(2) }]);
}

#[test]
fn ac1642_unknown_keys_table_keys_and_app_fields_reach_the_dto_in_document_order() {
    let body = "# c\nui_them = \"dark\"\nui_theme = 1\n\n[font]\nfamily = \"A\"\nweight = 700\n\n[[external_apps]]\nname = \"one\"\nprogram = \"C:\\\\t\\\\a.exe\"\nagrs = [\"{dir}\"]\n";
    let (_d, _p, cfg) = from_text(body);
    assert_eq!(
        cfg.to_dto().unknown_settings,
        vec![
            UnknownSettingDto { kind: "key", name: "ui_them".into(), table: None, position: None, line: Some(2) },
            UnknownSettingDto { kind: "key", name: "ui_theme".into(), table: None, position: None, line: Some(3) },
            UnknownSettingDto { kind: "tableKey", name: "weight".into(), table: Some("font".into()), position: None, line: Some(7) },
            UnknownSettingDto { kind: "appField", name: "agrs".into(), table: None, position: Some(1), line: Some(12) },
        ]
    );
}

#[test]
fn the_dto_of_a_table_key_is_built_from_the_domain_value() {
    let setting = UnknownSetting::TableKey { table: "layout".into(), name: "time_format".into(), line: Some(4) };
    assert_eq!(UnknownSettingDto::from(&setting), UnknownSettingDto { kind: "tableKey", name: "time_format".into(), table: Some("layout".into()), position: None, line: Some(4) });
    let none = UnknownSetting::TableKey { table: "theme".into(), name: "mode".into(), line: None };
    assert_eq!(UnknownSettingDto::from(&none).line, None, "R-1642: no number when none could be found");
}

// ------------------------------------------------------------------ snapshot semantics (R-917-8 as carried by R-1651)

#[test]
fn the_dto_is_a_snapshot_that_never_re_reads_the_file() {
    let (_d, path, cfg) = from_text("[input_keymap_custom]\ncopy = \"Ctrl+C\"\n");
    let first = cfg.to_dto();
    fs::write(&path, "[input_keymap_custom]\ncopy = \"Ctrl+D\"\n").unwrap();
    assert_eq!(cfg.to_dto(), first, "AC-957: a rewrite while running is not applied");
    fs::remove_file(&path).unwrap();
    assert_eq!(cfg.to_dto(), first);
}

#[test]
fn from_loaded_and_from_path_agree() {
    let (_d, path, via_path) = from_text("[theme]\npreset = \"Dark\"\n[input_keymap_custom]\nundo = \"Ctrl+Z\"\n");
    let via_loaded = StartupConfig::from_loaded(super::config_toml::load(&path));
    assert_eq!(via_path, via_loaded);
    assert_eq!(via_path.to_dto(), via_loaded.to_dto());
}

// ------------------------------------------------------------------ the wire form

#[test]
fn the_dto_has_no_theme_field_any_more_and_the_new_names_are_camel_case() {
    let (_d, _p, cfg) = from_text("ui_theme = \"Dark\"\n[font]\nweight = 1\n[input_keymap_custom]\ncopy = \"x\"\n");
    let s = toml::to_string(&cfg.to_dto()).expect("serialize");
    for name in ["present", "unknownSettings", "actionId"] {
        assert!(s.contains(name), "`{name}` missing from {s}");
    }
    for gone in ["uiTheme", "uiThemeInvalid", "uiThemeLine", "ui_theme_line", "unknown_settings"] {
        assert!(!s.contains(gone), "`{gone}` must not be on the wire: {s}");
    }
    let s = toml::to_string(&UnknownSettingDto { kind: "tableKey", name: "weight".into(), table: Some("font".into()), position: None, line: Some(3) }).unwrap();
    assert!(s.contains("kind = \"tableKey\"") && s.contains("table = \"font\"") && s.contains("line = 3"), "{s}");
    let s = toml::to_string(&KeymapParseErrorDto { message: "x".into(), line: Some(2), whole_file: true }).unwrap();
    assert!(s.contains("wholeFile = true"), "{s}");
}
