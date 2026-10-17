//! "Is there a file here?" for the executable lookup and the target check (SPEC-0300-0021 R-1540 2, R-1536, D-03, D-05;
//! SPEC-0200-0001 §3.16.2). No unsafe code: the reparse-point bit comes from `std::os::windows::fs::MetadataExt`.
//!
//! An app-execution alias (a reparse point that is not a directory) is "a file" even where following it fails (spike S-1);
//! a junction / symlink is otherwise judged by what it points at. Nothing is cached: every call asks the file system.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Probe {
    File,
    Dir,
    Missing,
}

const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// `attrs` = the attributes from `symlink_metadata` (that call succeeded); `followed` = the link-following `metadata`:
/// `Some(is_dir)` when it succeeded, `None` when it failed.
pub fn classify(attrs: u32, followed: Option<bool>) -> Probe {
    match followed {
        Some(true) => Probe::Dir,
        Some(false) => Probe::File,
        None => {
            let reparse = attrs & FILE_ATTRIBUTE_REPARSE_POINT != 0;
            let directory = attrs & FILE_ATTRIBUTE_DIRECTORY != 0;
            if reparse && !directory {
                Probe::File
            } else {
                Probe::Missing
            }
        }
    }
}

#[cfg(windows)]
pub fn probe(path: &Path) -> Probe {
    use std::os::windows::fs::MetadataExt;
    let Ok(own) = std::fs::symlink_metadata(path) else { return Probe::Missing };
    let followed = std::fs::metadata(path).ok().map(|m| m.is_dir());
    classify(own.file_attributes(), followed)
}

#[cfg(not(windows))]
pub fn probe(path: &Path) -> Probe {
    match std::fs::metadata(path) {
        Ok(m) if m.is_dir() => Probe::Dir,
        Ok(_) => Probe::File,
        Err(_) => Probe::Missing,
    }
}
