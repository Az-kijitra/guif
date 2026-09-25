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
