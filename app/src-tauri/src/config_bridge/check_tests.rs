//! TDD (unit-test-writer, 2026-10-20): `config_bridge/check.rs` -- the backend of "設定ファイルのチェック" (`settings_file_check`)
//! (SPEC-0300-0022 R-1650 / R-1651 / R-1652 / R-1653 / R-1656, AC-1651 (Rust side) / AC-1653 / AC-1654 / AC-1657;
//! SPEC-0200-0001 §3.17.3 `config_bridge/check.rs`, §3.17.6).
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct ConfigCheckDto { pub keymap: KeymapLoadResultDto, pub external_apps: ExternalAppsDto }
//! /// The pure core of the command: `evaluate::snapshot_at` + `startup.to_dto()` + `registry_dto(&registry)`. Reads the file AGAIN
//! /// (a "non-reflecting read", R-1652), writes nothing, manages nothing.
//! pub fn check_at(path: &Path, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> ConfigCheckDto;
//! #[tauri::command(async)] pub fn settings_file_check(window: Window, app: AppHandle) -> Result<ConfigCheckDto, String>;  // main window only
//! ```
//! The command's arguments (`window`, `app` only), its registration and the "no `.manage(`" rule are static tests in
//! `settings_file_structure_tests.rs` / `acl_consistency_bridge_tests.rs`.

use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;

use super::check::check_at;
use super::evaluate::snapshot_at;
use crate::external_apps::commands::registry_dto;

fn env(name: &str) -> Option<OsString> {
    (name == "MY_TOOL_DIR").then(|| OsString::from(r"C:\tools"))
}

fn file(body: &str) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, body).unwrap();
    (dir, path)
}

// R-1651 / AC-1651: the check's data is exactly the start-up data of the same file (the front end then builds the same sentence).
#[test]
fn r1651_the_check_returns_what_start_up_would_return_for_the_same_file() {
    let body = "ui_them = 1\nui_theme = \"Dark\"\n[input_keymap_custom]\ncopy = \"Ctrl+\"\n[[external_apps]]\nname = \"bad\"\nprogram = \"bin\\\\x.exe\"\n";
    let (_d, path) = file(body);
    let dto = check_at(&path, &env, None);
    let snap = snapshot_at(&path, &env, None);
    let (startup, registry) = (snap.0, snap.1);
    assert_eq!(dto.keymap, startup.to_dto());
    assert_eq!(dto.external_apps, registry_dto(&registry));
    assert_eq!(dto.keymap.unknown_settings.len(), 2, "ui_them and (SPEC-0300-0023: no longer read) ui_theme");
    assert_eq!(dto.external_apps.invalid[0].line, Some(7));
}

// R-1650: each call reads the file as it is NOW.
#[test]
fn r1650_each_check_reads_the_file_again() {
    // SPEC-0300-0023: `theme` is a known key, `ui_theme` an unknown one (a different file gives a different check)
    let (_d, path) = file("theme = \"dark\"\n");
    assert!(check_at(&path, &env, None).keymap.unknown_settings.is_empty());
    fs::write(&path, "ui_theme = \"Dark\"\n").unwrap();
    let dto = check_at(&path, &env, None);
    assert!(dto.keymap.unknown_settings.len() == 1 && dto.keymap.unknown_settings[0].line == Some(1));
    fs::remove_file(&path).unwrap();
    assert!(!check_at(&path, &env, None).keymap.present, "R-1654 W-AB: the file is gone");
}

// AC-1653 (ii) / AC-1654 / R-1653: a missing config.toml stays missing; no sample or temporary file appears.
#[test]
fn ac1653_ii_checking_a_missing_config_creates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let dto = check_at(&path, &env, None);
    assert!(!dto.keymap.present && dto.external_apps.apps.len() == 4);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0, "no config.toml, no config.sample.toml");
}

// AC-1654: whatever the content, config.toml and config.sample.toml keep content and mtime.
#[test]
fn ac1654_the_check_changes_neither_config_toml_nor_the_sample() {
    for body in ["", "this is = = not toml\n", "ui_theme = \"dark\"\n", "\u{feff}ui_them = 1\r\n"] {
        let (dir, path) = file(body);
        let sample = dir.path().join("config.sample.toml");
        fs::write(&sample, b"# sample\n").unwrap();
        let (m1, m2) = (fs::metadata(&path).unwrap().modified().unwrap(), fs::metadata(&sample).unwrap().modified().unwrap());
        check_at(&path, &env, None);
        check_at(&path, &env, None);
        assert_eq!(fs::read(&path).unwrap(), body.as_bytes(), "body {body:?}");
        assert_eq!(fs::read(&sample).unwrap(), b"# sample\n");
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), m1);
        assert_eq!(fs::metadata(&sample).unwrap().modified().unwrap(), m2);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2, "no temporary file");
    }
}

// AC-1653 (iii): a syntax error is reported with its line and without any setting.
#[test]
fn ac1653_iii_a_syntax_error_is_a_whole_file_error_with_a_line() {
    let (_d, path) = file("external_apps = []\nthis is = = not toml\n");
    let dto = check_at(&path, &env, None);
    let err = dto.keymap.parse_error.expect("W-31");
    assert_eq!((err.whole_file, err.line), (true, Some(2)));
    assert!(dto.keymap.present);
}

// AC-1657 / R-1656: environment variables are expanded at CHECK time with the environment given; repeated checks agree.
#[test]
fn ac1657_the_check_expands_program_with_the_environment_of_the_check() {
    let (_d, path) = file("[[external_apps]]\nname = \"a\"\nprogram = \"%MY_TOOL_DIR%\\\\t.exe\"\n\n[[external_apps]]\nname = \"b\"\nprogram = \"%UNDEFINED_X%\\\\t.exe\"\n");
    let (first, second) = (check_at(&path, &env, None), check_at(&path, &env, None));
    assert_eq!(first, second);
    assert_eq!(first.external_apps.apps.len(), 1, "a is usable");
    assert_eq!((first.external_apps.invalid[0].position, first.external_apps.invalid[0].line), (2, Some(7)), "b is listed by W-9A with its line");
}

// §3.17.6: the wire names.
#[test]
fn the_check_dto_serializes_in_camel_case() {
    let (_d, path) = file("ui_theme = \"dark\"\n");
    let s = toml::to_string(&check_at(&path, &env, None)).expect("serialize");
    assert!(s.contains("[keymap]") && s.contains("[externalApps]") && s.contains("[appearance]") && !s.contains("external_apps"), "{s}");
}
