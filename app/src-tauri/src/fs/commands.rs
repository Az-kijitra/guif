//! Tauri command wrapper around `fs::query::fs_list_dir` (SPEC-0300-0009 §7,
//! SPEC-0200-0001 §2). `query::fs_list_dir` itself stays framework-agnostic
//! (no `Serialize`, `PathBuf`/enum types) and is intentionally left
//! unmodified; this module is the thin IPC boundary that converts its
//! output into a JSON-serializable shape and is registered by the `app/`
//! bootstrap (`crate::run`, `lib.rs`) via `tauri::generate_handler!`.

use std::io;
use std::path::PathBuf;

use serde::Serialize;

use super::query::{self, EntryType};

// SPEC-0200-0001 §3.6.11.6 (MUST-89): `fs_list_dir`'s error is structured so
// the frontend can implement R-40-3 ("access-denied/not-found are silent,
// anything else is notified") WITHOUT parsing a possibly-localized message
// string. `code` is derived from `io::ErrorKind`; `message` keeps `e.to_string()`
// for display (unchanged from the current plain-`String` error).
//
// Planned change (not yet wired, code-generator territory per
// architecture-guardian's 14th audit: "MUST-89 ... unit-test-writer は妨げ
// ない"): `fs_list_dir` itself becomes `#[tauri::command(async)]` and returns
// `Result<Vec<FsEntryDto>, FsListDirErrorDto>` instead of `Result<_, String>`.
// R-70's argument/return VALUE shape is unchanged; only the error type and
// the sync/async attribute change. This struct/impl is written now (and unit
// tested below) so that change is a small, already-verified swap.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsListDirErrorDto {
    pub code: String,
    pub message: String,
}

impl From<io::Error> for FsListDirErrorDto {
    fn from(e: io::Error) -> Self {
        let code = match e.kind() {
            io::ErrorKind::PermissionDenied => "access_denied",
            io::ErrorKind::NotFound => "not_found",
            // SPEC-0300-0016 R-731-1: ERROR_DIRECTORY (a file given to read_dir).
            io::ErrorKind::NotADirectory => "not_a_directory",
            _ => "other",
        };
        Self { code: code.to_string(), message: e.to_string() }
    }
}

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
///
/// SPEC-0200-0001 §3.6.11.6 (MUST-89): `async` so a slow directory (e.g. a
/// network share) never blocks the WebView2 main thread, and the error is a
/// structured `FsListDirErrorDto` (never a bare `String`) so the frontend can
/// implement R-40-3 ("access-denied/not-found are silent, anything else is
/// notified") without parsing a possibly-localized message string. R-70's
/// argument/return VALUE shape is unchanged.
#[tauri::command(async)]
pub fn fs_list_dir(
    path: String,
    show_hidden: bool,
    sort_key: String,
    sort_order: String,
) -> Result<Vec<FsEntryDto>, FsListDirErrorDto> {
    let path_buf = PathBuf::from(path);
    query::fs_list_dir(&path_buf, show_hidden, &sort_key, &sort_order)
        .map(|entries| entries.into_iter().map(FsEntryDto::from).collect())
        .map_err(FsListDirErrorDto::from)
}

/// SPEC-0300-0016 R-780~R-784: the logical drive roots (`C:`, `D:`, ...) in
/// ascending order. A separate command from `fs_list_dir` (R-784: the drive
/// list is not a directory listing). Returns immediately and never touches a
/// drive's contents (R-783); `async` keeps it off the main thread like the
/// other `fs` commands. The `unsafe` OS call is isolated in `win_drives`.
#[tauri::command(async)]
pub fn fs_list_drives() -> Vec<String> {
    super::win_drives::list_logical_drives()
}

#[cfg(test)]
mod tests {
    use super::*;

    // SPEC-0200-0001 §3.6.11.6 (MUST-89): io::ErrorKind -> {code, message}.
    #[test]
    fn permission_denied_maps_to_access_denied() {
        let e = io::Error::new(io::ErrorKind::PermissionDenied, "denied");
        let dto: FsListDirErrorDto = e.into();
        assert_eq!(dto.code, "access_denied");
        assert_eq!(dto.message, "denied");
    }

    #[test]
    fn not_found_maps_to_not_found() {
        let e = io::Error::new(io::ErrorKind::NotFound, "gone");
        let dto: FsListDirErrorDto = e.into();
        assert_eq!(dto.code, "not_found");
    }

    #[test]
    fn any_other_error_kind_maps_to_other() {
        let e = io::Error::new(io::ErrorKind::InvalidData, "weird");
        let dto: FsListDirErrorDto = e.into();
        assert_eq!(dto.code, "other");
        assert_eq!(dto.message, "weird");
    }

