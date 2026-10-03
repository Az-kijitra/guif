//! The three clipboard commands, their DTOs and the owner-window state (SPEC-0300-0011 R-18,
//! CB-12; SPEC-0200-0001 §3.10.6 / §3.10.4 / §3.10.17.5).
//!
//! The commands are thin: the testable pieces are `parse_effect` and the `*_with` functions
//! (over a `ClipboardOps`), which map `flow` outcomes to the wire DTOs. A failure is a VALUE
//! (`ok: false` + `error`), never a rejected command: the front end falls back to its in-app
//! clipboard as the normal path. All three run on a worker thread (`async` command option);
//! open .. close happens inside one synchronous `flow` call.

use std::sync::atomic::{AtomicIsize, Ordering};

use serde::Serialize;
use tauri::State;

use super::flow::{self, ClipboardOps, ReadOutcome, WriteFailure, WriteOutcome};
use super::hdrop::Effect;
use super::SystemClipboard;

/// The main window's HWND as an `isize` (0 = not registered / window gone: writing is refused,
/// which the front end reports as "could not write to the OS clipboard"). Managed by `lib.rs`.
#[derive(Default)]
pub struct ClipboardOwner(AtomicIsize);

impl ClipboardOwner {
    pub fn set(&self, hwnd: isize) {
        self.0.store(hwnd, Ordering::SeqCst);
    }
    pub fn get(&self) -> isize {
        self.0.load(Ordering::SeqCst)
    }
}

/// Stores the main window's handle (once, from `.setup`). A failure only costs OS writes (the
/// app clipboard still works); it is reported on stderr for the real-device check (SHOULD-171).
#[cfg(windows)]
pub fn register_owner(app: &tauri::App) {
    use tauri::Manager;
    let owner = app.state::<ClipboardOwner>();
    match app.get_webview_window("main").map(|window| window.hwnd()) {
        Some(Ok(hwnd)) if hwnd.0 as isize != 0 => owner.set(hwnd.0 as isize),
        Some(Ok(_)) => eprintln!("[clipboard] the main window handle is null; OS clipboard writes are disabled"),
        Some(Err(e)) => eprintln!("[clipboard] cannot get the main window handle ({e}); OS clipboard writes are disabled"),
        None => eprintln!("[clipboard] no main window; OS clipboard writes are disabled"),
    }
}

/// JSON camelCase. `error`: "no_paths" | "invalid_path" | "invalid_effect" |
/// "cannot_open" | "rejected" | "changed".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardWriteDto {
    pub ok: bool,
    pub sequence: u32,
    pub error: Option<String>,
}

/// `state`: "files" | "none" | "unavailable"; `sequence` 0 = unknown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReadDto {
    pub state: String,
    pub paths: Vec<String>,
    pub sequence: u32,
}

/// "copy" -> Copy, "move" -> Move, anything else (incl. "COPY", "") -> None.
pub fn parse_effect(raw: &str) -> Option<Effect> {
    match raw {
        "copy" => Some(Effect::Copy),
        "move" => Some(Effect::Move),
        _ => None,
    }
}

fn write_failed(error: &str) -> ClipboardWriteDto {
    ClipboardWriteDto { ok: false, sequence: 0, error: Some(error.to_string()) }
}

pub fn set_files_with(
    ops: &mut impl ClipboardOps,
    paths: Vec<String>,
    effect: &str,
    expected_sequence: Option<u32>,
) -> ClipboardWriteDto {
    let Some(effect) = parse_effect(effect) else {
        return write_failed("invalid_effect");
    };
    match flow::write_files(ops, &paths, effect, expected_sequence) {
        WriteOutcome::Written { sequence } => ClipboardWriteDto { ok: true, sequence, error: None },
        WriteOutcome::Skipped => write_failed("changed"),
        WriteOutcome::Failed(WriteFailure::NoPaths) => write_failed("no_paths"),
        WriteOutcome::Failed(WriteFailure::InvalidPath) => write_failed("invalid_path"),
        WriteOutcome::Failed(WriteFailure::CannotOpen) => write_failed("cannot_open"),
        WriteOutcome::Failed(WriteFailure::Rejected) => write_failed("rejected"),
    }
}

pub fn get_files_with(ops: &mut impl ClipboardOps, probe_only: bool) -> ClipboardReadDto {
    let outcome = if probe_only { flow::probe_files(ops) } else { flow::read_files(ops) };
    let (state, paths, sequence) = match outcome {
        ReadOutcome::Files { paths, sequence } => ("files", paths, sequence),
        ReadOutcome::None { sequence } => ("none", Vec::new(), sequence),
        ReadOutcome::Unavailable { sequence } => ("unavailable", Vec::new(), sequence),
    };
    ClipboardReadDto { state: state.to_string(), paths, sequence }
}

/// R-15 / R-16 / R-18: replace the OS clipboard with a file list (`effect`: "copy" | "move").
/// With `expected_sequence` the write happens only if the clipboard still has that sequence
/// number (checked and written inside one open; MUST-121).
#[tauri::command(async)]
pub fn clipboard_set_files(
    owner: State<ClipboardOwner>,
    paths: Vec<String>,
    effect: String,
    expected_sequence: Option<u32>,
) -> ClipboardWriteDto {
    set_files_with(&mut SystemClipboard::new(owner.get()), paths, &effect, expected_sequence)
}

/// R-17: read the file list, or (`probe_only`) only whether the format is present (CB-11).
#[tauri::command(async)]
pub fn clipboard_get_files(probe_only: bool) -> ClipboardReadDto {
    get_files_with(&mut SystemClipboard::new(0), probe_only)
}

/// R-19-6: empty the clipboard only if its sequence number is still `sequence`.
#[tauri::command(async)]
pub fn clipboard_clear_if_unchanged(owner: State<ClipboardOwner>, sequence: u32) -> bool {
    flow::clear_if_unchanged(&mut SystemClipboard::new(owner.get()), sequence)
}
