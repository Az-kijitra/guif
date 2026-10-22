//! TDD (unit-test-writer, 2026-10-17): `external_apps/commands.rs` -- the snapshot DTO of `external_apps_load` and the
//! caller-window guard shared by both commands. (The inner layer of `external_app_launch` is `guarded_tests.rs`; the command
//! signature rules -- only `index`, `path`, `kind`; no program / args parameter -- are static tests in
//! `external_apps_structure_tests.rs` and `abs_path_structure_tests.rs`.)
//! Specs: SPEC-0300-0021 R-1501 (a start-up snapshot, the file is not read again), R-1510-1 (a default registration is sent as
//! `defaultNo` + NO `name`; a user registration as its `name`), R-1503-1 (`keyInvalid`), R-1574 (the invalid registrations and the
//! type error are what the start-up notice is built from), R-1581 (the screen gets numbers / names / keys only), R-1555 (the viewer
//! window has no entrance: main window only), AC-1534; SPEC-0200-0001 §3.16.3 (the DTO fields), §3.16.2 (`commands.rs`).
//!
//! Contract the implementer must satisfy (module `external_apps::commands`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod commands_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct ExternalAppDto { pub index: usize, pub default_no: Option<u8>, pub name: Option<String>, pub key: Option<String>, pub key_invalid: bool }
//! #[derive(Debug, Clone, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct InvalidRegistrationDto { pub position: usize, pub name: Option<String>, pub reason: &'static str /* "invalid" | "limit" */ }
//! #[derive(Debug, Clone, PartialEq, Serialize)] #[serde(rename_all = "camelCase")]
//! pub struct ExternalAppsDto { pub apps: Vec<ExternalAppDto>, pub invalid: Vec<InvalidRegistrationDto>, pub type_error: bool }
//! pub fn registry_dto(registry: &Registry) -> ExternalAppsDto;                 // pure
//! pub fn check_main_window(label: &str) -> Result<(), impl std::fmt::Debug>;    // Ok only for "main" (R-1555)
//! ```

use std::ffi::OsString;

use super::commands::{check_main_window, registry_dto, ExternalAppDto, ExternalAppsDto, InvalidRegistrationDto};
use super::registry::Registry;
use crate::shared::schema::config_lines::ExternalAppsLines;
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

fn env(name: &str) -> Option<OsString> {
    match name.to_uppercase().as_str() {
        "LOCALAPPDATA" => Some(OsString::from(r"C:\L")),
        "SYSTEMROOT" => Some(OsString::from(r"C:\W")),
        _ => None,
    }
}

fn s(v: &str) -> RawValue<String> {
    RawValue::Value(v.to_string())
}

fn app(name: &str, program: &str, key: RawValue<String>) -> RawExternalApp {
    RawExternalApp { name: s(name), program: s(program), args: RawValue::Missing, args_for_file: RawValue::Missing, key }
}

fn dto_of(raw: ExternalAppsRaw) -> ExternalAppsDto {
    registry_dto(&Registry::from_raw(&raw, &ExternalAppsLines::default(), &env, None))
}

#[test]
fn the_default_four_are_sent_as_numbers_without_a_name() {
    let dto = dto_of(ExternalAppsRaw::Missing);
    assert!(!dto.type_error);
    assert!(dto.invalid.is_empty());
    assert_eq!(
        dto.apps,
        vec![
            ExternalAppDto { index: 0, default_no: Some(1), name: None, key: Some("Ctrl+Alt+C".into()), key_invalid: false, key_line: None },
            ExternalAppDto { index: 1, default_no: Some(2), name: None, key: Some("Ctrl+Alt+V".into()), key_invalid: false, key_line: None },
            ExternalAppDto { index: 2, default_no: Some(3), name: None, key: Some("Ctrl+Alt+E".into()), key_invalid: false, key_line: None },
            ExternalAppDto { index: 3, default_no: Some(4), name: None, key: Some("Ctrl+Alt+Shift+G".into()), key_invalid: false, key_line: None },
        ]
    );
}

#[test]
fn a_type_error_sends_the_default_four_with_the_flag_and_no_invalid_list() {
    let dto = dto_of(ExternalAppsRaw::WrongType);
    assert!(dto.type_error);
    assert_eq!(dto.apps.len(), 4);
    assert!(dto.apps.iter().all(|a| a.default_no.is_some() && a.name.is_none()));
    assert!(dto.invalid.is_empty());
}

