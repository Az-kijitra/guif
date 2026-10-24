//! TDD (unit-test-writer, 2026-10-24): `shared/schema/appearance_raw.rs` and the new top-level constant of `shared/schema/config_lines.rs` --
//! the raw values of `[theme]` / `[colors]` / `[font]` / `[layout]` and the ONE definition of the key names
//! (SPEC-0300-0023 R-1700 / R-1704 / R-1751 / R-1791 / R-1804 / R-1821; SPEC-0200-0001 §3.18.3, §3.18.15 MUST-3).
//!
//! Contract (module `shared::schema::appearance_raw`, pure data, no logic; declared in `shared/schema/mod.rs` as `pub mod appearance_raw;` and
//! `#[cfg(test)] mod appearance_raw_tests;`):
//!
//! ```ignore
//! pub const THEME_KEYS: [&str; 3];            // ["preset", "name", "theme"]: the ORDER is the priority (R-1700)
//! pub const COLOR_KEYS: [&str; 16];           // the 16 items, in the order of tuif's `Theme`
//! pub const COLOR_ALIASES: [(&str, &str); 2]; // (alias, item): ("background", "bg"), ("selected_mark", "selected")
//! pub const FONT_KEYS: [&str; 2];             // ["family", "size"]
//! pub const LAYOUT_KEYS: [&str; 2];           // ["min_col_width", "tree_width_percent"]
//! pub enum RawField<T> { Missing, Value { value: T, line: Option<u32> }, WrongType { line: Option<u32> } }   // Default = Missing
//! pub enum RawFamily { Str(String), List(Vec<String>) }        // `family`: a string, or an array whose elements are ALL strings
//! pub enum RawSection<T> { Missing, NotTable { line: Option<u32> }, Table(T) }                              // Default = Missing
//! pub struct RawTheme { pub line: Option<u32> /* the [theme] heading / first key */, pub preset: RawField<String>, pub name: RawField<String>, pub theme: RawField<String> }
//! pub enum RawThemeSection { Missing, Table(RawTheme), Str { value: String, line: Option<u32> } /* theme = "nord" */, WrongType { line: Option<u32> } }
//! pub struct RawFont { pub family: RawField<RawFamily>, pub size: RawField<i64> }
//! pub struct RawLayout { pub min_col_width: RawField<i64>, pub tree_width_percent: RawField<i64> }
//! pub struct RawAppearance {
//!     pub theme: RawThemeSection,
//!     pub colors: RawSection<Vec<(String, RawField<String>)>>,   // EVERY key of the table, known or not; the value is a string or `WrongType`
//!     pub font: RawSection<RawFont>, pub layout: RawSection<RawLayout>,
//! }                                                               // all of them derive Debug, Clone, PartialEq, Eq, Default
//! ```
//! `shared/schema/config_lines.rs` gets `pub const KNOWN_TOP_KEYS: [&str; 6]` -- `input_keymap_custom`, `external_apps`, `theme`, `colors`, `font`,
//! `layout` (R-1821; `ui_theme` is no longer one of them). The names are not written anywhere else (checked by `appearance_structure_tests`).

use super::appearance_raw::{
    RawAppearance, RawField, RawFont, RawLayout, RawSection, RawTheme, RawThemeSection, COLOR_ALIASES, COLOR_KEYS, FONT_KEYS, LAYOUT_KEYS, THEME_KEYS,
};
use super::config_lines::KNOWN_TOP_KEYS;

#[test]
fn r1700_the_theme_keys_are_in_priority_order() {
    assert_eq!(THEME_KEYS, ["preset", "name", "theme"]);
}

#[test]
fn r1704_the_sixteen_items_are_those_of_tuifs_theme_in_its_order() {
    assert_eq!(
        COLOR_KEYS,
        [
            "bg", "border", "border_inactive", "cursor_fg", "cursor_bg", "folder", "file", "symlink", "executable", "selected", "status_bar_fg", "status_bar_bg",
            "menu_bar_active_fg", "menu_bar_active_bg", "tree_current", "tree_cursor"
        ]
    );
    let mut sorted = COLOR_KEYS;
    sorted.sort();
    for pair in sorted.windows(2) {
        assert_ne!(pair[0], pair[1], "no item twice");
    }
}

#[test]
fn r1704_the_two_aliases_name_an_item() {
    assert_eq!(COLOR_ALIASES, [("background", "bg"), ("selected_mark", "selected")]);
    for (alias, item) in COLOR_ALIASES {
        assert!(COLOR_KEYS.contains(&item), "{alias} -> {item} must be an item");
        assert!(!COLOR_KEYS.contains(&alias), "an alias is not an item");
    }
}

#[test]
fn r1751_r1791_r1804_the_font_and_layout_keys() {
    assert_eq!(FONT_KEYS, ["family", "size"]);
    assert_eq!(LAYOUT_KEYS, ["min_col_width", "tree_width_percent"], "`time_format` is not one of them (T-30)");
}

#[test]
fn r1821_the_known_top_level_keys_are_the_six_and_ui_theme_is_not_one() {
    let mut keys = KNOWN_TOP_KEYS.to_vec();
    keys.sort();
    assert_eq!(keys, ["colors", "external_apps", "font", "input_keymap_custom", "layout", "theme"]);
    assert!(!KNOWN_TOP_KEYS.contains(&"ui_theme"));
}

#[test]
fn the_default_of_every_raw_type_is_nothing_written() {
    assert_eq!(RawField::<String>::default(), RawField::Missing);
    assert_eq!(RawSection::<RawFont>::default(), RawSection::Missing);
    let all_missing = RawAppearance {
        theme: RawThemeSection::Missing,
        colors: RawSection::Missing,
        font: RawSection::Missing,
        layout: RawSection::Missing,
    };
    assert_eq!(RawAppearance::default(), all_missing, "no file / an unreadable file reads as this (R-1707)");
    assert_eq!(RawTheme::default(), RawTheme { line: None, preset: RawField::Missing, name: RawField::Missing, theme: RawField::Missing });
    assert_eq!(RawFont::default(), RawFont { family: RawField::Missing, size: RawField::Missing });
    assert_eq!(RawLayout::default(), RawLayout { min_col_width: RawField::Missing, tree_width_percent: RawField::Missing });
}
