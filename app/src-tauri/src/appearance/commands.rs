//! `appearance/commands.rs`: the command that gives the main window its appearance (SPEC-0300-0023 R-1720 / R-1721;
//! SPEC-0200-0001 §3.18.4). The value is a copy of the snapshot taken at startup; the file is not read again, so a page reload
//! gets the same value. Only the main window may ask: the viewer gets its colours from its initialization script.

use tauri::{State, Window};

use super::dto::{appearance_dto, AppearanceDto};
use super::resolve::Appearance;

/// The one window allowed to call `appearance_load`.
const MAIN_WINDOW_LABEL: &str = "main";

/// The pure core of the command: `Err` for any window but the main one.
pub fn appearance_for(window_label: &str, a: &Appearance) -> Result<AppearanceDto, String> {
    if window_label == MAIN_WINDOW_LABEL {
        Ok(appearance_dto(a))
    } else {
        Err("the calling window is not allowed".to_string())
    }
}

#[tauri::command(async)]
pub fn appearance_load(window: Window, state: State<'_, Appearance>) -> Result<AppearanceDto, String> {
    appearance_for(window.label(), &state)
}
