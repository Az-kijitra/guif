//! TDD (unit-test-writer, 2026-10-24): `config/config_toml_lines.rs` + `shared/schema/config_lines.rs` -- the generalized `ConfigLines`
//! (`top` and `tables`), `UnknownSetting::TableKey`, and the new known top-level keys (SPEC-0300-0023 R-1642 (lines) / R-1700-1 / R-1705 / R-1751 3 /
//! R-1791 / R-1821; AC-1709 / AC-1748 / AC-1756; SPEC-0300-0022 R-1642 / R-1643; SPEC-0200-0001 §3.18.4 second and third bullets, §3.18.15 MUST-3).
//! This file adds to `config_toml_lines_tests.rs` / `config_toml_load_lines_tests.rs`, whose `ui_theme` tests are rewritten or removed (see
//! the list of the old tests in the hand-over); the keymap and external-app line tests of those files are unchanged.
//!
//! Contract:
//!
//! ```ignore
//! pub struct ConfigLines {
//!     // `ui_theme` is REMOVED. `input_keymap_custom`, `keymap_entries`, `external_apps` stay as they were.
//!     pub top: BTreeMap<String, u32>,                           // the line of each top-level key: the key, or its `[...]` heading, or its first dotted key
//!     pub tables: BTreeMap<String, BTreeMap<String, u32>>,      // for theme / colors / font / layout: key -> line, EVERY key of the table (known or not)
//!     // ..
//! }
//! pub enum UnknownSetting {
//!     Top { name, line }, AppField { position, name, line },
//!     TableKey { table: String, name: String, line: Option<u32> },   // NEW: a key of [theme] / [colors] / [font] / [layout] that is not read
//! }
//! ```
//! A table that is not a table (`font = "x"`) has no `tables` entry and no `TableKey` (its keys cannot be judged); its own line is in `top`.
//! The known keys come from `shared::schema::appearance_raw` (THEME_KEYS, COLOR_KEYS + COLOR_ALIASES, FONT_KEYS, LAYOUT_KEYS).

use super::config_toml::load;
use super::config_toml_lines::{index, index_full};
use crate::shared::schema::config_lines::{ConfigLines, UnknownSetting};

fn idx(text: &str) -> ConfigLines {
    index(text).unwrap_or_else(|| panic!("the text must parse: {text:?}"))
}

fn unknown(text: &str) -> Vec<UnknownSetting> {
    index_full(text).unwrap_or_else(|| panic!("the text must parse: {text:?}")).unknown
}

fn tk(table: &str, name: &str, line: u32) -> UnknownSetting {
    UnknownSetting::TableKey { table: table.into(), name: name.into(), line: Some(line) }
}

fn top(name: &str, line: u32) -> UnknownSetting {
    UnknownSetting::Top { name: name.into(), line: Some(line) }
}

const FULL: &str = "# head\n\n[theme]\npreset = \"nord\"\n\n[colors]\nfolder = \"#FF0000\"\nfoo = \"red\"\n\n[font]\nfamily = \"Consolas\"\nsize = 14\n\n[layout]\nmin_col_width = 30\ntree_width_percent = 40\n";

// ------------------------------------------------------------------ top: the line of each top-level key

#[test]
fn the_lines_of_the_four_tables_headings_are_in_top() {
    let lines = idx(FULL);
    assert_eq!(lines.top.get("theme"), Some(&3));
    assert_eq!(lines.top.get("colors"), Some(&6));
    assert_eq!(lines.top.get("font"), Some(&10));
    assert_eq!(lines.top.get("layout"), Some(&14));
}

#[test]
fn the_line_of_a_plain_dotted_and_inline_form_is_the_line_of_its_key() {
    assert_eq!(idx("# c\ntheme = \"nord\"\n").top.get("theme"), Some(&2));
    assert_eq!(idx("a = 1\ncolors.folder = \"red\"\ncolors.file = \"blue\"\n").top.get("colors"), Some(&2), "the FIRST dotted key");
    assert_eq!(idx("\n\nfont = { size = 12 }\n").top.get("font"), Some(&3));
    assert_eq!(idx("theme = 1\n").top.get("theme"), Some(&1), "a wrong-typed value still has its line (W-B1 names it)");
    assert_eq!(idx("font = \"x\"\n").top.get("font"), Some(&1));
}

