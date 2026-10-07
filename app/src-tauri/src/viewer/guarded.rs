//! The inner layer of the `viewer_*` commands (SPEC-0200-0001 §3.12.3 #15..#18 / §3.12.6;
//! SPEC-0300-0015 第6版 R-440 / R-441-6 / R-447, AC-514 / AC-515; SPEC-0300-0011 第9版 R-89 / R-89-4).
//!
//! No Tauri types. `commands.rs` applies the caller-window `guard`, then calls these
//! (`commands.rs -> guarded.rs` only, never back, SHOULD-187). A non-absolute `path` is refused with
//! `invalid_path` before any file-system access and BEFORE the E2E scope check (R-89-4). The
//! helpers shared with `viewer_navigate` (`err`, `classify_path`, `kind_to_wire`, `to_display`) live here too.

use std::path::{Path, PathBuf};

use super::error::{classify_io_error, ViewerError, ViewerErrorCode, ViewerErrorDto};
use super::pending::PendingOpen;
use super::session::{is_allowed, is_newer, RequestKey, ViewerSession};
use super::text::TextPayload;
use super::window::ViewerRuntime;
use super::{classify, image, os_open, siblings, text};
use crate::shared::abs_path;
use crate::shared::e2e_scope;

pub(super) fn err(code: ViewerErrorCode, message: impl Into<String>) -> ViewerErrorDto {
    ViewerError { code, message: message.into() }.into()
}

/// R-440 / R-89-2: `invalid_path`, naming the refused path.
fn invalid_path(path: &str) -> ViewerErrorDto {
    err(ViewerErrorCode::InvalidPath, format!("絶対パスではありません: {path}"))
}

const SAMPLE_SIZE: usize = 65_536;

fn read_sample(path: &Path) -> Result<Vec<u8>, ViewerErrorDto> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| err(classify_io_error(&e), e.to_string()))?;
    let mut buf = vec![0u8; SAMPLE_SIZE];
    let read = file.read(&mut buf).map_err(|e| err(classify_io_error(&e), e.to_string()))?;
    buf.truncate(read);
    Ok(buf)
}

/// R-410/R-410-2: the single classification entry point shared by
/// `viewer_classify_path` (the filer's judgment) and `viewer_navigate`
/// (R-493's display-capability check).
pub(super) fn classify_path(path: &Path) -> Result<classify::ViewerKind, ViewerErrorDto> {
    let ext = classify::extension_of(path);
    let known = ext.as_deref().is_some_and(|e| {
        [classify::IMAGE_EXTENSIONS, classify::MARKDOWN_EXTENSIONS, classify::TEXT_EXTENSIONS, classify::OS_OPEN_EXTENSIONS]
            .iter()
            .any(|list| list.iter().any(|c| c.eq_ignore_ascii_case(e)))
    });
    let sample = if known { Vec::new() } else { read_sample(path)? };
    Ok(classify::decide_kind(ext.as_deref(), &sample))
}

pub(super) fn kind_to_wire(kind: classify::ViewerKind) -> &'static str {
    match kind {
        classify::ViewerKind::Image => "image",
        classify::ViewerKind::Markdown => "markdown",
        classify::ViewerKind::Text => "text",
        classify::ViewerKind::OsOpen => "os_open",
    }
}

