//! TDD (unit-test-writer, 2026-10-24): `config_bridge/evaluate.rs` and `config_bridge/check.rs` with the appearance -- ONE function turns
//! `config.toml` into `(StartupConfig, Registry, Appearance)` for start-up and for "設定ファイルのチェック", and the check reflects nothing
//! (SPEC-0300-0023 R-1720 / R-1748 / R-1820; AC-1708 / AC-1748 (Rust half); SPEC-0300-0022 R-1651 / R-1652 / R-1653; SPEC-0200-0001 §3.18.4
//! fourth bullet). This file ADDS to `evaluate_tests.rs` / `check_tests.rs`, whose `ui_theme` assertions are replaced (see the hand-over).
//!
//! Contract:
//!
//! ```ignore
//! // config_bridge/evaluate.rs
//! pub fn snapshot(app: &AppHandle) -> (StartupConfig, Registry, Appearance);
//! pub fn snapshot_at(path: &Path, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> (StartupConfig, Registry, Appearance);
//! //   Appearance = appearance::resolve(&startup.loaded.appearance)  -- called in ONE place of the production code
//! // config_bridge/check.rs
//! pub struct ConfigCheckDto { pub keymap: KeymapLoadResultDto, pub external_apps: ExternalAppsDto, pub appearance: AppearanceDto }
//! pub fn check_at(path, env, path_var) -> ConfigCheckDto;    // reads the file again; manages and writes nothing
//! ```

use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

use super::check::check_at;
use super::evaluate::snapshot_at;
use crate::appearance::dto::appearance_dto;
use crate::appearance::resolve::resolve;
use crate::appearance::Problem;
use crate::external_apps::commands::registry_dto;
use crate::shared::schema::appearance_raw::RawAppearance;

fn env(_: &str) -> Option<OsString> {
    None
}

fn file(body: &str) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, body).unwrap();
    (dir, path)
}

// ------------------------------------------------------------------ the third element

#[test]
fn r1651_the_appearance_is_the_resolution_of_the_raw_values_of_the_same_read() {
    let (_d, path) = file("[theme]\npreset = \"light\"\n[colors]\nfolder = \"#FF0000\"\n[font]\nsize = 14\n[layout]\nmin_col_width = 30\n");
    let (startup, _registry, appearance) = snapshot_at(&path, &env, None);
    assert_eq!(appearance, resolve(&startup.loaded.appearance), "no second implementation");
    assert!(!appearance.dark);
    assert_eq!((appearance.font_size, appearance.row_height, appearance.min_col_width, appearance.tree_width_percent), (14, 18, 30, 24));
    assert!(appearance.problems.is_empty(), "{:?}", appearance.problems);
}

#[test]
fn r1644_no_config_toml_is_nord_with_the_default_font_and_layout_and_no_notice() {
    let dir = tempfile::tempdir().unwrap();
    let (startup, registry, appearance) = snapshot_at(&dir.path().join("config.toml"), &env, None);
    assert!(!startup.to_dto().present);
    assert_eq!(registry.apps.len(), 4);
    assert_eq!(appearance, resolve(&RawAppearance::default()));
    assert!(appearance.dark && appearance.problems.is_empty());
    assert_eq!((appearance.font_size, appearance.min_col_width, appearance.tree_width_percent), (12, 24, 24));
    assert!(!dir.path().join("config.toml").exists(), "reading never creates the file");
}

#[test]
fn ac1708_a_toml_syntax_error_gives_every_default_and_the_screens_w_31() {
    let (_d, path) = file("[theme]\npreset = \"light\"\n[font]\nsize = 20\nthis is = = not toml\n");
    let (startup, _r, appearance) = snapshot_at(&path, &env, None);
    assert!(startup.to_dto().parse_error.is_some_and(|e| e.whole_file), "W-31 (it names 配色(nord) in the screen)");
    assert_eq!(appearance, resolve(&RawAppearance::default()));
    assert!(appearance.dark, "nord, not light");
    assert_eq!(appearance.font_size, 12);
    assert!(appearance.problems.is_empty(), "the one notice of a broken file is W-31; the appearance adds none");
}

#[test]
fn ac1748_ui_theme_changes_nothing_and_is_an_unknown_setting() {
    for value in ["\"light\"", "\"dark\"", "\"system\"", "3"] {
        let (_d, path) = file(&format!("# c\nui_theme = {value}\n"));
        let (startup, _r, appearance) = snapshot_at(&path, &env, None);
        assert_eq!(appearance, resolve(&RawAppearance::default()), "ui_theme = {value}");
        let unknown = startup.to_dto().unknown_settings;
        assert_eq!(unknown.len(), 1, "{unknown:?}");
        assert_eq!((unknown[0].kind, unknown[0].name.as_str(), unknown[0].line), ("key", "ui_theme", Some(2)));
    }
}

