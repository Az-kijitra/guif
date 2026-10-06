//! Window-level theme helpers (SPEC-0300-0017 R-917 / R-918 / R-919-1; SPEC-0200-0001 §3.11.5, §3.11.16
//! SHOULD-181). The first place in `shared/` that names `tauri`, kept thin on purpose: a pure mapping
//! (`ThemeSetting` -> `tauri::Theme`, `(WindowKind, Theme)` -> background colour) and one side effect on a
//! window passed in by the caller. No `Manager` / `State` / path resolution, no feature-module reference
//! (`WindowKind::Viewer` only selects a colour).
//!
//! AC-905 exception (R-919-1): the four colour literals below are the only colours written in Rust. They are
//! the WebView's pre-paint background and must equal the CSS `--ui-bg` (`app/src/app.css`) / `--vw-bg`
//! (`app/src/routes/viewer/viewer-theme.css`) of the same theme; `window_theme_tests` checks that they do not
//! drift.

use tauri::{window::Color, Theme, WebviewWindow};

use super::schema::ui_theme::ThemeSetting;

/// Which window's palette to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    Main,
    Viewer,
}

/// R-917: a fixed setting becomes the event loop's preferred theme; following the OS requests nothing
/// (`App::set_theme` is then never called, so the OS keeps deciding).
pub fn requested_theme(setting: ThemeSetting) -> Option<Theme> {
    match setting {
        ThemeSetting::Light => Some(Theme::Light),
        ThemeSetting::Dark => Some(Theme::Dark),
        ThemeSetting::System => None,
    }
}

/// R-911 / R-911-1 (main `--ui-bg`) and R-913-1 (viewer `--vw-bg`).
pub fn background_rgb(kind: WindowKind, theme: Theme) -> (u8, u8, u8) {
    match (kind, theme) {
        (WindowKind::Main, Theme::Dark) => (0x1e, 0x1f, 0x22),
        (WindowKind::Main, _) => (0xf5, 0xf5, 0xf5),
        (WindowKind::Viewer, Theme::Dark) => (0x1e, 0x1e, 0x1e),
        (WindowKind::Viewer, _) => (0xff, 0xff, 0xff),
    }
}

/// R-919-1: paints the window and the WebView's default background in the colour of the window's current
/// theme, so nothing in the opposite brightness shows before the first paint or when a resize exposes the
/// base. Callers decide what a failure means (the main window is shown regardless).
pub fn apply_background(window: &WebviewWindow, kind: WindowKind) -> tauri::Result<()> {
    let theme = window.theme()?;
    let (r, g, b) = background_rgb(kind, theme);
    window.set_background_color(Some(Color(r, g, b, 255)))
}