#[test]
fn user_registrations_are_sent_with_their_name_and_no_default_mark() {
    let dto = dto_of(ExternalAppsRaw::Array(vec![
        app("Mine", r"C:\t\a.exe", s("Ctrl+Alt+M")),
        app("日本語の名前", r"C:\t\b.exe", RawValue::Missing),
    ]));
    assert_eq!(
        dto.apps,
        vec![
            ExternalAppDto { index: 0, default_no: None, name: Some("Mine".into()), key: Some("Ctrl+Alt+M".into()), key_invalid: false, key_line: None },
            ExternalAppDto { index: 1, default_no: None, name: Some("日本語の名前".into()), key: None, key_invalid: false, key_line: None },
        ]
    );
}

#[test]
fn the_index_is_the_position_among_the_usable_registrations_not_in_config_toml() {
    let dto = dto_of(ExternalAppsRaw::Array(vec![
        app("bad", "x.bat", RawValue::Missing),
        app("good1", r"C:\t\1.exe", RawValue::Missing),
        app("bad2", "", RawValue::Missing),
        app("good2", r"C:\t\2.exe", RawValue::Missing),
    ]));
    assert_eq!(dto.apps.iter().map(|a| (a.index, a.name.clone().unwrap())).collect::<Vec<_>>(), [(0, "good1".to_string()), (1, "good2".to_string())]);
    assert_eq!(dto.invalid.iter().map(|i| i.position).collect::<Vec<_>>(), [1, 3]);
}

#[test]
fn a_key_that_is_not_a_string_is_flagged_and_the_registration_stays() {
    let dto = dto_of(ExternalAppsRaw::Array(vec![app("k", r"C:\t\k.exe", RawValue::WrongType)]));
    assert_eq!(dto.apps, vec![ExternalAppDto { index: 0, default_no: None, name: Some("k".into()), key: None, key_invalid: true, key_line: None }]);
}

#[test]
fn the_invalid_registrations_are_sent_in_position_order_with_their_reason() {
    let mut raws = vec![app("bad", "x.bat", RawValue::Missing)];
    raws.extend((1..=21).map(|i| app(&format!("n{i}"), &format!(r"C:\t\{i}.exe"), RawValue::Missing)));
    let dto = dto_of(ExternalAppsRaw::Array(raws));
    assert_eq!(dto.apps.len(), 20);
    assert_eq!(
        dto.invalid,
        vec![
            InvalidRegistrationDto { position: 1, name: Some("bad".into()), reason: "invalid", line: None },
            InvalidRegistrationDto { position: 22, name: Some("n21".into()), reason: "limit", line: None },
        ]
    );
}

#[test]
fn the_dto_has_no_program_or_arguments_for_the_screen_r1581() {
    // The screen never needs (and must not get) what it could be tempted to send back.
    let json_like = toml::to_string(&dto_of(ExternalAppsRaw::Missing).apps[0]).expect("serialize");
    for forbidden in ["program", "args", "argsForFile", "exe"] {
        assert!(!json_like.contains(forbidden), "{forbidden} must not be in the app DTO: {json_like}");
    }
}

#[test]
fn the_app_dto_serializes_in_camel_case() {
    let s = toml::to_string(&ExternalAppDto { index: 2, default_no: Some(3), name: None, key: Some("Ctrl+Alt+E".into()), key_invalid: false, key_line: None }).expect("serialize");
    assert!(s.contains("defaultNo = 3"), "{s}");
    assert!(s.contains("keyInvalid = false"), "{s}");
    assert!(s.contains("index = 2"), "{s}");
    assert!(!s.contains("default_no") && !s.contains("key_invalid"), "{s}");
}

#[test]
fn the_snapshot_dto_serializes_type_error_in_camel_case() {
    let s = toml::to_string(&InvalidRegistrationDto { position: 3, name: Some("VS Codeで開く".into()), reason: "invalid", line: None }).expect("serialize");
    assert!(s.contains("position = 3"), "{s}");
    assert!(s.contains("reason = \"invalid\""), "{s}");
}

#[test]
fn r1555_both_commands_are_for_the_main_window_only() {
    assert!(check_main_window("main").is_ok());
    for other in ["viewer", "some-other-window", "", "Main"] {
        assert!(check_main_window(other).is_err(), "{other:?} must be refused");
    }
}
