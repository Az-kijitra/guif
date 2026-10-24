//! TDD (unit-test-writer, 2026-10-24): `shared/window_theme.rs` after the OS-following theme is gone, and the new `shared/window_paint.rs`
//! (SPEC-0300-0023 R-1741 / R-1742 / R-1749; AC-1741 (Rust half) / AC-1743; SPEC-0300-0017 R-918 / R-919-1 as replaced; SPEC-0200-0001
//! §3.18.5, §3.18.14 (SHOULD-181 row)). This file REPLACES `window_theme_tests.rs`: its `requested_theme` tests (the OS axis) and the drift
//! tests against the four colour constants and the `@media` blocks of the style sheets (MUST-1: the CSS carries no colour, so there is
//! nothing to compare) are gone; `ui_theme_tests.rs` is deleted with `shared/schema/ui_theme.rs`.
//!
//! Contract:
//!
//! ```ignore
//! // shared/window_theme.rs -- still the one `shared/` file that names `tauri` (SHOULD-181), thin
//! pub fn theme_for(dark: bool) -> tauri::Theme;                                           // true -> Dark, false -> Light; ALWAYS a `Some`-able theme
//! pub fn apply_background(window: &WebviewWindow, rgb: (u8, u8, u8)) -> tauri::Result<()>; // set_background_color(Some(Color(r, g, b, 255)))
//! // shared/window_paint.rs -- pure data, no tauri:  #[derive(Debug, Clone, PartialEq, Eq)]
//! pub struct WindowPaint { pub bg: (u8, u8, u8), pub viewer_init_script: String }
//! ```
//! Gone: `WindowKind`, `requested_theme`, `background_rgb`, the four colour constants. (That they are gone from the source is checked by
//! `appearance_wiring_tests.rs`; here the behaviour.)

use super::window_paint::WindowPaint;
use super::window_theme::{apply_background, theme_for};
use tauri::{Theme, WebviewWindow};

// ------------------------------------------------------------------ theme_for (R-1741)

#[test]
fn r1741_a_dark_bg_asks_for_the_dark_title_bar_and_a_light_bg_for_the_light_one() {
    assert!(matches!(theme_for(true), Theme::Dark));
    assert!(matches!(theme_for(false), Theme::Light));
}

#[test]
fn r1741_the_mapping_never_depends_on_anything_but_the_brightness() {
    // a pure function of one bool: the OS setting is not an input (R-1749)
    for dark in [true, false] {
        assert_eq!(format!("{:?}", theme_for(dark)), format!("{:?}", theme_for(dark)));
    }
    assert_ne!(format!("{:?}", theme_for(true)), format!("{:?}", theme_for(false)));
}

// ------------------------------------------------------------------ apply_background (R-1742): the colour is an argument

#[test]
fn r1742_apply_background_takes_the_colour_from_the_caller_not_from_constants() {
    // a window cannot be built in a unit test; the signature is pinned at compile time instead
    let _pinned: fn(&WebviewWindow, (u8, u8, u8)) -> tauri::Result<()> = apply_background;
}

// ------------------------------------------------------------------ WindowPaint

#[test]
fn window_paint_is_plain_comparable_data() {
    let a = WindowPaint { bg: (0x2e, 0x34, 0x40), viewer_init_script: "window.__GUIF_APPEARANCE__={\"vars\":[]};".to_string() };
    let b = a.clone();
    assert_eq!(a, b);
    assert_ne!(a, WindowPaint { bg: (0, 0, 0), ..a.clone() });
    assert_ne!(a, WindowPaint { viewer_init_script: String::new(), ..a.clone() });
    assert!(format!("{a:?}").contains("WindowPaint"));
}
