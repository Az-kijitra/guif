//! TDD (unit-test-writer, 2026-10-24): `config/config_toml.rs` + `config/appearance_raw.rs` read `[theme]` / `[colors]` / `[font]` / `[layout]` RAW,
//! in the same single read as the keymap and the external apps; `ui_theme` is no longer read (SPEC-0300-0023 R-1700 / R-1704 / R-1707 / R-1748 /
//! R-1751 / R-1791 / R-1804 / R-1821; AC-1700 / AC-1707 / AC-1708 / AC-1748; SPEC-0300-0010 R-45, AC-63; SPEC-0200-0001 §3.18.4 first bullet,
//! §3.18.15 MUST-3). This file REPLACES `config_toml_tests.rs` (all of whose tests were about `ui_theme`, now gone); the keymap tests that file
//! shares with the inline ones stay in `config_toml_inline_tests.rs`.
//!
//! Contract: `ConfigTomlLoadResult` loses `ui_theme` and gains `pub appearance: RawAppearance` (default = nothing written). `config/` judges
//! NOTHING of it: no preset name, no colour grammar, no range -- only the type of each value (a string, an integer, a table, a string array) and
//! its line (`appearance::resolve` judges, MUST-86's policy). The key names come from `shared::schema::appearance_raw`.

use std::fs;
use std::path::PathBuf;

use super::config_toml::{load, ConfigTomlLoadResult};
use crate::shared::schema::appearance_raw::{RawAppearance, RawFamily, RawField, RawFont, RawLayout, RawSection, RawTheme, RawThemeSection};
use crate::shared::schema::config_lines::UnknownSetting;

fn write_config(contents: impl AsRef<[u8]>) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, contents).unwrap();
    (dir, path)
}

fn read(body: &str) -> ConfigTomlLoadResult {
    let (_d, path) = write_config(body);
    load(&path)
}

fn value<T>(v: T, line: u32) -> RawField<T> {
    RawField::Value { value: v, line: Some(line) }
}

fn wrong<T>(line: u32) -> RawField<T> {
    RawField::WrongType { line: Some(line) }
}

fn color_entries(a: &RawAppearance) -> Vec<(String, RawField<String>)> {
    let RawSection::Table(entries) = &a.colors else { panic!("[colors] must be a table: {:?}", a.colors) };
    let mut entries = entries.clone();
    entries.sort_by(|x, y| x.0.cmp(&y.0));
    entries
}

// ------------------------------------------------------------------ nothing written

#[test]
fn ac1700_i_a_missing_file_has_nothing_written_and_nothing_is_created() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let r = load(&path);
    assert_eq!(r.appearance, RawAppearance::default());
    assert!(!r.present);
    assert!(!path.exists(), "load must never create config.toml");
}

#[test]
fn ac1700_ii_a_file_without_the_four_tables_has_nothing_written() {
    for body in ["", "# comment\n", "some_future_setting = 1\n", "[input_keymap_custom]\ncopy = \"Ctrl+C\"\n"] {
        assert_eq!(read(body).appearance, RawAppearance::default(), "{body:?}");
    }
}

#[test]
fn ac1708_a_file_that_cannot_be_read_as_toml_has_nothing_written_so_everything_is_the_default() {
    // R-1707: the whole file is unreadable -> the appearance too (a syntax error, bytes that are not UTF-8, a folder where the file should be)
    let r = read("theme = \"light\"\n[colors]\nfolder = \"red\"\nthis is = = not toml [[[\n");
    assert_eq!(r.appearance, RawAppearance::default());
    assert!(r.keymap.parse_error.as_ref().is_some_and(|e| e.whole_file));
    let (_d, path) = write_config(vec![0xff, 0xfe, 0x00, 0xc3, 0x28]);
    assert_eq!(load(&path).appearance, RawAppearance::default());
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::create_dir(&path).unwrap();
    assert_eq!(load(&path).appearance, RawAppearance::default());
}

// ------------------------------------------------------------------ [theme]

#[test]
fn r1700_the_theme_table_is_read_with_the_lines_of_its_keys_and_the_strings_verbatim() {
    let r = read("[theme]\npreset = \"Solarized-Dark \"\nname = \"x\"\ntheme = \"y\"\n");
    assert_eq!(
        r.appearance.theme,
        RawThemeSection::Table(RawTheme { line: Some(1), preset: value("Solarized-Dark ".to_string(), 2), name: value("x".to_string(), 3), theme: value("y".to_string(), 4) }),
        "case and blanks are kept: R-1701's comparison is `appearance`'s job"
    );
    assert!(r.keymap.parse_error.is_none());
}