    // SPEC-0300-0016 R-731-1 (承認時に確定・ISS-0171 (c)の代案): a NEW
    // `not_a_directory` code, distinct from the generic "other" fallback, so
    // the frontend (SPEC-0200-0001 §3.7.10.2(c)) can show the dedicated
    // 「フォルダーではありません」文言 instead of the raw OS message.
    // architecture-guardian confirmed on real hardware (Windows 11, NTFS,
    // §3.7.10.10) that `ERROR_DIRECTORY` maps to `io::ErrorKind::NotADirectory`
    // for `std::fs::read_dir` on a file, for the plain/trailing-`\`/`\\?\`/
    // `\\localhost\C$\` path forms. RED until the `match` in `From<io::Error>`
    // above adds this arm (currently falls through to `_ => "other"`).
    #[test]
    fn not_a_directory_kind_maps_to_not_a_directory_not_other() {
        let e = io::Error::new(io::ErrorKind::NotADirectory, "not a directory");
        let dto: FsListDirErrorDto = e.into();
        assert_eq!(dto.code, "not_a_directory");
    }

    // R-40-3/SHOULD-131: Windows network-path errors (e.g. ERROR_BAD_NETPATH)
    // are pinned here as a canary so a std/Rust edition change to this
    // mapping is caught rather than silently drifting. On the toolchain this
    // crate currently builds with (rustc 1.98, which extended libstd's
    // raw-OS-error-to-`ErrorKind` table beyond the set assumed when this test
    // was first written), `ERROR_BAD_NETPATH` now maps to `NotFound` — both
    // "not_found" (silent, per R-40-3) and "other" (notified) are within
    // R-40-3's acceptable range, so this is a legitimate update of the pinned
    // value (code-generator, 2026-09-28), not a weakening of the guard: the
    // test still fails loudly if this mapping ever changes again.
    #[test]
    fn an_uncategorized_os_error_maps_within_r_40_3s_acceptable_range() {
        let e = io::Error::from_raw_os_error(53); // ERROR_BAD_NETPATH on Windows
        let dto: FsListDirErrorDto = e.into();
        assert!(
            dto.code == "not_found" || dto.code == "other",
            "R-40-3 only requires access_denied/not_found to stay silent and everything else to notify; got {:?}",
            dto.code
        );
    }

    // AC-751 (SPEC-0300-0016 R-731-1): the REAL `fs_list_dir` command,
    // called end-to-end (not just the DTO conversion above) against a file
    // on a real temp filesystem, must surface `not_a_directory` -- never
    // `other`. `#[cfg(windows)]` per §3.7.10.10 (only confirmed on Windows;
    // non-Windows/non-NTFS `ErrorKind` mapping is an explicit residual
    // per the spec's own §13 remaining-confirmation list).
    #[test]
    #[cfg(windows)]
    fn ac751_fs_list_dir_on_a_file_returns_not_a_directory_not_other() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file_path = dir.path().join("x.txt");
        std::fs::write(&file_path, b"hello").expect("write test file");

        let err = fs_list_dir(
            file_path.to_string_lossy().into_owned(),
            false,
            "name".to_string(),
            "asc".to_string(),
        )
        .expect_err("fs_list_dir on a FILE must fail (R-725)");

        assert_eq!(err.code, "not_a_directory", "got {err:?} (must not be \"other\")");
    }

    // AC-751 companion: a path that does not exist at all is still
    // `not_found` (distinct from `not_a_directory`), confirming the new code
    // does not accidentally swallow the existing not-found case.
    #[test]
    fn ac751_fs_list_dir_on_a_missing_path_still_returns_not_found() {
        let dir = tempfile::tempdir().expect("tempdir");
        let missing = dir.path().join("does-not-exist-9271");

        let err = fs_list_dir(missing.to_string_lossy().into_owned(), false, "name".to_string(), "asc".to_string())
            .expect_err("a missing path must fail");

        assert_eq!(err.code, "not_found");
    }

    // camelCase DTO on the wire (shared/ipc/fs.ts's FsListDirError).
    #[test]
    fn dto_serializes_with_camel_case_keys_unchanged() {
        let dto = FsListDirErrorDto { code: "access_denied".into(), message: "x".into() };
        // `code`/`message` have no underscores to rename, but this pins the
        // struct-level `rename_all` doesn't accidentally rename `code` itself.
        let s = toml::to_string(&dto).expect("serialize");
        assert!(s.contains("code"));
        assert!(s.contains("message"));
    }
}
