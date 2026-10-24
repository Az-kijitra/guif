//! TDD (unit-test-writer, 2026-10-24): `appearance/paint.rs` -- what the Rust side paints before the first frame: the window background and the
//! initialization script of the viewer (SPEC-0300-0023 R-1721 / R-1742 / R-1741; AC-1743 (Rust half); SPEC-0200-0001 §3.18.3 `paint.rs` and
//! `shared/window_paint.rs`, §3.18.5, §3.18.13 spike S-1 (b)).
//!
//! Contract (module `appearance::paint`; declared as `#[cfg(test)] mod paint_tests;`):
//!
//! ```ignore
//! pub fn window_paint(a: &Appearance) -> crate::shared::window_paint::WindowPaint;
//! // shared/window_paint.rs (pure data, no tauri):  #[derive(Debug, Clone, PartialEq, Eq)]
//! // pub struct WindowPaint { pub bg: (u8, u8, u8), pub viewer_init_script: String }
//! ```
//! `viewer_init_script` is ONE statement assembled by plain concatenation (no JSON library, `serde_json` is not a dependency):
//! `window.__GUIF_APPEARANCE__={"vars":[["--vw-bg","#2e3440"],["--vw-fg","#eceff4"],…]};` -- exactly the pairs of `viewer_vars`, in its order.
//! It only PLACES the value; it touches no `document` (spike S-1: at that time `document.documentElement` is null).

use super::paint::window_paint;
use super::resolve::resolve;
use super::test_support::{colors, colors_on, preset, rgb, PRESET_NAMES};
use super::vars::viewer_vars;
use crate::shared::window_paint::WindowPaint;

const PREFIX: &str = "window.__GUIF_APPEARANCE__=";

/// Strings of the script: everything between the double quotes. Fails the test on anything that is not `{"vars":[["a","b"],…]};`.
fn parse_pairs(script: &str) -> Vec<(String, String)> {
    let body = script.strip_prefix(PREFIX).unwrap_or_else(|| panic!("the script must start with `{PREFIX}`: {script:.60}"));
    let body = body.strip_suffix(';').expect("the script ends with `;`");
    let inner = body.strip_prefix("{\"vars\":[").and_then(|b| b.strip_suffix("]}")).unwrap_or_else(|| panic!("shape `{{\"vars\":[…]}}`: {body:.60}"));
    let mut pairs = Vec::new();
    let mut rest = inner;
    while !rest.is_empty() {
        let item = rest.strip_prefix("[\"").unwrap_or_else(|| panic!("a pair starts with [\": {rest:.40}"));
        let (name, after) = item.split_once("\",\"").expect("name\",\"value");
        let (value, after) = after.split_once("\"]").expect("value\"]");
        pairs.push((name.to_string(), value.to_string()));
        rest = after.strip_prefix(',').unwrap_or(after);
    }
    pairs
}

// ------------------------------------------------------------------ AC-1743 / R-1742: the background is the resolved bg

#[test]
fn ac1743_the_window_background_is_the_resolved_bg_for_all_six_presets() {
    let bgs = [("default", (0, 0, 0)), ("nord", (0x2e, 0x34, 0x40)), ("monokai", (0x27, 0x28, 0x22)), ("catppuccin", (0x1e, 0x1e, 0x2e)), ("solarized", (0x00, 0x2b, 0x36)), ("light", (0xf5, 0xf5, 0xf5))];
    for (name, expected) in bgs {
        assert_eq!(window_paint(&resolve(&preset(name))).bg, expected, "{name}");
    }
    assert_eq!(window_paint(&resolve(&crate::shared::schema::appearance_raw::RawAppearance::default())).bg, (0x2e, 0x34, 0x40), "no config: nord");
}

#[test]
fn ac1743_a_bg_override_is_the_window_background_too() {
    assert_eq!(window_paint(&resolve(&colors(&[("bg", "#F0F0F0")]))).bg, (0xf0, 0xf0, 0xf0));
    assert_eq!(window_paint(&resolve(&colors_on(preset("light"), &[("bg", "reset")]))).bg, (0, 0, 0), "bg = reset is black (R-1713)");
    // a bad bg keeps the preset's and so does the window
    assert_eq!(window_paint(&resolve(&colors_on(preset("light"), &[("bg", "not a colour")]))).bg, (0xf5, 0xf5, 0xf5));
}

#[test]
fn r1742_one_background_serves_the_main_window_and_the_viewer() {
    // WindowPaint has ONE bg; there is no per-window colour (the four constants of window_theme.rs are gone)
    let p: WindowPaint = window_paint(&resolve(&preset("catppuccin")));
    let (r, g, b) = p.bg;
    assert_eq!(rgb("#1e1e2e"), crate::appearance::color::Rgb(r, g, b));
}

