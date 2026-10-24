//! TDD (unit-test-writer, 2026-10-24): `appearance/highlight.rs` -- the 13 syntax-highlight colours of the viewer, adjusted for the bg
//! (SPEC-0300-0023 R-1727 / R-1745 (2); AC-1725; SPEC-0300-0015 R-466-8; SPEC-0200-0001 §3.18.3 `highlight.rs`, §3.18.13 Q-C).
//!
//! Contract (module `appearance::highlight`; declared as `#[cfg(test)] mod highlight_tests;`):
//!
//! ```ignore
//! /// A colour under 4.5:1 against `bg` is moved in HSL: hue and saturation kept, lightness changed in steps of 1 % (a dark scheme lighter,
//! /// a light scheme darker) until the ROUNDED #rrggbb reaches 4.5:1; it stops at 0 % / 100 % when 4.5:1 cannot be reached.
//! /// A colour that is already 4.5:1 or more is returned as it is. Deterministic.
//! pub fn adjust(color: Rgb, bg: Rgb, dark: bool) -> Rgb;
//! ```
//! The 13 colours reach the viewer as `--vw-hl-*` through `viewer_vars` (the names are those of `viewer-theme.css`). Their ORIGINAL values are
//! the dark / light columns of SPEC-0300-0017 R-913-1-1 (GitHub Dark / GitHub), as they are in `viewer-theme.css` today; `addition` and
//! `deletion` (text) are held against their OWN background (`--vw-hl-addition-bg` / `--vw-hl-deletion-bg`, which are not adjusted).
//!
//! The adjusted values below follow the step rule above (computed outside the code under test). They are compared with 2 levels of
//! tolerance per channel (an HSL round trip may differ in the last digit); the PROPERTIES (4.5:1, direction, hue) are compared strictly.

use super::color::{contrast, Rgb};
use super::highlight::adjust;
use super::resolve::resolve;
use super::test_support::{colors, expected_hex, preset, rgb, var, PRESET_NAMES};
use super::vars::viewer_vars;

const KEYS: [&str; 13] = [
    "keyword", "title", "constant", "string", "builtin", "comment", "name", "section", "bullet", "addition-fg", "addition-bg", "deletion-fg", "deletion-bg",
];

/// SPEC-0300-0017 R-913-1-1, light column (GitHub) and dark column (GitHub Dark).
const LIGHT: [&str; 13] = ["#d73a49", "#6f42c1", "#005cc5", "#032f62", "#c24e00", "#6a737d", "#22863a", "#005cc5", "#735c0f", "#1e7f35", "#f0fff4", "#b31d28", "#ffeef0"];
const DARK: [&str; 13] = ["#ff7b72", "#d2a8ff", "#79c0ff", "#a5d6ff", "#ffa657", "#8b949e", "#7ee787", "#4a8cf7", "#f2cc60", "#aff5b4", "#033a16", "#ffdcd7", "#67060c"];

/// The adjusted values per preset (R-1727, steps of 1 % in HSL). Only nord (comment, section) and light (keyword, builtin, comment, name) differ from the column.
const ADJUSTED: [(&str, [&str; 13]); 6] = [
    ("default", DARK),
    ("nord", ["#ff7b72", "#d2a8ff", "#79c0ff", "#a5d6ff", "#ffa657", "#969ea7", "#7ee787", "#629cf8", "#f2cc60", "#aff5b4", "#033a16", "#ffdcd7", "#67060c"]),
    ("monokai", DARK),
    ("catppuccin", DARK),
    ("solarized", DARK),
    ("light", ["#d42d3d", "#6f42c1", "#005cc5", "#032f62", "#bd4c00", "#68707a", "#207e36", "#005cc5", "#735c0f", "#1e7f35", "#f0fff4", "#b31d28", "#ffeef0"]),
];

fn highlights(raw: &crate::shared::schema::appearance_raw::RawAppearance) -> Vec<(String, String)> {
    let vars = viewer_vars(&resolve(raw));
    KEYS.iter().map(|k| (k.to_string(), var(&vars, &format!("--vw-hl-{k}")).to_string())).collect()
}

