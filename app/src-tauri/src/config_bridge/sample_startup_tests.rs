//! TDD (unit-test-writer, 2026-10-20): `config_bridge/sample_startup.rs` -- writing the sample at start-up WITHOUT delaying the first
//! list (SPEC-0300-0022 R-1621 (start-up part) / R-1623 / R-1653, AC-1620 / AC-1621 / AC-1624; SPEC-0200-0001 §3.17.3).
//!
//! ```ignore
//! /// `lib.rs` calls this after `main.show()`: folder = parent of `config::startup_config::locate(&app)`, contents =
//! /// `source::render(Kind::Sample, env!("CARGO_PKG_VERSION"))`, writer = `write_sample_if_stale(.., &config::atomic::atomic_write)`
//! /// under `SettingsFileLock`. Returns at once. A failure is ONE `eprintln!` line, never a notice, never a panic (R-1623).
//! pub fn start(app: AppHandle);
//! /// The seam (the writer is an argument, so a test can delay it): spawns ONE thread that calls `write(&dir, &contents)` and
//! /// returns its handle immediately.
//! pub fn start_with(dir: PathBuf, contents: String,
//!                   write: impl FnOnce(&Path, &str) -> io::Result<()> + Send + 'static) -> std::thread::JoinHandle<()>;
//! ```

use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};

use super::sample_startup::start_with;
use crate::config::atomic::atomic_write;
use crate::settings_file::sample::write_sample_if_stale;

// AC-1624: `start_with` returns BEFORE the (delayed) writer has finished -- the first list is not waiting for the sample.
#[test]
fn ac1624_start_returns_before_a_delayed_writer_finishes() {
    let (release, gate) = mpsc::channel::<()>();
    let done = Arc::new(AtomicBool::new(false));
    let done_in_thread = done.clone();
    let handle = start_with("C:\\x".into(), "body".into(), move |_, _| {
        gate.recv().unwrap();
        done_in_thread.store(true, Ordering::SeqCst);
        Ok(())
    });
    assert!(!done.load(Ordering::SeqCst), "the caller got control back while the writer is still blocked");
    release.send(()).unwrap();
    handle.join().unwrap();
    assert!(done.load(Ordering::SeqCst), "the writer ran to the end on its own thread");
}

// AC-1620 (i): with the real writer the sample appears in the folder.
#[test]
fn ac1620_the_sample_is_written_in_the_background_with_the_real_writer() {
    let dir = tempfile::tempdir().unwrap();
    let handle = start_with(dir.path().to_path_buf(), "# sample\r\n".into(), |d: &Path, c: &str| write_sample_if_stale(d, c, &atomic_write).map(|_| ()));
    handle.join().unwrap();
    assert_eq!(std::fs::read_to_string(dir.path().join("config.sample.toml")).unwrap(), "# sample\r\n");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1, "R-1645: config.toml is NOT created at start-up (AC-1645)");
}

// R-1623 / AC-1621: a failing writer (a folder in the way) neither panics the thread nor stops anything.
#[test]
fn r1623_a_writer_error_is_swallowed_into_a_log_line_not_a_panic() {
    let handle = start_with("C:\\x".into(), "body".into(), |_, _| Err(io::Error::other("a folder is in the way")));
    assert!(handle.join().is_ok(), "the thread ends normally");
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir(dir.path().join("config.sample.toml")).unwrap();
    let handle = start_with(dir.path().to_path_buf(), "x".into(), |d: &Path, c: &str| write_sample_if_stale(d, c, &atomic_write).map(|_| ()));
    assert!(handle.join().is_ok());
    assert!(dir.path().join("config.sample.toml").is_dir());
}

// The writer receives the folder and the contents it was started with, exactly once.
#[test]
fn the_writer_gets_the_folder_and_the_contents_once() {
    let (tx, rx) = mpsc::channel();
    start_with("D:\\cfg".into(), "BODY".into(), move |d, c| {
        tx.send((d.to_path_buf(), c.to_string())).unwrap();
        Ok(())
    })
    .join()
    .unwrap();
    assert_eq!(rx.try_recv().unwrap(), (std::path::PathBuf::from("D:\\cfg"), "BODY".to_string()));
    assert!(rx.try_recv().is_err());
}