fn file_name_of(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

pub(super) fn to_display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// R-440's table, shared by `viewer_open`/`viewer_os_open_path`
/// (canonicalize + not_found/not_a_file/permission_denied/io_error).
fn resolve_target(path: &Path) -> Result<PathBuf, ViewerErrorDto> {
    os_open::validate_target_path(path).map_err(|code| err(code, "対象を開けません"))
}

/// R-441-4: the base folder is the CALLER'S (filer's) folder, canonicalized --
/// not the symlink target's folder.
fn resolve_base_dir(requested: &Path) -> Result<PathBuf, ViewerErrorDto> {
    let parent = requested.parent().ok_or_else(|| err(ViewerErrorCode::NotAFile, "親フォルダがありません"))?;
    std::fs::canonicalize(parent).map_err(|e| err(classify_io_error(&e), e.to_string()))
}

fn build_session(requested: &Path) -> Result<ViewerSession, ViewerErrorDto> {
    let opened_path = resolve_target(requested)?;
    let base_dir = resolve_base_dir(requested)?;
    // R-492: enumeration failure -> a 1-entry list of just the opened file
    // (its own base dir stays the allow-set's rule (b), even if listing failed).
    let siblings = siblings::build_sibling_list(&base_dir).unwrap_or_else(|_| vec![opened_path.clone()]);
    let requested_name = requested.file_name();
    let current_index = siblings.iter().position(|p| p.file_name() == requested_name).unwrap_or(0);
    Ok(ViewerSession { opened_path, base_dir, siblings, current_index, generation: 0 })
}

/// R-410/R-413: the judged kind (or an error, R-412-3).
pub fn classify_guarded(path: &str) -> Result<String, ViewerErrorDto> {
    if abs_path::first_relative([path]).is_some() {
        return Err(invalid_path(path));
    }
    let kind = classify_path(Path::new(path))?;
    Ok(kind_to_wire(kind).to_string())
}

/// `Ok(None)` = a stale request (ignored); `Ok(Some(title))` = applied. Never creates a window.
///
/// R-421/R-440/R-441/R-492/MUST-74/76/81/82/SHOULD-114: a stale request is rejected first (R-409, no file
/// system); then the path; the freshness is re-checked UNDER THE SAME LOCK as the session write, so a slow
/// earlier request can never clobber a faster later one.
pub fn open_viewer_guarded(
    runtime: &ViewerRuntime,
    path: &str,
    key: RequestKey,
) -> Result<Option<String>, ViewerErrorDto> {
    {
        let state = runtime.session.lock().expect("viewer session mutex poisoned");
        if !is_newer(state.request_key, key) {
            return Ok(None);
        }
    }
    if abs_path::first_relative([path]).is_some() {
        return Err(invalid_path(path));
    }
    let requested = PathBuf::from(path);
    let session = build_session(&requested)?;
    let kind = classify_path(&session.opened_path)?;
    let pending = PendingOpen {
        path: to_display(&session.opened_path),
        kind: kind_to_wire(kind).to_string(),
        siblings: session.siblings.iter().map(|p| to_display(p)).collect(),
        current_index: session.current_index,
    };
    let title = format!("ReflexViewer - {}", file_name_of(&session.opened_path));
    {
        let mut state = runtime.session.lock().expect("viewer session mutex poisoned");
        if !is_newer(state.request_key, key) {
            return Ok(None);
        }
        state.request_key = Some(key);
        state.session = Some(session);
        state.title = title.clone();
    }
    runtime.pending.set(pending);
    Ok(Some(title))
}

/// R-405 / R-10-5: `launch` is the OS-association start (never called on a refusal).
pub fn os_open_guarded(
    path: &str,
    launch: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), ViewerErrorDto> {
    if abs_path::first_relative([path]).is_some() {
        return Err(invalid_path(path));
    }
    // R-10-5: while an E2E scope is active no other program is ever launched.
    e2e_scope::check_external_launch(Path::new(path))
        .map_err(|violation| err(ViewerErrorCode::ViewerPathNotAllowed, violation.to_command_error()))?;
    let resolved = resolve_target(Path::new(path))?;
    launch(&resolved).map_err(|message| err(ViewerErrorCode::Unknown, message))
}

/// R-441/R-445/R-450: read-only.
pub fn read_text_guarded(runtime: &ViewerRuntime, path: &str) -> Result<TextPayload, ViewerErrorDto> {
    if abs_path::first_relative([path]).is_some() {
        return Err(invalid_path(path));
    }
    let canonical = std::fs::canonicalize(PathBuf::from(path)).map_err(|e| err(classify_io_error(&e), e.to_string()))?;
    {
        let state = runtime.session.lock().expect("viewer session mutex poisoned");
        let session = state.session.as_ref().ok_or_else(|| err(ViewerErrorCode::ViewerPathNotAllowed, "ビューアは開かれていません"))?;
        if !is_allowed(session, &canonical) {
            return Err(err(ViewerErrorCode::ViewerPathNotAllowed, "許可されていないパスです"));
        }
    }
    text::read_text(&canonical).map_err(|e| err(classify_io_error(&e), e.to_string()))
}

/// R-441/R-444/R-484/R-520: read-only; the raw image bytes.
pub fn read_image_guarded(runtime: &ViewerRuntime, path: &str) -> Result<Vec<u8>, ViewerErrorDto> {
    if abs_path::first_relative([path]).is_some() {
        return Err(invalid_path(path));
    }
    let canonical = std::fs::canonicalize(PathBuf::from(path)).map_err(|e| err(classify_io_error(&e), e.to_string()))?;
    {
        let state = runtime.session.lock().expect("viewer session mutex poisoned");
        let session = state.session.as_ref().ok_or_else(|| err(ViewerErrorCode::ViewerPathNotAllowed, "ビューアは開かれていません"))?;
        if !is_allowed(session, &canonical) {
            return Err(err(ViewerErrorCode::ViewerPathNotAllowed, "許可されていないパスです"));
        }
    }
    match image::read_image(&canonical) {
        Ok(Ok(bytes)) => Ok(bytes),
        Ok(Err(code)) => {
            Err(err(code, image::oversized_image_message(std::fs::metadata(&canonical).map(|m| m.len()).unwrap_or_default())))
        }
        Err(e) => Err(err(classify_io_error(&e), e.to_string())),
    }
}