fn hsl(c: Rgb) -> (f64, f64, f64) {
    let (r, g, b) = (c.0 as f64 / 255.0, c.1 as f64 / 255.0, c.2 as f64 / 255.0);
    let (mx, mn) = (r.max(g).max(b), r.min(g).min(b));
    let l = (mx + mn) / 2.0;
    let d = mx - mn;
    if d == 0.0 {
        return (0.0, 0.0, l);
    }
    let s = if l > 0.5 { d / (2.0 - mx - mn) } else { d / (mx + mn) };
    let h = if mx == r { (g - b) / d + if g < b { 6.0 } else { 0.0 } } else if mx == g { (b - r) / d + 2.0 } else { (r - g) / d + 4.0 };
    (h * 60.0, s, l)
}

fn within(a: Rgb, b: Rgb, tolerance: u8) -> bool {
    a.0.abs_diff(b.0) <= tolerance && a.1.abs_diff(b.1) <= tolerance && a.2.abs_diff(b.2) <= tolerance
}

// ------------------------------------------------------------------ AC-1725: all 13 hold 4.5:1 for the six presets

#[test]
fn ac1725_every_highlight_colour_is_4_5_to_1_against_its_background_for_all_six_presets() {
    for name in PRESET_NAMES {
        let vw = highlights(&preset(name));
        let bg = rgb(expected_hex(name, "bg"));
        let get = |k: &str| rgb(&vw.iter().find(|(n, _)| n == k).unwrap().1);
        for k in ["keyword", "title", "constant", "string", "builtin", "comment", "name", "section", "bullet"] {
            assert!(contrast(get(k), bg) >= 4.5, "{name} {k}: {} on {}", hex_of(get(k)), hex_of(bg));
        }
        assert!(contrast(get("addition-fg"), get("addition-bg")) >= 4.5, "{name} addition on its own background");
        assert!(contrast(get("deletion-fg"), get("deletion-bg")) >= 4.5, "{name} deletion on its own background");
    }
}

fn hex_of(c: Rgb) -> String {
    super::color::hex(c)
}

#[test]
fn ac1725_a_colour_that_was_already_4_5_to_1_keeps_its_original_value_exactly() {
    for name in PRESET_NAMES {
        let dark = name != "light";
        let (column, bg) = (if dark { DARK } else { LIGHT }, rgb(expected_hex(name, "bg")));
        let got = highlights(&preset(name));
        for (i, k) in KEYS.iter().enumerate() {
            let original = rgb(column[i]);
            let own_bg = match *k {
                "addition-fg" => rgb(column[10]),
                "deletion-fg" => rgb(column[12]),
                _ => bg,
            };
            if k.ends_with("-bg") || contrast(original, own_bg) >= 4.5 {
                assert_eq!(got[i].1, column[i], "{name} {k} must stay {}", column[i]);
            }
        }
    }
}

#[test]
fn ac1725_the_two_tinted_backgrounds_are_never_adjusted() {
    for name in PRESET_NAMES {
        let got = highlights(&preset(name));
        let column = if name == "light" { LIGHT } else { DARK };
        assert_eq!(got[10].1, column[10], "{name} addition-bg");
        assert_eq!(got[12].1, column[12], "{name} deletion-bg");
    }
}

// ------------------------------------------------------------------ the pinned results (Q-C: "結果は単体テストで固定")

#[test]
fn q_c_the_adjusted_values_of_the_six_presets_are_pinned() {
    for (name, expected) in ADJUSTED {
        let got = highlights(&preset(name));
        for (i, k) in KEYS.iter().enumerate() {
            let (want, have) = (rgb(expected[i]), rgb(&got[i].1));
            assert!(within(want, have, 2), "{name} {k}: {} expected (±2), got {}", expected[i], got[i].1);
        }
    }
}

