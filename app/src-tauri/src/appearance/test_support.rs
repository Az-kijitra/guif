//! TDD (unit-test-writer, 2026-10-24): helpers shared by the tests of `appearance/` (SPEC-0300-0023, SPEC-0200-0001 §3.18.3).
//!
//! ONE place knows the shape of `RawAppearance` and of the problems, so that a change of shape touches this file only. Nothing here is
//! production code (`is_test_file`: the name `test_support.rs`); `appearance/mod.rs` declares it as `#[cfg(test)] mod test_support;`.
//!
//! The expected tables of the tests (palettes, derived colours, contrast ratios, adjusted highlight colours) were computed with an
//! independent script (WCAG 2.1 relative luminance, `round(a * X + (1 - a) * Y)`, HSL steps of 1 %) and pasted in; they are NOT produced by
//! the code under test.

use crate::appearance::color::Rgb;
use crate::appearance::resolve::resolve;
use crate::appearance::Appearance;
use crate::shared::schema::appearance_raw::{RawAppearance, RawField, RawSection, RawTheme, RawThemeSection};

/// `"#rrggbb"` (any case) -> `Rgb`. A malformed expectation is a test bug, so it panics.
pub fn rgb(hex: &str) -> Rgb {
    let h = hex.trim_start_matches('#');
    assert!(h.len() == 6 && h.is_ascii(), "test bug: not #rrggbb: {hex}");
    let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap_or_else(|_| panic!("test bug: not hex: {hex}"));
    Rgb(p(0), p(2), p(4))
}

/// A string field written at `line`.
pub fn s(value: &str, line: u32) -> RawField<String> {
    RawField::Value { value: value.to_string(), line: Some(line) }
}

/// An integer field written at `line`.
pub fn n(value: i64, line: u32) -> RawField<i64> {
    RawField::Value { value, line: Some(line) }
}

/// A field that is there but has the wrong type (R-1703 / R-1705 / R-1751), at `line`.
pub fn wrong<T>(line: u32) -> RawField<T> {
    RawField::WrongType { line: Some(line) }
}

/// `[theme]` with the three keys; `None` = not written. Lines are 2, 3, 4 (the heading is line 1).
pub fn theme_table(preset: Option<&str>, name: Option<&str>, theme: Option<&str>) -> RawAppearance {
    let field = |v: Option<&str>, line: u32| v.map_or(RawField::Missing, |v| s(v, line));
    RawAppearance {
        theme: RawThemeSection::Table(RawTheme { line: Some(1), preset: field(preset, 2), name: field(name, 3), theme: field(theme, 4) }),
        ..RawAppearance::default()
    }
}

/// `[theme] preset = "<name>"`.
pub fn preset(name: &str) -> RawAppearance {
    theme_table(Some(name), None, None)
}

/// A top-level `theme = "<name>"` at line 1.
pub fn top_theme(name: &str) -> RawAppearance {
    RawAppearance { theme: RawThemeSection::Str { value: name.to_string(), line: Some(1) }, ..RawAppearance::default() }
}

/// `[colors]` with string values; entry i is on line i + 2.
pub fn colors(entries: &[(&str, &str)]) -> RawAppearance {
    colors_on(RawAppearance::default(), entries)
}

/// The same on top of `base` (e.g. a preset).
pub fn colors_on(base: RawAppearance, entries: &[(&str, &str)]) -> RawAppearance {
    let list = entries.iter().enumerate().map(|(i, (k, v))| (k.to_string(), s(v, i as u32 + 2))).collect();
    RawAppearance { colors: RawSection::Table(list), ..base }
}

/// `[colors]` with arbitrary raw fields.
pub fn colors_raw(entries: Vec<(&str, RawField<String>)>) -> RawAppearance {
    RawAppearance { colors: RawSection::Table(entries.into_iter().map(|(k, v)| (k.to_string(), v)).collect()), ..RawAppearance::default() }
}

