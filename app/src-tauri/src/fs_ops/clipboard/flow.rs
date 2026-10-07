//! Order / retry / rollback / sequence-number logic over a `ClipboardOps` seam
//! (SPEC-0200-0001 §3.10.2, §3.10.17.5). No OS calls and no `unsafe`: every judgement
//! ("which paths", "which order", "when to retry / roll back / read the sequence") lives
//! here; `clipboard_win.rs` only performs single Win32 calls.

use std::cell::RefCell;
use std::ops::{Deref, DerefMut};
use std::time::Duration;

pub use super::hdrop::Effect;
use super::hdrop::{build_hdrop, HdropError};
use super::paths::adopt_paths;
use super::retry::open_with_retry;
use crate::shared::abs_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Read,
    Write,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HdropRead {
    Absent,
    Paths(Vec<String>),
    Failed,
}

pub trait ClipboardOps {
    /// One attempt to open.
    fn open(&mut self, access: Access) -> bool;
    fn close(&mut self);
    fn empty(&mut self) -> bool;
    fn set_hdrop(&mut self, bytes: &[u8]) -> bool;
    fn set_drop_effect(&mut self, effect: Effect) -> bool;
    fn read_hdrop(&mut self) -> HdropRead;
    /// Callable without opening.
    fn hdrop_available(&mut self) -> bool;
    /// 0 = unknown. Callable without opening.
    fn sequence(&mut self) -> u32;
    fn wait(&mut self, d: Duration);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteFailure {
    /// `paths` empty.
    NoPaths,
    /// A path is not absolute (R-89-1 #20), or contains NUL.
    InvalidPath,
    /// Could not open after the retries (or `empty` etc. never reached).
    CannotOpen,
    /// empty / SetClipboardData(CF_HDROP) / DropEffect refused.
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteOutcome {
    /// `sequence` was read AFTER the clipboard was closed (M-1).
    Written { sequence: u32 },
    /// `expected` given and the sequence was 0 or different: nothing written
    /// (DTO error `changed`).
    Skipped,
    Failed(WriteFailure),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadOutcome {
    /// `probe_files` returns empty `paths`.
    Files { paths: Vec<String>, sequence: u32 },
    None { sequence: u32 },
    Unavailable { sequence: u32 },
}

/// MUST-122: an open clipboard. `close()` runs exactly once on every path (return, `?`, panic).
struct Opened<'a, O: ClipboardOps>(&'a mut O);

impl<O: ClipboardOps> Deref for Opened<'_, O> {
    type Target = O;
    fn deref(&self) -> &O {
        self.0
    }
}
impl<O: ClipboardOps> DerefMut for Opened<'_, O> {
    fn deref_mut(&mut self) -> &mut O {
        self.0
    }
}
impl<O: ClipboardOps> Drop for Opened<'_, O> {
    fn drop(&mut self) {
        self.0.close();
    }
}

/// CB-01: up to 5 attempts, 20 ms apart. `None` when it could not be opened (nothing to close).
fn open_guarded<O: ClipboardOps>(ops: &mut O, access: Access) -> Option<Opened<'_, O>> {
    let opened = {
        let cell = RefCell::new(&mut *ops);
        open_with_retry(|| cell.borrow_mut().open(access), |d| cell.borrow_mut().wait(d))
    };
    opened.then(|| Opened(ops))
}

/// R-15-2 / R-18 (`expectedSequence`, MUST-121): validate, open, [compare], empty, write
/// CF_HDROP, write the DropEffect (roll back with `empty` on failure), close, then read the
/// sequence number.
pub fn write_files<O: ClipboardOps>(ops: &mut O, paths: &[String], effect: Effect, expected: Option<u32>) -> WriteOutcome {
    // R-89-1 #20 / AC-86: one path that is not absolute refuses the whole write, before any clipboard call.
    if abs_path::first_relative(paths.iter().map(String::as_str)).is_some() {
        return WriteOutcome::Failed(WriteFailure::InvalidPath);
    }
    let bytes = match build_hdrop(paths) {
        Ok(bytes) => bytes,
        Err(HdropError::Empty) => return WriteOutcome::Failed(WriteFailure::NoPaths),
        Err(_) => return WriteOutcome::Failed(WriteFailure::InvalidPath),
    };
    {
        let Some(mut clip) = open_guarded(ops, Access::Write) else {
            return WriteOutcome::Failed(WriteFailure::CannotOpen);
        };
        if let Some(expected) = expected {
            let current = clip.sequence();
            if expected == 0 || current == 0 || current != expected {
                return WriteOutcome::Skipped;
            }
        }
        if !clip.empty() {
            return WriteOutcome::Failed(WriteFailure::Rejected);
        }
        if !clip.set_hdrop(&bytes) {
            return WriteOutcome::Failed(WriteFailure::Rejected);
        }
        if !clip.set_drop_effect(effect) {
            // R-15-2 L-5: never leave a file list without its DropEffect behind.
            let _ = clip.empty();
            return WriteOutcome::Failed(WriteFailure::Rejected);
        }
    } // closed here (the guard), BEFORE the sequence number is read (M-1)
    WriteOutcome::Written { sequence: ops.sequence() }
}

/// R-17-2: read the file list (owner NULL). The sequence number is taken after closing, and is
/// returned even when the clipboard could not be opened (G-11).
pub fn read_files<O: ClipboardOps>(ops: &mut O) -> ReadOutcome {
    let read = {
        let Some(mut clip) = open_guarded(ops, Access::Read) else {
            return ReadOutcome::Unavailable { sequence: ops.sequence() };
        };
        clip.read_hdrop()
    };
    let sequence = ops.sequence();
    match read {
        HdropRead::Failed => ReadOutcome::Unavailable { sequence },
        HdropRead::Absent => ReadOutcome::None { sequence },
        HdropRead::Paths(raw) => {
            let paths = adopt_paths(raw);
            if paths.is_empty() {
                ReadOutcome::None { sequence }
            } else {
                ReadOutcome::Files { paths, sequence }
            }
        }
    }
}

/// CB-11 `probeOnly`: does not open and does not retry.
pub fn probe_files<O: ClipboardOps>(ops: &mut O) -> ReadOutcome {
    let available = ops.hdrop_available();
    let sequence = ops.sequence();
    if available {
        ReadOutcome::Files { paths: Vec::new(), sequence }
    } else {
        ReadOutcome::None { sequence }
    }
}

/// R-19-6: empty the clipboard only if its sequence number still equals `sequence`; the
/// comparison and the `empty` happen inside ONE open.
pub fn clear_if_unchanged<O: ClipboardOps>(ops: &mut O, sequence: u32) -> bool {
    if sequence == 0 {
        return false;
    }
    let Some(mut clip) = open_guarded(ops, Access::Write) else {
        return false;
    };
    let current = clip.sequence();
    current != 0 && current == sequence && clip.empty()
}
