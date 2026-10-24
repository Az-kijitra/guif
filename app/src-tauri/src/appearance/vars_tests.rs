//! TDD (unit-test-writer, 2026-10-24): `appearance/vars.rs` -- the CSS variables of the main window and of the viewer, and the derived colours
//! (SPEC-0300-0023 R-1721 / R-1722 / R-1723 / R-1724 / R-1725 / R-1726 / R-1741; AC-1720 / AC-1721 / AC-1726;
//! SPEC-0200-0001 §3.18.3 `vars.rs`, §3.18.15 MUST-1). The ONE place that computes the values (AC-1726): the main window and the viewer both
//! use it.
//!
//! Contract (module `appearance::vars`; declared as `#[cfg(test)] mod vars_tests;`):
//!
//! ```ignore
//! pub const UI_VAR_NAMES: &[&str];       // the names of `ui_vars`, in its order
//! pub const VIEWER_VAR_NAMES: &[&str];   // the names of `viewer_vars`, in its order
//! /// 19 existing variables (R-1722) + the new ones (R-1723) + `--ui-color-scheme`. Values: `#rrggbb` (lower case), `rgba(0,0,0,.NN)`, `dark` | `light`.
//! pub fn ui_vars(a: &Appearance) -> Vec<(&'static str, String)>;
//! /// 11 variables (R-1726) + `--vw-header-fg` + the 13 highlight colours + `--vw-color-scheme`.
//! pub fn viewer_vars(a: &Appearance) -> Vec<(&'static str, String)>;
//! ```
//! The NAMES of the new variables are examples in R-1723 ("名前は例"); the ones used here are the proposal's and are the contract with the
//! front end and the E2E tests: change them in this file and in `UI_VAR_NAMES` together. The derived colours are compared with 1 level of
//! tolerance per channel because `round(a * X + (1 - a) * Y)` meets an exact `.5` for some presets (catppuccin's muted red channel is 152.5).

use super::color::contrast;
use super::resolve::resolve;
use super::test_support::{colors, colors_on, expected_hex, preset, rgb, var, PRESET_NAMES};
use super::vars::{ui_vars, viewer_vars, UI_VAR_NAMES, VIEWER_VAR_NAMES};

/// (preset, `--ui-muted`, `--ui-error`, `--ui-muted-2`, dark): computed outside the code under test (R-1725 1 / 2 / 5).
const DERIVED: [(&str, &str, &str, &str, bool); 6] = [
    ("default", "#9a9ca0", "#ff8a80", "#6e7072", true),
    ("nord", "#b3b7be", "#ff8a80", "#8d929a", true),
    ("monokai", "#b9bab4", "#ff8a80", "#90908a", true),
    ("catppuccin", "#999fb9", "#ff8a80", "#767a91", true),
    ("solarized", "#839496", "#ff8a80", "#5c7579", true),
    ("light", "#5f6670", "#b00020", "#7f858d", false),
];

const UI_NAMES: [&str; 32] = [
    "--ui-bg", "--ui-fg", "--ui-surface", "--ui-surface-2", "--ui-surface-3", "--ui-border", "--ui-border-strong", "--ui-border-muted", "--ui-muted",
    "--ui-muted-2", "--ui-hover", "--ui-selected", "--ui-focused", "--ui-row-head", "--ui-link", "--ui-error", "--ui-backdrop", "--ui-shadow-1",
    "--ui-shadow-2", "--ui-border-active", "--ui-cursor-fg", "--ui-cursor-bg", "--ui-folder", "--ui-executable", "--ui-selected-fg", "--ui-status-fg",
    "--ui-status-bg", "--ui-menu-active-fg", "--ui-menu-active-bg", "--ui-tree-current", "--ui-tree-cursor", "--ui-color-scheme",
];

