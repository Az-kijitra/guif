//! `viewer/commands.rs` (SPEC-0300-0015 R-432-3, R-432-4, R-405-3;
//! SPEC-0200-0001 §3.5.2, §3.5.12.5). The seven Tauri commands themselves
//! (`viewer_classify_path`, `viewer_open`, `viewer_os_open_path`,
//! `viewer_take_pending`, `viewer_read_text`, `viewer_read_image`,
//! `viewer_navigate`) are wired against real `tauri::Window`/`AppHandle`
//! objects by code-generator and are out of scope for this pure-function TDD
//! pass; what IS a pure, unit-testable function is the caller-window guard
//! every one of them applies BEFORE doing anything else (R-432-3 for the 3
//! main-only commands, R-432-4 for the 4 viewer-only commands, R-405-3 for
//! the OS-association launch).
//!
//! Planned API (not yet implemented, TDD):
//!
//! ```ignore
//! // `actual` is `window.label()`; `expected` is "main" or "viewer".
//! // Ok(()) when they match; Err(ViewerPathNotAllowed) otherwise (R-440's
//! // table: "呼び出し元がメインウィンドウでない" -> viewer_path_not_allowed;
//! // the same code is reused for the viewer-only commands' mirror check,
//! // R-432-4, since neither case can occur from a normal user action).
//! pub fn check_caller_window(actual: &str, expected: &str) -> Result<(), super::error::ViewerErrorCode>;
//! ```
//!
//! Tests: `viewer/commands_tests.rs`.

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};

use super::error::{classify_io_error, ViewerError, ViewerErrorCode, ViewerErrorDto};
use super::guarded::{
    classify_guarded, classify_path, err, kind_to_wire, open_viewer_guarded, os_open_guarded, read_image_guarded,
    read_text_guarded, to_display,
};
use super::pending::PendingOpen;
use super::session::{decide_open_action, is_allowed, OpenWhileAction, RequestKey};
use super::text;
use super::window::{open_or_focus_viewer_window, ViewerRuntime, MAIN_WINDOW_LABEL, VIEWER_WINDOW_LABEL};

/// R-432-3/R-432-4/R-405-3: the caller-window guard shared by all seven
/// commands. `actual` is `window.label()`; `expected` is `"main"` or
/// `"viewer"`.
pub fn check_caller_window(actual: &str, expected: &str) -> Result<(), ViewerErrorCode> {
    if actual == expected {
        Ok(())
    } else {
        Err(ViewerErrorCode::ViewerPathNotAllowed)
    }
}

fn guard(window: &Window, expected: &str) -> Result<(), ViewerErrorDto> {
    check_caller_window(window.label(), expected)
        .map_err(|code| ViewerError { code, message: "呼び出し元ウィンドウが許可されていません".into() }.into())
}

// ---------------------------------------------------------------------
// DTOs (IPC wire shapes, camelCase)
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingOpenDto {
    pub path: String,
    pub kind: String,
    pub siblings: Vec<String>,
    pub current_index: usize,
}

