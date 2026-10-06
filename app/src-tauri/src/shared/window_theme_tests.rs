//! Phase 12 tests (unit-test-writer, 2026-10-06): `shared/window_theme.rs` pure parts and the colour drift test.
//! Specs: SPEC-0300-0017 R-917 (fixed theme -> the OS is not followed), R-918 / R-918-1 (title bar via
//! `App::set_theme(Some)`), R-919-1 (background colour before the first paint), R-913-1 (viewer colours),
//! R-911 / R-911-1 (main colours), AC-905 note (the 4 Rust colour constants are the only colour literals
//! outside CSS); SPEC-0200-0001 §3.11.5, §3.11.8, §3.11.12 (4), §3.11.16 SHOULD-181 / MINOR-6.
//!
//! API under test: `WindowKind`, `requested_theme(ThemeSetting) -> Option<tauri::Theme>` (Light -> Some(Light),
//! Dark -> Some(Dark), System -> None), `background_rgb(WindowKind, tauri::Theme) -> (u8, u8, u8)`. `apply_background`
//! needs a real window and is not unit-tested here.
//!
//! Drift test (MINOR-6): `background_rgb` must equal the CSS values, read with `include_str!`:
//! main = `--ui-bg` of `app/src/app.css` (light `:root`, and inside `@media (prefers-color-scheme: dark)`),
//! viewer = `--vw-bg` of `app/src/routes/viewer/viewer-theme.css` (light `html`, and the dark media block).
//! `#fff` / `#ffffff` are normalised; a variable that cannot be found FAILS the test (it never passes silently).
//!

use super::schema::ui_theme::ThemeSetting;
use super::window_theme::{background_rgb, requested_theme, WindowKind};
use tauri::Theme;

const APP_CSS: &str = include_str!("../../../src/app.css");
const VIEWER_CSS: &str = include_str!("../../../src/routes/viewer/viewer-theme.css");

// ------------------------------------------------------------------ requested_theme (AC-950 / AC-952)

#[test]
fn light_requests_a_fixed_light_theme() {
    assert!(matches!(requested_theme(ThemeSetting::Light), Some(Theme::Light)));
}

#[test]
fn dark_requests_a_fixed_dark_theme() {
    assert!(matches!(requested_theme(ThemeSetting::Dark), Some(Theme::Dark)));
}

// R-917 (2) / S-6: following the OS means "do not call set_theme at all" (never Some, never set_theme(None)).
#[test]
fn system_requests_nothing_so_the_os_is_followed() {
    assert!(requested_theme(ThemeSetting::System).is_none());
}

// ------------------------------------------------------------------ background_rgb: the 4 constants

// SPEC-0300-0017 R-911 / R-911-1 (main) and R-913-1 (viewer); the values the design lists in §3.11.5.
#[test]
fn background_rgb_has_the_four_documented_values() {
    assert_eq!(background_rgb(WindowKind::Main, Theme::Light), (0xf5, 0xf5, 0xf5));
    assert_eq!(background_rgb(WindowKind::Main, Theme::Dark), (0x1e, 0x1f, 0x22));
    assert_eq!(background_rgb(WindowKind::Viewer, Theme::Light), (0xff, 0xff, 0xff));
    assert_eq!(background_rgb(WindowKind::Viewer, Theme::Dark), (0x1e, 0x1e, 0x1e));
}

#[test]
fn the_main_and_viewer_backgrounds_differ_in_each_theme() {
    for theme in [Theme::Light, Theme::Dark] {
        assert_ne!(background_rgb(WindowKind::Main, theme), background_rgb(WindowKind::Viewer, theme), "{theme:?}");
    }
}

#[test]
fn the_light_and_dark_backgrounds_differ_for_each_kind() {
    for kind in [WindowKind::Main, WindowKind::Viewer] {
        assert_ne!(background_rgb(kind, Theme::Light), background_rgb(kind, Theme::Dark), "{kind:?}");
    }
}

// ------------------------------------------------------------------ drift test helpers

