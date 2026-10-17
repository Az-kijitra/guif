//! The launch target, `{dir}` of a file, and the pre-launch check (SPEC-0300-0021 R-1525 / R-1536 / D-05;
//! SPEC-0200-0001 §3.16.2).

use std::path::Path;

use serde::Deserialize;

use super::exists::{probe, Probe};

/// What the target is, as the screen decided it (the wire form is `"file"` / `"dir"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    File,
    Dir,
}

/// `path` is passed to the program exactly as the file list holds it (R-1525).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub path: String,
    pub kind: Kind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetMissing;

/// R-1525: the file's folder = the path without its last `\` and what follows. A drive-only result (`C:`) becomes `C:\`; the top
/// of a UNC share (`\\server\share`) becomes `\\server\share\`.
pub fn dir_of(file_path: &str) -> String {
    let Some(cut) = file_path.rfind('\\') else { return file_path.to_string() };
    let dir = &file_path[..cut];
    // `C:` and the verbatim form `\\?\C:` are both a bare drive, which is not a usable working folder without the `\`.
    let bare_drive = dir.strip_prefix(r"\\?\").unwrap_or(dir);
    let drive_only = bare_drive.len() == 2 && bare_drive.ends_with(':');
    let share_top = dir.strip_prefix(r"\\").is_some_and(|rest| rest.matches('\\').count() == 1);
    if drive_only || share_top {
        format!("{dir}\\")
    } else {
        dir.to_string()
    }
}

/// R-1536: the target must still exist with the same kind as when it was decided. The kind is judged like the file list does
/// (a junction / symlink by what it points at). Touches the file system.
pub fn verify(target: &Target) -> Result<(), TargetMissing> {
    let path = Path::new(&target.path);
    // A target is judged by what it points at: a link that cannot be followed (a broken link) is missing (SPEC-0300-0021 R-1536 / AC-1516).
    // (A broken link as the EXECUTABLE is different: it is "a file" and the OS answers at launch, Q-7.)
    if std::fs::metadata(path).is_err() {
        return Err(TargetMissing);
    }
    match (probe(path), target.kind) {
        (Probe::File, Kind::File) | (Probe::Dir, Kind::Dir) => Ok(()),
        _ => Err(TargetMissing),
    }
}