/// `resolve` of a preset with `[colors]` on top, then the colour `key` of the result as `#rrggbb` (lower case).
pub fn resolved_hex(raw: &RawAppearance, key: &str) -> String {
    let a = resolve(raw);
    crate::appearance::color::hex(a.colors.get(key).unwrap_or_else(|| panic!("no colour `{key}`")))
}

/// The colour `key` of the resolved appearance.
pub fn color_of(a: &Appearance, key: &str) -> Rgb {
    a.colors.get(key).unwrap_or_else(|| panic!("no colour `{key}`"))
}

/// A variable of `ui_vars` / `viewer_vars` output by name.
pub fn var<'a>(vars: &'a [(&'static str, String)], name: &str) -> &'a str {
    vars.iter().find(|(n, _)| *n == name).map(|(_, v)| v.as_str()).unwrap_or_else(|| panic!("variable `{name}` is missing"))
}

/// No problems at all (the common expectation for a good file).
pub fn assert_clean(a: &Appearance) {
    assert!(a.problems.is_empty(), "expected no problems, got {:?}", a.problems);
}

/// The six presets in the order of R-1708.
pub const PRESET_NAMES: [&str; 6] = ["default", "nord", "monokai", "catppuccin", "solarized", "light"];

/// The same 96 values resolved to `#rrggbb` (R-1712 / R-1713 applied; the `default` row is R-1714). Computed outside the code under test.
pub const RESOLVED: [(&str, [&str; 16]); 6] = [
    ("default", ["#000000", "#56b6c2", "#5a6374", "#282c34", "#56b6c2", "#e5c07b", "#dcdfe4", "#c678dd", "#98c379", "#61afef", "#dcdfe4", "#5a6374", "#282c34", "#56b6c2", "#56b6c2", "#e5c07b"]),
    ("nord", ["#2e3440", "#88c0d0", "#4c566a", "#2e3440", "#8fbcbb", "#81a1c1", "#eceff4", "#b48ead", "#a3be8c", "#ebcb8b", "#e5e9f0", "#3b4252", "#2e3440", "#88c0d0", "#88c0d0", "#ebcb8b"]),
    ("monokai", ["#272822", "#f92672", "#75715e", "#272822", "#a6e22e", "#fd971f", "#f8f8f2", "#ae81ff", "#a6e22e", "#e6db74", "#f8f8f2", "#3e3d32", "#272822", "#f92672", "#66d9ef", "#e6db74"]),
    ("catppuccin", ["#1e1e2e", "#cba6f7", "#585b70", "#11111b", "#89b4fa", "#f9e2af", "#cdd6f4", "#f5c2e7", "#a6e3a1", "#fab387", "#cdd6f4", "#313244", "#11111b", "#cba6f7", "#89dceb", "#f9e2af"]),
    ("solarized", ["#002b36", "#268bd2", "#073642", "#002b36", "#2aa198", "#b58900", "#839496", "#d33682", "#859900", "#cb4b16", "#93a1a1", "#073642", "#002b36", "#268bd2", "#2aa198", "#b58900"]),
    ("light", ["#f5f5f5", "#0066cc", "#b4b4b4", "#ffffff", "#0078d7", "#d97706", "#1f2937", "#7c3aed", "#16a34a", "#ea580c", "#374151", "#e5e7eb", "#ffffff", "#0078d7", "#0066cc", "#d97706"]),
];


/// `RESOLVED` for one preset and one item (`key` is a name of COLOR_KEYS).
pub fn expected_hex(preset: &str, key: &str) -> &'static str {
    let row = RESOLVED.iter().find(|(n, _)| *n == preset).unwrap_or_else(|| panic!("test bug: no preset {preset}"));
    let at = crate::shared::schema::appearance_raw::COLOR_KEYS.iter().position(|k| *k == key).unwrap_or_else(|| panic!("test bug: no item {key}"));
    row.1[at]
}
