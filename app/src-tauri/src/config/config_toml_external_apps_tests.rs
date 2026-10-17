//! TDD (unit-test-writer, 2026-10-17): `config/config_toml.rs` reads the top-level `external_apps` in the SAME single read /
//! single TOML parse as `input_keymap_custom` and `ui_theme`, and hands it back RAW (no per-element validation).
//! Specs: SPEC-0300-0021 R-1500 (the fields; `[[external_apps]]` = an array of tables), R-1501 (read once; the app never writes
//! `config.toml`), R-1502 (absent -> `Missing`; `external_apps = []` is a real empty list), R-1503 (unknown fields are ignored; the
//! values are NOT judged here), R-1504 (a value that is not an array of tables -> the WHOLE value is `WrongType`, including the case of
//! a non-table element in the array, design question Q-1 decided 2026-10-17; a TOML syntax error -> the whole file is unreadable and
//! `external_apps` is `Missing`, so the default four apply, notice = the single R-45-2 one), AC-1504, AC-1507;
//! SPEC-0300-0010 R-45; SPEC-0200-0001 §3.16.1 / §3.16.2 (`config/` never imports `external_apps/`; the raw types live in
//! `shared/schema/external_apps.rs`), §3.16.3, §3.16.15.
//!
//! Contract the implementer must satisfy (declared in `config/mod.rs` as `#[cfg(test)] mod config_toml_external_apps_tests;`):
//!
//! ```ignore
//! pub struct ConfigTomlLoadResult { pub keymap: KeymapRawLoadResult, pub ui_theme: UiThemeRaw, pub external_apps: ExternalAppsRaw }
//! // Default / missing file / whole-file failure => external_apps: ExternalAppsRaw::Missing
//! // `ExternalAppsRaw`, `RawExternalApp`, `RawValue<T>`: see external_apps/registry_tests.rs (all derive Debug, Clone, PartialEq, Eq).
//! ```
//! `ConfigTomlLoadResult` derives `Eq`: the new type must be `Eq` too. `StartupConfig` structure-literal sites only need the new field.

use std::fs;
use std::path::PathBuf;

use super::config_toml::load;
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};
use crate::shared::schema::ui_theme::UiThemeRaw;

fn write_config(contents: impl AsRef<[u8]>) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, contents).unwrap();
    (dir, path)
}

fn s(v: &str) -> RawValue<String> {
    RawValue::Value(v.to_string())
}

fn strs(v: &[&str]) -> RawValue<Vec<String>> {
    RawValue::Value(v.iter().map(|x| x.to_string()).collect())
}

fn external(body: &str) -> ExternalAppsRaw {
    let (_d, path) = write_config(body);
    load(&path).external_apps
}

// ------------------------------------------------------------------ absent / empty

#[test]
fn a_missing_file_has_external_apps_missing_and_nothing_is_created() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    assert_eq!(load(&path).external_apps, ExternalAppsRaw::Missing);
    assert!(!path.exists());
}

#[test]
fn a_file_without_external_apps_is_missing() {
    assert_eq!(external("ui_theme = \"dark\"\n[input_keymap_custom]\nsort_menu = \"D\"\n"), ExternalAppsRaw::Missing);
    assert_eq!(external(""), ExternalAppsRaw::Missing);
}

#[test]
fn ac1501_an_empty_array_is_an_empty_list_not_missing() {
    assert_eq!(external("external_apps = []\n"), ExternalAppsRaw::Array(vec![]));
}

// ------------------------------------------------------------------ the array of tables, verbatim and unvalidated

#[test]
fn array_of_tables_elements_are_returned_in_order_verbatim() {
    let got = external(
        r#"
[[external_apps]]
name = "ターミナルで開く"
program = "wt.exe"
args = ["-d", "{dir}"]
key = "Ctrl+Alt+C"

[[external_apps]]
name = "エクスプローラーで開く"
program = '%SystemRoot%\explorer.exe'
args = ["{dir}"]
args_for_file = ["/select,", "{path}"]
"#,
    );
    assert_eq!(
        got,
        ExternalAppsRaw::Array(vec![
            RawExternalApp { name: s("ターミナルで開く"), program: s("wt.exe"), args: strs(&["-d", "{dir}"]), args_for_file: RawValue::Missing, key: s("Ctrl+Alt+C") },
            RawExternalApp {
                name: s("エクスプローラーで開く"),
                program: s(r"%SystemRoot%\explorer.exe"),
                args: strs(&["{dir}"]),
                args_for_file: strs(&["/select,", "{path}"]),
                key: RawValue::Missing,
            },
        ])
    );
}

