//! TDD (unit-test-writer, 2026-10-20): the line fields of the `external_apps_load` DTO (SPEC-0300-0022 R-1642; SPEC-0200-0001 §3.17.6).
//!
//! ```ignore
//! ExternalAppDto { ..., pub key_line: Option<u32> }              // from RegisteredApp.key_line
//! InvalidRegistrationDto { ..., pub line: Option<u32> }          // from InvalidRegistration.line
//! ExternalAppsDto { ..., pub type_error_line: Option<u32> }      // from Registry.type_error_line
//! // all camelCase on the wire: keyLine, line, typeErrorLine
//! ```
//! Existing struct literals in `commands_tests.rs` get `key_line: None` / `line: None` / `type_error_line: None` (mechanical).

use std::ffi::OsString;

use super::commands::{registry_dto, ExternalAppDto, InvalidRegistrationDto};
use super::registry::Registry;
use crate::shared::schema::config_lines::{AppLines, ExternalAppsLines};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

fn env(_: &str) -> Option<OsString> {
    Some(OsString::from(r"C:\E"))
}

fn raw(name: &str, program: &str, key: Option<&str>) -> RawExternalApp {
    let v = |t: &str| RawValue::Value(t.to_string());
    RawExternalApp { name: v(name), program: v(program), args: RawValue::Missing, args_for_file: RawValue::Missing, key: key.map_or(RawValue::Missing, v) }
}

#[test]
fn the_dto_carries_the_key_line_the_invalid_line_and_the_type_error_line() {
    let lines = ExternalAppsLines {
        line: Some(4),
        apps: vec![
            AppLines { header: Some(4), name: Some(5), program: Some(6), key: Some(8), ..AppLines::default() },
            AppLines { header: Some(10), name: Some(11), program: Some(12), ..AppLines::default() },
        ],
    };
    let items = vec![raw("ok", r"C:\t\a.exe", Some("Ctrl+Alt+K")), raw("bad", r"bin\x.exe", None)];
    let dto = registry_dto(&Registry::from_raw(&ExternalAppsRaw::Array(items), &lines, &env, None));
    assert_eq!(dto.apps.len(), 1);
    assert_eq!(dto.apps[0].key_line, Some(8));
    assert_eq!(dto.invalid[0].line, Some(12));
    assert_eq!(dto.type_error_line, None);

    let dto = registry_dto(&Registry::from_raw(&ExternalAppsRaw::WrongType, &ExternalAppsLines { line: Some(3), apps: vec![] }, &env, None));
    assert!(dto.type_error);
    assert_eq!(dto.type_error_line, Some(3));
    assert!(dto.apps.iter().all(|a| a.key_line.is_none()));
}

#[test]
fn the_new_fields_serialize_in_camel_case() {
    let app = toml::to_string(&ExternalAppDto { index: 0, default_no: None, name: Some("a".into()), key: Some("Ctrl+1".into()), key_invalid: false, key_line: Some(8) }).unwrap();
    assert!(app.contains("keyLine = 8"), "{app}");
    let inv = toml::to_string(&InvalidRegistrationDto { position: 2, name: None, reason: "invalid", line: Some(22) }).unwrap();
    assert!(inv.contains("line = 22"), "{inv}");
    let all = toml::to_string(&registry_dto(&Registry::from_raw(
        &ExternalAppsRaw::WrongType,
        &ExternalAppsLines { line: Some(3), apps: vec![] },
        &env,
        None,
    )))
    .unwrap();
    assert!(all.contains("typeErrorLine = 3") && !all.contains("type_error_line"), "{all}");
}
