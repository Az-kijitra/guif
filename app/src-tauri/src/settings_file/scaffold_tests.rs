//! TDD (unit-test-writer, 2026-10-20): `settings_file/scaffold.rs` -- THE one writer of `config.toml`: create it only when it is not
//! there (SPEC-0300-0022 R-1601 / R-1610 / R-1612 / R-1613 / R-1614, AC-1600 (file side) / AC-1602 / AC-1607 / AC-1611;
//! SPEC-0200-0001 §3.17.3 / §3.17.4, MUST-92 as rewritten by H-1).
//!
//! ```ignore
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum Scaffold { Existing, Created }
//! pub fn create_template_if_missing(path: &Path, contents: &str) -> io::Result<Scaffold>;
//! /// The same, with the body write injected (the seam for "the write fails half-way", AC-1607). The public one calls it with
//! /// `|file, bytes| { file.write_all(bytes)?; file.sync_all() }`.
//! pub fn create_template_with(path: &Path, contents: &str, write: &dyn Fn(&mut std::fs::File, &[u8]) -> io::Result<()>) -> io::Result<Scaffold>;
//! ```
//! `symlink_metadata` finds ANYTHING at the path (file, folder, link, dangling link) => `Existing`, nothing touched. Otherwise
//! `create_new` (so a file created by someone else in between is `Existing`, never overwritten). A failure after the file was created
//! removes THAT file (only) and returns the error. The parent folder is never created. Bytes are written verbatim (no BOM added,
//! no newline conversion).

use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::{Arc, Barrier};
use std::thread;

use super::scaffold::{create_template_if_missing, create_template_with, Scaffold};

const BODY: &str = "## このファイルは自由に編集できます。\r\n# ui_theme = \"system\"\r\n";

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    v.sort();
    v
}

// R-1610 / R-1611: created with exactly the given bytes (CRLF kept, UTF-8, no BOM added).
#[test]
fn r1610_a_missing_file_is_created_with_exactly_the_given_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    assert_eq!(create_template_if_missing(&path, BODY).unwrap(), Scaffold::Created);
    assert_eq!(fs::read(&path).unwrap(), BODY.as_bytes());
    assert_eq!(names(dir.path()), vec!["config.toml"], "R-1614: no sibling, no temporary file");
}

// AC-1600 (i)-(v) / R-1601: whatever is already there is left alone (content, mtime, attributes).
#[test]
fn ac1600_an_existing_file_is_never_touched_whatever_it_holds() {
    let cases: [(&str, Vec<u8>); 4] = [
        ("comments and good settings", b"# c\nui_theme = \"dark\"\n".to_vec()),
        ("syntax error", b"ui_theme = \"dark\"\nthis is = = not toml\n".to_vec()),
        ("0 bytes", Vec::new()),
        ("BOM", [&[0xEF, 0xBB, 0xBF][..], b"ui_theme = \"dark\"\r\n"].concat()),
    ];
    for (what, bytes) in cases {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        fs::write(&path, &bytes).unwrap();
        let mtime = fs::metadata(&path).unwrap().modified().unwrap();
        assert_eq!(create_template_if_missing(&path, BODY).unwrap(), Scaffold::Existing, "{what}");
        assert_eq!(fs::read(&path).unwrap(), bytes, "{what}");
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime, "{what}: mtime");
        assert_eq!(names(dir.path()), vec!["config.toml"], "{what}");
    }
}

#[test]
fn ac1600_v_a_read_only_file_stays_read_only_and_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, b"ui_theme = \"dark\"\n").unwrap();
    let mut perms = fs::metadata(&path).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&path, perms).unwrap();
    let result = create_template_if_missing(&path, BODY);
    assert_eq!(result.unwrap(), Scaffold::Existing);
    assert!(fs::metadata(&path).unwrap().permissions().readonly(), "the attribute is unchanged");
    assert_eq!(fs::read(&path).unwrap(), b"ui_theme = \"dark\"\n");
    let mut perms = fs::metadata(&path).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    perms.set_readonly(false);
    fs::set_permissions(&path, perms).unwrap();
}

// R-1601 / AC-1611: a folder (or a junction / link) at the path counts as "there": no scaffold, nothing written inside it.
#[test]
fn r1601_a_folder_at_the_path_is_existing_and_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::create_dir(&path).unwrap();
    assert_eq!(create_template_if_missing(&path, BODY).unwrap(), Scaffold::Existing);
    assert!(path.is_dir());
    assert_eq!(fs::read_dir(&path).unwrap().count(), 0);
}