#[test]
fn inline_tables_in_an_array_work_like_array_of_tables() {
    let got = external("external_apps = [{ name = \"a\", program = \"a.exe\" }, { name = \"b\", program = \"b.exe\" }]\n");
    let ExternalAppsRaw::Array(items) = got else { panic!("expected an array") };
    assert_eq!(items.len(), 2);
    assert_eq!(items[1].name, s("b"));
    assert_eq!(items[0].args, RawValue::Missing);
}

#[test]
fn no_validation_happens_here_the_values_are_handed_on_as_they_are() {
    // empty name, a relative program, a bad template, a .bat, a 70-character name: all are the registry's business (R-1503)
    let long = "n".repeat(70);
    let got = external(&format!(
        "[[external_apps]]\nname = \"\"\nprogram = \"bin\\\\x.bat\"\nargs = [\"{{cwd}}\"]\n\n[[external_apps]]\nname = \"{long}\"\nprogram = \"\"\n"
    ));
    let ExternalAppsRaw::Array(items) = got else { panic!("expected an array") };
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].name, s(""));
    assert_eq!(items[0].program, s(r"bin\x.bat"));
    assert_eq!(items[0].args, strs(&["{cwd}"]));
    assert_eq!(items[1].name, s(&long));
    assert_eq!(items[1].program, s(""));
}

#[test]
fn ac1507_unknown_fields_are_ignored_and_the_element_is_kept() {
    let got = external("[[external_apps]]\nname = \"a\"\nprogram = \"a.exe\"\ncolor = \"red\"\nextra = [1, 2]\n");
    let ExternalAppsRaw::Array(items) = got else { panic!("expected an array") };
    assert_eq!(items, vec![RawExternalApp { name: s("a"), program: s("a.exe"), args: RawValue::Missing, args_for_file: RawValue::Missing, key: RawValue::Missing }]);
}

#[test]
fn an_empty_table_element_has_every_field_missing() {
    let got = external("external_apps = [{}]\n");
    assert_eq!(
        got,
        ExternalAppsRaw::Array(vec![RawExternalApp {
            name: RawValue::Missing,
            program: RawValue::Missing,
            args: RawValue::Missing,
            args_for_file: RawValue::Missing,
            key: RawValue::Missing
        }])
    );
}

#[test]
fn an_empty_key_string_is_a_string_not_missing() {
    let ExternalAppsRaw::Array(items) = external("[[external_apps]]\nname = \"a\"\nprogram = \"a.exe\"\nkey = \"\"\n") else { panic!() };
    assert_eq!(items[0].key, s(""));
}

// ------------------------------------------------------------------ field types

#[test]
fn a_field_of_the_wrong_type_is_marked_wrong_type_and_its_neighbours_are_untouched() {
    let ExternalAppsRaw::Array(items) = external(
        "[[external_apps]]\nname = 1\nprogram = true\nargs = \"-d\"\nargs_for_file = 3.5\nkey = [\"Ctrl+A\"]\n\n\
         [[external_apps]]\nname = \"ok\"\nprogram = \"ok.exe\"\nargs = [\"a\", 1]\nargs_for_file = [\"x\", [\"y\"]]\nkey = 5\n",
    ) else {
        panic!("expected an array")
    };
    assert_eq!(items[0].name, RawValue::WrongType);
    assert_eq!(items[0].program, RawValue::WrongType);
    assert_eq!(items[0].args, RawValue::WrongType);
    assert_eq!(items[0].args_for_file, RawValue::WrongType);
    assert_eq!(items[0].key, RawValue::WrongType);
    assert_eq!(items[1].name, s("ok"));
    assert_eq!(items[1].program, s("ok.exe"));
    assert_eq!(items[1].args, RawValue::WrongType, "an array with a non-string element is not an array of strings (R-1503 3)");
    assert_eq!(items[1].args_for_file, RawValue::WrongType);
    assert_eq!(items[1].key, RawValue::WrongType);
}

#[test]
fn an_empty_args_array_is_a_valid_empty_list() {
    let ExternalAppsRaw::Array(items) = external("[[external_apps]]\nname = \"a\"\nprogram = \"a.exe\"\nargs = []\n") else { panic!() };
    assert_eq!(items[0].args, strs(&[]));
}

// ------------------------------------------------------------------ R-1504: a type error is the whole value

#[test]
fn ac1504_a_value_that_is_not_an_array_of_tables_is_wrong_type() {
    for body in [
        "external_apps = \"wt.exe\"\n",
        "external_apps = 1\n",
        "external_apps = true\n",
        "external_apps = { name = \"a\", program = \"a.exe\" }\n",
        "[external_apps]\nname = \"a\"\nprogram = \"a.exe\"\n",
        "external_apps = 1979-05-27T07:32:00Z\n",
    ] {
        assert_eq!(external(body), ExternalAppsRaw::WrongType, "{body:?}");
    }
}

