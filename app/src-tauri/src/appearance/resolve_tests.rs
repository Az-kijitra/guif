//! TDD (unit-test-writer, 2026-10-24): `appearance::resolve` -- which preset is chosen, what is reported, and light or dark
//! (SPEC-0300-0023 R-1700 / R-1700-1 / R-1701 / R-1702 / R-1703 / R-1740; AC-1700 / AC-1701 / AC-1702 / AC-1709 / AC-1740;
//! SPEC-0200-0001 §3.18.3 `resolve.rs`). The colours of `[colors]` are in `resolve_colors_tests.rs`, the font and layout in
//! `resolve_layout_tests.rs`.
//!
//! Contract (module `appearance::resolve`, re-exported as `appearance::resolve(..)`; declared as `#[cfg(test)] mod resolve_tests;`):
//!
//! ```ignore
//! /// Pure. Never panics, whatever the raw values are.
//! pub fn resolve(raw: &RawAppearance) -> Appearance;
//! pub struct Appearance {
//!     pub colors: Palette,            // 16 resolved colours; `Palette::get(&self, key) -> Option<Rgb>` for the names of COLOR_KEYS
//!     pub dark: bool,                 // R-1740
//!     pub font_families: Vec<String>, pub font_size: u32, pub row_height: u32,
//!     pub min_col_width: u32, pub tree_width_percent: u32,
//!     pub problems: Vec<Problem>,
//! }
//! pub enum Problem {
//!     PresetUnusable { line: Option<u32>, value: String },          // W-B0: the name of the used key does not stand for a preset
//!     PresetWrongType { line: Option<u32>, key: String },           // W-B1: key = "preset" | "name" | "theme"
//!     ColorsUnparsable { items: Vec<ColorItem> },                   // W-B2 (one problem, all items)     ColorItem { name, line }
//!     ColorsNotTable { line: Option<u32> },                         // W-B5
//!     FontSize { line: Option<u32> },                               // W-B3
//!     FontFamily { line: Option<u32> },                             // W-B6
//!     FontFamilyElements { line: Option<u32>, names: Vec<String> }, // W-B9
//!     NotTable { line: Option<u32>, key: String },                  // W-B7: key = "font" | "layout"
//!     LayoutValue { line: Option<u32>, key: String },               // W-B4: key = "min_col_width" | "tree_width_percent"
//!     Unused { items: Vec<UnusedItem> },                            // W-B8 (one problem, all items)    UnusedItem { table, name, line, used }
//! }
//! ```
//! The order of `problems` is not pinned except where a test says so; the order of sentences is the screen's job (R-1820).

use super::color::hex;
use super::resolve::resolve;
use super::test_support::{color_of, colors, preset, s, theme_table, top_theme, wrong};
use super::{Problem, UnusedItem};
use crate::shared::schema::appearance_raw::{RawAppearance, RawField, RawTheme, RawThemeSection};

fn bg_hex(raw: &RawAppearance) -> String {
    hex(color_of(&resolve(raw), "bg"))
}

fn unused(a: &super::Appearance) -> Vec<UnusedItem> {
    a.problems.iter().filter_map(|p| if let Problem::Unused { items } = p { Some(items.clone()) } else { None }).flatten().collect()
}

fn item(table: &str, name: &str, line: u32, used: &str) -> UnusedItem {
    UnusedItem { table: table.into(), name: name.into(), line: Some(line), used: used.into() }
}

// ------------------------------------------------------------------ R-1702 / AC-1700: nord when nothing is written

#[test]
fn ac1700_no_file_no_theme_or_an_empty_theme_table_is_nord_without_a_notice() {
    let nord = resolve(&preset("nord"));
    // (i) no config.toml / unreadable file: the raw value is the default (all Missing)
    // (ii) no [theme]
    // (iii) [theme] without preset / name / theme (the `foo` key is the unknown-settings list's business)
    for raw in [RawAppearance::default(), RawAppearance { theme: RawThemeSection::Missing, ..RawAppearance::default() }, theme_table(None, None, None)] {
        let a = resolve(&raw);
        assert_eq!(a.colors, nord.colors);
        assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
        assert!(a.dark);
        assert!(a.problems.is_empty(), "{:?}", a.problems);
    }
}

#[test]
fn r1702_the_default_is_nord_not_tuifs_default() {
    assert_eq!(bg_hex(&RawAppearance::default()), "#2e3440", "tuif's `default` has bg Reset = #000000; guif's default is nord");
}

// ------------------------------------------------------------------ AC-1701: which key, which name