#[test]
fn the_notices_of_a_bad_file_travel_as_problems_not_as_a_failure() {
    let (_d, path) = file("[theme]\npreset = \"dracula\"\n[colors]\nfolder = \"nonsense\"\n[font]\nsize = 99\n[layout]\ntree_width_percent = 99\n");
    let (_s, _r, appearance) = snapshot_at(&path, &env, None);
    assert_eq!(appearance.problems.len(), 4, "{:?}", appearance.problems);
    assert!(appearance.problems.iter().any(|p| matches!(p, Problem::PresetUnusable { line: Some(2), .. })));
    assert!(appearance.problems.iter().any(|p| matches!(p, Problem::ColorsUnparsable { .. })));
    assert!(appearance.problems.contains(&Problem::FontSize { line: Some(6) }));
    assert!(appearance.problems.contains(&Problem::LayoutValue { line: Some(8), key: "tree_width_percent".into() }));
    assert_eq!(appearance.tree_width_percent, 24);
    assert!(appearance.dark);
}

// ------------------------------------------------------------------ the check (R-1651 / R-1652 / R-1653)

#[test]
fn r1651_the_check_carries_the_same_appearance_data_as_start_up_for_the_same_file() {
    let body = "ui_theme = \"x\"\n[theme]\npreset = \"dracula\"\n[font]\nfamily = [\"A\", \"B\\u0001\"]\nweight = 1\n[[external_apps]]\nname = \"bad\"\nprogram = \"bin\\\\x.exe\"\n";
    let (_d, path) = file(body);
    let dto = check_at(&path, &env, None);
    let (startup, registry, appearance) = snapshot_at(&path, &env, None);
    assert_eq!(dto.keymap, startup.to_dto());
    assert_eq!(dto.external_apps, registry_dto(&registry));
    assert_eq!(dto.appearance, appearance_dto(&appearance), "ConfigCheckDto.appearance is the very DTO `appearance_load` serves");
    assert!(dto.appearance.problems.iter().any(|p| p.kind == "presetUnusable"));
    assert!(dto.appearance.problems.iter().any(|p| p.kind == "fontFamilyElements"));
    assert_eq!(dto.keymap.unknown_settings.len(), 2, "ui_theme and [font] weight");
}

#[test]
fn r1650_each_check_reads_the_file_as_it_is_now_and_changes_no_state() {
    let (_d, path) = file("[theme]\npreset = \"nord\"\n");
    let first = check_at(&path, &env, None);
    assert!(first.appearance.problems.is_empty() && first.appearance.dark);
    fs::write(&path, "[theme]\npreset = \"light\"\n[font]\nsize = 3\n").unwrap();
    let second = check_at(&path, &env, None);
    assert!(!second.appearance.dark && second.appearance.problems.iter().any(|p| p.kind == "fontSize"));
    fs::remove_file(&path).unwrap();
    let third = check_at(&path, &env, None);
    assert!(!third.keymap.present, "R-1654: the file is gone");
    assert!(third.appearance.dark && third.appearance.problems.is_empty(), "no file: nord");
    assert!(first.appearance.dark, "the first result is a value: the later checks did not change it");
}

#[test]
fn r1653_checking_neither_creates_nor_changes_a_file() {
    let (dir, path) = file("[theme]\npreset = \"dracula\"\n");
    let before = fs::read(&path).unwrap();
    let mtime = fs::metadata(&path).unwrap().modified().unwrap();
    check_at(&path, &env, None);
    snapshot_at(&path, &env, None);
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no sample or temporary file (R-1653)");
}

#[test]
fn the_check_and_start_up_agree_on_a_good_file_with_zero_problems() {
    let (_d, path) = file("[theme]\npreset = \"catppuccin\"\n[colors]\nfolder = \"#abc\"\n[font]\nfamily = \"Consolas\"\nsize = 12\n[layout]\nmin_col_width = 20\ntree_width_percent = 30\n");
    let dto = check_at(&path, &env, None);
    assert!(dto.appearance.problems.is_empty());
    assert!(dto.keymap.unknown_settings.is_empty());
    assert_eq!((dto.appearance.font_size, dto.appearance.row_height, dto.appearance.min_col_width, dto.appearance.tree_width_percent), (12, 16, 20, 30));
    assert!(dto.appearance.font_family.starts_with("\"Consolas\", "));
    assert!(dto.appearance.dark);
}