#[test]
fn a_table_that_is_not_written_has_no_line() {
    let lines = idx("[font]\nsize = 12\n");
    assert!(!lines.top.contains_key("theme") && !lines.top.contains_key("colors") && !lines.top.contains_key("layout"));
    assert!(!lines.tables.contains_key("theme") && !lines.tables.contains_key("colors"));
}

// ------------------------------------------------------------------ tables: the line of each key inside

#[test]
fn the_line_of_every_key_inside_the_four_tables_known_or_not() {
    let lines = idx(FULL);
    assert_eq!(lines.tables["theme"]["preset"], 4);
    assert_eq!(lines.tables["colors"]["folder"], 7);
    assert_eq!(lines.tables["colors"]["foo"], 8, "an unknown key has its line too (the TableKey notice names it)");
    assert_eq!(lines.tables["font"]["family"], 11);
    assert_eq!(lines.tables["font"]["size"], 12);
    assert_eq!(lines.tables["layout"]["min_col_width"], 15);
    assert_eq!(lines.tables["layout"]["tree_width_percent"], 16);
    assert_eq!(lines.tables["theme"].len(), 1);
    assert_eq!(lines.tables["colors"].len(), 2);
}

#[test]
fn dotted_and_inline_keys_inside_a_table_have_their_own_lines() {
    let lines = idx("font.family = \"A\"\nfont.size = 13\ncolors = { folder = \"red\", file = \"blue\" }\ntheme = { preset = \"nord\" }\n");
    assert_eq!(lines.tables["font"]["family"], 1);
    assert_eq!(lines.tables["font"]["size"], 2);
    assert_eq!(lines.tables["colors"]["folder"], 3);
    assert_eq!(lines.tables["colors"]["file"], 3, "keys of one inline table share its line");
    assert_eq!(lines.tables["theme"]["preset"], 4);
}

#[test]
fn lines_are_right_with_crlf_a_bom_comments_in_japanese_and_multi_line_strings() {
    let body = "\u{feff}## 日本語の説明\r\n## もう一行\r\n[theme]\r\nname = \"\"\"\r\na\r\nb\"\"\"\r\npreset = \"nord\"\r\n[layout]\r\nmin_col_width = 30\r\n";
    let lines = idx(body);
    assert_eq!(lines.top.get("theme"), Some(&3));
    assert_eq!(lines.tables["theme"]["name"], 4);
    assert_eq!(lines.tables["theme"]["preset"], 7);
    assert_eq!(lines.tables["layout"]["min_col_width"], 9);
}

#[test]
fn a_syntax_error_has_no_lines_at_all() {
    assert_eq!(index("[theme]\npreset = \"nord\"\nthis is = = not toml\n"), None);
}

#[test]
fn the_keymap_and_external_app_lines_are_unchanged_by_the_new_tables() {
    let lines = idx("[theme]\npreset = \"nord\"\n\n[input_keymap_custom]\ncopy = \"Ctrl+C\"\n\n[[external_apps]]\nname = \"a\"\nprogram = \"p\"\n");
    assert_eq!(lines.input_keymap_custom, Some(4));
    assert_eq!(lines.keymap_entries.get("copy"), Some(&5));
    assert_eq!(lines.external_apps.line, Some(7));
    assert_eq!(lines.external_apps.apps[0].name, Some(8));
    assert!(!lines.tables.contains_key("input_keymap_custom"), "`tables` is for the four appearance tables only");
}

// ------------------------------------------------------------------ the unknown settings

#[test]
fn r1821_a_file_with_only_known_keys_has_no_unknown_setting() {
    assert_eq!(unknown(FULL.replace("foo = \"red\"\n", "background = \"#101010\"\nselected_mark = \"red\"\n").as_str()), vec![]);
    assert_eq!(unknown("[theme]\npreset = \"nord\"\nname = \"nord\"\ntheme = \"nord\"\n"), vec![], "name / theme are KNOWN (an unused one is W-B8, not W-AC)");
    assert_eq!(unknown("theme = \"nord\"\n"), vec![]);
}

#[test]
fn all_sixteen_items_and_both_aliases_are_known_keys_of_colors() {
    let mut body = String::from("[colors]\n");
    for key in crate::shared::schema::appearance_raw::COLOR_KEYS {
        body.push_str(&format!("{key} = \"red\"\n"));
    }
    body.push_str("background = \"red\"\nselected_mark = \"red\"\n");
    assert_eq!(unknown(&body), vec![]);
}