#[test]
fn r1700_only_the_keys_that_are_written_are_filled_and_unknown_keys_are_not_part_of_the_raw_theme() {
    let r = read("[theme]\nmode = \"dark\"\nname = \"monokai\"\n");
    let RawThemeSection::Table(t) = r.appearance.theme else { panic!("a table") };
    assert_eq!((t.preset, t.name, t.theme), (RawField::Missing, value("monokai".to_string(), 3), RawField::Missing));
}

#[test]
fn r1700_a_value_that_is_not_a_string_is_a_type_error_of_that_key_only() {
    for body in ["preset = 1", "preset = true", "preset = 1.5", "preset = [\"nord\"]", "preset = { a = 1 }", "preset = 1979-05-27T07:32:00Z"] {
        let r = read(&format!("[theme]\n{body}\nname = \"light\"\n"));
        let RawThemeSection::Table(t) = r.appearance.theme else { panic!("a table: {body}") };
        assert_eq!(t.preset, wrong(2), "{body}");
        assert_eq!(t.name, value("light".to_string(), 3), "{body}");
        assert!(r.keymap.parse_error.is_none(), "a wrong-typed key is not a whole-file failure: {body}");
    }
}

#[test]
fn r1700_the_top_level_theme_string_and_the_wrong_typed_theme() {
    assert_eq!(read("theme = \"monokai\"\n").appearance.theme, RawThemeSection::Str { value: "monokai".into(), line: Some(1) });
    assert_eq!(read("# c\n\ntheme = \"Nord\"\n").appearance.theme, RawThemeSection::Str { value: "Nord".into(), line: Some(3) });
    for body in ["theme = 1\n", "theme = true\n", "theme = [\"nord\"]\n", "theme = 1.5\n", "theme = 1979-05-27T07:32:00Z\n"] {
        assert_eq!(read(body).appearance.theme, RawThemeSection::WrongType { line: Some(1) }, "{body:?}");
    }
}

#[test]
fn r1700_inline_and_dotted_forms_of_the_theme_table_are_tables_too() {
    let r = read("theme = { preset = \"light\" }\n");
    let RawThemeSection::Table(t) = r.appearance.theme else { panic!("an inline table is a table") };
    assert_eq!(t.preset, value("light".to_string(), 1));
    let r = read("theme.preset = \"light\"\ntheme.name = \"nord\"\n");
    let RawThemeSection::Table(t) = r.appearance.theme else { panic!("dotted keys make a table") };
    assert_eq!((t.preset, t.name), (value("light".to_string(), 1), value("nord".to_string(), 2)));
}

#[test]
fn only_top_level_theme_counts_a_theme_key_elsewhere_belongs_to_that_table() {
    let r = read("[input_keymap_custom]\ntheme = \"Ctrl+Alt+T\"\n\n[font]\nsize = 12\n");
    assert_eq!(r.appearance.theme, RawThemeSection::Missing);
    assert_eq!(r.keymap.entries.len(), 1);
}

// ------------------------------------------------------------------ [colors]

#[test]
fn r1704_every_key_of_the_colors_table_comes_with_its_line_and_a_string_or_a_type_error() {
    let r = read("[colors]\nfolder = \"#FF0000\"\nbackground = \"#101010\"\nfoo = \"red\"\nstatus_bar_fg = 3\nfile = [\"a\"]\nsymlink = \"\"\n");
    assert_eq!(
        color_entries(&r.appearance),
        vec![
            ("background".to_string(), value("#101010".to_string(), 3)),
            ("file".to_string(), wrong(6)),
            ("folder".to_string(), value("#FF0000".to_string(), 2)),
            ("foo".to_string(), value("red".to_string(), 4)),
            ("status_bar_fg".to_string(), wrong(5)),
            ("symlink".to_string(), value(String::new(), 7)),
        ],
        "unknown keys are carried too (resolve ignores them, the unknown-settings list reports them); nothing is judged here"
    );
}

#[test]
fn r1705_colors_that_is_not_a_table_is_reported_with_its_line() {
    for body in ["colors = \"red\"\n", "# c\ncolors = 1\n", "colors = [\"red\"]\n", "colors = true\n"] {
        let line = body.lines().position(|l| l.starts_with("colors")).unwrap() as u32 + 1;
        assert_eq!(read(body).appearance.colors, RawSection::NotTable { line: Some(line) }, "{body:?}");
    }
}

#[test]
fn colors_in_inline_and_dotted_forms_are_read_like_the_heading_form() {
    let inline = read("colors = { folder = \"red\", file = \"blue\" }\n");
    assert_eq!(color_entries(&inline.appearance), vec![("file".to_string(), value("blue".to_string(), 1)), ("folder".to_string(), value("red".to_string(), 1))]);
    let dotted = read("colors.folder = \"red\"\n\ncolors.file = \"blue\"\n");
    assert_eq!(color_entries(&dotted.appearance), vec![("file".to_string(), value("blue".to_string(), 3)), ("folder".to_string(), value("red".to_string(), 1))]);
    assert_eq!(color_entries(&read("[colors]\n").appearance), vec![], "an empty table");
}

