//! TDD (unit-test-writer, 2026-10-20): `config_bridge/evaluate.rs` -- the ONE function that turns `config.toml` into the start-up
//! snapshot and the external-app registry, shared by start-up and by "設定ファイルのチェック" (SPEC-0300-0022 R-1651 1-2, R-1656,
//! AC-1651 (Rust side) / AC-1657; SPEC-0200-0001 §3.17.3 `config_bridge/evaluate.rs`, H-2).
//!
//! ```ignore
//! /// What `lib.rs` and `check.rs` call. `StartupConfig::load(app)` (which goes through `config::startup_config::locate`) and
//! /// `Registry::from_raw(&loaded.external_apps, &loaded.lines.external_apps, &env::lookup, env::path_var())`.
//! pub fn snapshot(app: &AppHandle) -> (StartupConfig, Registry);
//! /// The AppHandle-free seam of `snapshot` (a unit test cannot build an AppHandle): `snapshot(app)` is `snapshot_at(&locate(app)?,
//! /// &env::lookup, env::path_var())` (a path-resolution failure => `StartupConfig::unreadable` and a registry of the default four).
//! pub fn snapshot_at(path: &Path, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> (StartupConfig, Registry);
//! ```
//! The environment is an argument here, so no test touches the real one.

use std::ffi::OsString;
use std::fs;

use super::evaluate::snapshot_at;
use crate::config::startup_config::StartupConfig;
use crate::external_apps::registry::{InvalidReason, Registry};

fn env(name: &str) -> Option<OsString> {
    match name {
        "MY_TOOL_DIR" => Some(OsString::from(r"C:\tools")),
        "LOCALAPPDATA" => Some(OsString::from(r"C:\L")),
        "SystemRoot" | "SYSTEMROOT" => Some(OsString::from(r"C:\W")),
        _ => None,
    }
}

/// AC-1640 shape: ui_theme bad on line 3, a good element at line 5, a bad one (program `bin\x.exe`) at line 20/22.
fn ac1640() -> String {
    let mut lines = vec![String::new(); 22];
    lines[2] = "ui_theme = \"Dark\"".into();
    lines[4] = "[[external_apps]]".into();
    lines[5] = "name = \"ok\"".into();
    lines[6] = "program = \"C:\\\\test\\\\t.exe\"".into();
    lines[9] = "[input_keymap_custom]".into();
    lines[11] = "copy = \"Ctrl+\"".into();
    lines[19] = "[[external_apps]]".into();
    lines[20] = "name = \"bad\"".into();
    lines[21] = "program = \"bin\\\\x.exe\"".into();
    lines.join("\n") + "\n"
}

fn file(body: &str) -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, body).unwrap();
    (dir, path)
}

// R-1651: the snapshot IS "StartupConfig::from_path + Registry::from_raw with the lines of the same read" -- no second implementation.
#[test]
fn r1651_snapshot_is_the_composition_of_the_shared_functions() {
    let (_d, path) = file(&ac1640());
    let (startup, registry) = snapshot_at(&path, &env, Some(OsString::from(r"C:\bin")));
    let expected_startup = StartupConfig::from_path(&path);
    let expected_registry = Registry::from_raw(
        &expected_startup.loaded.external_apps,
        &expected_startup.loaded.lines.external_apps,
        &env,
        Some(OsString::from(r"C:\bin")),
    );
    assert_eq!(startup, expected_startup);
    assert_eq!(registry, expected_registry);
    assert_eq!(registry.path_var(), Some(std::ffi::OsStr::new(r"C:\bin")), "the PATH snapshot is carried into the registry");
}

// AC-1640: the lines travel through the composition: the second element is dropped WITH its program line.
#[test]
fn ac1640_the_registry_knows_the_line_of_the_failing_field() {
    let (_d, path) = file(&ac1640());
    let (startup, registry) = snapshot_at(&path, &env, None);
    assert_eq!(registry.apps.len(), 1, "【確定 #3】only the bad element is dropped");
    assert_eq!((registry.invalid[0].position, registry.invalid[0].reason, registry.invalid[0].line), (2, InvalidReason::Invalid, Some(22)));
    let dto = startup.to_dto();
    assert!(dto.ui_theme_invalid);
    assert_eq!(dto.ui_theme_line, Some(3));
    assert_eq!(dto.entries[0].line, Some(12));
}

// R-1644: no file => the default four, present false, no lines.
#[test]
fn r1644_a_missing_file_gives_the_default_four_and_present_false() {
    let dir = tempfile::tempdir().unwrap();
    let (startup, registry) = snapshot_at(&dir.path().join("config.toml"), &env, None);
    assert!(!startup.to_dto().present);
    assert_eq!(registry.apps.len(), 4);
    assert!(registry.invalid.is_empty() && !registry.type_error);
    assert!(!dir.path().join("config.toml").exists(), "reading never creates config.toml");
}

// AC-1657 / R-1656: the `%NAME%` expansion uses THIS call's environment; the line of an undefined variable is reported.
#[test]
fn ac1657_expansion_and_validation_use_the_environment_given_to_this_call() {
    let (_d, path) = file("[[external_apps]]\nname = \"tool\"\nprogram = \"%MY_TOOL_DIR%\\\\t.exe\"\n");
    let (_, defined) = snapshot_at(&path, &env, None);
    assert_eq!(defined.apps[0].program, r"C:\tools\t.exe");
    let (_, undefined) = snapshot_at(&path, &|_| None, None);
    assert!(undefined.apps.is_empty());
    assert_eq!(undefined.invalid[0].line, Some(3), "W-9A '1(tool、3 行目)'");
    let (_, again) = snapshot_at(&path, &env, None);
    assert_eq!(again, defined, "the same file and environment give the same registry every time");
}

// R-1645: evaluating is read-only.
#[test]
fn r1645_evaluating_does_not_touch_the_file_or_the_folder() {
    let (dir, path) = file(&ac1640());
    let before = fs::read(&path).unwrap();
    let mtime = fs::metadata(&path).unwrap().modified().unwrap();
    snapshot_at(&path, &env, None);
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}
