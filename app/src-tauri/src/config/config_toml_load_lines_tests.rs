//! TDD (unit-test-writer, 2026-10-20): what `config_toml::load` now also returns -- `present`, `lines` and `unknown` -- and the
//! line of the W-30-2 / W-31 errors (SPEC-0300-0022 R-1641 / R-1642 / R-1643 / R-1643-1 / R-1644 / R-1645 / R-1640 table,
//! AC-1640 / AC-1641 / AC-1642; SPEC-0200-0001 §3.17.3 `config/config_toml.rs`, §3.17.5).
//!
//! Contract the implementer must satisfy (module `config::config_toml`; the data types are in `shared::schema::config_lines`,
//! see `config_toml_lines_tests.rs`):
//!
//! ```ignore
//! pub struct ConfigTomlLoadResult {
//!     pub keymap: KeymapRawLoadResult,
//!     pub ui_theme: UiThemeRaw,
//!     pub external_apps: ExternalAppsRaw,
//!     pub present: bool,                  // the file was there: everything except `NotFound` (an unreadable file IS present)
//!     pub lines: ConfigLines,             // all-None / empty when the file is absent, unreadable or has a syntax error
//!     pub unknown: Vec<UnknownSetting>,   // R-1643; in DOCUMENT order when `index` succeeded (R-1643-1), else key order
//! }
//! // `Default` stays (present: false, lines: default, unknown: empty).
//! // KeymapParseError.line is now also Some(the line of `input_keymap_custom`) when it is not a table (W-30-2, R-1642).
//! ```
//!
//! Unchanged behaviour (existing tests keep pinning it): unknown settings are NOT read, an `external_apps` element with an unknown
//! field is still used (R-1643 "振る舞いは変えない").

use std::fs;
use std::path::PathBuf;

use super::config_toml::load;
use crate::shared::schema::config_lines::{AppLines, ConfigLines, UnknownSetting};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawValue};
use crate::shared::schema::ui_theme::UiThemeRaw;

fn write(bytes: &[u8]) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, bytes).unwrap();
    (dir, path)
}

fn top(name: &str, line: u32) -> UnknownSetting {
    UnknownSetting::Top { name: name.to_string(), line: Some(line) }
}

fn field(position: usize, name: &str, line: u32) -> UnknownSetting {
    UnknownSetting::AppField { position, name: name.to_string(), line: Some(line) }
}

/// AC-1640's file: line 3 `ui_theme = "Dark"`, line 10 `[input_keymap_custom]`, line 12 `copy = "Ctrl+"`, line 13 `toggle_time`,
/// a valid first `[[external_apps]]` (line 5), a second one from line 20 with `program = "bin\\x.exe"` on line 22.
fn ac1640_text() -> String {
    let mut lines: Vec<String> = vec![String::new(); 22];
    lines[0] = "# config.toml".into();
    lines[2] = "ui_theme = \"Dark\"".into();
    lines[4] = "[[external_apps]]".into();
    lines[5] = "name = \"テスト用\"".into();
    lines[6] = "program = \"C:\\\\test\\\\t.exe\"".into();
    lines[9] = "[input_keymap_custom]".into();
    lines[11] = "copy = \"Ctrl+\"".into();
    lines[12] = "toggle_time = \"Ctrl+Alt+T\"".into();
    lines[19] = "[[external_apps]]".into();
    lines[20] = "name = \"bad\"".into();
    lines[21] = "program = \"bin\\\\x.exe\"".into();
    lines.join("\n") + "\n"
}

/// AC-1642's file: `ui_them` on line 2, `input_keymap_profile` on 3, an element from line 5, a second from 15 with `agrs` on 18.
fn ac1642_text() -> String {
    let mut lines: Vec<String> = vec![String::new(); 18];
    lines[0] = "# config.toml".into();
    lines[1] = "ui_them = \"dark\"".into();
    lines[2] = "input_keymap_profile = \"vim\"".into();
    lines[4] = "[[external_apps]]".into();
    lines[5] = "name = \"one\"".into();
    lines[6] = "program = \"C:\\\\t\\\\a.exe\"".into();
    lines[14] = "[[external_apps]]".into();
    lines[15] = "name = \"two\"".into();
    lines[16] = "program = \"C:\\\\t\\\\b.exe\"".into();
    lines[17] = "agrs = [\"{dir}\"]".into();
    lines.join("\n") + "\n"
}

// ------------------------------------------------------------------ present (R-1644, R-1654 W-AB)

