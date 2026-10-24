//! TDD (unit-test-writer, 2026-10-24): the contrast of the six presets -- what is GUARANTEED (derived colours, highlights) and what is only RECORDED
//! (the 16 colours as tuif has them, which are not adjusted) (SPEC-0300-0023 R-1745 / R-1746 / R-1747; AC-1745 / AC-1746; SPEC-0300-0017
//! R-916 (4.5:1); SPEC-0200-0001 §3.18.2 "(k)", §3.18.11).
//!
//! AC-1746 asks for "the list of results, including the pairs that do not reach the standard, is equal to the table of the test (the values
//! are recorded unchanged)". The table below was computed with WCAG 2.1 outside the code under test; it is the RECORD that a human accepts
//! (R-1746). A change of a preset value, of the table of `light` / `solarized` / ..., or of the contrast formula makes this file fail on
//! purpose: the person who changes it re-records and has it accepted again.
//!
//! Where this record differs from the approximations written in R-1746 1 / 2 (made before the numbers existed), THE NUMBERS HERE ARE THE
//! RECORD: `monokai` menu 3.93 (not about 3.8), `nord` border_inactive 1.69 (not about 1.9), `default` status 4.53 (it MEETS 4.5:1),
//! `light` cursor and menu 4.499 (a hair under 4.5:1), and `solarized` selected 3.26 / menu 4.08 as in the text.

use super::color::contrast;
use super::resolve::resolve;
use super::test_support::{color_of, preset, rgb, var, PRESET_NAMES};
use super::vars::{ui_vars, viewer_vars};

type Row = (&'static str, &'static str, f64);

/// The ten pairs of AC-1746 per preset: (text colour item, its background item, ratio rounded to 2 places).
const RECORD: [(&str, [Row; 10]); 6] = [
    ("default", [("file", "bg", 15.72), ("folder", "bg", 12.16), ("executable", "bg", 10.42), ("selected", "bg", 8.89), ("tree_current", "bg", 8.87), ("tree_cursor", "bg", 12.16), ("cursor_fg", "cursor_bg", 5.91), ("status_bar_fg", "status_bar_bg", 4.53), ("menu_bar_active_fg", "menu_bar_active_bg", 5.91), ("border_inactive", "bg", 3.47)]),
    ("nord", [("file", "bg", 10.84), ("folder", "bg", 4.64), ("executable", "bg", 6.13), ("selected", "bg", 8.00), ("tree_current", "bg", 6.24), ("tree_cursor", "bg", 8.00), ("cursor_fg", "cursor_bg", 5.99), ("status_bar_fg", "status_bar_bg", 8.26), ("menu_bar_active_fg", "menu_bar_active_bg", 6.24), ("border_inactive", "bg", 1.69)]),
    ("monokai", [("file", "bg", 13.94), ("folder", "bg", 6.81), ("executable", "bg", 9.58), ("selected", "bg", 10.44), ("tree_current", "bg", 9.01), ("tree_cursor", "bg", 10.44), ("cursor_fg", "cursor_bg", 9.58), ("status_bar_fg", "status_bar_bg", 10.27), ("menu_bar_active_fg", "menu_bar_active_bg", 3.93), ("border_inactive", "bg", 3.03)]),
    ("catppuccin", [("file", "bg", 11.34), ("folder", "bg", 12.91), ("executable", "bg", 11.03), ("selected", "bg", 9.27), ("tree_current", "bg", 10.54), ("tree_cursor", "bg", 12.91), ("cursor_fg", "cursor_bg", 8.91), ("status_bar_fg", "status_bar_bg", 8.69), ("menu_bar_active_fg", "menu_bar_active_bg", 9.23), ("border_inactive", "bg", 2.46)]),
    ("solarized", [("file", "bg", 4.75), ("folder", "bg", 4.68), ("executable", "bg", 4.69), ("selected", "bg", 3.26), ("tree_current", "bg", 4.75), ("tree_cursor", "bg", 4.68), ("cursor_fg", "cursor_bg", 4.75), ("status_bar_fg", "status_bar_bg", 4.86), ("menu_bar_active_fg", "menu_bar_active_bg", 4.08), ("border_inactive", "bg", 1.15)]),
    ("light", [("file", "bg", 13.46), ("folder", "bg", 2.92), ("executable", "bg", 3.02), ("selected", "bg", 3.26), ("tree_current", "bg", 5.11), ("tree_cursor", "bg", 2.92), ("cursor_fg", "cursor_bg", 4.50), ("status_bar_fg", "status_bar_bg", 8.33), ("menu_bar_active_fg", "menu_bar_active_bg", 4.50), ("border_inactive", "bg", 1.90)]),
];

/// The TEXT pairs under 4.5:1 that the person who accepts the record knows about (R-1746 1). `light`'s cursor and menu pairs are 4.499 and are
/// listed in `UNDER_BY_A_HAIR`; `default`'s status pair is 4.528 and meets the standard.
const UNDER_4_5: [(&str, &str); 7] = [
    ("monokai", "menu_bar_active_fg"),
    ("solarized", "selected"),
    ("solarized", "menu_bar_active_fg"),
    ("light", "folder"),
    ("light", "executable"),
    ("light", "selected"),
    ("light", "tree_cursor"),
];
const UNDER_BY_A_HAIR: [(&str, &str); 2] = [("light", "cursor_fg"), ("light", "menu_bar_active_fg")];