/// `#rgb` / `#rrggbb` -> (r, g, b). Anything else is a test failure.
fn parse_hex(value: &str) -> (u8, u8, u8) {
    let h = value.trim().trim_start_matches('#').to_ascii_lowercase();
    let h = if h.len() == 3 { h.chars().flat_map(|c| [c, c]).collect::<String>() } else { h };
    assert!(h.len() == 6 && h.chars().all(|c| c.is_ascii_hexdigit()), "not a #rgb / #rrggbb colour: {value:?}");
    let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap();
    (p(0), p(2), p(4))
}

fn strip_comments(css: &str) -> String {
    let mut out = String::new();
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        match rest[start + 2..].find("*/") {
            Some(end) => rest = &rest[start + 2 + end + 2..],
            None => {
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// Splits into (light part, dark media block content) by brace matching on `@media (prefers-color-scheme: dark) {`.
fn split_themes(css: &str) -> (String, String) {
    let css = strip_comments(css);
    let marker = css
        .find("@media")
        .filter(|&at| css[at..].split('{').next().map_or(false, |h| h.contains("prefers-color-scheme") && h.contains("dark")))
        .unwrap_or_else(|| panic!("no `@media (prefers-color-scheme: dark)` block found in the stylesheet"));
    let open = marker + css[marker..].find('{').unwrap();
    let mut depth = 0i32;
    let mut close = None;
    for (i, c) in css[open..].char_indices() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    close = Some(open + i);
                    break;
                }
            }
            _ => {}
        }
    }
    let close = close.expect("unbalanced braces in the dark media block");
    let dark = css[open + 1..close].to_string();
    let light = format!("{}{}", &css[..marker], &css[close + 1..]);
    (light, dark)
}

/// Value of `--name: <value>;` in `part`; the test FAILS when it is not there.
fn var_value(part: &str, name: &str) -> String {
    let needle = format!("{name}:");
    let at = part
        .match_indices(&needle)
        .map(|(i, _)| i)
        .find(|&i| i == 0 || !part[..i].chars().next_back().map_or(false, |c| c.is_alphanumeric() || c == '-' || c == '_'))
        .unwrap_or_else(|| panic!("variable {name} not found (drift test must not pass silently)"));
    let rest = &part[at + needle.len()..];
    let end = rest.find(|c| c == ';' || c == '}').unwrap_or(rest.len());
    rest[..end].trim().to_string()
}

// Self-checks of the helpers (they must be able to fail).
#[test]
fn helper_parse_hex_normalises_short_and_long_forms() {
    assert_eq!(parse_hex("#fff"), parse_hex("#ffffff"));
    assert_eq!(parse_hex(" #1E1F22 "), (0x1e, 0x1f, 0x22));
}

#[test]
#[should_panic(expected = "not found")]
fn helper_var_value_fails_when_the_variable_is_missing() {
    var_value("--other: #fff;", "--vw-bg");
}

#[test]
#[should_panic(expected = "no `@media (prefers-color-scheme: dark)` block")]
fn helper_split_themes_fails_without_a_dark_block() {
    split_themes(":root { --ui-bg: #fff; }");
}

#[test]
fn helper_var_value_does_not_match_a_longer_variable_name() {
    assert_eq!(var_value("--ui-bg-2: #111; --ui-bg: #222;", "--ui-bg"), "#222");
}

// ------------------------------------------------------------------ drift (MINOR-6, AC-905 note)

// R-919-1: the colour the WebView shows before the first paint equals the CSS background of the same theme.
#[test]
fn drift_main_background_equals_ui_bg_of_app_css_in_both_themes() {
    let (light, dark) = split_themes(APP_CSS);
    assert_eq!(background_rgb(WindowKind::Main, Theme::Light), parse_hex(&var_value(&light, "--ui-bg")), "light");
    assert_eq!(background_rgb(WindowKind::Main, Theme::Dark), parse_hex(&var_value(&dark, "--ui-bg")), "dark");
}

#[test]
fn drift_viewer_background_equals_vw_bg_of_viewer_theme_css_in_both_themes() {
    let (light, dark) = split_themes(VIEWER_CSS);
    assert_eq!(background_rgb(WindowKind::Viewer, Theme::Light), parse_hex(&var_value(&light, "--vw-bg")), "light");
    assert_eq!(background_rgb(WindowKind::Viewer, Theme::Dark), parse_hex(&var_value(&dark, "--vw-bg")), "dark");
}