// R-1644: no file => `present` is false (the check says "config.toml がない"), nothing else is set, and no file is created.
#[test]
fn r1644_a_missing_file_is_not_present_and_has_no_lines_or_unknown_settings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let r = load(&path);
    assert!(!r.present);
    assert_eq!(r.lines, ConfigLines::default());
    assert!(r.unknown.is_empty());
    assert!(!path.exists(), "load never creates config.toml (R-1645)");
}

#[test]
fn the_default_result_is_not_present() {
    let r = super::config_toml::ConfigTomlLoadResult::default();
    assert!(!r.present && r.unknown.is_empty() && r.lines == ConfigLines::default());
}

// An existing file is present whatever it holds: a 0-byte file and a comment-only file (the scaffold) are valid, empty settings.
#[test]
fn an_existing_empty_or_comment_only_file_is_present_with_nothing_reported() {
    for body in ["", "# only comments\n## a description\n# ui_theme = \"system\"\n"] {
        let (_d, path) = write(body.as_bytes());
        let r = load(&path);
        assert!(r.present, "body {body:?}");
        assert!(r.keymap.parse_error.is_none() && r.keymap.entries.is_empty(), "body {body:?}");
        assert_eq!(r.ui_theme, UiThemeRaw::Missing);
        assert_eq!(r.external_apps, ExternalAppsRaw::Missing);
        assert_eq!(r.lines, ConfigLines::default(), "body {body:?}");
        assert!(r.unknown.is_empty(), "AC-1631: the scaffold has no unknown settings, body {body:?}");
    }
}

// R-1654: an UNREADABLE file (syntax error, non-UTF-8, a folder in its place) is present: it is "W-31", not "config.toml がない".
#[test]
fn an_unreadable_file_is_still_present_and_reports_no_settings() {
    let (_d1, p1) = write(b"ui_theme = \"dark\"\nthis is = = not toml\n");
    let (_d2, p2) = write(&[0xff, 0xfe, 0x00, 0xc3, 0x28, 0xa0, 0xa1]);
    let d3 = tempfile::tempdir().unwrap();
    let p3 = d3.path().join("config.toml");
    fs::create_dir(&p3).unwrap();
    for (what, path) in [("syntax error", p1), ("non-UTF-8", p2), ("a folder", p3)] {
        let r = load(&path);
        assert!(r.present, "{what}");
        assert!(r.keymap.parse_error.as_ref().is_some_and(|e| e.whole_file), "{what}");
        assert_eq!(r.lines, ConfigLines::default(), "{what}: R-1641 no setting can be named");
        assert!(r.unknown.is_empty(), "{what}");
    }
}

// ------------------------------------------------------------------ the line of a syntax error (R-1641, AC-1641)

// AC-1641 (the content of `theme.mjs` S8): the error is on line 2 and no setting is named.
#[test]
fn ac1641_the_syntax_error_of_theme_mjs_s8_is_on_line_2() {
    let (_d, path) = write(b"ui_theme = \"dark\"\nthis is = = not toml\n");
    let err = load(&path).keymap.parse_error.expect("W-31");
    assert_eq!(err.line, Some(2));
    assert!(err.whole_file);
}

// SHOULD-121: the error line is right with a BOM, with CRLF and after multi-byte comments (the offset is a byte offset).
#[test]
fn the_syntax_error_line_survives_bom_crlf_and_multibyte_text() {
    let mut bom_crlf = vec![0xEF, 0xBB, 0xBF];
    bom_crlf.extend_from_slice(b"ui_theme = \"dark\"\r\nthis is = = not toml\r\n");
    let japanese = "## 日本語の説明\n## もう一行\nui_theme = \"dark\"\nthis is = = not toml\n".as_bytes().to_vec();
    for (what, bytes, line) in [("BOM + CRLF", bom_crlf, 2), ("Japanese comments", japanese, 4)] {
        let (_d, path) = write(&bytes);
        assert_eq!(load(&path).keymap.parse_error.expect("error").line, Some(line), "{what}");
    }
}

// ------------------------------------------------------------------ W-30-2: input_keymap_custom is not a table

// R-1642 / R-1640 table row 2: the line of the `input_keymap_custom` key, the theme is unaffected (R-917-5 (3)).
#[test]
fn w_30_2_a_non_table_input_keymap_custom_carries_its_line() {
    for (what, body, line) in [
        ("string", "# c\nui_theme = \"dark\"\ninput_keymap_custom = \"x\"\n", 3),
        ("array", "input_keymap_custom = [1, 2]\n", 1),
        ("array of tables", "ui_theme = \"dark\"\n\n[[input_keymap_custom]]\ncopy = \"x\"\n", 3),
    ] {
        let (_d, path) = write(body.as_bytes());
        let r = load(&path);
        let err = r.keymap.parse_error.unwrap_or_else(|| panic!("{what}: W-30-2 expected"));
        assert!(!err.whole_file, "{what}");
        assert_eq!(err.line, Some(line), "{what}");
        assert!(r.keymap.entries.is_empty(), "{what}");
    }
}