const VIEWER_NAMES: [&str; 26] = [
    "--vw-bg", "--vw-fg", "--vw-header-bg", "--vw-header-fg", "--vw-border", "--vw-banner-bg", "--vw-banner-fg", "--vw-muted", "--vw-error", "--vw-lineno",
    "--vw-gutter-bg", "--vw-gutter-border", "--vw-hl-keyword", "--vw-hl-title", "--vw-hl-constant", "--vw-hl-string", "--vw-hl-builtin", "--vw-hl-comment",
    "--vw-hl-name", "--vw-hl-section", "--vw-hl-bullet", "--vw-hl-addition-fg", "--vw-hl-addition-bg", "--vw-hl-deletion-fg", "--vw-hl-deletion-bg",
    "--vw-color-scheme",
];

fn near(actual: &str, expected: &str, what: &str) {
    let (a, e) = (rgb(actual), rgb(expected));
    assert!(a.0.abs_diff(e.0) <= 1 && a.1.abs_diff(e.1) <= 1 && a.2.abs_diff(e.2) <= 1, "{what}: {actual} vs {expected}");
}

// ------------------------------------------------------------------ the names

#[test]
fn r1722_r1723_the_main_window_variables_are_the_19_existing_and_the_new_ones() {
    let a = resolve(&preset("nord"));
    let names: Vec<&str> = ui_vars(&a).iter().map(|(n, _)| *n).collect();
    assert_eq!(names, UI_NAMES, "order and names of ui_vars");
    assert_eq!(UI_VAR_NAMES, UI_NAMES, "the public list is the same");
    let mut sorted = names.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), names.len(), "no name twice");
    assert!(names.iter().all(|n| n.starts_with("--ui-")), "R-1723: `--ui-` names");
}

#[test]
fn r1726_the_viewer_variables_are_the_11_the_header_text_the_13_highlights_and_the_scheme() {
    let a = resolve(&preset("nord"));
    let names: Vec<&str> = viewer_vars(&a).iter().map(|(n, _)| *n).collect();
    assert_eq!(names, VIEWER_NAMES);
    assert_eq!(VIEWER_VAR_NAMES, VIEWER_NAMES);
    assert_eq!(names.len(), 26, "11 + header-fg + 13 + color-scheme");
    assert!(names.iter().all(|n| n.starts_with("--vw-")), "the main window's `--ui-*` never reach the viewer (R-1726)");
    assert!(!names.iter().any(|n| n.contains("font")), "R-1728: the viewer fonts are not variables of the palette");
}

// ------------------------------------------------------------------ AC-1720: the values for the six presets

fn expected_ui(name: &str) -> Vec<(&'static str, String)> {
    let h = |key: &str| expected_hex(name, key).to_string();
    let (_, muted, error, muted2, dark) = *DERIVED.iter().find(|d| d.0 == name).unwrap();
    let shadow = |a: &str, b: &str| if dark { a.to_string() } else { b.to_string() };
    vec![
        ("--ui-bg", h("bg")), ("--ui-fg", h("file")), ("--ui-surface", h("bg")), ("--ui-surface-2", h("bg")), ("--ui-surface-3", h("status_bar_bg")),
        ("--ui-border", h("border_inactive")), ("--ui-border-strong", muted2.to_string()), ("--ui-border-muted", h("border_inactive")),
        ("--ui-muted", muted.to_string()), ("--ui-muted-2", muted2.to_string()), ("--ui-hover", h("cursor_bg")), ("--ui-selected", h("status_bar_bg")),
        ("--ui-focused", h("border")), ("--ui-row-head", h("status_bar_bg")), ("--ui-link", h("tree_current")), ("--ui-error", error.to_string()),
        ("--ui-backdrop", "rgba(0,0,0,.35)".into()), ("--ui-shadow-1", shadow("rgba(0,0,0,.4)", "rgba(0,0,0,.12)")), ("--ui-shadow-2", shadow("rgba(0,0,0,.45)", "rgba(0,0,0,.14)")),
        ("--ui-border-active", h("border")), ("--ui-cursor-fg", h("cursor_fg")), ("--ui-cursor-bg", h("cursor_bg")), ("--ui-folder", h("folder")),
        ("--ui-executable", h("executable")), ("--ui-selected-fg", h("selected")), ("--ui-status-fg", h("status_bar_fg")), ("--ui-status-bg", h("status_bar_bg")),
        ("--ui-menu-active-fg", h("menu_bar_active_fg")), ("--ui-menu-active-bg", h("menu_bar_active_bg")), ("--ui-tree-current", h("tree_current")),
        ("--ui-tree-cursor", h("tree_cursor")), ("--ui-color-scheme", if dark { "dark" } else { "light" }.to_string()),
    ]
}