#[test]
fn ac1701_preset_names_pick_the_preset_whatever_the_spelling() {
    let bg_of = [
        ("Nord", "#2e3440"), ("solarized-dark", "#002b36"), ("Solarized_Dark", "#002b36"), ("solarized", "#002b36"),
        ("catppuccin-mocha", "#1e1e2e"), ("LIGHT", "#f5f5f5"), ("default", "#000000"), ("monokai", "#272822"),
    ];
    for (name, bg) in bg_of {
        let a = resolve(&preset(name));
        assert_eq!(hex(color_of(&a, "bg")), bg, "preset = {name:?}");
        assert!(a.problems.is_empty(), "{name:?}: {:?}", a.problems);
    }
}

#[test]
fn ac1701_name_alone_theme_alone_and_the_top_level_theme_string_are_read_too() {
    assert_eq!(bg_hex(&theme_table(None, Some("monokai"), None)), "#272822", "[theme] name = \"monokai\"");
    assert_eq!(bg_hex(&theme_table(None, None, Some("monokai"))), "#272822", "[theme] theme = \"monokai\"");
    assert_eq!(bg_hex(&top_theme("monokai")), "#272822", "top-level theme = \"monokai\"");
    assert_eq!(bg_hex(&top_theme("Solarized-Dark")), "#002b36");
}

#[test]
fn r1700_the_first_written_key_in_the_order_preset_name_theme_is_used() {
    // preset + name -> light (and `name` is reported as unused, R-1700-1)
    let a = resolve(&theme_table(Some("light"), Some("monokai"), None));
    assert_eq!(hex(color_of(&a, "bg")), "#f5f5f5");
    assert_eq!(unused(&a), vec![item("theme", "name", 3, "preset")]);
    // name + theme (no preset) -> `name`
    let a = resolve(&theme_table(None, Some("light"), Some("monokai")));
    assert_eq!(hex(color_of(&a, "bg")), "#f5f5f5");
    assert_eq!(unused(&a), vec![item("theme", "theme", 4, "name")]);
    // all three -> preset; both others unused, in key order
    let a = resolve(&theme_table(Some("nord"), Some("light"), Some("monokai")));
    assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
    assert_eq!(unused(&a), vec![item("theme", "name", 3, "preset"), item("theme", "theme", 4, "preset")]);
    // one key only: nothing unused
    assert!(unused(&resolve(&theme_table(Some("light"), None, None))).is_empty());
}

#[test]
fn ac1709_preset_name_and_an_unknown_key_nord_with_name_reported_as_unused() {
    // [theme] preset = "nord" (2), name = "monokai" (3), mode = "dark" (4: unknown, reported by config as a TableKey)
    let a = resolve(&theme_table(Some("nord"), Some("monokai"), None));
    assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
    assert_eq!(unused(&a), vec![item("theme", "name", 3, "preset")]);
    assert!(!a.problems.iter().any(|p| matches!(p, Problem::PresetUnusable { .. } | Problem::PresetWrongType { .. })));
}

#[test]
fn r1700_1_a_written_but_wrong_typed_key_still_takes_the_place_of_the_later_ones() {
    // preset = 1 (the first key) is the used key: nord + W-B1, and `name` is not used
    let raw = RawAppearance {
        theme: RawThemeSection::Table(RawTheme { line: Some(1), preset: wrong(2), name: s("light", 3), theme: RawField::Missing }),
        ..RawAppearance::default()
    };
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
    assert!(a.problems.contains(&Problem::PresetWrongType { line: Some(2), key: "preset".into() }), "{:?}", a.problems);
    assert_eq!(unused(&a), vec![item("theme", "name", 3, "preset")]);
}

// ------------------------------------------------------------------ AC-1702: the notices of a wrong preset

#[test]
fn ac1702_i_an_unknown_preset_name_is_nord_with_w_b0_and_the_line() {
    let raw = RawAppearance {
        theme: RawThemeSection::Table(RawTheme { line: Some(1), preset: s("dracula", 3), name: RawField::Missing, theme: RawField::Missing }),
        ..RawAppearance::default()
    };
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
    assert_eq!(a.problems, vec![Problem::PresetUnusable { line: Some(3), value: "dracula".into() }]);
}

