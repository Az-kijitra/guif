//! `shared/window_paint.rs`: what a window needs to be painted in the colours of the appearance
//! (SPEC-0300-0023 R-1742; SPEC-0200-0001 §3.18.12).
//!
//! Pure data: no colour is written here (the colours come from `appearance/`, the one place that resolves them;
//! the value is built once at startup from the snapshot), and nothing here touches Tauri, so it can be built,
//! cloned and compared in a test. `shared/window_theme.rs` applies it to a real window.
//!
//! Two things are carried: the native background of the window (the first thing a user sees, before any page is drawn)
//! and, for the viewer window only, the script that hands its colour variables to the page.

/// The paint of the windows, decided once at startup from the resolved appearance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowPaint {
    /// The background of the native window (the `bg` colour as red, green, blue): shown before the page has
    /// drawn anything, so a window never flashes a colour other than the theme's.
    pub bg: (u8, u8, u8),
    /// The script run at the start of the viewer window's page. It hands the colour variables of the
    /// appearance to the page (the viewer never loads the main window's style sheet, R-913), so that its
    /// first frame already has the right colours.
    pub viewer_init_script: String,
}