#[test]
fn q1_an_array_with_a_non_table_element_is_wrong_type_as_a_whole() {
    for body in [
        "external_apps = [\"wt.exe\"]\n",
        "external_apps = [1, 2]\n",
        "external_apps = [{ name = \"a\", program = \"a.exe\" }, \"oops\"]\n",
        "external_apps = [[1]]\n",
    ] {
        assert_eq!(external(body), ExternalAppsRaw::WrongType, "{body:?}: the good element is NOT kept (design question Q-1)");
    }
}

// ------------------------------------------------------------------ the rest of config.toml is unaffected

#[test]
fn external_apps_does_not_disturb_the_keymap_or_the_theme() {
    let (_d, path) = write_config(
        "ui_theme = \"dark\"\nexternal_apps = []\n\n[input_keymap_custom]\nsort_menu = \"D\"\n",
    );
    let r = load(&path);
    assert_eq!(r.ui_theme, UiThemeRaw::Str("dark".into()));
    assert_eq!(r.keymap.entries.len(), 1);
    assert!(r.keymap.parse_error.is_none());
    assert_eq!(r.external_apps, ExternalAppsRaw::Array(vec![]));
}

#[test]
fn a_wrong_typed_external_apps_does_not_fail_the_whole_file() {
    let (_d, path) = write_config("ui_theme = \"dark\"\nexternal_apps = \"nope\"\n[input_keymap_custom]\nsort_menu = \"D\"\n");
    let r = load(&path);
    assert_eq!(r.external_apps, ExternalAppsRaw::WrongType);
    assert!(r.keymap.parse_error.is_none(), "only the default four are used; the keymap and theme are read as usual");
    assert_eq!(r.ui_theme, UiThemeRaw::Str("dark".into()));
    assert_eq!(r.keymap.entries.len(), 1);
}

#[test]
fn a_registration_written_after_a_table_header_is_part_of_that_table_not_a_top_level_external_apps() {
    // MINOR-35: `external_apps = []` AFTER `[input_keymap_custom]` is an entry of the keymap table, so `external_apps` stays Missing.
    let (_d, path) = write_config("[input_keymap_custom]\nsort_menu = \"D\"\nexternal_apps = []\n");
    let r = load(&path);
    assert_eq!(r.external_apps, ExternalAppsRaw::Missing);
    assert_eq!(r.keymap.entries.len(), 2, "`external_apps` became a keymap entry (the keymap validation reports it as an unknown action)");
}

// ------------------------------------------------------------------ R-1504: an unreadable file -> the default four

#[test]
fn a_toml_syntax_error_makes_the_whole_file_unreadable_and_external_apps_missing() {
    let (_d, path) = write_config("ui_theme = \"dark\"\nexternal_apps = []\nthis is = = not toml\n");
    let r = load(&path);
    assert_eq!(r.external_apps, ExternalAppsRaw::Missing, "the default four apply");
    let err = r.keymap.parse_error.expect("the single R-45-2 error");
    assert!(err.whole_file);
    assert_eq!(r.ui_theme, UiThemeRaw::Missing);
}

#[test]
fn non_utf8_bytes_and_an_io_error_also_give_missing() {
    let (_d, path) = write_config(vec![0xff, 0xfe, 0x00, 0xc3, 0x28]);
    assert_eq!(load(&path).external_apps, ExternalAppsRaw::Missing);
    let dir = tempfile::tempdir().unwrap();
    let as_dir = dir.path().join("config.toml");
    fs::create_dir(&as_dir).unwrap();
    assert_eq!(load(&as_dir).external_apps, ExternalAppsRaw::Missing);
}

#[test]
fn a_leading_bom_does_not_hide_external_apps() {
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(b"external_apps = []\n");
    let (_d, path) = write_config(bytes);
    assert_eq!(load(&path).external_apps, ExternalAppsRaw::Array(vec![]));
}

// ------------------------------------------------------------------ R-1501: the app never writes config.toml

#[test]
fn load_never_modifies_config_toml_or_creates_a_sibling() {
    let original = "# hand edited\nui_theme = \"light\"\n\n[[external_apps]]\nname = \"a\"\nprogram = \"a.exe\"\n";
    let (dir, path) = write_config(original);
    let mtime = fs::metadata(&path).unwrap().modified().unwrap();
    load(&path);
    load(&path);
    assert_eq!(fs::read_to_string(&path).unwrap(), original);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no .bak / .tmp");
}
