//! TDD (unit-test-writer, 2026-10-24): `appearance::resolve` -- the `[colors]` overrides (SPEC-0300-0023 R-1704 / R-1705 / R-1706 / R-1707 /
//! R-1709 / R-1713; AC-1703 / AC-1704 / AC-1706 / AC-1707; SPEC-0200-0001 §3.18.3 `resolve.rs`, §3.18.15 SHOULD-5, MUST-3).
//!
//! The decisions pinned here (all from the specification, none from tuif's source order):
//! - an item is replaced by its written colour; an item whose value cannot be read keeps the PRESET's value and is listed in ONE
//!   `Problem::ColorsUnparsable` (W-B2), ordered by line (no line last, then by name);
//! - `background` and `bg` both written: `bg` is used, `background` is `Unused { used: "bg" }`; `selected` and `selected_mark` both written:
//!   `selected_mark` is used, `selected` is `Unused { used: "selected_mark" }` (R-1704 / T-42); the order of the entries of the raw table
//!   never matters (SHOULD-5: the aliases are applied first, explicitly);
//! - a name that is none of the 16 items nor an alias is ignored here (the unknown-settings list of `config/` reports it, W-AC).

use super::color::hex;
use super::resolve::resolve;
use super::test_support::{assert_clean, color_of, colors, colors_on, colors_raw, preset, resolved_hex, s, wrong};
use super::{Appearance, ColorItem, Problem, UnusedItem};
use crate::shared::schema::appearance_raw::{RawAppearance, RawSection, COLOR_KEYS};

fn unparsable(a: &Appearance) -> Vec<ColorItem> {
    let all: Vec<Vec<ColorItem>> = a.problems.iter().filter_map(|p| if let Problem::ColorsUnparsable { items } = p { Some(items.clone()) } else { None }).collect();
    assert!(all.len() <= 1, "W-B2 is ONE problem with all items: {:?}", a.problems);
    all.into_iter().next().unwrap_or_default()
}

fn unused(a: &Appearance) -> Vec<UnusedItem> {
    a.problems.iter().filter_map(|p| if let Problem::Unused { items } = p { Some(items.clone()) } else { None }).flatten().collect()
}

fn ci(name: &str, line: Option<u32>) -> ColorItem {
    ColorItem { name: name.into(), line }
}

// ------------------------------------------------------------------ AC-1703: overrides

#[test]
fn ac1703_individual_overrides_replace_only_their_items() {
    let raw = colors_on(preset("nord"), &[("folder", "#FF0000"), ("background", "#101010"), ("selected_mark", "yellow"), ("file", "  #abc  ")]);
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "folder")), "#ff0000");
    assert_eq!(hex(color_of(&a, "bg")), "#101010", "`background` is the alias of bg");
    assert_eq!(hex(color_of(&a, "selected")), "#e5c07b", "`selected_mark` is the alias of selected; yellow is R-1712's #E5C07B");
    assert_eq!(hex(color_of(&a, "file")), "#aabbcc");
    let nord = resolve(&preset("nord"));
    for key in COLOR_KEYS.iter().filter(|k| !["folder", "bg", "selected", "file"].contains(k)) {
        assert_eq!(color_of(&a, key), color_of(&nord, key), "{key} stays the preset's");
    }
    assert_clean(&a);
}

#[test]
fn every_one_of_the_sixteen_items_can_be_overridden_alone() {
    let nord = resolve(&preset("nord"));
    for target in COLOR_KEYS {
        let a = resolve(&colors_on(preset("nord"), &[(target, "#010203")]));
        for key in COLOR_KEYS {
            let expected = if key == target { "#010203".to_string() } else { hex(color_of(&nord, key)) };
            assert_eq!(hex(color_of(&a, key)), expected, "override of {target}, looking at {key}");
        }
        assert_clean(&a);
    }
}

#[test]
fn an_override_applies_on_top_of_every_preset() {
    for name in ["default", "monokai", "catppuccin", "solarized", "light"] {
        let base = resolve(&preset(name));
        let a = resolve(&colors_on(preset(name), &[("folder", "#123456")]));
        assert_eq!(hex(color_of(&a, "folder")), "#123456", "{name}");
        assert_eq!(color_of(&a, "bg"), color_of(&base, "bg"), "{name}");
    }
    // without [theme] the base is nord
    assert_eq!(resolved_hex(&colors(&[("folder", "#123456")]), "border"), "#88c0d0");
}

#[test]
fn colour_names_numbers_and_hex_forms_all_work_in_colors() {
    let raw = colors(&[("folder", "LightRed"), ("file", "196"), ("executable", "#0af"), ("selected", "dark-grey"), ("symlink", "007")]);
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "folder")), "#e06c75");
    assert_eq!(hex(color_of(&a, "file")), "#ff0000");
    assert_eq!(hex(color_of(&a, "executable")), "#00aaff");
    assert_eq!(hex(color_of(&a, "selected")), "#5a6374");
    assert_eq!(hex(color_of(&a, "symlink")), "#dcdfe4");
    assert_clean(&a);
}

