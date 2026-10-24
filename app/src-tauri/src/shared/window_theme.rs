//! Window-level theme helpers (SPEC-0300-0023 R-1741 / R-1742; SPEC-0200-0001 §3.18.12). The only place in `shared/` that
//! names `tauri`, kept thin on purpose: one pure mapping (`dark` -> `tauri::Theme`) and one side effect on a window passed in
//! by the caller. No `Manager` / `State` / path resolution. No colour is written here: the background is an argument.

use tauri::{window::Color, Theme, WebviewWindow};

/// The window theme for the appearance: the title bar and the scroll bars follow `dark`, whatever the OS says.
pub fn theme_for(dark: bool) -> Theme {
    if dark {
        Theme::Dark
    } else {
        Theme::Light
    }
}

/// Paints the native window in `rgb`, so the first frame is already in the colour of the theme.
pub fn apply_background(window: &WebviewWindow, rgb: (u8, u8, u8)) -> tauri::Result<()> {
    window.set_background_color(Some(Color(rgb.0, rgb.1, rgb.2, 255)))
}
