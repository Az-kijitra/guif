//! TDD (unit-test-writer, 2026-10-20): the line numbers of `Registry::from_raw` (SPEC-0300-0022 R-1642; SPEC-0200-0001 §3.17.3
//! `external_apps/registry.rs`, §3.17.5 "外部アプリの行の使い方"; AC-1640 W-9A / W-9B / W-9C).
//!
//! Contract the implementer must satisfy (the existing `registry_tests.rs` / `commands_tests.rs` / `guarded_tests.rs` /
//! `launch_tests.rs` call `from_raw` with the old 3 arguments and build `RegisteredApp` / DTO literals; code-generator updates them
//! mechanically: pass `&ExternalAppsLines::default()` as 2nd argument and add `key_line: None` / `line: None` / `type_error_line: None`):
//!
//! ```ignore
//! pub fn Registry::from_raw(raw: &ExternalAppsRaw, lines: &ExternalAppsLines,
//!                           env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> Registry;
//! pub struct InvalidRegistration { position, name, reason, pub line: Option<u32> }   // + line
//! pub struct RegisteredApp { ..., pub key_line: Option<u32> }                         // + key_line (None for the default four)
//! pub struct Registry { ..., pub type_error_line: Option<u32> }                        // + type_error_line
//! ```
//!
//! Rule (R-1642 / §3.17.5): `lines.apps[i]` belongs to the i-th element of the raw array (the position is 1-based, `position - 1`).
//! An invalid element's `line` is the line of the FIRST failing field in the order name -> program -> args -> args_for_file; when
//! that field has no line (it is missing) it is the element's header line; a registration over the limit gets the header line.
//! A usable registration's `key_line` is its `key` line. A `lines` shorter than the raw array (or empty) gives `None`s, no panic.

use std::ffi::OsString;

use super::registry::{InvalidReason, Registry, MAX_APPS};
use crate::shared::schema::config_lines::{AppLines, ExternalAppsLines};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

fn env(name: &str) -> Option<OsString> {
    match name.to_uppercase().as_str() {
        "LOCALAPPDATA" => Some(OsString::from(r"C:\L")),
        "SYSTEMROOT" => Some(OsString::from(r"C:\W")),
        "MY_TOOL_DIR" => Some(OsString::from(r"C:\tools")),
        _ => None,
    }
}

fn s(v: &str) -> RawValue<String> {
    RawValue::Value(v.to_string())
}

fn good(name: &str) -> RawExternalApp {
    RawExternalApp { name: s(name), program: s(r"C:\t\x.exe"), args: RawValue::Missing, args_for_file: RawValue::Missing, key: RawValue::Missing }
}

fn lines_of(line: Option<u32>, apps: Vec<AppLines>) -> ExternalAppsLines {
    ExternalAppsLines { line, apps }
}

fn al(header: u32, name: u32, program: u32) -> AppLines {
    AppLines { header: Some(header), name: Some(name), program: Some(program), ..AppLines::default() }
}

fn build(items: Vec<RawExternalApp>, lines: &ExternalAppsLines) -> Registry {
    Registry::from_raw(&ExternalAppsRaw::Array(items), lines, &env, None)
}

// AC-1640: the second element is bad because of `program` (line 22); the list item shows "2(…、22 行目)".
#[test]
fn ac1640_a_bad_program_reports_the_line_of_the_program_field() {
    let mut bad = good("bad");
    bad.program = s(r"bin\x.exe");
    let r = build(vec![good("ok"), bad], &lines_of(Some(5), vec![al(5, 6, 7), al(20, 21, 22)]));
    assert_eq!(r.apps.len(), 1);
    assert_eq!((r.invalid[0].position, r.invalid[0].reason, r.invalid[0].line), (2, InvalidReason::Invalid, Some(22)));
    assert_eq!(r.invalid[0].name.as_deref(), Some("bad"));
}

// R-1642: the first failing field decides, in the order name -> program -> args -> args_for_file.
#[test]
fn r1642_the_first_failing_field_in_the_validation_order_gives_the_line() {
    let lines = lines_of(Some(1), vec![AppLines { header: Some(1), name: Some(2), program: Some(3), args: Some(4), args_for_file: Some(5), key: None }]);
    let cases: [(&str, RawExternalApp, u32); 5] = [
        ("blank name", RawExternalApp { name: s("   "), ..good("x") }, 2),
        ("name of the wrong type", RawExternalApp { name: RawValue::WrongType, ..good("x") }, 2),
        ("undefined %VAR% in program", RawExternalApp { program: s(r"%NOPE%\t.exe"), ..good("x") }, 3),
        ("an argument template that does not parse", RawExternalApp { args: RawValue::Value(vec!["{cwd}".into()]), ..good("x") }, 4),
        ("an args_for_file template that does not parse", RawExternalApp { args_for_file: RawValue::Value(vec!["{cwd}".into()]), ..good("x") }, 5),
    ];
    for (what, raw, line) in cases {
        let r = build(vec![raw], &lines);
        assert_eq!(r.invalid.len(), 1, "{what}");
        assert_eq!(r.invalid[0].line, Some(line), "{what}");
    }
    // name and program both bad: the name (checked first) wins
    let both = RawExternalApp { name: s(""), program: s(r"bin\x.exe"), ..good("x") };
    assert_eq!(build(vec![both], &lines).invalid[0].line, Some(2));
}