// ------------------------------------------------------------------ the initialization script

#[test]
fn s1_b_the_script_is_one_statement_that_places_the_viewer_variables_in_order() {
    for name in PRESET_NAMES {
        let a = resolve(&preset(name));
        let script = window_paint(&a).viewer_init_script;
        let pairs = parse_pairs(&script);
        let expected: Vec<(String, String)> = viewer_vars(&a).into_iter().map(|(n, v)| (n.to_string(), v)).collect();
        assert_eq!(pairs, expected, "{name}: exactly the pairs of viewer_vars, in its order");
        assert_eq!(pairs.len(), 26);
        assert!(!script.contains('\n') && !script.contains('\r'), "{name}: one line");
        assert_eq!(script.matches(PREFIX).count(), 1);
        assert_eq!(script.matches(';').count(), 1, "{name}: one statement");
    }
}

#[test]
fn s1_b_the_script_has_no_main_window_variable_and_touches_no_document() {
    let script = window_paint(&resolve(&preset("nord"))).viewer_init_script;
    assert!(!script.contains("--ui-"), "the viewer never receives the main window's variables (R-1726)");
    for forbidden in ["document", "documentElement", "style", "setProperty", "addEventListener", "function", "=>", "eval", "import"] {
        assert!(!script.contains(forbidden), "`{forbidden}`: the script only places a value (spike S-1)");
    }
}

#[test]
fn the_script_changes_with_the_appearance() {
    let nord = window_paint(&resolve(&preset("nord"))).viewer_init_script;
    let light = window_paint(&resolve(&preset("light"))).viewer_init_script;
    assert_ne!(nord, light);
    assert!(nord.contains("[\"--vw-bg\",\"#2e3440\"]") && nord.contains("[\"--vw-color-scheme\",\"dark\"]"), "{nord}");
    assert!(light.contains("[\"--vw-bg\",\"#f5f5f5\"]") && light.contains("[\"--vw-color-scheme\",\"light\"]"), "{light}");
    assert_eq!(window_paint(&resolve(&preset("nord"))).viewer_init_script, nord, "deterministic");
}

// ------------------------------------------------------------------ safety: the characters (no injection)

fn assert_safe(script: &str) {
    for (name, value) in parse_pairs(script) {
        for s in [&name, &value] {
            assert!(!s.is_empty(), "no empty name or value");
            for c in s.chars() {
                assert!(c.is_ascii_lowercase() || c.is_ascii_digit() || "-#(),. %".contains(c), "character {c:?} is outside [-a-z0-9#(),. %] in {s:?}");
            }
        }
    }
    for forbidden in [b'"', b'\\', b'<', b'>', b'\'', b'`', b'\n', b'\r', 0u8] {
        let inside_structure = script.bytes().filter(|b| *b == forbidden).count();
        if forbidden == b'"' {
            assert_eq!(inside_structure % 2, 0, "quotes are balanced");
        } else {
            assert_eq!(inside_structure, 0, "byte {forbidden} must not appear");
        }
    }
    assert!(!script.to_lowercase().contains("</script"));
}

#[test]
fn s1_the_characters_of_the_script_are_fixed_for_every_preset() {
    for name in PRESET_NAMES {
        assert_safe(&window_paint(&resolve(&preset(name))).viewer_init_script);
    }
}

#[test]
fn s1_hostile_text_in_the_configuration_cannot_reach_the_script() {
    // values that cannot be read are dropped (the preset's value stays); the names of the unknown items never leave `resolve`
    let hostile = [
        ("folder", "\"</script><script>alert(1)</script>"), ("file", "'; document.write(1); '"), ("border", "\\\"; x"), ("bg", "#12345\"6"),
        ("</script>", "red"), ("\"", "red"), ("symlink", "javascript:alert(1)"),
    ];
    let a = resolve(&colors(&hostile));
    assert_safe(&window_paint(&a).viewer_init_script);
    let bad_preset = resolve(&preset("</script><script>alert(1)</script>"));
    assert_safe(&window_paint(&bad_preset).viewer_init_script);
}

#[test]
fn nothing_panics_for_odd_appearances() {
    for (bg, file) in [("#000000", "#000000"), ("#ffffff", "#ffffff"), ("#777777", "#777777")] {
        let a = resolve(&colors(&[("bg", bg), ("file", file)]));
        assert_safe(&window_paint(&a).viewer_init_script);
    }
}
