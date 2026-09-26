//! Entity-identity helpers for copy/move/overwrite (SPEC-0300-0011 R-25,
//! R-37, R-37-1, R-37-2; SPEC-0200-0001 §3.3.13-2, MUST-59).
//!
//! Comparing paths as strings (`==`, `starts_with`) misses aliases of the same
//! entity: letter case on Windows, junctions/symlinks, verbatim (`\\?\`)
//! spellings, 8.3 short names. Identity is therefore decided on
//! `std::fs::canonicalize` results (or, when a path cannot be canonicalized,
//! on the file ID `(dev, ino)` where the platform exposes it on stable Rust).
//!
//! Every function returns `Option<bool>`: `None` means "identity could not
//! be determined". Callers on a destructive path (overwrite) must treat
//! `None` as "do not overwrite".

use std::fs;
use std::path::Path;

#[cfg(unix)]
fn file_id(path: &Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    fs::metadata(path).ok().map(|m| (m.dev(), m.ino()))
}

// There is no stable std API for the Windows file index; canonicalize is the
// only identity source there.
#[cfg(not(unix))]
fn file_id(_path: &Path) -> Option<(u64, u64)> {
    None
}

/// `Some(true)` when `a` and `b` are the very same filesystem entity.
pub(crate) fn same_entity(a: &Path, b: &Path) -> Option<bool> {
    if let (Ok(ca), Ok(cb)) = (fs::canonicalize(a), fs::canonicalize(b)) {
        return Some(ca == cb);
    }
    match (file_id(a), file_id(b)) {
        (Some(ia), Some(ib)) => Some(ia == ib),
        _ => None,
    }
}

/// `Some(true)` when `inner` lies strictly beneath `outer` (component-wise on
/// canonical paths, so `parent2` is not beneath `parent`). Equal entities are
/// `Some(false)`; use `same_entity` for those.
pub(crate) fn is_strictly_within(outer: &Path, inner: &Path) -> Option<bool> {
    let co = fs::canonicalize(outer).ok()?;
    let ci = fs::canonicalize(inner).ok()?;
    Some(ci != co && ci.starts_with(&co))
}
