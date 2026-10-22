//! `config.sample.toml`: written only when it is missing or differs byte for byte (SPEC-0300-0022 R-1620 / R-1621 / R-1622 / R-1623;
//! SPEC-0200-0001 §3.17.3 / §3.17.4 (3)).
//!
//! This module never receives the settings file's path (only the folder) and names only `SAMPLE_FILE`. The atomic writer
//! (`config::atomic::atomic_write`, whose temporary `<target>.tmp` = `config.sample.toml.tmp` does not start with the settings
//! file's name, R-1614) is injected by `config_bridge/`, because `settings_file/` does not import `config/`.

use std::fs;
use std::io;
use std::path::Path;
use std::sync::Mutex;

use super::source::SAMPLE_FILE;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SampleWrite {
    /// The same bytes were already there: nothing was written (the modification time is unchanged, R-1621).
    Unchanged,
    Written,
}

/// Serializes the start-up sample write and the one of "設定ファイルを開く", which would otherwise race for the same temporary file.
/// `lib.rs` `.manage()`s one instance.
#[derive(Default)]
pub struct SettingsFileLock(pub Mutex<()>);

/// R-1621: compares the bytes of `<dir>/config.sample.toml` with `contents` and calls `write` only when they differ (or the
/// file cannot be read: a folder in its place, non-UTF-8 content ...). An error of `write` is returned unchanged (R-1623).
pub fn write_sample_if_stale(dir: &Path, contents: &str, write: &dyn Fn(&Path, &str) -> io::Result<()>) -> io::Result<SampleWrite> {
    let target = dir.join(SAMPLE_FILE);
    if fs::read(&target).is_ok_and(|current| current == contents.as_bytes()) {
        return Ok(SampleWrite::Unchanged);
    }
    write(&target, contents)?;
    Ok(SampleWrite::Written)
}
