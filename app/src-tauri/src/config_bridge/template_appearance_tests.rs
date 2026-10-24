//! TDD (unit-test-writer, 2026-10-24): the original `templates/config.sample.toml` against the appearance defaults that live in code
//! (SPEC-0300-0023 R-1830 / R-1831; AC-1830 (Rust side); SPEC-0300-0022 R-1612 / R-1631 / R-1634 / R-1637 / R-1638; SPEC-0200-0001 §3.18.9
//! "Rust の照合", §3.18.15 MINOR-8, MUST-3). It ADDS to `template_consistency_tests.rs`, whose `ui_theme` assertions are removed (the template
//! has no `ui_theme` setting any more). The original is rewritten by code-generator: `## ` descriptions, `# ` setting lines, in the order
//! `[theme]` -> `[colors]` -> `[font]` -> `[layout]` -> `[input_keymap_custom]` -> `[[external_apps]]`.
//!
//! Method (R-1638 1): take the rendered scaffold / sample, strip the leading `# ` of every setting line (NOT of `## ` description lines), read
//! it as `config.toml`, and run the start-up reading and `appearance::resolve` on it.

use std::fs;

use crate::appearance::color::hex;
use crate::appearance::font::css_font_family;
use crate::appearance::resolve::resolve;
use crate::config::config_toml::{load, ConfigTomlLoadResult};
use crate::settings_file::source::{render, Kind};
use crate::shared::schema::appearance_raw::{RawAppearance, RawField, RawFont, RawLayout, RawSection, RawThemeSection, COLOR_KEYS};

fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn uncomment_settings(text: &str) -> String {
    text.split("\r\n").map(|l| l.strip_prefix("# ").unwrap_or(l)).collect::<Vec<_>>().join("\r\n")
}

fn load_text(text: &str) -> (tempfile::TempDir, ConfigTomlLoadResult) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, text).unwrap();
    let loaded = load(&path);
    (dir, loaded)
}

const NORD: [&str; 16] = ["#2e3440", "#88c0d0", "#4c566a", "#2e3440", "#8fbcbb", "#81a1c1", "#eceff4", "#b48ead", "#a3be8c", "#ebcb8b", "#e5e9f0", "#3b4252", "#2e3440", "#88c0d0", "#88c0d0", "#ebcb8b"];

// ------------------------------------------------------------------ AC-1830 / R-1831: un-commenting gives exactly the defaults

#[test]
fn ac1830_the_uncommented_scaffold_and_sample_are_nord_default_font_24_24_without_a_notice() {
    for (what, kind) in [("scaffold", Kind::Template), ("sample", Kind::Sample)] {
        let (_d, r) = load_text(&uncomment_settings(&render(kind, version())));
        assert!(r.present && r.keymap.parse_error.is_none(), "{what}: valid TOML");
        assert!(r.unknown.is_empty(), "{what}: zero unknown settings: {:?}", r.unknown);
        let a = resolve(&r.appearance);
        assert!(a.problems.is_empty(), "{what}: zero problems (this includes the unused-settings notice W-B8): {:?}", a.problems);
        let defaults = resolve(&RawAppearance::default());
        assert_eq!(a.colors, defaults.colors, "{what}: the colours are nord's, whatever [colors] repeats");
        assert!(a.dark, "{what}");
        assert_eq!((a.font_size, a.row_height, a.min_col_width, a.tree_width_percent), (12, 16, 24, 24), "{what}");
        assert_eq!(css_font_family(&a.font_families), css_font_family(&defaults.font_families), "{what}: `# family = \"JetBrains Mono\"` switched on equals the default order (duplicates removed)");
        assert_eq!(a, defaults, "{what}: the same as if nothing were written");
    }
}

#[test]
fn ac1830_the_uncommented_theme_is_a_table_with_preset_nord_and_no_top_level_theme_string() {
    let (_d, r) = load_text(&uncomment_settings(&render(Kind::Template, version())));
    let RawThemeSection::Table(t) = &r.appearance.theme else { panic!("[theme] must be a table (MINOR-8: no `theme = \"nord\"` setting line): {:?}", r.appearance.theme) };
    assert!(matches!(&t.preset, RawField::Value { value, .. } if value == "nord"), "{:?}", t.preset);
    assert_eq!((&t.name, &t.theme), (&RawField::Missing, &RawField::Missing), "only `preset` is written");
}

