//! TDD (unit-test-writer, 2026-10-20): `config/startup_config.rs` -- `StartupConfig` and the `config_load_keymap` DTO carrying the
//! lines, `present` and the unknown settings (SPEC-0300-0022 R-1642 / R-1643 / R-1654; SPEC-0200-0001 §3.17.3 / §3.17.6).
//!
//! `StartupConfig` and its DTOs move from `config/commands.rs` to `config/startup_config.rs` (same API; `commands.rs` keeps the IoLocks,
//! the navigation / ui-state commands and the thin `config_load_keymap`). The existing `startup_config_tests.rs` still imports from
//! `super::commands`; code-generator changes that one import line to `super::startup_config`.
//!
//! ```ignore
//! // config/startup_config.rs
//! pub fn locate(app: &AppHandle) -> io::Result<PathBuf>;   // the ONLY place that calls `paths::config_path(` (SHOULD-183 (a))
//! pub struct KeymapRawEntryDto { pub action_id: String, pub value: Option<String>, pub line: Option<u32> }       // + line
//! pub struct KeymapParseErrorDto { message, line: Option<u32>, whole_file }                                       // unchanged
//! pub struct UnknownSettingDto { pub kind: &'static str /* "key" | "appField" */, pub name: String,
//!                                pub position: Option<usize> /* 1-based, appField only */, pub line: Option<u32> }
//! pub struct KeymapLoadResultDto { entries, ui_theme, ui_theme_invalid, parse_error,
//!                                  pub ui_theme_line: Option<u32>, pub present: bool, pub unknown_settings: Vec<UnknownSettingDto> }
//! // all `#[derive(Debug, Clone, PartialEq, Eq, Serialize)] #[serde(rename_all = "camelCase")]`
//! ```
//! (`serde_json` is not a dependency; the wire names are checked through the `toml` serializer like the existing DTO tests.)

use std::fs;
use std::path::PathBuf;

use super::startup_config::{KeymapLoadResultDto, StartupConfig, UnknownSettingDto};

fn from_text(body: &str) -> (tempfile::TempDir, PathBuf, StartupConfig) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, body).unwrap();
    let cfg = StartupConfig::from_path(&path);
    (dir, path, cfg)
}

// R-1644 / R-1654: no file => `present: false` (W-AB) and nothing else.
#[test]
fn r1644_a_missing_file_gives_present_false_and_empty_lines() {
    let dir = tempfile::tempdir().unwrap();
    let dto = StartupConfig::from_path(&dir.path().join("config.toml")).to_dto();
    assert!(!dto.present);
    assert_eq!(dto.ui_theme_line, None);
    assert!(dto.unknown_settings.is_empty() && dto.entries.is_empty() && dto.parse_error.is_none());
}

// R-1654: an unreadable file is present (W-31 is shown, not W-AB).
#[test]
fn r1654_an_unreadable_file_is_present_in_the_dto() {
    let (_d, _p, cfg) = from_text("this is = = not toml\n");
    assert!(cfg.to_dto().present);
    assert!(StartupConfig::unreadable("path could not be resolved".into()).to_dto().present, "a path-resolution failure is reported as W-31, never as 'no file'");
}

// R-1642 / W-33: the line of ui_theme; W-32: the line of each entry; both reach the screen.
#[test]
fn r1642_the_dto_carries_the_theme_line_and_each_entry_line() {
    let (_d, _p, cfg) = from_text("# c\nui_theme = \"Dark\"\n[input_keymap_custom]\ncopy = \"Ctrl+\"\ntoggle_time = \"Ctrl+Alt+T\"\n");
    let dto = cfg.to_dto();
    assert!(dto.ui_theme_invalid);
    assert_eq!(dto.ui_theme_line, Some(2));
    let line_of = |id: &str| dto.entries.iter().find(|e| e.action_id == id).unwrap().line;
    assert_eq!(line_of("copy"), Some(4));
    assert_eq!(line_of("toggle_time"), Some(5));
}

// W-30-2: the parse error of a non-table input_keymap_custom has its line in the DTO.
#[test]
fn w_30_2_the_parse_error_dto_carries_the_line_of_a_non_table() {
    let (_d, _p, cfg) = from_text("ui_theme = \"dark\"\ninput_keymap_custom = \"x\"\n");
    let err = cfg.to_dto().parse_error.expect("W-30-2");
    assert_eq!((err.whole_file, err.line), (false, Some(2)));
}

// W-31: a syntax error keeps its line; no setting is named.
#[test]
fn w_31_a_syntax_error_has_its_line_and_no_unknown_settings_or_entry_lines() {
    let (_d, _p, cfg) = from_text("ui_theme = \"dark\"\nthis is = = not toml\n");
    let dto = cfg.to_dto();
    assert_eq!(dto.parse_error.expect("W-31").line, Some(2));
    assert!(dto.unknown_settings.is_empty() && dto.entries.is_empty());
    assert_eq!(dto.ui_theme_line, None);
}

// AC-1642: the DTO's unknown settings, in document order, with the kind / position / line the screen builds W-AC from.
#[test]
fn ac1642_unknown_settings_reach_the_dto_in_document_order() {
    let body = "# c\nui_them = \"dark\"\ninput_keymap_profile = \"vim\"\n\n[[external_apps]]\nname = \"one\"\nprogram = \"C:\\\\t\\\\a.exe\"\nagrs = [\"{dir}\"]\n";
    let (_d, _p, cfg) = from_text(body);
    assert_eq!(
        cfg.to_dto().unknown_settings,
        vec![
            UnknownSettingDto { kind: "key", name: "ui_them".into(), position: None, line: Some(2) },
            UnknownSettingDto { kind: "key", name: "input_keymap_profile".into(), position: None, line: Some(3) },
            UnknownSettingDto { kind: "appField", name: "agrs".into(), position: Some(1), line: Some(8) },
        ]
    );
}

// The snapshot is still a copy: building the DTO twice gives the same value and touches no file (R-917-8, R-1645).
#[test]
fn to_dto_is_pure_and_repeatable() {
    let (dir, path, cfg) = from_text("ui_them = 1\n");
    let before = fs::read(&path).unwrap();
    let (a, b): (KeymapLoadResultDto, KeymapLoadResultDto) = (cfg.to_dto(), cfg.to_dto());
    assert_eq!(a, b);
    fs::remove_file(&path).unwrap();
    assert_eq!(cfg.to_dto(), a, "no re-read");
    assert_eq!(before, b"ui_them = 1\n");
    drop(dir);
}

// Wire format (camelCase), through the `toml` serializer. `None` fields are omitted by it, so only present ones are checked.
#[test]
fn the_new_dto_fields_serialize_in_camel_case() {
    let (_d, _p, cfg) = from_text("ui_theme = \"Dark\"\nui_them = 1\n[input_keymap_custom]\ncopy = \"x\"\n");
    let s = toml::to_string(&cfg.to_dto()).expect("serialize");
    for name in ["uiThemeLine", "present", "unknownSettings", "line"] {
        assert!(s.contains(name), "`{name}` missing from {s}");
    }
    for snake in ["ui_theme_line", "unknown_settings"] {
        assert!(!s.contains(snake), "{snake} must be camelCase: {s}");
    }
    let s = toml::to_string(&UnknownSettingDto { kind: "appField", name: "agrs".into(), position: Some(2), line: Some(18) }).unwrap();
    assert!(s.contains("kind = \"appField\"") && s.contains("position = 2") && s.contains("line = 18"), "{s}");
}
