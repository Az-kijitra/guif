//! TDD (unit-test-writer, 2026-10-17): `external_apps/registry.rs` (+ `defaults.rs`) -- the start-up validation of the
//! registrations and the four default registrations.
//! Specs: SPEC-0300-0021 R-1500 (fields), R-1501 (read once), R-1502 (`external_apps` absent -> the default four; present ->
//! ONLY what is written, never mixed; `[]` = no registration), R-1503 (per-element validation: 1 name, 2 program, 3 args /
//! args_for_file; unknown fields ignored; same `name` twice is fine; existence of the executable is NOT checked here), R-1503-1
//! (a bad / non-string `key` only loses the key), R-1504 (a type error -> the default four + a flag), R-1505 (20 registrations,
//! counting the valid ones only), R-1506 (config order), R-1510 / R-1510-1 (the default four: program / args / args_for_file / key
//! by number; NO `name`; the `default` mark + the number), R-1540-1 (`program` expanded ONCE at start-up; the kept value is the
//! expanded one), AC-1500, AC-1502, AC-1503, AC-1504, AC-1505, AC-1507, AC-1534;
//! SPEC-0200-0001 §3.16.2 (`registry.rs`, `defaults.rs`), §3.16.3 (the DTO fields), §3.16.15.
//!
//! Contract the implementer must satisfy (module `external_apps::registry`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod registry_tests;`; the raw types live in `shared/schema/external_apps.rs`):
//!
//! ```ignore
//! // shared::schema::external_apps  (pure data, no logic; all derive Debug, Clone, PartialEq, Eq)
//! pub enum RawValue<T> { Missing, WrongType, Value(T) }
//! pub struct RawExternalApp { pub name: RawValue<String>, pub program: RawValue<String>, pub args: RawValue<Vec<String>>,
//!                             pub args_for_file: RawValue<Vec<String>>, pub key: RawValue<String> }
//! pub enum ExternalAppsRaw { Missing, WrongType, Array(Vec<RawExternalApp>) }
//!
//! // external_apps::registry
//! #[derive(Debug, Clone, PartialEq, Eq)]
//! pub struct RegisteredApp { pub default_no: Option<u8> /* Some(1..=4) for the default four */, pub name: Option<String> /* None for the default four */,
//!     pub program: String /* EXPANDED (R-1540-1) */, pub args: Vec<String>, pub args_for_file: Option<Vec<String>>,
//!     pub key: Option<String> /* the raw string; None = no key */, pub key_invalid: bool /* `key` was not a string */ }
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum InvalidReason { Invalid, Limit }
//! #[derive(Debug, Clone, PartialEq, Eq)]
//! pub struct InvalidRegistration { pub position: usize /* 1-based index in the config array */, pub name: Option<String> /* a string that is not empty and has no control character */, pub reason: InvalidReason }
//! pub struct Registry { pub apps: Vec<RegisteredApp>, pub invalid: Vec<InvalidRegistration> /* ascending position */, pub type_error: bool, /* + private path_var */ }
//! impl Registry {
//!     pub fn from_raw(raw: &ExternalAppsRaw, lines: &ExternalAppsLines, env: &dyn Fn(&str) -> Option<std::ffi::OsString>, path_var: Option<std::ffi::OsString>) -> Registry;
//!     pub fn path_var(&self) -> Option<&std::ffi::OsStr>;   // the start-up snapshot of PATH
//! }
//! ```
//! `Registry` must be `Send + Sync` (it is a Tauri managed state), immutable, and `from_raw` must not touch the file system.

use std::collections::BTreeMap;
use std::ffi::OsString;

use super::registry::{InvalidReason, InvalidRegistration, Registry};
use crate::shared::schema::config_lines::ExternalAppsLines;
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

// ------------------------------------------------------------------ builders

fn env_of(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
    let map: BTreeMap<String, String> = pairs.iter().map(|(k, v)| (k.to_uppercase(), v.to_string())).collect();
    move |name: &str| map.get(&name.to_uppercase()).map(OsString::from)
}

const LOCAL: &str = r"C:\Users\u\AppData\Local";
const SYSROOT: &str = r"C:\Windows";

fn registry(raw: &ExternalAppsRaw) -> Registry {
    Registry::from_raw(raw, &ExternalAppsLines::default(), &env_of(&[("LOCALAPPDATA", LOCAL), ("SystemRoot", SYSROOT), ("MYDIR", r"D:\p2")]), Some(OsString::from(r"D:\p1;D:\p2")))
}