// R-1713 through the slots: `Reset` in a background item is black, elsewhere the text colour.
#[test]
fn r1713_reset_depends_on_the_item_it_is_written_in() {
    for key in ["bg", "cursor_bg", "status_bar_bg", "menu_bar_active_bg"] {
        for word in ["reset", "default", "none"] {
            assert_eq!(resolved_hex(&colors(&[(key, word)]), key), "#000000", "{key} = {word}");
        }
    }
    for key in ["border", "border_inactive", "cursor_fg", "folder", "file", "symlink", "executable", "selected", "status_bar_fg", "menu_bar_active_fg", "tree_current", "tree_cursor"] {
        assert_eq!(resolved_hex(&colors(&[(key, "reset")]), key), "#dcdfe4", "{key} = reset");
    }
}

// ------------------------------------------------------------------ R-1704 / T-42: names and aliases

#[test]
fn ac1703_bg_wins_over_background_and_selected_mark_wins_over_selected() {
    let raw = colors(&[("bg", "#111111"), ("background", "#222222")]);
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "bg")), "#111111");
    assert_eq!(unused(&a), vec![UnusedItem { table: "colors".into(), name: "background".into(), line: Some(3), used: "bg".into() }]);

    let raw = colors(&[("selected", "red"), ("selected_mark", "blue")]);
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "selected")), "#61afef", "blue = selected_mark's value");
    assert_eq!(unused(&a), vec![UnusedItem { table: "colors".into(), name: "selected".into(), line: Some(2), used: "selected_mark".into() }]);
}

#[test]
fn should5_the_order_of_the_raw_entries_never_changes_the_result() {
    let entries = [("bg", "#111111"), ("background", "#222222"), ("selected", "red"), ("selected_mark", "blue")];
    // all 24 orders; the line of an entry follows the entry, so every order is a different file that must resolve identically
    fn permutations(items: &mut Vec<(&'static str, &'static str)>, k: usize, out: &mut Vec<Vec<(&'static str, &'static str)>>) {
        if k == items.len() {
            out.push(items.clone());
            return;
        }
        for i in k..items.len() {
            items.swap(k, i);
            permutations(items, k + 1, out);
            items.swap(k, i);
        }
    }
    let mut all = Vec::new();
    permutations(&mut entries.to_vec(), 0, &mut all);
    assert_eq!(all.len(), 24);
    for order in all {
        // the lines are attached to the NAMES (bg 2, background 3, selected 4, selected_mark 5) so only the order of the Vec varies
        let line_of = |name: &str| 2 + entries.iter().position(|(k, _)| *k == name).unwrap() as u32;
        let raw = colors_raw(order.iter().map(|(k, v)| (*k, s(v, line_of(k)))).collect());
        let a = resolve(&raw);
        assert_eq!(hex(color_of(&a, "bg")), "#111111", "{order:?}");
        assert_eq!(hex(color_of(&a, "selected")), "#61afef", "{order:?}");
        let mut got = unused(&a);
        got.sort_by(|x, y| x.name.cmp(&y.name));
        assert_eq!(
            got,
            vec![
                UnusedItem { table: "colors".into(), name: "background".into(), line: Some(3), used: "bg".into() },
                UnusedItem { table: "colors".into(), name: "selected".into(), line: Some(4), used: "selected_mark".into() },
            ],
            "{order:?}"
        );
    }
}

#[test]
fn the_aliases_alone_work_and_are_not_reported() {
    let a = resolve(&colors(&[("background", "#101010"), ("selected_mark", "#eeeeee")]));
    assert_eq!(hex(color_of(&a, "bg")), "#101010");
    assert_eq!(hex(color_of(&a, "selected")), "#eeeeee");
    assert_clean(&a);
}

#[test]
fn names_that_are_not_items_are_ignored_here_and_keys_are_case_sensitive() {
    let a = resolve(&colors(&[("foo", "red"), ("BG", "#123456"), ("Folder", "#654321"), ("selectedmark", "red"), ("", "red")]));
    assert_eq!(a.colors, resolve(&preset("nord")).colors, "none of them is an item");
    assert_clean(&a);
}

// ------------------------------------------------------------------ AC-1704: values that cannot be read

fn ac1704_raw() -> RawAppearance {
    colors_raw(vec![
        ("folder", s("#GG0000", 5)),
        ("file", s("#ＡＢＣ", 6)),
        ("symlink", s("#ＡＢ", 7)),
        ("border", s("#12345", 8)),
        ("cursor_bg", s("256", 9)),
        ("tree_current", s("１２", 10)),
        ("status_bar_fg", wrong(11)),
        ("foo", s("red", 12)),
    ])
}

