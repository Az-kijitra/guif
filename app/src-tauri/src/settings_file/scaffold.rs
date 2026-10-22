//! THE one writer of `config.toml` (SPEC-0300-0022 R-1601 / R-1610 / R-1613 / R-1614; SPEC-0200-0001 §3.17.4, MUST-92 as rewritten
//! by H-1): it creates the file only when NOTHING is at the path, with a create-new open, so that an existing file -- whatever it
//! holds, a folder or a link included -- is never opened for writing, truncated, replaced, renamed or removed.
//!
//! There is no other file-opening call with write access in this file (a structure test scans for them); the one removal is in the
//! failure branch and removes the file THIS call created and nothing else.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scaffold {
    /// Something was already at the path (it is untouched).
    Existing,
    /// This call created the file.
    Created,
}

/// R-1610: creates `path` with exactly `contents` (verbatim bytes, flushed) unless something is there.
pub fn create_template_if_missing(path: &Path, contents: &str) -> io::Result<Scaffold> {
    create_template_with(path, contents, &|file, bytes| {
        file.write_all(bytes)?;
        file.sync_all()
    })
}

/// The same with the body write injected (the seam for "the write fails half-way", AC-1607).
pub fn create_template_with(path: &Path, contents: &str, write: &dyn Fn(&mut File, &[u8]) -> io::Result<()>) -> io::Result<Scaffold> {
    // R-1601: ANYTHING at the path (a file, a folder, a link, a dangling link) counts as "there".
    if fs::symlink_metadata(path).is_ok() {
        return Ok(Scaffold::Existing);
    }
    // R-1610: create-new, so a file another process created since the check is never overwritten (it is "there" too).
    let mut file = match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => return Ok(Scaffold::Existing),
        Err(e) => return Err(e),
    };
    if let Err(e) = write(&mut file, contents.as_bytes()) {
        // R-1613: no half-written file is left; only the file created just above is removed.
        drop(file);
        let _ = fs::remove_file(path);
        return Err(e);
    }
    Ok(Scaffold::Created)
}
