//! TDD (unit-test-writer, 2026-10-20): `settings_file/sample.rs` -- write `config.sample.toml` only when it is missing or differs
//! byte for byte (SPEC-0300-0022 R-1620 / R-1621 / R-1622 / R-1623 / R-1614, AC-1620 / AC-1621 / AC-1622;
//! SPEC-0200-0001 §3.17.3, §3.17.4 (3)).
//!
//! ```ignore
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum SampleWrite { Unchanged, Written }
//! pub fn write_sample_if_stale(dir: &Path, contents: &str,
//!                              write: &dyn Fn(&Path, &str) -> io::Result<()>) -> io::Result<SampleWrite>;
//! #[derive(Default)] pub struct SettingsFileLock(pub std::sync::Mutex<()>);
//! ```
//! The target is `dir.join(source::SAMPLE_FILE)` (never `config.toml`, whose path this function does not even receive). `write` is the
//! atomic writer (`config::atomic::atomic_write`, injected by `config_bridge`; its temporary name is `<target>.tmp` =
//! `config.sample.toml.tmp`, which does not start with `config.toml`). Equal bytes => `write` is not called (mtime untouched).

use std::cell::RefCell;
use std::fs;
use std::io;
use std::path::PathBuf;

use super::sample::{write_sample_if_stale, SampleWrite, SettingsFileLock};
use super::source::SAMPLE_FILE;
use crate::config::atomic::atomic_write;

const BODY: &str = "## このファイルは見本です。\r\n# ui_theme = \"system\"\r\n";

// AC-1620 (i): no sample => written once, to `<dir>/config.sample.toml`, with the contents.
#[test]
fn ac1620_a_missing_sample_is_written_to_the_sample_path() {
    let dir = tempfile::tempdir().unwrap();
    let calls: RefCell<Vec<(PathBuf, String)>> = RefCell::new(Vec::new());
    let r = write_sample_if_stale(dir.path(), BODY, &|p, c| {
        calls.borrow_mut().push((p.to_path_buf(), c.to_string()));
        Ok(())
    });
    assert_eq!(r.unwrap(), SampleWrite::Written);
    assert_eq!(calls.into_inner(), vec![(dir.path().join("config.sample.toml"), BODY.to_string())]);
}

// AC-1620 (ii) / R-1621: the same bytes => not written, and the modification time is the same afterwards (with the real writer).
#[test]
fn ac1620_the_same_content_is_not_written_and_the_mtime_stays() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SAMPLE_FILE);
    fs::write(&path, BODY).unwrap();
    let mtime = fs::metadata(&path).unwrap().modified().unwrap();
    let r = write_sample_if_stale(dir.path(), BODY, &atomic_write);
    assert_eq!(r.unwrap(), SampleWrite::Unchanged);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
}

#[test]
fn ac1620_the_write_function_is_not_even_called_for_equal_content() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(SAMPLE_FILE), BODY).unwrap();
    let r = write_sample_if_stale(dir.path(), BODY, &|_, _| panic!("must not be called"));
    assert_eq!(r.unwrap(), SampleWrite::Unchanged);
}

// AC-1620 (iii): different content (the user edited it, or an older version) => replaced by the original.
#[test]
fn ac1620_different_content_is_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SAMPLE_FILE);
    fs::write(&path, "ui_theme = \"dark\"\n").unwrap();
    assert_eq!(write_sample_if_stale(dir.path(), BODY, &atomic_write).unwrap(), SampleWrite::Written);
    assert_eq!(fs::read_to_string(&path).unwrap(), BODY);
}

// R-1621 "バイト単位": an LF-only copy of the same text is different, a trailing-newline difference is different.
#[test]
fn r1621_the_comparison_is_by_bytes_not_by_line_endings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SAMPLE_FILE);
    fs::write(&path, BODY.replace("\r\n", "\n")).unwrap();
    assert_eq!(write_sample_if_stale(dir.path(), BODY, &atomic_write).unwrap(), SampleWrite::Written);
    fs::write(&path, BODY.trim_end()).unwrap();
    assert_eq!(write_sample_if_stale(dir.path(), BODY, &atomic_write).unwrap(), SampleWrite::Written);
    // a file that is not UTF-8 is simply different
    fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();
    assert_eq!(write_sample_if_stale(dir.path(), BODY, &atomic_write).unwrap(), SampleWrite::Written);
    assert_eq!(fs::read_to_string(&path).unwrap(), BODY);
}

// AC-1621 / R-1623: a folder where the sample should be => an error (the caller turns it into W-A8 / stderr), the folder survives.
#[test]
fn ac1621_a_folder_at_the_sample_path_is_an_error_and_is_left_alone() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SAMPLE_FILE);
    fs::create_dir(&path).unwrap();
    assert!(write_sample_if_stale(dir.path(), BODY, &atomic_write).is_err());
    assert!(path.is_dir());
}

#[test]
fn r1623_an_error_of_the_writer_is_returned_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let err = write_sample_if_stale(dir.path(), BODY, &|_, _| Err(io::Error::from_raw_os_error(5))).unwrap_err();
    assert_eq!(err.raw_os_error(), Some(5), "the OS wording must reach W-A8 '詳細:' as it is");
}

// AC-1622 / R-1614: nothing else is created and no name starts with `config.toml`; a neighbouring config.toml is never touched.
#[test]
fn ac1622_only_the_sample_appears_and_config_toml_is_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.toml");
    fs::write(&config, b"ui_theme = \"dark\"\n").unwrap();
    let mtime = fs::metadata(&config).unwrap().modified().unwrap();
    write_sample_if_stale(dir.path(), BODY, &atomic_write).unwrap();
    let mut names: Vec<String> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    assert_eq!(names, vec!["config.sample.toml", "config.toml"], "no leftover temporary file");
    assert_eq!(fs::read(&config).unwrap(), b"ui_theme = \"dark\"\n");
    assert_eq!(fs::metadata(&config).unwrap().modified().unwrap(), mtime);
}

// AC-1622: the temporary name the atomic writer uses (`<target>.tmp`) does not begin with `config.toml` (theme.mjs checkConfigUntouched).
#[test]
fn ac1622_the_temporary_name_does_not_start_with_config_toml() {
    let tmp_name = format!("{SAMPLE_FILE}.tmp");
    assert!(!tmp_name.starts_with("config.toml"), "{tmp_name}");
    assert_ne!(SAMPLE_FILE, "config.toml");
}

// The lock exists, is a plain `Mutex<()>` and is usable as a Tauri managed state (Default + Send + Sync).
#[test]
fn the_settings_file_lock_is_a_default_mutex() {
    fn assert_state<T: Default + Send + Sync + 'static>() {}
    assert_state::<SettingsFileLock>();
    let lock = SettingsFileLock::default();
    drop(lock.0.lock().unwrap());
}