// ------------------------------------------------------------------ [font]

#[test]
fn r1751_family_is_a_string_or_an_array_of_strings_and_size_an_integer() {
    let r = read("[font]\nfamily = \"Consolas\"\nsize = 13\n");
    assert_eq!(r.appearance.font, RawSection::Table(RawFont { family: value(RawFamily::Str("Consolas".into()), 2), size: value(13, 3) }));
    let r = read("[font]\nfamily = [\"A\", \"B\", \"\"]\n");
    assert_eq!(r.appearance.font, RawSection::Table(RawFont { family: value(RawFamily::List(vec!["A".into(), "B".into(), String::new()]), 2), size: RawField::Missing }));
    let r = read("[font]\nfamily = []\n");
    assert_eq!(r.appearance.font, RawSection::Table(RawFont { family: value(RawFamily::List(vec![]), 2), size: RawField::Missing }));
}

#[test]
fn r1751_the_wrong_types_of_family_and_size() {
    for (body, family_wrong) in [("family = 1", true), ("family = true", true), ("family = [\"a\", 1]", true), ("family = [1]", true), ("family = { a = \"b\" }", true), ("family = [[\"a\"]]", true)] {
        let RawSection::Table(f) = read(&format!("[font]\n{body}\n")).appearance.font else { panic!("{body}") };
        assert_eq!(f.family == wrong(2), family_wrong, "{body}: {:?}", f.family);
    }
    for body in ["size = \"13\"", "size = 13.0", "size = true", "size = [13]", "size = { a = 1 }"] {
        let RawSection::Table(f) = read(&format!("[font]\n{body}\n")).appearance.font else { panic!("{body}") };
        assert_eq!(f.size, wrong(2), "{body}");
    }
    // out-of-range integers are values: the RANGE is judged by `resolve`
    for n in [-5i64, 0, 9, 25, 30, i64::MAX, i64::MIN + 1] {
        let RawSection::Table(f) = read(&format!("[font]\nsize = {n}\n")).appearance.font else { panic!("{n}") };
        assert_eq!(f.size, value(n, 2), "{n}");
    }
}

#[test]
fn r1751_font_that_is_not_a_table() {
    for (body, line) in [("font = \"x\"\n", 1), ("# c\nfont = 3\n", 2), ("font = [\"a\"]\n", 1)] {
        assert_eq!(read(body).appearance.font, RawSection::NotTable { line: Some(line) }, "{body:?}");
    }
}

// ------------------------------------------------------------------ [layout]

#[test]
fn r1791_r1804_min_col_width_and_tree_width_percent_are_integers() {
    let r = read("[layout]\nmin_col_width = 30\ntree_width_percent = 40\ntime_format = \"%H\"\n");
    assert_eq!(r.appearance.layout, RawSection::Table(RawLayout { min_col_width: value(30, 2), tree_width_percent: value(40, 3) }), "time_format is not part of the raw layout (T-30)");
    let r = read("[layout]\nmin_col_width = \"24\"\ntree_width_percent = 24.0\n");
    assert_eq!(r.appearance.layout, RawSection::Table(RawLayout { min_col_width: wrong(2), tree_width_percent: wrong(3) }));
    let r = read("[layout]\nmin_col_width = 9\ntree_width_percent = 51\n");
    assert_eq!(r.appearance.layout, RawSection::Table(RawLayout { min_col_width: value(9, 2), tree_width_percent: value(51, 3) }), "out of range is a value here, judged by resolve");
    assert_eq!(read("layout = 5\n").appearance.layout, RawSection::NotTable { line: Some(1) });
}

// ------------------------------------------------------------------ ui_theme is gone (R-1748, AC-1748)

#[test]
fn ac1748_ui_theme_changes_nothing_and_is_an_unknown_setting() {
    for body in ["ui_theme = \"light\"\n", "ui_theme = \"dark\"\n", "ui_theme = \"system\"\n", "ui_theme = 1\n", "ui_theme = \"nord\"\n"] {
        let r = read(&format!("# c\n{body}"));
        assert_eq!(r.appearance, RawAppearance::default(), "{body:?}: the value does not matter (R-1748)");
        assert_eq!(r.unknown, vec![UnknownSetting::Top { name: "ui_theme".into(), line: Some(2) }], "{body:?}");
    }
}