// ------------------------------------------------------------------ the lines of the known keys (AC-1640)

// AC-1640 / R-1642: the lines the notices are built from, together with the RAW values (unchanged: still unvalidated).
#[test]
fn ac1640_load_returns_the_line_of_every_known_key_and_still_the_raw_values() {
    let (_d, path) = write(ac1640_text().as_bytes());
    let r = load(&path);

    assert!(r.present && r.keymap.parse_error.is_none());
    assert_eq!(r.ui_theme, UiThemeRaw::Str("Dark".into()), "raw, unjudged (the judgement is interpret_ui_theme's)");
    assert_eq!(r.lines.ui_theme, Some(3));
    assert_eq!(r.lines.input_keymap_custom, Some(10));
    assert_eq!(r.lines.keymap_entries.get("copy"), Some(&12));
    assert_eq!(r.lines.keymap_entries.get("toggle_time"), Some(&13));
    assert_eq!(r.keymap.entries.iter().find(|e| e.action_id == "copy").unwrap().value.as_deref(), Some("Ctrl+"), "no validation here (MUST-86)");
    assert_eq!(r.lines.external_apps.line, Some(5));
    assert_eq!(
        r.lines.external_apps.apps,
        vec![
            AppLines { header: Some(5), name: Some(6), program: Some(7), args: None, args_for_file: None, key: None },
            AppLines { header: Some(20), name: Some(21), program: Some(22), args: None, args_for_file: None, key: None },
        ]
    );
    assert!(r.unknown.is_empty());
    let ExternalAppsRaw::Array(apps) = &r.external_apps else { panic!("two elements expected") };
    assert_eq!(apps.len(), 2);
    assert_eq!(apps[1].program, RawValue::Value("bin\\x.exe".into()));
}

// R-1642: a wrong-typed `ui_theme` / `external_apps` and non-string keymap values carry their lines too (W-33, W-9B).
#[test]
fn wrong_typed_known_keys_carry_their_lines() {
    let (_d, path) = write(b"# c\nui_theme = 3\nexternal_apps = \"wt.exe\"\n[input_keymap_custom]\nsort_menu = 123\n");
    let r = load(&path);
    assert_eq!(r.ui_theme, UiThemeRaw::WrongType);
    assert_eq!(r.lines.ui_theme, Some(2));
    assert_eq!(r.external_apps, ExternalAppsRaw::WrongType);
    assert_eq!(r.lines.external_apps.line, Some(3));
    assert_eq!(r.lines.keymap_entries.get("sort_menu"), Some(&5));
    assert_eq!(r.keymap.entries[0].value, None, "a non-string value is still value: None (AC-62 (iv))");
}

// SHOULD-121 + spike 5: BOM and CRLF in a real file give the same lines as plain LF.
#[test]
fn a_bom_and_crlf_file_has_the_same_lines_as_the_plain_one() {
    let plain = "ui_theme = \"dark\"\n[input_keymap_custom]\ncopy = \"x\"\n\n[[external_apps]]\nname = \"a\"\nprogram = \"p.exe\"\n";
    let (_d1, p1) = write(plain.as_bytes());
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(plain.replace('\n', "\r\n").as_bytes());
    let (_d2, p2) = write(&bytes);
    let (a, b) = (load(&p1), load(&p2));
    assert_eq!(a.lines, b.lines);
    assert_eq!(a.lines.external_apps.apps[0].header, Some(5));
    assert!(b.keymap.parse_error.is_none());
}

// Spike 3a through the real `load`: a datetime must not hide the lines of the known keys (and is itself an unknown key).
#[test]
fn a_datetime_value_does_not_lose_the_lines_and_is_reported_as_an_unknown_key() {
    let (_d, path) = write(b"x = 1979-05-27T07:32:00Z\n[input_keymap_custom]\ncopy = \"a\"\n");
    let r = load(&path);
    assert!(r.keymap.parse_error.is_none());
    assert_eq!(r.lines.keymap_entries.get("copy"), Some(&3));
    assert_eq!(r.unknown, vec![top("x", 1)]);
}

// ------------------------------------------------------------------ unknown settings (R-1643, R-1643-1, AC-1642)

// AC-1642: the three kinds of unknown setting, in the order of the lines (NOT alphabetical: `input_keymap_profile` < `ui_them`).
#[test]
fn ac1642_unknown_settings_are_listed_with_their_lines_in_document_order() {
    let (_d, path) = write(ac1642_text().as_bytes());
    let r = load(&path);
    assert_eq!(r.unknown, vec![top("ui_them", 2), top("input_keymap_profile", 3), field(2, "agrs", 18)]);
}