#[test]
fn ac1720_every_main_window_variable_has_the_value_of_the_table_for_all_six_presets() {
    for name in PRESET_NAMES {
        let vars = ui_vars(&resolve(&preset(name)));
        for (var_name, expected) in expected_ui(name) {
            let got = var(&vars, var_name);
            if ["--ui-muted", "--ui-muted-2", "--ui-border-strong"].contains(&var_name) {
                near(got, &expected, &format!("{name} {var_name}"));
            } else {
                assert_eq!(got, expected, "{name} {var_name}");
            }
        }
    }
}

#[test]
fn ac1720_every_viewer_variable_has_the_value_of_the_table_for_all_six_presets() {
    for name in PRESET_NAMES {
        let vars = viewer_vars(&resolve(&preset(name)));
        let h = |key: &str| expected_hex(name, key).to_string();
        let (_, muted, error, _, dark) = *DERIVED.iter().find(|d| d.0 == name).unwrap();
        let (banner_bg, banner_fg) = if dark { ("#4a3b00", "#ffd866") } else { ("#fff4ce", "#5c4400") };
        for (var_name, expected) in [
            ("--vw-bg", h("bg")), ("--vw-fg", h("file")), ("--vw-header-bg", h("status_bar_bg")), ("--vw-header-fg", h("status_bar_fg")), ("--vw-border", h("border")),
            ("--vw-banner-bg", banner_bg.to_string()), ("--vw-banner-fg", banner_fg.to_string()), ("--vw-gutter-bg", h("bg")), ("--vw-gutter-border", h("border_inactive")),
            ("--vw-color-scheme", if dark { "dark" } else { "light" }.to_string()),
        ] {
            assert_eq!(var(&vars, var_name), expected, "{name} {var_name}");
        }
        near(var(&vars, "--vw-muted"), muted, &format!("{name} --vw-muted"));
        near(var(&vars, "--vw-lineno"), muted, &format!("{name} --vw-lineno"));
        assert_eq!(var(&vars, "--vw-error"), error, "{name} --vw-error");
    }
}

#[test]
fn ac1726_the_main_window_and_the_viewer_share_the_derived_colours() {
    for name in PRESET_NAMES {
        let a = resolve(&preset(name));
        let (ui, vw) = (ui_vars(&a), viewer_vars(&a));
        assert_eq!(var(&ui, "--ui-muted"), var(&vw, "--vw-muted"), "{name}");
        assert_eq!(var(&ui, "--ui-muted"), var(&vw, "--vw-lineno"), "{name}");
        assert_eq!(var(&ui, "--ui-error"), var(&vw, "--vw-error"), "{name}");
        assert_eq!(var(&ui, "--ui-bg"), var(&vw, "--vw-bg"), "{name}");
        assert_eq!(var(&ui, "--ui-color-scheme"), var(&vw, "--vw-color-scheme"), "{name}");
    }
}

#[test]
fn ac1721_every_value_is_a_hex_colour_an_rgba_or_a_scheme_word_and_nothing_else() {
    for name in PRESET_NAMES {
        let a = resolve(&preset(name));
        for (var_name, value) in ui_vars(&a).into_iter().chain(viewer_vars(&a)) {
            let hex_ok = value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'));
            let rgba_ok = value.starts_with("rgba(0,0,0,.") && value.ends_with(')') && value[12..value.len() - 1].chars().all(|c| c.is_ascii_digit());
            let scheme_ok = var_name.ends_with("color-scheme") && (value == "dark" || value == "light");
            assert!(hex_ok || rgba_ok || scheme_ok, "{name} {var_name} = {value:?}");
            assert!(var_name.ends_with("color-scheme") || !(value.contains(';') || value.contains('"') || value.contains('<')), "{value:?}");
        }
    }
}