#[test]
fn ac1748_ui_theme_beside_a_theme_table_does_not_leak_into_it() {
    let r = read("ui_theme = \"light\"\n[theme]\npreset = \"nord\"\n");
    let RawThemeSection::Table(t) = r.appearance.theme else { panic!("a table") };
    assert_eq!(t.preset, value("nord".to_string(), 3));
    assert_eq!(r.unknown, vec![UnknownSetting::Top { name: "ui_theme".into(), line: Some(1) }]);
}

// ------------------------------------------------------------------ one read, all settings; BOM; read-only

#[test]
fn one_load_returns_the_keymap_the_external_apps_and_the_appearance() {
    let r = read("[theme]\npreset = \"nord\"\n\n[font]\nsize = 14\n\n[input_keymap_custom]\ncopy = \"Ctrl+C\"\n\n[[external_apps]]\nname = \"a\"\nprogram = \"p.exe\"\n");
    assert!(matches!(r.appearance.theme, RawThemeSection::Table(_)));
    assert_eq!(r.appearance.font, RawSection::Table(RawFont { family: RawField::Missing, size: value(14, 5) }));
    assert_eq!(r.keymap.entries.len(), 1);
    assert!(matches!(r.external_apps, crate::shared::schema::external_apps::ExternalAppsRaw::Array(ref a) if a.len() == 1));
    assert!(r.unknown.is_empty(), "{:?}", r.unknown);
}

#[test]
fn a_wrong_typed_keymap_table_keeps_a_valid_appearance() {
    // R-917-5 case 3 carried over: only `input_keymap_custom` is bad, the rest of the file still applies
    let r = read("theme = \"light\"\ninput_keymap_custom = \"Ctrl+X\"\n");
    assert!(r.keymap.parse_error.as_ref().is_some_and(|e| !e.whole_file));
    assert_eq!(r.appearance.theme, RawThemeSection::Str { value: "light".into(), line: Some(1) });
}

#[test]
fn a_bom_and_crlf_do_not_hide_the_appearance_or_move_its_lines() {
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(b"[theme]\r\npreset = \"light\"\r\n[font]\r\nsize = 12\r\n");
    let (_d, path) = write_config(bytes);
    let r = load(&path);
    let RawThemeSection::Table(t) = r.appearance.theme else { panic!("a table") };
    assert_eq!(t.preset, value("light".to_string(), 2));
    assert_eq!(r.appearance.font, RawSection::Table(RawFont { family: RawField::Missing, size: value(12, 4) }));
}

#[test]
fn ac63_load_never_modifies_content_or_mtime_with_the_appearance_tables_present() {
    let original = "# hand-edited\n[theme]\npreset = \"nord\"   # my theme\n\n[colors]\nfolder = \"red\"\n\n[font]\nsize = 14\n\n[input_keymap_custom]\ntoggle_hidden = \"Ctrl+Alt+H\"\n";
    let (dir, path) = write_config(original);
    let mtime_before = fs::metadata(&path).unwrap().modified().unwrap();
    load(&path);
    load(&path);
    assert_eq!(fs::read_to_string(&path).unwrap(), original, "content (comments included) must be byte-for-byte unchanged");
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime_before);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no sibling file (.bak / .tmp) may appear");
}

#[test]
fn ac63_load_leaves_a_broken_or_wrong_typed_file_untouched() {
    let cases: [(&str, &[u8]); 6] = [
        ("a syntax error", b"theme = \"nord\"
[colors
bg = 
"),
        ("theme = 1", b"theme = 1
"),
        ("colors = \"x\"", b"colors = \"x\"
"),
        ("input_keymap_custom = \"x\"", b"input_keymap_custom = \"x\"
"),
        ("font = 3 and layout = []", b"font = 3
layout = []
"),
        ("not UTF-8", &[0x66, 0xff, 0xfe, 0x3d, 0x0a]),
    ];
    for (what, bytes) in cases {
        let (dir, path) = write_config(bytes);
        let mtime_before = fs::metadata(&path).unwrap().modified().unwrap();
        load(&path);
        assert_eq!(fs::read(&path).unwrap(), bytes, "{what}: content unchanged");
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime_before, "{what}: mtime unchanged");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "{what}: no sibling file");
    }
}

#[test]
fn a_healthy_file_has_no_parse_error_and_no_unknown_setting() {
    let (_dir, path) = write_config("[theme]
preset = \"nord\"

[font]
size = 14

[input_keymap_custom]
toggle_hidden = \"Ctrl+Alt+H\"
");
    let r = load(&path);
    assert!(r.present && r.keymap.parse_error.is_none(), "{:?}", r.keymap.parse_error);
    assert!(r.unknown.is_empty(), "{:?}", r.unknown);
}