#[test]
fn ac1830_the_font_and_layout_lines_are_the_documented_ones() {
    let (_d, r) = load_text(&uncomment_settings(&render(Kind::Template, version())));
    let RawSection::Table(RawFont { family, size }) = &r.appearance.font else { panic!() };
    assert!(matches!(family, RawField::Value { value: crate::shared::schema::appearance_raw::RawFamily::Str(s), .. } if s == "JetBrains Mono"), "{family:?}");
    assert!(matches!(size, RawField::Value { value: 12, .. }));
    let RawSection::Table(RawLayout { min_col_width, tree_width_percent }) = &r.appearance.layout else { panic!("[layout] must be a table") };
    assert!(matches!(min_col_width, RawField::Value { value: 24, .. }), "{min_col_width:?}");
    assert!(matches!(tree_width_percent, RawField::Value { value: 24, .. }), "{tree_width_percent:?}");
}

// ------------------------------------------------------------------ R-1831: the 16 names and their nord values

#[test]
fn r1831_the_names_of_the_colors_lines_are_exactly_the_sixteen_items_of_the_reader() {
    for kind in [Kind::Template, Kind::Sample] {
        let (_d, r) = load_text(&uncomment_settings(&render(kind, version())));
        let RawSection::Table(entries) = &r.appearance.colors else { panic!("{kind:?}: [colors] must be a table") };
        let mut names: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).collect();
        names.sort();
        let mut expected = COLOR_KEYS.to_vec();
        expected.sort();
        assert_eq!(names, expected, "{kind:?}: one line per item, no alias, no other key");
    }
}

#[test]
fn r1831_the_right_hand_sides_are_the_nord_values() {
    let (_d, r) = load_text(&uncomment_settings(&render(Kind::Template, version())));
    let RawSection::Table(entries) = &r.appearance.colors else { panic!("[colors] must be a table") };
    for (i, key) in COLOR_KEYS.iter().enumerate() {
        let (_, field) = entries.iter().find(|(k, _)| k == key).unwrap_or_else(|| panic!("{key} is missing from [colors]"));
        let RawField::Value { value, .. } = field else { panic!("{key}: a string value is expected: {field:?}") };
        assert_eq!(value.to_ascii_lowercase(), NORD[i], "{key}: the template's value must be nord's (presets.rs and the template must not drift apart)");
    }
    // and the preset table of the code agrees with this list
    let nord = resolve(&RawAppearance::default()); // (no config: nord)
    for (i, key) in COLOR_KEYS.iter().enumerate() {
        assert_eq!(hex(nord.colors.get(key).unwrap()), NORD[i], "{key}");
    }
}

// ------------------------------------------------------------------ AC-1631 as before: as written = no settings

#[test]
fn ac1631_the_scaffold_and_the_sample_as_written_read_as_if_there_were_no_appearance_settings() {
    for kind in [Kind::Template, Kind::Sample] {
        let (_d, r) = load_text(&render(kind, version()));
        assert!(r.present && r.keymap.parse_error.is_none());
        assert_eq!(r.appearance, RawAppearance::default(), "{kind:?}: all comments");
        assert!(r.unknown.is_empty(), "AC-1631: zero unknown settings");
        assert_eq!(resolve(&r.appearance), resolve(&RawAppearance::default()));
    }
}

// ------------------------------------------------------------------ ui_theme: explained, never a setting

#[test]
fn r1830_ui_theme_is_mentioned_only_in_descriptions_and_never_as_a_setting_line() {
    for kind in [Kind::Template, Kind::Sample] {
        let text = render(kind, version());
        let lines: Vec<&str> = text.split("\r\n").collect();
        assert!(lines.iter().any(|l| l.starts_with("## ") && l.contains("ui_theme")), "{kind:?}: the retirement of ui_theme is explained");
        for l in &lines {
            if l.starts_with("# ") && !l.starts_with("## ") {
                assert!(!l.contains("ui_theme"), "{kind:?}: `{l}` is a setting line and must not mention ui_theme");
            }
        }
        assert!(!lines.iter().any(|l| l.starts_with("# theme =") || l.starts_with("theme =")), "{kind:?}: MINOR-8: the top-level `theme = \"nord\"` is explained with `## ` only");
    }
}

#[test]
fn r1830_the_four_tables_come_in_order_before_the_keymap_and_the_external_apps() {
    let text = render(Kind::Template, version());
    let lines: Vec<&str> = text.split("\r\n").collect();
    let at = |exact: &str| lines.iter().position(|l| *l == exact).unwrap_or_else(|| panic!("the line `{exact}` is missing"));
    let order = [at("# [theme]"), at("# [colors]"), at("# [font]"), at("# [layout]"), at("# [input_keymap_custom]"), at("# [[external_apps]]")];
    assert!(order.windows(2).all(|w| w[0] < w[1]), "{order:?}");
    for line in ["# preset = \"nord\"", "# family = \"JetBrains Mono\"", "# size = 12", "# min_col_width = 24", "# tree_width_percent = 24"] {
        assert_eq!(lines.iter().filter(|l| **l == line).count(), 1, "exactly one `{line}`");
    }
}