#[test]
fn ac1702_the_value_is_reported_as_written() {
    for value in ["Dracula", "", " ", "nord!", "ｎｏｒｄ"] {
        let a = resolve(&preset(value));
        assert_eq!(hex(color_of(&a, "bg")), "#2e3440", "{value:?}");
        assert_eq!(a.problems, vec![Problem::PresetUnusable { line: Some(2), value: value.into() }], "{value:?}");
    }
    // the top-level string form reports the same
    let a = resolve(&top_theme("dracula"));
    assert_eq!(a.problems, vec![Problem::PresetUnusable { line: Some(1), value: "dracula".into() }]);
}

#[test]
fn ac1702_ii_a_preset_that_is_not_a_string_is_nord_with_w_b1_naming_the_key() {
    for (raw, key) in [
        (RawAppearance { theme: RawThemeSection::Table(RawTheme { line: Some(1), preset: wrong(3), ..RawTheme::default() }), ..RawAppearance::default() }, "preset"),
        (RawAppearance { theme: RawThemeSection::Table(RawTheme { line: Some(1), name: wrong(3), ..RawTheme::default() }), ..RawAppearance::default() }, "name"),
        (RawAppearance { theme: RawThemeSection::Table(RawTheme { line: Some(1), theme: wrong(3), ..RawTheme::default() }), ..RawAppearance::default() }, "theme"),
    ] {
        let a = resolve(&raw);
        assert_eq!(hex(color_of(&a, "bg")), "#2e3440", "{key}");
        assert_eq!(a.problems, vec![Problem::PresetWrongType { line: Some(3), key: key.into() }], "{key}");
    }
}

#[test]
fn ac1702_iii_a_top_level_theme_that_is_neither_a_table_nor_a_string_is_nord_with_w_b1() {
    let raw = RawAppearance { theme: RawThemeSection::WrongType { line: Some(1) }, ..RawAppearance::default() };
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
    assert_eq!(a.problems, vec![Problem::PresetWrongType { line: Some(1), key: "theme".into() }]);
}

#[test]
fn a_notice_without_a_line_keeps_the_notice_and_drops_only_the_number() {
    let raw = RawAppearance {
        theme: RawThemeSection::Table(RawTheme { line: None, preset: RawField::Value { value: "dracula".into(), line: None }, ..RawTheme::default() }),
        ..RawAppearance::default()
    };
    assert_eq!(resolve(&raw).problems, vec![Problem::PresetUnusable { line: None, value: "dracula".into() }], "R-1642: no line is written when none could be found");
}

// ------------------------------------------------------------------ R-1740 / AC-1740: light or dark

#[test]
fn r1740_only_light_is_a_light_preset() {
    for name in ["default", "nord", "monokai", "catppuccin", "solarized"] {
        assert!(resolve(&preset(name)).dark, "{name} is dark (default's bg is #000000)");
    }
    assert!(!resolve(&preset("light")).dark);
}

#[test]
fn ac1740_a_bg_override_decides_by_the_ratio_to_white_and_to_black() {
    let dark_of = |value: &str| resolve(&colors(&[("bg", value)])).dark;
    assert!(!dark_of("#FFFFFF"), "white is light");
    assert!(dark_of("#000000"), "black is dark");
    assert!(!dark_of("#777777"), "AC-1740: 4.48 to white < 4.69 to black -> light");
    assert!(dark_of("#757575"), "the boundary: 4.608 to white >= 4.558 to black -> dark");
    assert!(!dark_of("#767676"), "4.542 to white < 4.623 to black -> light");
    assert!(dark_of("reset"), "bg = reset is #000000 -> dark");
    // the override applies on top of a light preset, and back
    let on_light = crate::appearance::test_support::colors_on(preset("light"), &[("bg", "#101010")]);
    assert!(resolve(&on_light).dark, "the brightness follows the RESOLVED bg, not the preset's name");
    let on_dark = crate::appearance::test_support::colors_on(preset("nord"), &[("bg", "#fafafa")]);
    assert!(!resolve(&on_dark).dark);
}

#[test]
fn only_bg_decides_the_brightness() {
    // a light foreground colour on a light bg and a dark file colour on a dark bg do not matter
    let a = resolve(&crate::appearance::test_support::colors_on(preset("nord"), &[("file", "#000000"), ("status_bar_bg", "#ffffff")]));
    assert!(a.dark);
}

// ------------------------------------------------------------------ purity

#[test]
fn resolve_is_pure_and_deterministic() {
    let raw = crate::appearance::test_support::colors_on(preset("solarized"), &[("folder", "#123456"), ("bg", "bogus")]);
    assert_eq!(resolve(&raw), resolve(&raw));
    assert_eq!(resolve(&RawAppearance::default()), resolve(&RawAppearance::default()));
}
