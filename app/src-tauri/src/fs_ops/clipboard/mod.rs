//! `fs_ops/clipboard/` (SPEC-0300-0011 R-15~R-19, R-18-11; SPEC-0200-0001 §3.10.2 / §3.10.17.5).
//! OS clipboard (CF_HDROP + Preferred DropEffect).
//!
//! - `paths` / `hdrop` / `retry` / `flow`: pure logic over the `ClipboardOps` seam (no OS calls).
//! - `commands`: the three Tauri commands, DTOs and the owner-window state.
//! - `clipboard_win`: the only file with unsafe code and Win32 calls (a thin, decision-free wrapper);
//!   `clipboard_unsupported`: a stand-in for non-Windows build/test environments.

#[cfg(windows)]
mod clipboard_win;
#[cfg(windows)]
pub(crate) use clipboard_win::WinClipboard as SystemClipboard;

#[cfg(not(windows))]
mod clipboard_unsupported;
#[cfg(not(windows))]
pub(crate) use clipboard_unsupported::UnsupportedClipboard as SystemClipboard;

pub mod commands;
pub mod flow;
pub mod hdrop;
pub mod paths;
pub mod retry;

#[cfg(test)]
mod commands_tests;
#[cfg(test)]
mod flow_tests;
#[cfg(test)]
mod hdrop_tests;
#[cfg(test)]
mod paths_tests;
#[cfg(test)]
mod retry_tests;