// R-1642: "決められない場合(必須のフィールドが無い等)は、その要素の見出しの行".
#[test]
fn r1642_a_missing_required_field_falls_back_to_the_header_line() {
    let lines = lines_of(Some(1), vec![AppLines { header: Some(1), name: None, program: Some(3), ..AppLines::default() }]);
    let no_name = RawExternalApp { name: RawValue::Missing, ..good("x") };
    assert_eq!(build(vec![no_name], &lines).invalid[0].line, Some(1));
    let lines = lines_of(Some(1), vec![AppLines { header: Some(7), name: Some(8), program: None, ..AppLines::default() }]);
    let no_program = RawExternalApp { program: RawValue::Missing, ..good("x") };
    assert_eq!(build(vec![no_program], &lines).invalid[0].line, Some(7));
}

// R-1642: the element over the limit (R-1505) is reported at its header line, not at one of its (fine) fields.
#[test]
fn r1642_the_registration_over_the_limit_gets_the_header_line() {
    let items: Vec<RawExternalApp> = (0..=MAX_APPS).map(|i| good(&format!("app{i}"))).collect();
    let apps: Vec<AppLines> = (0..=MAX_APPS as u32).map(|i| al(10 + i * 4, 11 + i * 4, 12 + i * 4)).collect();
    let r = build(items, &lines_of(Some(10), apps));
    assert_eq!(r.apps.len(), MAX_APPS);
    assert_eq!((r.invalid[0].position, r.invalid[0].reason), (MAX_APPS + 1, InvalidReason::Limit));
    assert_eq!(r.invalid[0].line, Some(10 + MAX_APPS as u32 * 4), "the header of the 21st element (W-9A '21(上限を超えています、60 行目)')");
}

// R-1642: a usable registration keeps the line of its `key`; the index is the CONFIG position, not the registry index.
#[test]
fn r1642_key_line_follows_the_config_position_when_an_earlier_element_was_dropped() {
    let mut bad = good("bad");
    bad.program = s(r"bin\x.exe");
    let mut with_key = good("keyed");
    with_key.key = s("Ctrl+Alt+K");
    let mut lines = lines_of(Some(1), vec![al(1, 2, 3), al(5, 6, 7)]);
    lines.apps[1].key = Some(25);
    let r = build(vec![bad, with_key, good("plain")], &lines);
    assert_eq!(r.apps.len(), 2);
    assert_eq!(r.apps[0].key_line, Some(25));
    assert_eq!(r.apps[1].key_line, None, "no key, and no lines for the third element");
}

// R-1642: "既定の4つのキー(config.toml に書かれていない)には行を書かない" and the type-error line.
#[test]
fn r1642_the_default_four_have_no_key_line_and_a_type_error_has_the_key_line() {
    let r = Registry::from_raw(&ExternalAppsRaw::Missing, &ExternalAppsLines::default(), &env, None);
    assert_eq!(r.apps.len(), 4);
    assert!(r.apps.iter().all(|a| a.key_line.is_none()));
    assert_eq!(r.type_error_line, None);

    let r = Registry::from_raw(&ExternalAppsRaw::WrongType, &lines_of(Some(4), vec![]), &env, None);
    assert!(r.type_error);
    assert_eq!(r.type_error_line, Some(4), "W-9B: the line of `external_apps`");
    assert!(r.apps.iter().all(|a| a.key_line.is_none()), "the defaults used after a type error still carry no line");
    let r = Registry::from_raw(&ExternalAppsRaw::WrongType, &ExternalAppsLines::default(), &env, None);
    assert!(r.type_error && r.type_error_line.is_none(), "no line known: W-9B in its current wording");
}

// A `lines` that does not match the raw array (empty / shorter) must not panic and just yields no lines.
#[test]
fn missing_lines_give_none_and_never_panic() {
    let mut bad = good("bad");
    bad.program = s(r"bin\x.exe");
    let r = build(vec![bad, good("ok")], &ExternalAppsLines::default());
    assert_eq!(r.invalid[0].line, None);
    assert_eq!(r.apps[0].key_line, None);
    let r = build(vec![good("a"), good("b")], &lines_of(Some(1), vec![al(1, 2, 3)]));
    assert_eq!(r.apps.len(), 2);
}

// R-1656 / AC-1657: the `%NAME%` expansion uses the `env` handed in at THIS call (so the check expands at check time), and the
// line of the failure is still reported.
#[test]
fn ac1657_expansion_uses_the_injected_environment_of_each_call() {
    let mut raw = good("tool");
    raw.program = s(r"%MY_TOOL_DIR%\t.exe");
    let lines = lines_of(Some(1), vec![al(1, 2, 3)]);
    let defined = build(vec![raw.clone()], &lines);
    assert_eq!(defined.apps[0].program, r"C:\tools\t.exe");
    assert!(defined.invalid.is_empty());
    let none = |_: &str| -> Option<OsString> { None };
    let undefined = Registry::from_raw(&ExternalAppsRaw::Array(vec![raw]), &lines, &none, None);
    assert!(undefined.apps.is_empty());
    assert_eq!(undefined.invalid[0].line, Some(3));
    assert_eq!(defined.apps[0].program, r"C:\tools\t.exe", "the earlier registry is a value: a later call changes nothing");
}