// R-1601 / AC-1611 (iii): a dangling link is "there" as well (`symlink_metadata`, not `exists()`). Skipped when links are not allowed.
#[cfg(windows)]
#[test]
fn r1601_a_dangling_symlink_is_existing_and_not_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    if std::os::windows::fs::symlink_file(dir.path().join("no-such-target.toml"), &path).is_err() {
        eprintln!("SKIP: creating a symlink needs a privilege that is not available");
        return;
    }
    assert_eq!(create_template_if_missing(&path, BODY).unwrap(), Scaffold::Existing);
    assert!(fs::symlink_metadata(&path).unwrap().file_type().is_symlink(), "the link is still the link");
    assert!(!dir.path().join("no-such-target.toml").exists(), "nothing was created through the link");
}

// AC-1602 / R-1610: several creators at once: exactly one wins, the others see `Existing`, the winner's bytes are intact.
#[test]
fn ac1602_concurrent_creators_never_overwrite_each_other() {
    let dir = tempfile::tempdir().unwrap();
    let path = Arc::new(dir.path().join("config.toml"));
    let barrier = Arc::new(Barrier::new(8));
    let handles: Vec<_> = (0..8)
        .map(|i| {
            let (path, barrier) = (path.clone(), barrier.clone());
            thread::spawn(move || {
                let body = format!("# creator {i}\r\n{}", "x".repeat(4096));
                barrier.wait();
                (body.clone(), create_template_if_missing(&path, &body))
            })
        })
        .collect();
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    let winners: Vec<_> = results.iter().filter(|(_, r)| matches!(r, Ok(Scaffold::Created))).collect();
    assert_eq!(winners.len(), 1, "exactly one Created");
    assert!(results.iter().all(|(_, r)| matches!(r, Ok(Scaffold::Created) | Ok(Scaffold::Existing))), "AlreadyExists is mapped to Existing, never an error");
    assert_eq!(fs::read_to_string(&*path).unwrap(), winners[0].0, "the file is exactly the winner's contents");
    assert_eq!(names(dir.path()), vec!["config.toml"]);
}

// AC-1602: the "someone created it between my check and my create" case, made deterministic by the injected write: here the file
// appears before `create_new` can run is not possible to inject, so the observable promise is checked: a pre-existing file wins.
#[test]
fn ac1602_a_file_that_appears_first_is_opened_not_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    fs::write(&path, b"# written by someone else\n").unwrap();
    let called = std::cell::Cell::new(false);
    let r = create_template_with(&path, BODY, &|_, _| {
        called.set(true);
        Ok(())
    });
    assert_eq!(r.unwrap(), Scaffold::Existing);
    assert!(!called.get(), "the write is never even attempted for an existing file");
    assert_eq!(fs::read(&path).unwrap(), b"# written by someone else\n");
}

// AC-1607 / R-1613: a write that fails half-way removes the half-written file and returns the error.
#[test]
fn ac1607_a_failure_during_the_write_leaves_no_half_written_file() {
    let dir = tempfile::tempdir().unwrap();
    let other = dir.path().join("config.sample.toml");
    fs::write(&other, b"sample").unwrap();
    let path = dir.path().join("config.toml");
    let err = create_template_with(&path, BODY, &|file, bytes| {
        file.write_all(&bytes[..bytes.len() / 2])?;
        Err(io::Error::other("disk full"))
    })
    .unwrap_err();
    assert!(err.to_string().contains("disk full"), "the OS-side message is kept for W-A6: {err}");
    assert!(!path.exists(), "no half-written config.toml");
    assert_eq!(names(dir.path()), vec!["config.sample.toml"], "only the file this call created is removed; others are untouched");
    assert_eq!(fs::read(&other).unwrap(), b"sample");
}

// R-1613: a failure to create (the folder is missing) is an error; the folder is not created.
#[test]
fn r1613_a_missing_parent_folder_is_an_error_and_is_not_created() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("no-such-folder").join("config.toml");
    let err = create_template_if_missing(&path, BODY).unwrap_err();
    assert_eq!(err.kind(), io::ErrorKind::NotFound);
    assert!(!dir.path().join("no-such-folder").exists());
}

// The public function writes everything and flushes (a 100 KB body round-trips).
#[test]
fn a_large_body_round_trips() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    let body = "## 説明\r\n".repeat(20_000);
    assert_eq!(create_template_if_missing(&path, &body).unwrap(), Scaffold::Created);
    assert_eq!(fs::read_to_string(&path).unwrap(), body);
}
