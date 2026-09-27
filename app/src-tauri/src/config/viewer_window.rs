//! `viewer-window.toml` load/save (SPEC-0300-0015 R-424, R-424-2, R-424-6,
//! R-425; SPEC-0200-0001 §3.5.12.1, §3.5.12.10 SHOULD-104/112). Planned API
//! (not yet implemented, TDD):
//!
//! ```ignore
//! pub fn load(path: &Path) -> ViewerWindowData;         // R-424-6: never Err
//! pub fn save(path: &Path, data: &ViewerWindowData) -> io::Result<()>;
//! ```
//! `load`: missing file OR non-UTF-8 OR invalid TOML => `ViewerWindowData::default()`
//! (R-424-2's *size*; the caller applies R-424-2's monitor-centered position on
//! top, since this module has no monitor info); invalid TOML additionally
//! renames the corrupt file to `<path>.toml.bak` (overwriting, same as
//! `config::navigation`), never notifying the user (R-424-6). `save` uses
//! `config::atomic::atomic_write` (same as `config::navigation::save`).
//!
//! `viewer/window.rs` never imports this module directly (§4.2/§3.5.12.1
//! MUST-73): `app/` (`lib.rs`) binds `load`/`save` as CLOSURES (closing over
//! an `Arc<ViewerWindowIoLock>`, below) into a `viewer::window::ViewerWindowIo`
//! it `.manage()`s.

use std::fs;
use std::io;
use std::path::Path;
use std::sync::Mutex;

use crate::shared::schema::viewer_window::ViewerWindowData;

/// R-424-6: never `Err`. Missing file, non-UTF-8, or invalid TOML all yield
/// `ViewerWindowData::default()`; invalid TOML/non-UTF-8 additionally renames
/// the corrupt file to `<path>.toml.bak` (overwriting), never notifying the
/// user.
pub fn load(path: &Path) -> ViewerWindowData {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => return ViewerWindowData::default(),
    };
    let parsed = String::from_utf8(bytes).ok().and_then(|s| toml::from_str::<ViewerWindowData>(&s).ok());
    match parsed {
        Some(data) => data,
        None => {
            let backup_path = path.with_extension("toml.bak");
            let _ = fs::rename(path, &backup_path);
            ViewerWindowData::default()
        }
    }
}

pub fn save(path: &Path, data: &ViewerWindowData) -> io::Result<()> {
    let serialized = toml::to_string_pretty(data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    crate::config::atomic::atomic_write(path, &serialized)
}

/// SHOULD-104/112: serializes `viewer-window.toml` load/save, same idea as
/// `config::commands::NavigationIoLock`. Lives here (not in `viewer/`) because
/// `viewer/` may not depend on `config` directly (§4.2); `app/` `.manage()`s
/// this and the injected `load`/`save` fn values close over it.
#[derive(Default)]
pub struct ViewerWindowIoLock(pub Mutex<()>);

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // R-424-6/AC-441 (i): missing file is normal: the fixed-size default, no
    // panic, no backup file created.
    #[test]
    fn missing_file_returns_the_default_without_a_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("viewer-window.toml");

        let data = load(&path);

        assert_eq!(data, ViewerWindowData::default());
        assert!(!dir.path().join("viewer-window.toml.bak").exists());
    }

    // R-425: save then load round-trips every field.
    #[test]
    fn save_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("viewer-window.toml");
        let data = ViewerWindowData { x: 10, y: 20, width: 900, height: 700, maximized: true };

        save(&path, &data).expect("save");
        let loaded = load(&path);

        assert_eq!(loaded, data);
    }

    // R-425: exactly one file, no leftover `.tmp` (atomic_write's contract).
    #[test]
    fn save_produces_a_single_file_and_no_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("viewer-window.toml");
        save(&path, &ViewerWindowData::default()).expect("save");
        let count = fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(count, 1);
        assert!(!dir.path().join("viewer-window.toml.tmp").exists());
    }

    // AC-441 (ii): corrupt TOML is moved to `.bak` and the default is used,
    // never Err and never a panic (R-424-6: no notification either, which
    // this pure-logic test cannot observe directly, but the recovered value
    // must be usable).
    #[test]
    fn invalid_toml_is_backed_up_and_the_default_is_returned() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("viewer-window.toml");
        let bad = "this is = = not toml [[[";
        fs::write(&path, bad).unwrap();

        let data = load(&path);

        assert_eq!(data, ViewerWindowData::default());
        assert_eq!(fs::read_to_string(dir.path().join("viewer-window.toml.bak")).unwrap(), bad);
        assert!(!path.exists(), "the corrupt original must no longer sit at the load path");
    }

    // Non-UTF-8 bytes are a parse failure too (same MUST-48(a) rule as navigation.rs).
    #[test]
    fn non_utf8_bytes_are_backed_up_like_invalid_toml() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("viewer-window.toml");
        let bytes: Vec<u8> = vec![0xff, 0xfe, 0x00, 0xc3, 0x28, 0xa0, 0xa1];
        fs::write(&path, &bytes).unwrap();

        let data = load(&path);

        assert_eq!(data, ViewerWindowData::default());
        assert_eq!(fs::read(dir.path().join("viewer-window.toml.bak")).unwrap(), bytes);
    }

    // AC-441 (iii): a save that cannot write (parent directory missing) fails
    // loudly (`Err`) rather than silently -- the CALLER (viewer::window) is
    // responsible for swallowing it per R-424-6 ("closing still succeeds").
    #[test]
    fn save_failure_is_surfaced_as_err_not_swallowed_here() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("no_such_dir").join("viewer-window.toml");
        assert!(save(&path, &ViewerWindowData::default()).is_err());
    }

    // §3.2.2 precedent: an existing `.bak` is overwritten by a newer corruption.
    #[test]
    fn existing_bak_is_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("viewer-window.toml");
        fs::write(dir.path().join("viewer-window.toml.bak"), "older").unwrap();
        fs::write(&path, "newer [[[").unwrap();

        load(&path);

        assert_eq!(fs::read_to_string(dir.path().join("viewer-window.toml.bak")).unwrap(), "newer [[[");
    }
}