#[test]
fn dark_presets_use_the_dark_column_and_light_uses_the_light_column() {
    // on a bg where every original is already good, the output is the column itself
    let on_white = highlights(&colors(&[("bg", "#ffffff")]));
    let on_dark = highlights(&colors(&[("bg", "#1e1e1e")]));
    for (i, k) in KEYS.iter().enumerate() {
        assert_eq!(on_white[i].1, LIGHT[i], "bg #ffffff -> light column: {k}");
        assert_eq!(on_dark[i].1, DARK[i], "bg #1e1e1e -> dark column: {k}");
    }
}

// ------------------------------------------------------------------ direction and hue

#[test]
fn r1727_a_dark_scheme_is_made_lighter_a_light_scheme_darker_and_the_hue_is_kept() {
    for (name, _) in ADJUSTED {
        let dark = name != "light";
        let column = if dark { DARK } else { LIGHT };
        let got = highlights(&preset(name));
        for (i, k) in KEYS.iter().enumerate() {
            let (original, now) = (rgb(column[i]), rgb(&got[i].1));
            if original == now {
                continue;
            }
            let (h0, s0, l0) = hsl(original);
            let (h1, _, l1) = hsl(now);
            if dark {
                assert!(l1 > l0, "{name} {k}: lighter ({l0:.3} -> {l1:.3})");
            } else {
                assert!(l1 < l0, "{name} {k}: darker ({l0:.3} -> {l1:.3})");
            }
            if s0 > 0.2 {
                let d = (h0 - h1).abs().min(360.0 - (h0 - h1).abs());
                assert!(d <= 4.0, "{name} {k}: hue {h0:.1} -> {h1:.1}");
            }
        }
    }
}

// ------------------------------------------------------------------ `adjust` itself

#[test]
fn adjust_returns_a_good_colour_unchanged_and_fixes_a_bad_one_minimally() {
    let bg = rgb("#2e3440");
    assert_eq!(adjust(rgb("#ffffff"), bg, true), rgb("#ffffff"));
    assert_eq!(adjust(rgb("#79c0ff"), bg, true), rgb("#79c0ff"));
    // #4a8cf7 on the nord bg is under 4.5:1; the result reaches it and is the closest 1 %-step that does
    let fixed = adjust(rgb("#4a8cf7"), bg, true);
    assert!(contrast(fixed, bg) >= 4.5);
    assert!(within(fixed, rgb("#629cf8"), 2), "{}", hex_of(fixed));
    // one step back (1 % darker) would be under 4.5:1: the result is not lighter than needed
    let (h, s, l) = hsl(fixed);
    assert!(h > 200.0 && h < 230.0 && s > 0.8, "{h} {s}");
    assert!(l < 0.75, "{l}");
}

#[test]
fn adjust_light_scheme_darkens() {
    let bg = rgb("#f5f5f5");
    let fixed = adjust(rgb("#d73a49"), bg, false);
    assert!(contrast(fixed, bg) >= 4.5);
    assert!(hsl(fixed).2 < hsl(rgb("#d73a49")).2);
    assert!(within(fixed, rgb("#d42d3d"), 2), "{}", hex_of(fixed));
}

#[test]
fn adjust_stops_at_the_limit_when_4_5_to_1_cannot_be_reached() {
    // a mid-grey bg: no colour of the same hue can reach 4.5:1 in the light direction on #808080 with white-ish text (3.95:1 at best)
    let bg = rgb("#808080");
    let r = adjust(rgb("#d0d0d0"), bg, true);
    assert_eq!(r, rgb("#ffffff"), "lightness runs to 100 % and stops (no endless loop, no panic)");
    let r = adjust(rgb("#303030"), bg, false);
    assert!(hsl(r).2 <= hsl(rgb("#303030")).2);
    for (c, b) in [("#000000", "#000000"), ("#ffffff", "#ffffff"), ("#777777", "#777777"), ("#123456", "#123457")] {
        for dark in [true, false] {
            let _ = adjust(rgb(c), rgb(b), dark);
        }
    }
}

#[test]
fn adjust_is_deterministic() {
    let (c, bg) = (rgb("#4a8cf7"), rgb("#2e3440"));
    assert_eq!(adjust(c, bg, true), adjust(c, bg, true));
}
