//! `viewer/os_open.rs` (SPEC-0300-0015 R-405, R-405-2, R-405-4;
//! SPEC-0200-0001 §3.5.5/§3.5.6, §3.5.12.9 MUST-83). The actual launch
//! (`tauri_plugin_opener::open_path`, a plugin-free free function call) is
//! deliberately NOT unit-tested here (it would really launch a program); only
//! the pre-flight path validation (R-405-2, shared with R-440's table) is a
//! pure/file-system-only function.
//!
//! Planned API (not yet implemented, TDD):
//!
//! ```ignore
//! // Canonicalizes `path` and classifies it exactly like R-440's table:
//! // does not exist -> NotFound, a directory -> NotAFile, otherwise Ok(the
//! // canonicalized path). Permission errors surface via
//! // `error::classify_io_error`.
//! pub fn validate_target_path(path: &std::path::Path) -> Result<std::path::PathBuf, super::error::ViewerErrorCode>;
//! ```
//!
//! Tests: `viewer/os_open_tests.rs`.

use std::path::{Path, PathBuf};

use super::error::{classify_io_error, ViewerErrorCode};

/// R-405-2/R-440: canonicalizes `path` and classifies it. Does not exist ->
/// `NotFound`; a directory -> `NotAFile`; otherwise `Ok` with the
/// canonicalized path. Other I/O errors (e.g. permission) are classified via
/// `classify_io_error`.
pub fn validate_target_path(path: &Path) -> Result<PathBuf, ViewerErrorCode> {
    let resolved = std::fs::canonicalize(path).map_err(|e| classify_io_error(&e))?;
    let metadata = std::fs::metadata(&resolved).map_err(|e| classify_io_error(&e))?;
    if metadata.is_dir() {
        return Err(ViewerErrorCode::NotAFile);
    }
    Ok(resolved)
}