// R-1643 "振る舞いは変えない": the unknown key is not read, the element with the unknown field is used as written.
#[test]
fn ac1642_unknown_settings_change_no_behaviour() {
    let (_d, path) = write(ac1642_text().as_bytes());
    let r = load(&path);
    assert_eq!(r.ui_theme, UiThemeRaw::Missing, "`ui_them` is not `ui_theme`");
    assert!(r.keymap.entries.is_empty() && r.keymap.parse_error.is_none());
    let ExternalAppsRaw::Array(apps) = r.external_apps else { panic!("two elements expected") };
    assert_eq!(apps.len(), 2);
    assert_eq!(apps[1].name, RawValue::Value("two".into()));
    assert_eq!(apps[1].args, RawValue::Missing, "`agrs` is dropped: args stays empty (AC-1642)");
}

// R-1643-1: document order also for tables, which `toml::Table` (a BTreeMap) would sort alphabetically.
#[test]
fn r1643_1_unknown_top_level_tables_and_keys_follow_the_document() {
    let (_d, path) = write(b"alpha = 1\n[zzz]\nk = 1\n[aaa]\nj = 2\n");
    assert_eq!(load(&path).unknown, vec![top("alpha", 1), top("zzz", 2), top("aaa", 4)]);
}

// R-1643 (1): every legacy / future top-level key is unknown: the old product's display-state keys and the profile key.
#[test]
fn r1643_legacy_and_future_top_level_keys_are_unknown() {
    let (_d, path) = write(b"ui_show_hidden = false\ninput_keymap_profile = \"vim\"\nsome_future_setting = 1\n");
    assert_eq!(load(&path).unknown, vec![top("ui_show_hidden", 1), top("input_keymap_profile", 2), top("some_future_setting", 3)]);
}

// A dotted unknown key is ONE unknown setting, on its first line.
#[test]
fn a_dotted_unknown_key_is_reported_once_on_its_first_line() {
    let (_d, path) = write(b"# c\nfoo.a = 1\nfoo.b = 2\n");
    assert_eq!(load(&path).unknown, vec![top("foo", 2)]);
}

// R-1643 (2): only the five fields of R-1500 are known inside an element; every other field is reported with the element's number.
#[test]
fn r1643_the_five_known_fields_are_never_unknown_and_other_fields_carry_the_element_number() {
    let body = "[[external_apps]]\nname = \"a\"\nprogram = \"p.exe\"\nargs = []\nargs_for_file = []\nkey = \"Ctrl+1\"\n\n[[external_apps]]\nname = \"b\"\nprogram = \"q.exe\"\nArgs = []\nx.y = 1\n";
    let (_d, path) = write(body.as_bytes());
    assert_eq!(load(&path).unknown, vec![field(2, "Args", 11), field(2, "x", 12)], "field names are case-sensitive");
}

// R-1643: W-32 owns the unknown action ids; they are NOT reported as unknown settings.
#[test]
fn r1643_unknown_action_ids_inside_input_keymap_custom_are_not_unknown_settings() {
    let (_d, path) = write(b"[input_keymap_custom]\nundo = \"Ctrl+Z\"\nui_theme = \"dark\"\n");
    let r = load(&path);
    assert!(r.unknown.is_empty(), "undo / the misplaced ui_theme are W-32 entries, not W-AC: {:?}", r.unknown);
    assert_eq!(r.keymap.entries.len(), 2);
}

// The known keys with the wrong TYPE are not unknown (they are reported as type errors).
#[test]
fn known_keys_of_the_wrong_type_are_not_unknown_settings() {
    let (_d, path) = write(b"ui_theme = 1\ninput_keymap_custom = \"x\"\nexternal_apps = \"x\"\n");
    assert!(load(&path).unknown.is_empty());
    let (_d, path) = write(b"external_apps = [1, 2]\n");
    assert!(load(&path).unknown.is_empty(), "a non-table element has no fields to be unknown");
}

// ------------------------------------------------------------------ R-1645: reading is still read-only

// R-1645 / AC-63: computing the lines reads the text a second time but never the file again, and never writes.
#[test]
fn r1645_load_with_lines_still_leaves_the_file_and_the_folder_untouched() {
    let (dir, path) = write(ac1642_text().as_bytes());
    let before = fs::read(&path).unwrap();
    let mtime = fs::metadata(&path).unwrap().modified().unwrap();
    load(&path);
    load(&path);
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no sibling file (no .bak, no .tmp, no sample)");
}
