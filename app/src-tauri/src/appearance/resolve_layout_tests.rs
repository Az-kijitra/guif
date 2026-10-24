//! TDD (unit-test-writer, 2026-10-24): `appearance::resolve` -- the font size, the row height, `[layout]`, the sections that are not
//! tables, and the defaults when the file cannot be read (SPEC-0300-0023 R-1707 / R-1751 3 / R-1753 / R-1754 / R-1791 / R-1804;
//! AC-1708 / AC-1750 (v) / AC-1751 / AC-1791; SPEC-0200-0001 §3.18.3 `resolve.rs`, `font.rs`).
//!
//! Ranges (from the specification, written here in numbers on purpose): `size` 10..=24 (default 12), `min_col_width` 10..=80 (default 24),
//! `tree_width_percent` 10..=50 (default 24). A value outside the range or of another type is replaced by the default AND reported; the
//! other items of the same table keep their good values (R-1707).

use super::font::{css_font_family, row_height};
use super::resolve::resolve;
use super::test_support::{assert_clean, n, preset, wrong};
use super::{Appearance, Problem};
use crate::shared::schema::appearance_raw::{RawAppearance, RawField, RawFamily, RawFont, RawLayout, RawSection};

fn font(size: RawField<i64>) -> RawAppearance {
    RawAppearance { font: RawSection::Table(RawFont { family: RawField::Missing, size }), ..RawAppearance::default() }
}

fn layout(min_col_width: RawField<i64>, tree_width_percent: RawField<i64>) -> RawAppearance {
    RawAppearance { layout: RawSection::Table(RawLayout { min_col_width, tree_width_percent }), ..RawAppearance::default() }
}

fn has(a: &Appearance, expected: &Problem) -> bool {
    a.problems.contains(expected)
}

// ------------------------------------------------------------------ defaults (AC-1708, R-1707, R-1750, R-1753, R-1754)

#[test]
fn ac1708_the_default_appearance_is_nord_12px_16px_24_24_without_a_notice() {
    let a = resolve(&RawAppearance::default());
    assert_eq!((a.font_size, a.row_height, a.min_col_width, a.tree_width_percent), (12, 16, 24, 24));
    assert_eq!(a.colors, resolve(&preset("nord")).colors);
    assert!(a.dark);
    assert_clean(&a);
    assert_eq!(
        css_font_family(&a.font_families),
        "\"JetBrains Mono\", \"JetBrainsMono NFM\", \"JetBrainsMono NF\", \"Cascadia Mono\", \"Consolas\", \"BIZ UDGothic\", monospace"
    );
}

#[test]
fn present_but_empty_tables_are_the_same_as_no_tables() {
    let empty = RawAppearance {
        font: RawSection::Table(RawFont::default()),
        layout: RawSection::Table(RawLayout::default()),
        ..RawAppearance::default()
    };
    assert_eq!(resolve(&empty), resolve(&RawAppearance::default()));
}

// ------------------------------------------------------------------ R-1753 / R-1754: size and row height

#[test]
fn r1754_the_row_height_is_the_size_times_1_32_rounded() {
    let expected = [(10, 13), (11, 15), (12, 16), (13, 17), (14, 18), (15, 20), (16, 21), (17, 22), (18, 24), (19, 25), (20, 26), (21, 28), (22, 29), (23, 30), (24, 32)];
    for (size, height) in expected {
        assert_eq!(row_height(size), height, "row_height({size})");
        let a = resolve(&font(n(size as i64, 3)));
        assert_eq!((a.font_size, a.row_height), (size, height), "size = {size}");
        assert_clean(&a);
    }
}

#[test]
fn ac1750_v_size_13_is_13px_and_a_row_of_17() {
    let a = resolve(&font(n(13, 3)));
    assert_eq!((a.font_size, a.row_height), (13, 17));
}

#[test]
fn ac1751_a_size_outside_10_to_24_or_not_an_integer_is_12_with_w_b3_and_its_line() {
    for bad in [9i64, 25, 0, -1, 30, 100, i64::MIN, i64::MAX] {
        let a = resolve(&font(n(bad, 4)));
        assert_eq!((a.font_size, a.row_height), (12, 16), "size = {bad}");
        assert!(has(&a, &Problem::FontSize { line: Some(4) }), "size = {bad}: {:?}", a.problems);
        assert_eq!(a.problems.len(), 1, "size = {bad}");
    }
    // "13" (a string), 13.0 (a float), true: the reader hands them over as `WrongType`
    let a = resolve(&font(wrong(4)));
    assert_eq!(a.font_size, 12);
    assert!(has(&a, &Problem::FontSize { line: Some(4) }));
}

#[test]
fn a_bad_size_does_not_spoil_the_family_of_the_same_table() {
    let raw = RawAppearance {
        font: RawSection::Table(RawFont { family: s_family("Consolas", 3), size: n(30, 4) }),
        ..RawAppearance::default()
    };
    let a = resolve(&raw);
    assert_eq!(a.font_size, 12);
    assert_eq!(a.font_families.first().map(String::as_str), Some("Consolas"));
    assert!(has(&a, &Problem::FontSize { line: Some(4) }));
}

fn s_family(name: &str, line: u32) -> RawField<RawFamily> {
    RawField::Value { value: RawFamily::Str(name.into()), line: Some(line) }
}

// ------------------------------------------------------------------ R-1791 / R-1804: [layout]

