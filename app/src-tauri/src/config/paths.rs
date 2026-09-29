//! Config directory resolution shared by `config.toml` / `navigation.toml`
//! (SPEC-0200-0001 §3.2.2): `app_config_dir()` (`%APPDATA%\<identifier>\` on Windows).

use std::fs;
use std::io;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Returns the app config directory, creating it if missing.
pub fn app_config_dir(app: &AppHandle) -> io::Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Full path of `navigation.toml`.
pub fn navigation_path(app: &AppHandle) -> io::Result<PathBuf> {
    Ok(app_config_dir(app)?.join("navigation.toml"))
}

/// Full path of `viewer-window.toml` (SPEC-0300-0015 R-425): its own file,
/// not a key inside `config.toml` (ISS-0118).
pub fn viewer_window_path(app: &AppHandle) -> io::Result<PathBuf> {
    Ok(app_config_dir(app)?.join("viewer-window.toml"))
}

/// Full path of `config.toml` (SPEC-0300-0010 R-45; SPEC-0200-0001 §3.6.1).
/// Read-only from the app's perspective (R-77-4/MUST-92: `config/keymap.rs`
/// is the only reader, and there is no writer anywhere in the crate).
pub fn config_path(app: &AppHandle) -> io::Result<PathBuf> {
    Ok(app_config_dir(app)?.join("config.toml"))
}

/// Full path of `ui-state.toml` (SPEC-0300-0009 R-77; SPEC-0200-0001
/// §3.6.1), a sibling of `navigation.toml` / `viewer-window.toml` in the same
/// config directory.
pub fn ui_state_path(app: &AppHandle) -> io::Result<PathBuf> {
    Ok(app_config_dir(app)?.join("ui-state.toml"))
}