// ------------------------------------------------------------------ R-1724 and the `[colors]` flowing through

#[test]
fn r1724_the_focus_colour_follows_the_preset_border_not_a_fixed_blue() {
    for name in PRESET_NAMES {
        let ui = ui_vars(&resolve(&preset(name)));
        assert_eq!(var(&ui, "--ui-focused"), expected_hex(name, "border"), "{name}");
        assert_ne!(var(&ui, "--ui-focused"), "#7aa7ff", "{name}: the old fixed colour is gone");
    }
}

#[test]
fn ac1721_iii_a_bg_override_reaches_every_variable_that_is_the_bg() {
    let a = resolve(&colors_on(preset("solarized"), &[("bg", "#F0F0F0")]));
    let (ui, vw) = (ui_vars(&a), viewer_vars(&a));
    for v in ["--ui-bg", "--ui-surface", "--ui-surface-2"] {
        assert_eq!(var(&ui, v), "#f0f0f0", "{v}");
    }
    for v in ["--vw-bg", "--vw-gutter-bg"] {
        assert_eq!(var(&vw, v), "#f0f0f0", "{v}");
    }
    assert_eq!(var(&ui, "--ui-color-scheme"), "light", "the brightness follows the resolved bg");
    assert_eq!(var(&vw, "--vw-color-scheme"), "light");
    assert_eq!(var(&vw, "--vw-banner-bg"), "#fff4ce", "light banner colours");
    assert_eq!(var(&ui, "--ui-shadow-1"), "rgba(0,0,0,.12)");
}

#[test]
fn a_colors_override_of_each_kind_reaches_its_variable() {
    let a = resolve(&colors(&[
        ("folder", "#010101"), ("executable", "#020202"), ("selected", "#030303"), ("cursor_fg", "#040404"), ("cursor_bg", "#050505"),
        ("status_bar_fg", "#060606"), ("status_bar_bg", "#070707"), ("menu_bar_active_fg", "#080808"), ("menu_bar_active_bg", "#090909"),
        ("tree_current", "#0a0a0a"), ("tree_cursor", "#0b0b0b"), ("border", "#0c0c0c"), ("border_inactive", "#0d0d0d"), ("file", "#fefefe"),
    ]));
    let ui = ui_vars(&a);
    for (v, want) in [
        ("--ui-folder", "#010101"), ("--ui-executable", "#020202"), ("--ui-selected-fg", "#030303"), ("--ui-cursor-fg", "#040404"), ("--ui-cursor-bg", "#050505"),
        ("--ui-hover", "#050505"), ("--ui-status-fg", "#060606"), ("--ui-status-bg", "#070707"), ("--ui-surface-3", "#070707"), ("--ui-menu-active-fg", "#080808"),
        ("--ui-menu-active-bg", "#090909"), ("--ui-tree-current", "#0a0a0a"), ("--ui-link", "#0a0a0a"), ("--ui-tree-cursor", "#0b0b0b"), ("--ui-border-active", "#0c0c0c"),
        ("--ui-focused", "#0c0c0c"), ("--ui-border", "#0d0d0d"), ("--ui-border-muted", "#0d0d0d"), ("--ui-fg", "#fefefe"),
    ] {
        assert_eq!(var(&ui, v), want, "{v}");
    }
}

#[test]
fn r1706_symlink_changes_no_variable() {
    let plain = ui_vars(&resolve(&preset("nord")));
    let with = ui_vars(&resolve(&colors(&[("symlink", "#123456")])));
    assert_eq!(plain, with, "symlink is read but drawn nowhere (R-1706)");
    assert_eq!(viewer_vars(&resolve(&preset("nord"))), viewer_vars(&resolve(&colors(&[("symlink", "#123456")]))));
}