fn ratio(name: &str, a: &str, b: &str) -> f64 {
    let p = resolve(&preset(name));
    contrast(color_of(&p, a), color_of(&p, b))
}

// ------------------------------------------------------------------ AC-1746: the record

#[test]
fn ac1746_the_ratios_of_the_ten_pairs_of_all_six_presets_are_the_recorded_values() {
    assert_eq!(RECORD.map(|r| r.0), PRESET_NAMES);
    for (name, rows) in RECORD {
        for (a, b, expected) in rows {
            let got = ratio(name, a, b);
            assert!((got - expected).abs() <= 0.011, "{name}: {a} on {b} is {got:.4}, recorded {expected:.2}");
        }
    }
}

#[test]
fn ac1746_1_the_text_pairs_under_4_5_to_1_are_exactly_the_recorded_ones() {
    let mut under: Vec<(String, String)> = Vec::new();
    for (name, rows) in RECORD {
        for (a, b, _) in rows {
            if a == "border_inactive" {
                continue; // (2) below
            }
            let got = ratio(name, a, b);
            if got < 4.5 && (got - 4.5).abs() > 0.002 {
                under.push((name.to_string(), a.to_string()));
            }
        }
    }
    let expected: Vec<(String, String)> = UNDER_4_5.iter().map(|(n, k)| (n.to_string(), k.to_string())).collect();
    assert_eq!(under, expected, "R-1746 1: the pairs that do not reach 4.5:1 are recorded and accepted, not adjusted (T-07)");
}

#[test]
fn ac1746_1_the_borderline_pairs_are_pinned_on_their_own_side() {
    assert!(ratio("default", "status_bar_fg", "status_bar_bg") >= 4.5, "4.528: meets");
    for (name, a) in UNDER_BY_A_HAIR {
        let b = if a == "cursor_fg" { "cursor_bg" } else { "menu_bar_active_bg" };
        let got = ratio(name, a, b);
        assert!(got < 4.5 && got > 4.49, "{name} {a}: {got:.5}");
    }
}

#[test]
fn ac1746_2_border_inactive_against_the_bg_is_recorded_for_all_presets() {
    // the frame / line / `項目なし` colour (R-1790, `--ui-border`, `--vw-gutter-border`): accepted as tuif has it
    let under_3: Vec<&str> = RECORD.iter().filter(|(n, _)| ratio(n, "border_inactive", "bg") < 3.0).map(|(n, _)| *n).collect();
    assert_eq!(under_3, ["nord", "catppuccin", "solarized", "light"], "almost invisible: nord 1.69, catppuccin 2.46, light 1.90, solarized 1.15");
    for name in PRESET_NAMES {
        assert!(ratio(name, "border_inactive", "bg") < 4.5, "{name}: `項目なし` (a TEXT in border_inactive) does not reach 4.5:1 in any preset: it is part of the record (R-1790)");
        let ui = ui_vars(&resolve(&preset(name)));
        let vw = viewer_vars(&resolve(&preset(name)));
        let want = ratio(name, "border_inactive", "bg");
        assert!((contrast(rgb(var(&ui, "--ui-border")), rgb(var(&ui, "--ui-bg"))) - want).abs() < 1e-9, "{name} --ui-border is border_inactive");
        assert!((contrast(rgb(var(&vw, "--vw-gutter-border")), rgb(var(&vw, "--vw-bg"))) - want).abs() < 1e-9, "{name} --vw-gutter-border is border_inactive");
    }
}

// ------------------------------------------------------------------ AC-1745: what is guaranteed

#[test]
fn ac1745_the_derived_text_colours_are_4_5_to_1_against_the_bg_in_all_six_presets() {
    for name in PRESET_NAMES {
        let a = resolve(&preset(name));
        let (ui, vw) = (ui_vars(&a), viewer_vars(&a));
        let (ui_bg, vw_bg) = (rgb(var(&ui, "--ui-bg")), rgb(var(&vw, "--vw-bg")));
        for v in ["--ui-muted", "--ui-error"] {
            let r = contrast(rgb(var(&ui, v)), ui_bg);
            assert!(r >= 4.5, "{name} {v}: {r:.3}");
        }
        for v in ["--vw-muted", "--vw-lineno", "--vw-error"] {
            let r = contrast(rgb(var(&vw, v)), vw_bg);
            assert!(r >= 4.5, "{name} {v}: {r:.3}");
        }
    }
}

#[test]
fn ac1745_the_subdued_colours_are_3_to_1_for_non_text_in_all_six_presets() {
    for name in PRESET_NAMES {
        let ui = ui_vars(&resolve(&preset(name)));
        for v in ["--ui-muted-2", "--ui-border-strong"] {
            let r = contrast(rgb(var(&ui, v)), rgb(var(&ui, "--ui-bg")));
            assert!(r >= 3.0, "{name} {v}: {r:.3}");
        }
    }
}

// R-1747: an override is the user's choice -- nothing is checked and nothing is reported about contrast.
#[test]
fn r1747_a_hard_to_read_override_is_used_as_it_is_and_not_reported() {
    use super::test_support::{assert_clean, colors};
    let a = resolve(&colors(&[("file", "#2f3541"), ("folder", "#2e3441")]));
    assert_clean(&a);
    assert_eq!(super::color::hex(color_of(&a, "file")), "#2f3541");
    assert_eq!(super::color::hex(color_of(&a, "folder")), "#2e3441");
}
