//! Tauri command wrapper around `fs::query::fs_list_dir` (SPEC-0300-0009 §7,
//! SPEC-0200-0001 §2). `query::fs_list_dir` itself stays framework-agnostic
//! (no `Serialize`, `PathBuf`/enum types) and is intentionally left
//! unmodified; this module is the thin IPC boundary that converts its
//! output into a JSON-serializable shape and is registered by the `app/`
//! bootstrap (`crate::run`, `lib.rs`) via `tauri::generate_handler!`.

use std::path::PathBuf;

use serde::Serialize;

use super::query::{self, EntryType};

/// Serializable counterpart of `query::Entry` for the Tauri IPC boundary.
/// Mirrors the 7 fields from SPEC-0300-0009 R-71 exactly; `camelCase` output
/// matches the frontend `FsEntry` type in `shared/ipc/fs.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntryDto {
    pub name: String,
    pub path: String,
    pub entry_type: String,
    pub size: u64,
    pub modified: String,
    pub hidden: bool,
    pub ext: String,
}

impl From<query::Entry> for FsEntryDto {
    fn from(entry: query::Entry) -> Self {
        FsEntryDto {
            name: entry.name,
            path: entry.path.to_string_lossy().into_owned(),
            entry_type: match entry.entry_type {
                EntryType::File => "file".to_string(),
                EntryType::Dir => "dir".to_string(),
            },
            size: entry.size,
            modified: entry.modified,
            hidden: entry.hidden,
            ext: entry.ext,
        }
    }
}

/// The single directory-enumeration Tauri command (R-70), used by both the
/// file list and the tree (the caller passes `sort_key: "name"`,
/// `sort_order: "asc"` and filters to dirs on its own side for the tree
/// case, per R-41 — this command itself has no dir-only mode).
#[tauri::command]
pub fn fs_list_dir(
    path: String,
    show_hidden: bool,
    sort_key: String,
    sort_order: String,
) -> Result<Vec<FsEntryDto>, String> {
    let path_buf = PathBuf::from(path);
    query::fs_list_dir(&path_buf, show_hidden, &sort_key, &sort_order)
        .map(|entries| entries.into_iter().map(FsEntryDto::from).collect())
        .map_err(|e| e.to_string())
}