// ------------------------------------------------------------------ R-1725: the rules of the derived colours

#[test]
fn r1725_1_muted_is_the_7_3_mix_unless_that_is_under_4_5_to_1_then_the_file_colour() {
    // solarized: the mix is under 4.5:1, so muted = file (#839496)
    let ui = ui_vars(&resolve(&preset("solarized")));
    assert_eq!(var(&ui, "--ui-muted"), "#839496");
    // a file colour that is nearly the bg: any mix is under 4.5:1 -> the file colour itself
    let ui = ui_vars(&resolve(&colors(&[("file", "#808080"), ("bg", "#888888")])));
    assert_eq!(var(&ui, "--ui-muted"), "#808080");
    // a good pair keeps the mix, and it is at least 4.5:1
    let ui = ui_vars(&resolve(&preset("nord")));
    assert!(contrast(rgb(var(&ui, "--ui-muted")), rgb("#2e3440")) >= 4.5);
}

#[test]
fn r1725_2_error_is_ff8a80_on_dark_b00020_on_light_and_the_file_colour_when_under_4_5() {
    assert_eq!(var(&ui_vars(&resolve(&preset("nord"))), "--ui-error"), "#ff8a80");
    assert_eq!(var(&ui_vars(&resolve(&preset("light"))), "--ui-error"), "#b00020");
    // a light bg of the same family as ff8a80 makes b00020 fall under 4.5:1 -> the file colour
    let ui = ui_vars(&resolve(&colors(&[("bg", "#ff8a80"), ("file", "#123456")])));
    assert_eq!(var(&ui, "--ui-error"), "#123456");
    assert_eq!(var(&viewer_vars(&resolve(&colors(&[("bg", "#ff8a80"), ("file", "#123456")]))), "--vw-error"), "#123456");
}

#[test]
fn r1725_3_the_banner_has_two_fixed_pairs_by_brightness() {
    for (name, bg, fg) in [("nord", "#4a3b00", "#ffd866"), ("default", "#4a3b00", "#ffd866"), ("light", "#fff4ce", "#5c4400")] {
        let vw = viewer_vars(&resolve(&preset(name)));
        assert_eq!((var(&vw, "--vw-banner-bg"), var(&vw, "--vw-banner-fg")), (bg, fg), "{name}");
    }
}

#[test]
fn r1725_5_the_subdued_colour_goes_towards_the_file_colour_until_3_to_1_and_ends_at_the_file_colour() {
    // light and solarized need steps (5:5 is under 3:1); the others take the 5:5 mix
    for (name, _, _, muted2, _) in DERIVED {
        let a = resolve(&preset(name));
        let ui = ui_vars(&a);
        near(var(&ui, "--ui-muted-2"), muted2, name);
        assert_eq!(var(&ui, "--ui-border-strong"), var(&ui, "--ui-muted-2"), "{name}: the same colour (T-41)");
        assert!(contrast(rgb(var(&ui, "--ui-muted-2")), rgb(expected_hex(name, "bg"))) >= 3.0, "{name}: AC-1745, 3:1 for non-text");
    }
    // file == bg: no mix can reach 3:1, the result is the file colour (R-1725 5, last sentence)
    let ui = ui_vars(&resolve(&colors(&[("file", "#2e3440")])));
    assert_eq!(var(&ui, "--ui-muted-2"), "#2e3440");
    assert_eq!(var(&ui, "--ui-border-strong"), "#2e3440");
}

#[test]
fn nothing_panics_for_odd_colour_combinations() {
    for (bg, file) in [("#000000", "#000000"), ("#ffffff", "#ffffff"), ("#000000", "#ffffff"), ("#ffffff", "#000000"), ("#777777", "#777777"), ("#010101", "#000000")] {
        let a = resolve(&colors(&[("bg", bg), ("file", file)]));
        let ui = ui_vars(&a);
        let _ = viewer_vars(&a);
        assert_eq!(ui.len(), UI_NAMES.len());
        for (_, value) in &ui {
            assert!(!value.is_empty());
        }
    }
}