impl From<PendingOpen> for PendingOpenDto {
    fn from(p: PendingOpen) -> Self {
        PendingOpenDto { path: p.path, kind: p.kind, siblings: p.siblings, current_index: p.current_index }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPayloadDto {
    pub content: String,
    pub encoding: String,
    pub original_size_bytes: u64,
    pub truncated_by_size: bool,
    pub truncated_by_lines: bool,
    pub line_count: usize,
    pub truncation_message: Option<String>,
}

impl From<text::TextPayload> for TextPayloadDto {
    fn from(p: text::TextPayload) -> Self {
        let truncation_message = text::truncation_message(p.original_size_bytes, p.truncated_by_size);
        TextPayloadDto {
            content: p.content,
            encoding: p.encoding.as_str().to_string(),
            original_size_bytes: p.original_size_bytes,
            truncated_by_size: p.truncated_by_size,
            truncated_by_lines: p.truncated_by_lines,
            line_count: p.line_count,
            truncation_message,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigateResultDto {
    pub path: String,
    pub kind: String,
    pub current_index: usize,
    pub total: usize,
}

// ---------------------------------------------------------------------
// The seven Tauri commands (SPEC-0200-0001 §3.5.2)
// ---------------------------------------------------------------------

/// R-410/R-413: main-only. Reads no content back to the frontend, only the
/// judged kind (or an error, R-412-3).
#[tauri::command(async)]
pub fn viewer_classify_path(window: Window, path: String) -> Result<String, ViewerErrorDto> {
    guard(&window, MAIN_WINDOW_LABEL)?;
    classify_guarded(&path)
}

/// R-405: main-only. Launches the OS-associated application; never used from
/// the viewer window itself (R-493).
#[tauri::command(async)]
pub fn viewer_os_open_path(window: Window, path: String) -> Result<(), ViewerErrorDto> {
    guard(&window, MAIN_WINDOW_LABEL)?;
    os_open_guarded(&path, |resolved| {
        tauri_plugin_opener::open_path(resolved, None::<&str>).map_err(|e| e.to_string())
    })
}

/// R-421/R-440/R-441/R-492/MUST-74/76/81/82/SHOULD-114: main-only. Replaces
/// the allow-set/sibling snapshot, hands off a `PendingOpen` and creates/
/// focuses/switches the viewer window (R-408: fire-and-forget, never blocks
/// the caller). `request_epoch`/`request_seq` are minted by the MAIN window
/// (epoch per page load, seq per request within it) and applied through
/// `session::is_newer` UNDER THE SAME LOCK as the session write, so a slow
/// earlier `viewer_open` can never clobber a faster later one even when the
/// two async commands' completion order is reversed at the backend itself
/// (not only guarded by the frontend's own `request-sequencer.ts`).
#[tauri::command(async)]
pub fn viewer_open(
    window: Window,
    app: AppHandle,
    runtime: State<ViewerRuntime>,
    path: String,
    request_epoch: u64,
    request_seq: u64,
) -> Result<(), ViewerErrorDto> {
    guard(&window, MAIN_WINDOW_LABEL)?;
    let incoming = RequestKey { epoch: request_epoch, seq: request_seq };
    // The inner layer judges the stale request (R-409), the path (R-89) and applies the session write.
    // `None` = a stale request: nothing more to do.
    let Some(title) = open_viewer_guarded(&runtime, &path, incoming)? else {
        return Ok(());
    };
    // R-421(b): an already-open viewer window is told to re-fetch the
    // pending slot instead of only relying on route-load-time hand-off.
    let _ = app.emit_to(VIEWER_WINDOW_LABEL, "viewer://pending-changed", ());

    // MUST-76/82: a request that arrives while the (only) viewer window is
    // still closing must not race the OS's own close by building a second
    // window now; it defers to generation g+1, rebuilt once the OLD
    // generation's `Destroyed` fires (`window::handle_viewer_window_event`).
    let action = {
        let mut gen_state = runtime.generation.lock().expect("viewer generation mutex poisoned");
        let (next, action) = decide_open_action(*gen_state);
        *gen_state = next;
        action
    };
    if let OpenWhileAction::ProceedNow { generation } = action {
        open_or_focus_viewer_window(app, title, generation);
    }
    Ok(())
}

/// R-430: viewer-only. Consumes the pending-open slot exactly once.
#[tauri::command(async)]
pub fn viewer_take_pending(window: Window, runtime: State<ViewerRuntime>) -> Result<Option<PendingOpenDto>, ViewerErrorDto> {
    guard(&window, VIEWER_WINDOW_LABEL)?;
    Ok(runtime.pending.take().map(Into::into))
}

/// R-441/R-445/R-450: viewer-only, read-only.
#[tauri::command(async)]
pub fn viewer_read_text(window: Window, runtime: State<ViewerRuntime>, path: String) -> Result<TextPayloadDto, ViewerErrorDto> {
    guard(&window, VIEWER_WINDOW_LABEL)?;
    read_text_guarded(&runtime, &path).map(Into::into)
}

/// R-441/R-444/R-484/R-520: viewer-only, read-only. Returns the raw image
/// bytes via `tauri::ipc::Response` (the JS `invoke()` call then resolves
/// with an `ArrayBuffer`) instead of a JSON array of byte numbers -- avoids
/// both the serialization blow-up of a `Vec<u8>` DTO and the frontend having
/// to build a data-URL by concatenating one `String.fromCharCode` per byte
/// (code-reviewer finding, 2026-09-27). The MIME type is not sent alongside
/// (no header-equivalent on a raw IPC response): the frontend derives it
/// itself from the file extension, the same fixed 4-extension set R-480/R-410
/// already fixes (`png`/`jpg`/`jpeg`/`bmp`), so no second round trip is
/// needed either.
#[tauri::command(async)]
pub fn viewer_read_image(
    window: Window,
    runtime: State<ViewerRuntime>,
    path: String,
) -> Result<tauri::ipc::Response, ViewerErrorDto> {
    guard(&window, VIEWER_WINDOW_LABEL)?;
    read_image_guarded(&runtime, &path).map(tauri::ipc::Response::new)
}

/// R-490~R-495: viewer-only. Moves within the R-492 snapshot; never re-lists
/// the folder, never launches the OS association app (R-493).
#[tauri::command(async)]
pub fn viewer_navigate(window: Window, runtime: State<ViewerRuntime>, direction: String) -> Result<NavigateResultDto, ViewerErrorDto> {
    guard(&window, VIEWER_WINDOW_LABEL)?;
    let mut state_guard = runtime.session.lock().expect("viewer session mutex poisoned");
    let session = state_guard.session.as_mut().ok_or_else(|| err(ViewerErrorCode::ViewerPathNotAllowed, "ビューアは開かれていません"))?;
    if session.siblings.is_empty() {
        return Err(err(ViewerErrorCode::NotFound, "前後のファイルがありません"));
    }
    // R-491-2: stops at the ends, never wraps.
    let next_index = match direction.as_str() {
        "prev" => session.current_index.saturating_sub(1),
        _ => (session.current_index + 1).min(session.siblings.len() - 1),
    };
    session.current_index = next_index;
    // R-492: `siblings` already holds each entry's full path (built by
    // `siblings::build_sibling_list`); re-joining `base_dir` with just the
    // file name was redundant and, more importantly, wrong for the (listed
    // but unreadable) R-495 symlink case, whose OWN path is what R-441-2's
    // `is_allowed` canonicalizes -- not a `base_dir`-relative reconstruction.
    let target = session.siblings[next_index].clone();
    let total = session.siblings.len();
    let session_snapshot = session.clone();
    drop(state_guard);

    let canonical = match std::fs::canonicalize(&target) {
        Ok(p) => p,
        Err(e) => return Err(err(classify_io_error(&e), e.to_string())),
    };
    if !is_allowed(&session_snapshot, &canonical) {
        return Err(err(ViewerErrorCode::ViewerPathNotAllowed, "許可されていないパスです"));
    }
    let kind = classify_path(&canonical)?;
    Ok(NavigateResultDto { path: to_display(&canonical), kind: kind_to_wire(kind).to_string(), current_index: next_index, total })
}
