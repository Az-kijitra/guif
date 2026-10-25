//! Config directory resolution shared by `config.toml` / `navigation.toml`
//! (SPEC-0200-0001 §3.2.2): `app_config_dir()` (`%APPDATA%\<identifier>\` on Windows).

use std::ffi::{OsStr, OsString};
use std::fmt;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Name of the debug-only override variable (SPEC-0400-0001 第2版 R-06).
const CONFIG_DIR_ENV: &str = "GUIF_CONFIG_DIR";

/// Returns the app config directory, creating it if missing. In debug builds the
/// environment variable `GUIF_CONFIG_DIR` overrides the location
/// (SPEC-0400-0001 第2版 R-06; a bad value is an error, never a fallback).
pub fn app_config_dir(app: &AppHandle) -> io::Result<PathBuf> {
    if let Some(dir) = config_dir_override()? {
        return Ok(dir);
    }
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
/// Read-only from this module's perspective (R-77-4/MUST-92: `config/config_toml.rs`
/// is the only reader; the one writer in the crate is `settings_file/scaffold.rs`, create-new only, SPEC-0300-0022 R-1610).
pub fn config_path(app: &AppHandle) -> io::Result<PathBuf> {
    Ok(app_config_dir(app)?.join("config.toml"))
}

/// Full path of `ui-state.toml` (SPEC-0300-0009 R-77; SPEC-0200-0001
/// §3.6.1), a sibling of `navigation.toml` / `viewer-window.toml` in the same
/// config directory.
pub fn ui_state_path(app: &AppHandle) -> io::Result<PathBuf> {
    Ok(app_config_dir(app)?.join("ui-state.toml"))
}

// ---------------------------------------------------------------------
// Phase 9 (SPEC-0400-0001 第2版 R-06~R-08, SPEC-0300-0017 §18.2 / AC-947;
// SPEC-0200-0001 §3.8.10-1, §3.8.17 MUST-108/MUST-109/SHOULD-155):
// debug-only configuration-folder override for E2E runs.
// ---------------------------------------------------------------------

/// Why a `GUIF_CONFIG_DIR` value was rejected.
#[derive(Debug)]
pub struct ConfigDirOverrideError(pub String);

impl fmt::Display for ConfigDirOverrideError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{CONFIG_DIR_ENV}: {}", self.0)
    }
}

impl std::error::Error for ConfigDirOverrideError {}

impl From<ConfigDirOverrideError> for io::Error {
    fn from(e: ConfigDirOverrideError) -> io::Error {
        io::Error::new(io::ErrorKind::InvalidInput, e.to_string())
    }
}

/// Validates the raw value of `GUIF_CONFIG_DIR` (`None` = the variable
/// does not exist, the only case that means "use the default"). Compiled in
/// EVERY build (not gated by `debug_assertions`) so `cargo test` covers it.
/// Rejects (before creating anything): empty / blank, non-Unicode, non-absolute
/// and `..`-containing values, and paths that are an existing non-directory.
pub fn resolve_config_dir_override(raw: Option<&OsStr>) -> Result<Option<PathBuf>, ConfigDirOverrideError> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let text = raw
        .to_str()
        .ok_or_else(|| ConfigDirOverrideError("value is not valid Unicode".to_string()))?;
    if text.trim().is_empty() {
        return Err(ConfigDirOverrideError("value is empty".to_string()));
    }
    let path = PathBuf::from(text);
    if !path.is_absolute() {
        return Err(ConfigDirOverrideError(format!("not an absolute path: {text}")));
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(ConfigDirOverrideError(format!("must not contain `..`: {text}")));
    }
    if path.exists() && !path.is_dir() {
        return Err(ConfigDirOverrideError(format!("not a directory: {text}")));
    }
    fs::create_dir_all(&path).map_err(|e| ConfigDirOverrideError(format!("cannot create {text}: {e}")))?;
    Ok(Some(path))
}

/// The single stderr line printed (debug builds only) when the override is active.
pub fn override_notice_line(dir: &Path) -> String {
    format!("[config] override dir: {}", dir.display())
}

/// Reads the variable (debug builds only; `var_os`, so a non-Unicode value is
/// not mistaken for "unset"). Release builds never read it.
#[cfg(debug_assertions)]
fn read_override_var() -> Option<OsString> {
    std::env::var_os(CONFIG_DIR_ENV)
}

#[cfg(not(debug_assertions))]
fn read_override_var() -> Option<OsString> {
    None
}

/// Prints the notice line once per process (debug builds only).
#[cfg(debug_assertions)]
fn announce_override(dir: &Path) {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| eprintln!("{}", override_notice_line(dir)));
}

#[cfg(not(debug_assertions))]
fn announce_override(_dir: &Path) {}

/// The active override directory, if any. Also the startup check: `lib.rs` calls
/// it from `setup` so an invalid value aborts startup instead of falling back.
pub fn config_dir_override() -> io::Result<Option<PathBuf>> {
    let raw = read_override_var();
    let resolved = resolve_config_dir_override(raw.as_deref())?;
    if let Some(dir) = &resolved {
        announce_override(dir);
    }
    Ok(resolved)
}
