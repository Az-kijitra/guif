//! Writing `config.sample.toml` at start-up WITHOUT delaying the first list (SPEC-0300-0022 R-1621 (start-up part) / R-1623 /
//! R-1653, AC-1620 / AC-1621 / AC-1624; SPEC-0200-0001 §3.17.3).
//!
//! `lib.rs` calls `start` after the main window is shown. The write runs on its own thread; a failure is ONE line on standard
//! error -- no notice, no panic, no stop of the start-up (R-1623). `config.toml` is never created here (R-1644 / AC-1645).

use std::io;
use std::path::{Path, PathBuf};
use std::thread::{self, JoinHandle};

use tauri::{AppHandle, Manager};

use crate::config::atomic::atomic_write;
use crate::config::startup_config::locate;
use crate::settings_file::sample::{write_sample_if_stale, SettingsFileLock};
use crate::settings_file::source::{render, Kind};

/// The folder is the parent of the resolved `config.toml` path; the contents are the sample of this app version. Returns at once.
pub fn start(app: AppHandle) {
    let Some(dir) = locate(&app).ok().and_then(|config| config.parent().map(Path::to_path_buf)) else {
        eprintln!("config.sample.toml was not written: the settings folder cannot be determined");
        return;
    };
    let contents = render(Kind::Sample, env!("CARGO_PKG_VERSION"));
    // Shares the lock with "設定ファイルを開く" (the same temporary file); `start_with` needs `'static`, so the handle moves in.
    start_with(dir, contents, move |dir, contents| {
        let lock = app.state::<SettingsFileLock>();
        let _guard = lock.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        write_sample_if_stale(dir, contents, &atomic_write).map(|_| ())
    });
}

/// The seam (the writer is an argument, so a test can delay it): ONE thread calls `write(&dir, &contents)`; its handle is returned
/// at once. An error of `write` becomes a log line (R-1623).
pub fn start_with(
    dir: PathBuf,
    contents: String,
    write: impl FnOnce(&Path, &str) -> io::Result<()> + Send + 'static,
) -> JoinHandle<()> {
    thread::spawn(move || {
        if let Err(e) = write(&dir, &contents) {
            eprintln!("config.sample.toml was not written: {e}");
        }
    })
}
