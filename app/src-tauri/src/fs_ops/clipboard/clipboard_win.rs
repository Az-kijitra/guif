//! The Win32 side of the OS clipboard (SPEC-0300-0011 R-18-11; SPEC-0200-0001 §3.10.2 / §3.10.3 /
//! §3.10.5). This is the ONLY file of `fs_ops/clipboard/` with unsafe code and the only one that
//! names the Win32 clipboard API. It makes NO decisions: each method is one thin call (or a
//! small allocate-lock-copy sequence); order, retry, rollback and sequence timing live in
//! `flow.rs`.
//!
//! Memory ownership of what is written (R-15-2-1 L-9 -- a reviewer checklist):
//!
//! | step                         | owner afterwards           | on failure                         |
//! |------------------------------|----------------------------|------------------------------------|
//! | `GlobalAlloc(MOVEABLE)`      | this code                  | null -> nothing to release         |
//! | `GlobalLock` + copy + unlock | this code                  | lock null -> `GlobalFree`          |
//! | `SetClipboardData` succeeds  | the OS (never freed here)  | -                                  |
//! | `SetClipboardData` fails     | this code                  | `GlobalFree` the block             |
//!
//! Reading never frees the handle (the OS owns it) and always unlocks what it locked.
#![allow(unsafe_code)]

use std::ffi::c_void;
use std::time::Duration;

use windows_sys::Win32::Foundation::{GlobalFree, HWND};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable,
    OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows_sys::Win32::UI::Shell::DragQueryFileW;

use super::flow::{Access, ClipboardOps, HdropRead};
use super::hdrop::{decode_wide_path, effect_bytes, to_wide_nul, Effect, CF_HDROP};

/// One short-lived accessor (never shared between threads): created per command call.
pub struct WinClipboard {
    /// The main window's HWND as `isize` (0 = unknown -> writing is refused).
    owner: isize,
}

impl WinClipboard {
    pub fn new(owner: isize) -> Self {
        WinClipboard { owner }
    }
}

/// Allocate, lock, copy, unlock, hand to the clipboard. The clipboard must be open.
fn set_bytes(format: u32, bytes: &[u8]) -> bool {
    // SAFETY: `GlobalAlloc` has no preconditions; a null result is handled below.
    let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len()) };
    if handle.is_null() {
        return false;
    }
    // SAFETY: `handle` is a live moveable block of `bytes.len()` bytes that only this code owns.
    let target = unsafe { GlobalLock(handle) } as *mut u8;
    if target.is_null() {
        // SAFETY: still owned here (never passed to the clipboard), so it must be released.
        unsafe { GlobalFree(handle) };
        return false;
    }
    // SAFETY: `target` points at `bytes.len()` writable bytes (locked above) and `bytes` is a
    // distinct allocation, so the ranges cannot overlap.
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), target, bytes.len()) };
    // SAFETY: matches the successful `GlobalLock` above.
    unsafe { GlobalUnlock(handle) };
    // SAFETY: the clipboard is open (caller contract) and `handle` is an unlocked moveable block.
    let accepted = unsafe { SetClipboardData(format, handle) };
    if accepted.is_null() {
        // SAFETY: the clipboard did not take ownership, so the block is still ours to release.
        unsafe { GlobalFree(handle) };
        return false;
    }
    true
}

impl ClipboardOps for WinClipboard {
    fn open(&mut self, access: Access) -> bool {
        let hwnd: HWND = match access {
            Access::Read => std::ptr::null_mut(),
            // Writing needs the owner window: `EmptyClipboard` after `OpenClipboard(NULL)` would
            // leave a null owner and make the next `SetClipboardData` fail (§3.10.4).
            Access::Write if self.owner == 0 => return false,
            Access::Write => self.owner as HWND,
        };
        // SAFETY: a plain call; `hwnd` is null or the main window's handle registered at start-up.
        unsafe { OpenClipboard(hwnd) != 0 }
    }

    fn close(&mut self) {
        // SAFETY: only called by the `Opened` guard after a successful `open` on this thread.
        unsafe { CloseClipboard() };
    }

    fn empty(&mut self) -> bool {
        // SAFETY: the clipboard is open (flow.rs only calls this through the open guard).
        unsafe { EmptyClipboard() != 0 }
    }

    fn set_hdrop(&mut self, bytes: &[u8]) -> bool {
        set_bytes(CF_HDROP, bytes)
    }

    fn set_drop_effect(&mut self, effect: Effect) -> bool {
        let name = to_wide_nul("Preferred DropEffect");
        // SAFETY: `name` is a NUL-terminated UTF-16 string that outlives the call.
        let format = unsafe { RegisterClipboardFormatW(name.as_ptr()) };
        format != 0 && set_bytes(format, &effect_bytes(effect))
    }

    fn read_hdrop(&mut self) -> HdropRead {
        // SAFETY: the clipboard is open (flow.rs). The handle stays owned by the OS.
        let handle = unsafe { GetClipboardData(CF_HDROP) };
        if handle.is_null() {
            return HdropRead::Absent;
        }
        // SAFETY: `handle` came from the open clipboard; it is unlocked below on every path.
        let locked = unsafe { GlobalLock(handle) };
        if locked.is_null() {
            return HdropRead::Failed;
        }
        let result = query_files(handle);
        // SAFETY: matches the successful `GlobalLock` above.
        unsafe { GlobalUnlock(handle) };
        result
    }

    fn hdrop_available(&mut self) -> bool {
        // SAFETY: valid without opening the clipboard.
        unsafe { IsClipboardFormatAvailable(CF_HDROP) != 0 }
    }

    fn sequence(&mut self) -> u32 {
        // SAFETY: valid without opening the clipboard; 0 = unknown.
        unsafe { GetClipboardSequenceNumber() }
    }

    fn wait(&mut self, d: Duration) {
        std::thread::sleep(d);
    }
}

/// `DragQueryFileW` over a locked CF_HDROP handle (ANSI lists are converted by the OS).
fn query_files(handle: *mut c_void) -> HdropRead {
    // SAFETY: `handle` is a locked CF_HDROP block; 0xFFFFFFFF asks only for the count.
    let count = unsafe { DragQueryFileW(handle, 0xFFFF_FFFF, std::ptr::null_mut(), 0) };
    if count == 0 {
        return HdropRead::Absent;
    }
    let mut paths = Vec::new();
    for index in 0..count {
        // SAFETY: `index < count`; a null buffer asks only for the length (without the NUL).
        let len = unsafe { DragQueryFileW(handle, index, std::ptr::null_mut(), 0) };
        if len == 0 {
            continue; // an empty item is dropped (SHOULD-172)
        }
        let mut buffer = vec![0u16; len as usize + 1];
        // SAFETY: `buffer` holds `len + 1` units, which is the `cch` passed.
        let copied = unsafe { DragQueryFileW(handle, index, buffer.as_mut_ptr(), buffer.len() as u32) };
        if copied == 0 {
            return HdropRead::Failed;
        }
        // an unpaired surrogate cannot be a Rust string: that item is dropped (G-12)
        if let Some(path) = decode_wide_path(&buffer[..copied as usize]) {
            paths.push(path);
        }
    }
    HdropRead::Paths(paths)
}
