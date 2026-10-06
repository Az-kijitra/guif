//! Phase 12 tests (unit-test-writer, 2026-10-06): `StartupConfig` (the one-time `config.toml` snapshot) and the
//! `config_load_keymap` DTO's new fields.
//! Specs: SPEC-0300-0017 R-917-2 (changes made while the app runs are not applied until a restart), R-917-4 /
//! R-917-5 (what is reported), R-917-8 (the file is read once), AC-950, AC-957, AC-958, AC-959;
//! SPEC-0200-0001 §3.11.2 (`StartupConfig`), §3.11.4 (DTO: `wholeFile` / `uiTheme` / `uiThemeInvalid`,
//! camelCase), §3.11.12 (3).
//!
//! `StartupConfig::load(&AppHandle)` needs an `AppHandle`, which a unit test cannot build, so these tests use the
//! AppHandle-free seams it is built from: `from_path`, `from_loaded`, `unreadable` and `to_dto` (what
//! `config_load_keymap` returns: a snapshot, no file access).

use std::fs;
use std::path::PathBuf;

use super::commands::{KeymapLoadResultDto, KeymapParseErrorDto, StartupConfig};
use crate::shared::schema::ui_theme::ThemeSetting;

fn from_text(body: &str) -> (tempfile::TempDir, PathBuf, StartupConfig) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, body).unwrap();
    let cfg = StartupConfig::from_path(&path);
    (dir, path, cfg)
}

// ------------------------------------------------------------------ theme resolution inside the snapshot

#[test]
fn a_missing_file_follows_the_os_with_no_notice_and_no_parse_error() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = StartupConfig::from_path(&dir.path().join("config.toml"));
    assert_eq!(cfg.theme.setting, ThemeSetting::System);
    assert!(!cfg.theme.invalid);
    let dto = cfg.to_dto();
    assert_eq!(dto.ui_theme, "system");
    assert!(!dto.ui_theme_invalid);
    assert!(dto.parse_error.is_none());
    assert!(dto.entries.is_empty());
}

// AC-950: the config.toml axis, end to end through the snapshot.
#[test]
fn ui_theme_values_map_to_the_dto_as_the_design_table_says() {
    let cases: [(&str, &str, bool); 12] = [
        ("", "system", false),                         // key missing
        ("ui_theme = \"light\"\n", "light", false),
        ("ui_theme = \"dark\"\n", "dark", false),
        ("ui_theme = \"system\"\n", "system", false),
        ("ui_theme = \"Dark\"\n", "system", true),
        ("ui_theme = \" dark\"\n", "system", true),
        ("ui_theme = \"\"\n", "system", true),
        ("ui_theme = 1\n", "system", true),
        ("ui_theme = true\n", "system", true),
        ("ui_theme = []\n", "system", true),
        ("ui_theme = { mode = \"dark\" }\n", "system", true),
        ("ui_theme = 1.5\n", "system", true),
    ];
    for (body, theme, invalid) in cases {
        let (_d, _p, cfg) = from_text(body);
        let dto = cfg.to_dto();
        assert_eq!((dto.ui_theme.as_str(), dto.ui_theme_invalid), (theme, invalid), "body {body:?}");
        assert!(dto.parse_error.is_none(), "body {body:?}");
    }
}

// R-917-5 case 2 (AC-959 (ii)): the whole file cannot be read -> both default; NO separate theme notice.
#[test]
fn a_syntax_error_defaults_both_and_raises_no_theme_notice() {
    let (_d, _p, cfg) = from_text("ui_theme = \"dark\"\nthis is = = not toml [[[\n");
    let dto = cfg.to_dto();
    let err = dto.parse_error.expect("R-45-2 notice");
    assert!(err.whole_file, "R-45-2's text will mention the default theme");
    assert_eq!(dto.ui_theme, "system");
    assert!(!dto.ui_theme_invalid, "the theme gets no notice of its own in this case");
}

// R-917-5 case 3 (AC-959 (iii), 確定 #16): input_keymap_custom of the wrong type, ui_theme still applies.
#[test]
fn a_wrong_typed_keymap_table_keeps_a_valid_theme() {
    let (_d, _p, cfg) = from_text("ui_theme = \"dark\"\ninput_keymap_custom = \"Ctrl+X\"\n");
    assert_eq!(cfg.theme.setting, ThemeSetting::Dark);
    let dto = cfg.to_dto();
    let err = dto.parse_error.expect("R-45-2 notice");
    assert!(!err.whole_file, "the notice must not mention the theme");
    assert_eq!(dto.ui_theme, "dark");
    assert!(!dto.ui_theme_invalid);
}