#[test]
fn ac1791_min_col_width_between_10_and_80_is_used() {
    for value in [10i64, 24, 33, 80] {
        let a = resolve(&layout(n(value, 2), RawField::Missing));
        assert_eq!(a.min_col_width, value as u32);
        assert_clean(&a);
    }
}

#[test]
fn ac1791_min_col_width_outside_the_range_or_of_another_type_is_24_with_w_b4() {
    for bad in [9i64, 81, 0, -1, 1000, i64::MAX, i64::MIN] {
        let a = resolve(&layout(n(bad, 3), RawField::Missing));
        assert_eq!(a.min_col_width, 24, "min_col_width = {bad}");
        assert!(has(&a, &Problem::LayoutValue { line: Some(3), key: "min_col_width".into() }), "{bad}: {:?}", a.problems);
    }
    let a = resolve(&layout(wrong(3), RawField::Missing)); // "24"
    assert_eq!(a.min_col_width, 24);
    assert!(has(&a, &Problem::LayoutValue { line: Some(3), key: "min_col_width".into() }));
}

#[test]
fn ac1791_tree_width_percent_between_10_and_50_is_used() {
    for value in [10i64, 24, 40, 50] {
        let a = resolve(&layout(RawField::Missing, n(value, 2)));
        assert_eq!(a.tree_width_percent, value as u32);
        assert_clean(&a);
    }
}

#[test]
fn ac1791_tree_width_percent_9_51_and_other_types_are_24_with_w_b4() {
    for bad in [9i64, 51, 0, -10, 100, i64::MAX] {
        let a = resolve(&layout(RawField::Missing, n(bad, 5)));
        assert_eq!(a.tree_width_percent, 24, "tree_width_percent = {bad}");
        assert!(has(&a, &Problem::LayoutValue { line: Some(5), key: "tree_width_percent".into() }), "{bad}: {:?}", a.problems);
    }
    let a = resolve(&layout(RawField::Missing, wrong(5)));
    assert_eq!(a.tree_width_percent, 24);
}

#[test]
fn ac1791_the_good_one_of_two_layout_keys_is_kept() {
    // min_col_width = 9 (bad) with tree_width_percent = 40 (good): "40 は使われ"
    let a = resolve(&layout(n(9, 2), n(40, 3)));
    assert_eq!((a.min_col_width, a.tree_width_percent), (24, 40));
    assert_eq!(a.problems, vec![Problem::LayoutValue { line: Some(2), key: "min_col_width".into() }]);
    // and the other way round
    let a = resolve(&layout(n(10, 2), n(51, 3)));
    assert_eq!((a.min_col_width, a.tree_width_percent), (10, 24));
    assert_eq!(a.problems, vec![Problem::LayoutValue { line: Some(3), key: "tree_width_percent".into() }]);
    // both bad: two problems
    let a = resolve(&layout(n(9, 2), n(9, 3)));
    assert_eq!(a.problems.len(), 2);
}

// ------------------------------------------------------------------ R-1751 3 / R-1791: `font` / `layout` that are not tables

#[test]
fn ac1751_font_that_is_not_a_table_is_the_default_font_with_w_b7() {
    let raw = RawAppearance { font: RawSection::NotTable { line: Some(6) }, ..RawAppearance::default() };
    let a = resolve(&raw);
    assert_eq!((a.font_size, a.row_height), (12, 16));
    assert_eq!(a.problems, vec![Problem::NotTable { line: Some(6), key: "font".into() }]);
}

#[test]
fn r1791_layout_that_is_not_a_table_gives_the_default_layout_with_w_b7() {
    let raw = RawAppearance { layout: RawSection::NotTable { line: Some(7) }, ..RawAppearance::default() };
    let a = resolve(&raw);
    assert_eq!((a.min_col_width, a.tree_width_percent), (24, 24));
    assert_eq!(a.problems, vec![Problem::NotTable { line: Some(7), key: "layout".into() }]);
}

#[test]
fn a_table_that_is_not_one_does_not_disturb_the_other_sections() {
    let raw = RawAppearance {
        font: RawSection::NotTable { line: Some(2) },
        layout: RawSection::Table(RawLayout { min_col_width: n(30, 5), tree_width_percent: n(35, 6) }),
        ..preset("light")
    };
    let a = resolve(&raw);
    assert_eq!((a.min_col_width, a.tree_width_percent), (30, 35));
    assert!(!a.dark);
    assert_eq!(a.problems, vec![Problem::NotTable { line: Some(2), key: "font".into() }]);
}

// ------------------------------------------------------------------ independent notices add up

#[test]
fn problems_of_the_four_sections_are_all_reported_together() {
    let raw = RawAppearance {
        font: RawSection::Table(RawFont { family: RawField::Missing, size: n(99, 3) }),
        layout: RawSection::Table(RawLayout { min_col_width: n(1, 5), tree_width_percent: n(99, 6) }),
        ..preset("dracula")
    };
    let a = resolve(&raw);
    assert!(a.problems.iter().any(|p| matches!(p, Problem::PresetUnusable { .. })));
    assert!(has(&a, &Problem::FontSize { line: Some(3) }));
    assert!(has(&a, &Problem::LayoutValue { line: Some(5), key: "min_col_width".into() }));
    assert!(has(&a, &Problem::LayoutValue { line: Some(6), key: "tree_width_percent".into() }));
    assert_eq!(a.problems.len(), 4);
}