#[test]
fn ac1704_seven_bad_items_keep_the_presets_values_and_are_listed_once_with_their_lines() {
    let a = resolve(&ac1704_raw());
    let nord = resolve(&preset("nord"));
    assert_eq!(a.colors, nord.colors, "every bad item keeps the preset's value; `foo` is ignored");
    assert_eq!(
        unparsable(&a),
        vec![ci("folder", Some(5)), ci("file", Some(6)), ci("symlink", Some(7)), ci("border", Some(8)), ci("cursor_bg", Some(9)), ci("tree_current", Some(10)), ci("status_bar_fg", Some(11))]
    );
    assert_eq!(a.problems.len(), 1, "nothing else is reported (the unknown `foo` is W-AC, from config/)");
}

#[test]
fn ac1704_the_good_items_beside_bad_ones_are_still_used() {
    let raw = colors_raw(vec![("folder", s("nonsense", 2)), ("file", s("#abcdef", 3)), ("selected", s("#Ａ", 4))]);
    let a = resolve(&raw);
    assert_eq!(hex(color_of(&a, "file")), "#abcdef", "R-1707: the faulty item only");
    assert_eq!(unparsable(&a), vec![ci("folder", Some(2)), ci("selected", Some(4))]);
}

#[test]
fn w_b2_items_are_ordered_by_line_then_the_lines_that_are_missing_then_by_name() {
    let raw = colors_raw(vec![
        ("tree_cursor", s("x", 9)),
        ("folder", value_without_line("x")),
        ("file", s("x", 3)),
        ("border", value_without_line("x")),
        ("selected", s("x", 7)),
    ]);
    let a = resolve(&raw);
    assert_eq!(unparsable(&a), vec![ci("file", Some(3)), ci("selected", Some(7)), ci("tree_cursor", Some(9)), ci("border", None), ci("folder", None)]);
}

fn value_without_line(value: &str) -> crate::shared::schema::appearance_raw::RawField<String> {
    crate::shared::schema::appearance_raw::RawField::Value { value: value.to_string(), line: None }
}

#[test]
fn an_empty_value_and_a_blank_value_are_unreadable() {
    let a = resolve(&colors(&[("folder", ""), ("file", "   ")]));
    assert_eq!(unparsable(&a), vec![ci("folder", Some(2)), ci("file", Some(3))]);
}

#[test]
fn a_value_that_is_not_a_string_is_unreadable_for_every_item() {
    for key in COLOR_KEYS {
        let a = resolve(&colors_raw(vec![(key, wrong(4))]));
        assert_eq!(unparsable(&a), vec![ci(key, Some(4))], "{key}");
        assert_eq!(a.colors, resolve(&preset("nord")).colors, "{key}");
    }
}

// ------------------------------------------------------------------ R-1706: symlink

#[test]
fn r1706_symlink_is_accepted_and_checked_like_the_others() {
    let ok = resolve(&colors(&[("symlink", "#123456")]));
    assert_eq!(hex(color_of(&ok, "symlink")), "#123456");
    assert_clean(&ok);
    let bad = resolve(&colors(&[("symlink", "teal")]));
    assert_eq!(unparsable(&bad), vec![ci("symlink", Some(2))]);
}

// ------------------------------------------------------------------ AC-1707: `colors` is not a table

#[test]
fn ac1707_colors_that_is_not_a_table_is_ignored_with_w_b5() {
    let raw = RawAppearance { colors: RawSection::NotTable { line: Some(4) }, ..preset("light") };
    let a = resolve(&raw);
    assert_eq!(a.colors, resolve(&preset("light")).colors, "the preset's colours as they are");
    assert_eq!(a.problems, vec![Problem::ColorsNotTable { line: Some(4) }]);
}

#[test]
fn an_empty_colors_table_is_not_an_error() {
    let a = resolve(&colors(&[]));
    assert_eq!(a.colors, resolve(&preset("nord")).colors);
    assert_clean(&a);
}

// ------------------------------------------------------------------ the notices of the theme and the colours do not hide each other

#[test]
fn a_bad_preset_and_a_bad_colour_are_both_reported() {
    let raw = colors_on(preset("dracula"), &[("folder", "nonsense"), ("file", "#abcdef")]);
    let a = resolve(&raw);
    assert!(a.problems.iter().any(|p| matches!(p, Problem::PresetUnusable { .. })), "{:?}", a.problems);
    assert_eq!(unparsable(&a), vec![ci("folder", Some(2))]);
    assert_eq!(hex(color_of(&a, "file")), "#abcdef", "the colours apply on top of the fallback (nord)");
    assert_eq!(hex(color_of(&a, "bg")), "#2e3440");
}