fn s(v: &str) -> RawValue<String> {
    RawValue::Value(v.to_string())
}

fn list(v: &[&str]) -> RawValue<Vec<String>> {
    RawValue::Value(v.iter().map(|x| x.to_string()).collect())
}

fn app(name: &str, program: &str) -> RawExternalApp {
    RawExternalApp { name: s(name), program: s(program), args: RawValue::Missing, args_for_file: RawValue::Missing, key: RawValue::Missing }
}

fn arr(apps: Vec<RawExternalApp>) -> ExternalAppsRaw {
    ExternalAppsRaw::Array(apps)
}

fn is_send_sync<T: Send + Sync>() {}

// ------------------------------------------------------------------ the default four (AC-1500, R-1510, R-1510-1)

fn assert_the_default_four(r: &Registry) {
    assert_eq!(r.apps.len(), 4);
    assert!(r.invalid.is_empty());
    let expected: [(&str, Vec<&str>, Option<Vec<&str>>, &str); 4] = [
        ("wt.exe", vec!["-d", "{dir}"], None, "Ctrl+Alt+C"),
        (r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe", vec!["{path}"], None, "Ctrl+Alt+V"),
        (r"C:\Windows\explorer.exe", vec!["{dir}"], Some(vec!["/select,", "{path}"]), "Ctrl+Alt+E"),
        (r"C:\Users\u\AppData\Local\GitHubDesktop\GitHubDesktop.exe", vec!["{dir}"], None, "Ctrl+Alt+Shift+G"),
    ];
    for (i, (program, args, for_file, key)) in expected.iter().enumerate() {
        let a = &r.apps[i];
        assert_eq!(a.default_no, Some(i as u8 + 1), "app {i}: the number follows the R-1510 order");
        assert_eq!(a.name, None, "app {i}: the backend holds no `name` of a default registration (R-1510-1)");
        assert_eq!(a.program, *program, "app {i}: the program is the EXPANDED value");
        assert_eq!(a.args, args.iter().map(|x| x.to_string()).collect::<Vec<_>>(), "app {i}");
        assert_eq!(a.args_for_file, for_file.as_ref().map(|v| v.iter().map(|x| x.to_string()).collect::<Vec<_>>()), "app {i}");
        assert_eq!(a.key.as_deref(), Some(*key), "app {i}");
        assert!(!a.key_invalid, "app {i}");
    }
}

#[test]
fn ac1500_without_external_apps_the_four_defaults_are_used_in_order() {
    let r = registry(&ExternalAppsRaw::Missing);
    assert_the_default_four(&r);
    assert!(!r.type_error);
}

#[test]
fn ac1500_the_explorer_default_has_the_two_element_args_for_file_of_spike_s2() {
    let r = registry(&ExternalAppsRaw::Missing);
    assert_eq!(r.apps[2].args_for_file, Some(vec!["/select,".to_string(), "{path}".to_string()]));
    assert_ne!(r.apps[2].args_for_file, Some(vec!["/select,{path}".to_string()]), "the one-element form fails (S-2)");
}

#[test]
fn r1504_a_type_error_uses_the_default_four_and_raises_the_flag() {
    let r = registry(&ExternalAppsRaw::WrongType);
    assert_the_default_four(&r);
    assert!(r.type_error);
}

#[test]
fn r1502_an_empty_array_is_no_registration_at_all() {
    let r = registry(&arr(vec![]));
    assert!(r.apps.is_empty());
    assert!(r.invalid.is_empty());
    assert!(!r.type_error);
}

#[test]
fn r1502_written_registrations_are_used_alone_and_never_mixed_with_the_defaults() {
    let r = registry(&arr(vec![app("Mine", r"C:\t\mine.exe")]));
    assert_eq!(r.apps.len(), 1);
    assert_eq!(r.apps[0].name.as_deref(), Some("Mine"));
    assert_eq!(r.apps[0].default_no, None);
    assert!(r.apps.iter().all(|a| a.default_no.is_none()));
}

#[test]
fn r1506_the_order_is_the_order_in_config_toml() {
    let r = registry(&arr(vec![app("c", r"C:\t\c.exe"), app("a", r"C:\t\a.exe"), app("b", r"C:\t\b.exe")]));
    let names: Vec<_> = r.apps.iter().map(|a| a.name.clone().unwrap()).collect();
    assert_eq!(names, ["c", "a", "b"]);
}

#[test]
fn the_registry_is_a_shareable_immutable_value() {
    is_send_sync::<Registry>();
}

#[test]
fn the_start_up_path_is_kept_for_later_lookups_r1542() {
    let r = registry(&ExternalAppsRaw::Missing);
    assert_eq!(r.path_var(), Some(std::ffi::OsStr::new(r"D:\p1;D:\p2")));
    let none = Registry::from_raw(&ExternalAppsRaw::Missing, &ExternalAppsLines::default(), &env_of(&[("LOCALAPPDATA", LOCAL), ("SystemRoot", SYSROOT)]), None);
    assert_eq!(none.path_var(), None);
}

// ------------------------------------------------------------------ the fields of a valid element (R-1500)

#[test]
fn a_full_element_is_kept_field_by_field() {
    let raw = RawExternalApp {
        name: s("VS Codeで開く"),
        program: s(r"C:\Tools\Code.exe"),
        args: list(&["--reuse-window", "{path}"]),
        args_for_file: list(&["--goto", "{path}"]),
        key: s("Ctrl+Alt+V, F9"),
    };
    let r = registry(&arr(vec![raw]));
    assert_eq!(r.apps.len(), 1);
    let a = &r.apps[0];
    assert_eq!(a.name.as_deref(), Some("VS Codeで開く"));
    assert_eq!(a.program, r"C:\Tools\Code.exe");
    assert_eq!(a.args, ["--reuse-window", "{path}"]);
    assert_eq!(a.args_for_file, Some(vec!["--goto".to_string(), "{path}".to_string()]));
    assert_eq!(a.key.as_deref(), Some("Ctrl+Alt+V, F9"), "the raw key string; grammar and overlaps are the front end's job (§3.16.3)");
    assert!(!a.key_invalid);
}

#[test]
fn the_optional_fields_default_to_empty_args_no_args_for_file_no_key() {
    let r = registry(&arr(vec![app("x", r"C:\t\x.exe")]));
    let a = &r.apps[0];
    assert!(a.args.is_empty());
    assert_eq!(a.args_for_file, None);
    assert_eq!(a.key, None);
    assert!(!a.key_invalid);
}

#[test]
fn an_empty_key_string_means_no_key_and_is_not_an_error() {
    let mut raw = app("x", r"C:\t\x.exe");
    raw.key = s("");
    let r = registry(&arr(vec![raw]));
    assert_eq!(r.apps.len(), 1);
    assert!(!r.apps[0].key_invalid);
    assert!(r.apps[0].key.as_deref().unwrap_or("").is_empty());
}

#[test]
fn r15401_the_program_is_kept_expanded_and_the_environment_is_used_only_once() {
    let r = registry(&arr(vec![app("x", r"%MYDIR%\tool.exe")]));
    assert_eq!(r.apps[0].program, r"D:\p2\tool.exe");
}

#[test]
fn r1503_the_existence_of_the_executable_is_not_checked_at_start_up() {
    let r = registry(&arr(vec![app("x", r"Z:\no\such\dir\x.exe"), app("y", "no-such-program-anywhere")]));
    assert_eq!(r.apps.len(), 2);
    assert!(r.invalid.is_empty());
}

// ------------------------------------------------------------------ name (R-1503 1, AC-1503)

fn only_valid(raw: RawExternalApp) -> bool {
    let r = registry(&arr(vec![raw]));
    let valid = r.apps.len() == 1 && r.invalid.is_empty();
    let invalid = r.apps.is_empty() && r.invalid.len() == 1;
    assert!(valid || invalid, "an element is either used or reported: {:?} / {:?}", r.apps, r.invalid);
    valid
}

fn with_name(name: RawValue<String>) -> RawExternalApp {
    RawExternalApp { name, ..app("ignored", r"C:\t\x.exe") }
}

#[test]
fn ac1503_bad_names_make_the_element_invalid() {
    let long65: String = "あ".repeat(65);
    let cases: Vec<(&str, RawValue<String>)> = vec![
        ("missing", RawValue::Missing),
        ("not a string", RawValue::WrongType),
        ("empty", s("")),
        ("blank", s("   ")),
        ("tab only", s("\t")),
        ("BEL inside", s("a\u{7}b")),
        ("newline inside", s("a\nb")),
        ("NUL inside", s("a\0b")),
        ("65 characters", RawValue::Value(long65)),
    ];
    for (what, name) in cases {
        assert!(!only_valid(with_name(name)), "name: {what}");
    }
}

#[test]
fn ac1503_a_name_of_64_characters_is_valid_and_counts_characters_not_bytes() {
    let sixty_four: String = "あ".repeat(64); // 192 bytes
    assert!(only_valid(with_name(RawValue::Value(sixty_four.clone()))));
    let r = registry(&arr(vec![with_name(RawValue::Value(sixty_four.clone()))]));
    assert_eq!(r.apps[0].name.as_deref(), Some(sixty_four.as_str()));
    assert!(only_valid(with_name(s("a"))));
    assert!(only_valid(with_name(s("VS Code で 開く (user) 日本語"))));
}

#[test]
fn ac1507_the_same_name_twice_is_fine_and_is_not_reported() {
    let r = registry(&arr(vec![app("same", r"C:\t\a.exe"), app("same", r"C:\t\b.exe")]));
    assert_eq!(r.apps.len(), 2);
    assert!(r.invalid.is_empty());
}

// ------------------------------------------------------------------ program (R-1503 2, AC-1503)

fn with_program(program: RawValue<String>) -> RawExternalApp {
    RawExternalApp { program, ..app("p", r"C:\t\x.exe") }
}

#[test]
fn ac1503_bad_programs_make_the_element_invalid() {
    let cases: Vec<(&str, RawValue<String>)> = vec![
        ("missing", RawValue::Missing),
        ("not a string", RawValue::WrongType),
        ("empty", s("")),
        (".bat", s("x.bat")),
        (".cmd", s("x.cmd")),
        (".lnk", s("x.lnk")),
        (".ps1", s(r"C:\t\x.ps1")),
        ("no extension on an absolute path", s(r"C:\t\x")),
        ("an undefined variable", s(r"%UNDEFINED_VAR%\x.exe")),
        ("relative path", s(r"bin\x.exe")),
        ("parent path", s(r"..\x.exe")),
        ("drive relative", s("C:x.exe")),
        ("an expansion that is relative", s(r"%MYDIR%\..\..\x.bat")),
    ];
    for (what, program) in cases {
        assert!(!only_valid(with_program(program)), "program: {what}");
    }
}

#[test]
fn ac1503_valid_programs() {
    for ok in ["X.EXE", r"C:\100%\x.exe", "wt.exe", "tool", r"C:\Program Files\a b\x.exe", r"\\srv\sh\x.exe", r"%MYDIR%\tool.exe"] {
        assert!(only_valid(with_program(s(ok))), "program `{ok}` must be valid");
    }
}

// ------------------------------------------------------------------ args / args_for_file (R-1503 3)

#[test]
fn bad_args_make_the_element_invalid() {
    let cases: Vec<(&str, RawValue<Vec<String>>)> = vec![
        ("not an array of strings", RawValue::WrongType),
        ("{cwd}", list(&["{cwd}"])),
        ("{PATH}", list(&["{PATH}"])),
        ("an unpaired brace", list(&["a{"])),
        ("one bad element among good ones", list(&["-d", "{dir}", "{file}"])),
    ];
    for (what, args) in cases {
        let mut raw = app("a", r"C:\t\x.exe");
        raw.args = args.clone();
        assert!(!only_valid(raw), "args: {what}");
        let mut raw = app("a", r"C:\t\x.exe");
        raw.args_for_file = args;
        assert!(!only_valid(raw), "args_for_file: {what}");
    }
}

#[test]
fn good_args_are_valid_and_percent_signs_stay() {
    let mut raw = app("a", r"C:\t\x.exe");
    raw.args = list(&["{{x}}", "a{path}b", "{path}{dir}", "%TEMP%", ""]);
    raw.args_for_file = list(&["/select,", "{path}"]);
    let r = registry(&arr(vec![raw]));
    assert_eq!(r.apps.len(), 1);
    assert_eq!(r.apps[0].args, ["{{x}}", "a{path}b", "{path}{dir}", "%TEMP%", ""], "args are not expanded and not changed (R-1524)");
}

// ------------------------------------------------------------------ key (R-1503-1)

#[test]
fn r15031_a_key_that_is_not_a_string_only_loses_the_key_and_the_element_stays() {
    let mut raw = app("k", r"C:\t\x.exe");
    raw.key = RawValue::WrongType;
    let r = registry(&arr(vec![raw]));
    assert_eq!(r.apps.len(), 1, "the element is kept (it can be run from the menus)");
    assert!(r.invalid.is_empty());
    assert!(r.apps[0].key_invalid);
    assert_eq!(r.apps[0].key, None);
}

// ------------------------------------------------------------------ the report of the unusable (AC-1502 / AC-1507 / AC-1508)

#[test]
fn ac1502_the_second_and_third_elements_are_dropped_and_reported_with_position_and_name() {
    let mut third = app("VS Codeで開く", r"C:\t\code.exe");
    third.args = list(&["{cwd}"]);
    let r = registry(&arr(vec![app("first", r"C:\t\first.exe"), app("second", r"bin\x.exe"), third]));
    assert_eq!(r.apps.len(), 1);
    assert_eq!(r.apps[0].name.as_deref(), Some("first"));
    assert_eq!(
        r.invalid,
        vec![
            InvalidRegistration { position: 2, name: Some("second".into()), reason: InvalidReason::Invalid, line: None },
            InvalidRegistration { position: 3, name: Some("VS Codeで開く".into()), reason: InvalidReason::Invalid, line: None },
        ]
    );
    assert!(!r.type_error);
}

#[test]
fn the_name_of_a_report_is_given_only_when_it_is_readable() {
    let unreadable_names: Vec<RawValue<String>> = vec![RawValue::Missing, RawValue::WrongType, s(""), s("   "), s("a\u{7}b")];
    for name in unreadable_names {
        let mut raw = app("x", r"bin\x.exe"); // invalid by program
        raw.name = name.clone();
        let r = registry(&arr(vec![raw]));
        assert_eq!(r.invalid.len(), 1);
        assert_eq!(r.invalid[0].name, None, "{name:?}");
        assert_eq!(r.invalid[0].position, 1);
    }
    // a 65-character name is still a readable string (only the element is invalid)
    let long65: String = "x".repeat(65);
    let r = registry(&arr(vec![with_name(RawValue::Value(long65.clone()))]));
    assert_eq!(r.invalid, vec![InvalidRegistration { position: 1, name: Some(long65), reason: InvalidReason::Invalid, line: None }]);
}

#[test]
fn positions_are_one_based_over_the_whole_array_in_ascending_order() {
    let r = registry(&arr(vec![app("a", "x.bat"), app("b", r"C:\t\b.exe"), app("c", "x.cmd"), app("d", r"C:\t\d.exe"), app("e", "")]));
    assert_eq!(r.apps.len(), 2);
    assert_eq!(r.invalid.iter().map(|i| i.position).collect::<Vec<_>>(), [1, 3, 5]);
}

// ------------------------------------------------------------------ the limit of 20 (R-1505, AC-1505)

fn valid_apps(n: usize) -> Vec<RawExternalApp> {
    (1..=n).map(|i| app(&format!("app{i}"), &format!(r"C:\t\app{i}.exe"))).collect()
}

#[test]
fn ac1505_twenty_are_used_and_the_twenty_first_is_reported_as_over_the_limit() {
    let r = registry(&arr(valid_apps(21)));
    assert_eq!(r.apps.len(), 20);
    assert_eq!(r.apps[19].name.as_deref(), Some("app20"));
    assert_eq!(r.invalid, vec![InvalidRegistration { position: 21, name: Some("app21".into()), reason: InvalidReason::Limit, line: None }]);
}

#[test]
fn exactly_twenty_is_fine_and_every_element_past_the_limit_is_reported() {
    let r = registry(&arr(valid_apps(20)));
    assert_eq!((r.apps.len(), r.invalid.len()), (20, 0));
    let r = registry(&arr(valid_apps(23)));
    assert_eq!(r.apps.len(), 20);
    assert_eq!(r.invalid.iter().map(|i| (i.position, i.reason)).collect::<Vec<_>>(), [(21, InvalidReason::Limit), (22, InvalidReason::Limit), (23, InvalidReason::Limit)]);
}

#[test]
fn only_the_valid_elements_are_counted_towards_the_limit() {
    let mut apps = vec![app("bad", "x.bat")];
    apps.extend(valid_apps(21)); // positions 2..=22
    let r = registry(&arr(apps));
    assert_eq!(r.apps.len(), 20, "the invalid first element does not use up a slot");
    assert_eq!(
        r.invalid.iter().map(|i| (i.position, i.reason)).collect::<Vec<_>>(),
        [(1, InvalidReason::Invalid), (22, InvalidReason::Limit)]
    );
}