#[test]
fn ac1709_ac1756_ac1791_unknown_keys_of_each_table_are_table_key_settings_in_document_order() {
    let body = "foo = 1\n[theme]\npreset = \"nord\"\nmode = \"dark\"\n[colors]\nfolder = \"red\"\nfoo = \"red\"\n[font]\nfamily = \"x\"\nweight = 700\n[layout]\ntime_format = \"%H\"\n";
    assert_eq!(unknown(body), vec![top("foo", 1), tk("theme", "mode", 4), tk("colors", "foo", 7), tk("font", "weight", 10), tk("layout", "time_format", 12)]);
}

#[test]
fn ac1756_a_family_beside_a_weight_keeps_the_family_and_reports_only_the_weight() {
    let r = unknown("[font]\nfamily = \"Consolas\"\nweight = 700\n");
    assert_eq!(r, vec![tk("font", "weight", 3)]);
}

#[test]
fn keys_are_case_sensitive_so_a_capitalised_item_is_unknown() {
    assert_eq!(unknown("[colors]\nBG = \"red\"\nFolder = \"red\"\n"), vec![tk("colors", "BG", 2), tk("colors", "Folder", 3)]);
    assert_eq!(unknown("[theme]\nPreset = \"nord\"\n"), vec![tk("theme", "Preset", 2)]);
}

#[test]
fn dotted_and_inline_unknown_keys_are_found_too() {
    assert_eq!(unknown("font.weight = 700\nfont.size = 13\n"), vec![tk("font", "weight", 1)]);
    assert_eq!(unknown("layout = { time_format = \"x\", min_col_width = 30 }\n"), vec![tk("layout", "time_format", 1)]);
}

#[test]
fn a_table_that_is_not_a_table_has_no_table_key_and_is_not_unknown_itself() {
    assert_eq!(unknown("font = \"x\"\ncolors = 3\nlayout = [1]\ntheme = \"nord\"\n"), vec![]);
}

#[test]
fn ac1748_ui_theme_is_an_ordinary_unknown_top_level_key_now() {
    assert_eq!(unknown("# c\nui_theme = \"light\"\n"), vec![top("ui_theme", 2)]);
    assert_eq!(unknown("ui_theme = 3\n[theme]\npreset = \"nord\"\n"), vec![top("ui_theme", 1)]);
    // inside another table it is that table's business: a keymap entry named ui_theme is a keymap problem (W-32), not W-AC
    assert_eq!(unknown("[input_keymap_custom]\nui_theme = \"Ctrl+T\"\n"), vec![]);
}

#[test]
fn unknown_top_level_keys_and_unknown_table_keys_and_unknown_app_fields_keep_one_document_order() {
    let body = "[theme]\nmode = 1\n\n[[external_apps]]\nname = \"a\"\nfoo = 2\n\n[font]\nweight = 1\n\nbar = 3\n";
    // `bar` sits under [font] (a table key), not at the top level
    assert_eq!(
        unknown(body),
        vec![tk("theme", "mode", 2), UnknownSetting::AppField { position: 1, name: "foo".into(), line: Some(6) }, tk("font", "weight", 9), tk("font", "bar", 11)]
    );
}

#[test]
fn a_table_after_a_key_that_ends_the_top_level_still_reads_its_keys_as_that_tables() {
    // the template's warning (R-1830): a top-level `name = value` written AFTER a heading belongs to that heading's table
    let body = "[colors]\nfolder = \"red\"\ntheme = \"nord\"\n";
    assert_eq!(unknown(body), vec![tk("colors", "theme", 3)]);
}

// ------------------------------------------------------------------ the same through `load` (what the screen is handed)

#[test]
fn load_hands_over_the_same_lines_and_unknown_settings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    std::fs::write(&path, "ui_theme = \"x\"\n[font]\nfamily = \"A\"\nweight = 1\n").unwrap();
    let r = load(&path);
    assert_eq!(r.unknown, vec![top("ui_theme", 1), tk("font", "weight", 4)]);
    assert_eq!(r.lines.top.get("font"), Some(&2));
    assert_eq!(r.lines.tables["font"]["weight"], 4);
}