#[test]
fn a_wrong_typed_keymap_table_with_an_invalid_theme_reports_both() {
    let (_d, _p, cfg) = from_text("ui_theme = 1\ninput_keymap_custom = \"Ctrl+X\"\n");
    let dto = cfg.to_dto();
    assert!(!dto.parse_error.expect("R-45-2 notice").whole_file);
    assert_eq!(dto.ui_theme, "system");
    assert!(dto.ui_theme_invalid);
}

// R-917-5 case 2 via path-resolution failure: the same "whole file unreadable" outcome.
#[test]
fn unreadable_is_a_whole_file_failure_following_the_os() {
    let cfg = StartupConfig::unreadable("cannot resolve the config folder".to_string());
    assert_eq!(cfg.theme.setting, ThemeSetting::System);
    let dto = cfg.to_dto();
    let err = dto.parse_error.expect("a notice is required");
    assert!(err.whole_file);
    assert!(err.message.contains("cannot resolve the config folder"));
    assert_eq!(dto.ui_theme, "system");
    assert!(!dto.ui_theme_invalid);
}

// ------------------------------------------------------------------ the keymap part keeps working

#[test]
fn entries_flow_through_the_snapshot_unvalidated() {
    let (_d, _p, cfg) = from_text("ui_theme = \"light\"\n[input_keymap_custom]\ntoggle_time = \"Ctrl+Alt+T\"\nsort_menu = 123\n");
    let mut entries = cfg.to_dto().entries;
    entries.sort_by(|a, b| a.action_id.cmp(&b.action_id));
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].action_id, "sort_menu");
    assert_eq!(entries[0].value, None);
    assert_eq!(entries[1].action_id, "toggle_time");
    assert_eq!(entries[1].value.as_deref(), Some("Ctrl+Alt+T"));
}

// ------------------------------------------------------------------ snapshot semantics (R-917-2 / R-917-8)

// The DTO is a snapshot: deleting or rewriting config.toml afterwards changes nothing, and calling
// `to_dto` repeatedly (e.g. a page reload) never reads the file again.
#[test]
fn the_dto_is_a_snapshot_that_never_re_reads_the_file() {
    let (_d, path, cfg) = from_text("ui_theme = \"dark\"\n");
    let first = cfg.to_dto();

    fs::write(&path, "ui_theme = \"light\"\n").unwrap();
    assert_eq!(cfg.to_dto(), first, "AC-957: a rewrite while running is not applied");

    fs::remove_file(&path).unwrap();
    assert_eq!(cfg.to_dto(), first, "AC-957: removing the line / file while running is not applied");
    assert_eq!(first.ui_theme, "dark");
}

#[test]
fn from_loaded_and_from_path_agree() {
    let (_d, path, via_path) = from_text("ui_theme = \"Dark\"\n[input_keymap_custom]\nundo = \"Ctrl+Z\"\n");
    let loaded = super::config_toml::load(&path);
    let via_loaded = StartupConfig::from_loaded(loaded);
    assert_eq!(via_path.to_dto(), via_loaded.to_dto());
}

// ------------------------------------------------------------------ DTO wire format (camelCase)

// Checked through the `toml` serializer like the other DTO tests (serde_json is not a dependency).
// `toml` cannot emit a plain value after a table, so the pieces are serialized separately.
#[test]
fn the_parse_error_dto_serializes_whole_file_in_camel_case() {
    let dto = KeymapParseErrorDto { message: "x".into(), line: Some(2), whole_file: true };
    let s = toml::to_string(&dto).expect("serialize");
    assert!(s.contains("wholeFile"), "{s}");
    assert!(!s.contains("whole_file"), "{s}");
    assert!(s.contains("wholeFile = true"), "{s}");
}

#[test]
fn the_result_dto_serializes_ui_theme_fields_in_camel_case() {
    let dto = KeymapLoadResultDto {
        entries: vec![],
        parse_error: None,
        ui_theme: "dark".into(),
        ui_theme_invalid: true,
    };
    let s = toml::to_string(&dto).expect("serialize");
    assert!(s.contains("uiTheme = \"dark\""), "{s}");
    assert!(s.contains("uiThemeInvalid = true"), "{s}");
    assert!(!s.contains("ui_theme"), "{s}");
}
