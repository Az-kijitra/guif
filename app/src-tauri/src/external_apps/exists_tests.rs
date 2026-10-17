//! TDD (unit-test-writer, 2026-10-17): `external_apps/exists.rs` -- "is there a file here?" for the executable lookup
//! and the target check.
//! Specs: SPEC-0300-0021 R-1540 2 (a file is used; a folder at that path = "not found"; **an app-execution-alias reparse
//! point is "a file" without following its link**, D-03; spike S-1: the alias `wt.exe` answers `symlink_metadata` AND `metadata`
//! with attributes `0x420`, `is_file`), R-1540 note (Q-7: a symlink without a link target is NOT special-cased -> "a file"; the
//! OS error comes at launch time as W-97), R-1536 + D-05 (a junction / symlink is judged by what it points at), AC-1520 (iii);
//! SPEC-0200-0001 §3.16.2 (`exists.rs`: pure `classify` + `probe`, no `unsafe`, `std::os::windows::fs::MetadataExt`).
//!
//! Contract the implementer must satisfy (module `external_apps::exists`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod exists_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, Copy, PartialEq, Eq)] pub enum Probe { File, Dir, Missing }
//! /// `attrs` = `symlink_metadata(path).file_attributes()` (the call SUCCEEDED); `followed` = the result of `metadata(path)`
//! /// (the link-following call): `Some(is_dir)` when it succeeded, `None` when it failed.
//! pub fn classify(attrs: u32, followed: Option<bool>) -> Probe;
//! pub fn probe(path: &std::path::Path) -> Probe;   // the real thing: symlink_metadata + metadata + classify; any error = Missing
//! ```
//!
//! No test launches a program. The only machine-specific test only STATS the app-execution-alias `wt.exe` when it exists.

use std::fs;
use std::path::{Path, PathBuf};

use super::exists::{classify, probe, Probe};

const DIRECTORY: u32 = 0x10;
const ARCHIVE: u32 = 0x20;
const REPARSE_POINT: u32 = 0x400;

// ------------------------------------------------------------------ classify (pure; AC-1520 (iii))

#[test]
fn a_plain_file_and_a_plain_folder() {
    assert_eq!(classify(ARCHIVE, Some(false)), Probe::File);
    assert_eq!(classify(0x80, Some(false)), Probe::File, "FILE_ATTRIBUTE_NORMAL");
    assert_eq!(classify(DIRECTORY, Some(true)), Probe::Dir);
}

#[test]
fn the_alias_attributes_of_spike_s1_are_a_file_in_both_ways() {
    // S-1: symlink_metadata AND metadata succeeded, attributes 0x420, is_file.
    assert_eq!(classify(ARCHIVE | REPARSE_POINT, Some(false)), Probe::File);
    // M-2: where following the link FAILS (or is not allowed), the alias is still "a file" without following it.
    assert_eq!(classify(ARCHIVE | REPARSE_POINT, None), Probe::File);
    assert_eq!(classify(REPARSE_POINT, None), Probe::File, "a reparse point that is not a directory");
}

#[test]
fn a_followed_link_is_judged_by_what_it_points_at() {
    assert_eq!(classify(DIRECTORY | REPARSE_POINT, Some(true)), Probe::Dir, "a junction to a folder");
    assert_eq!(classify(ARCHIVE | REPARSE_POINT, Some(true)), Probe::Dir, "a symlink that points at a folder");
    assert_eq!(classify(ARCHIVE | REPARSE_POINT, Some(false)), Probe::File, "a symlink that points at a file");
}

#[test]
fn a_broken_folder_link_is_missing_not_a_file() {
    assert_eq!(classify(DIRECTORY | REPARSE_POINT, None), Probe::Missing, "a junction whose target is gone");
}

#[test]
fn a_failed_follow_without_a_reparse_point_is_missing() {
    assert_eq!(classify(ARCHIVE, None), Probe::Missing);
    assert_eq!(classify(DIRECTORY, None), Probe::Missing);
}

// ------------------------------------------------------------------ probe (the real file system)

fn dir_link(link: &Path, target: &Path) -> bool {
    std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn skip(reason: &str) {
    eprintln!("SKIP: {reason}");
}

fn temp() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir");
    // Long-name form without the verbatim prefix (`cmd /C mklink` does not take `\\?\` paths).
    let canonical = fs::canonicalize(dir.path()).expect("canonicalize");
    let text = canonical.to_string_lossy().to_string();
    let root = PathBuf::from(text.strip_prefix(r"\\?\").filter(|rest| rest.as_bytes().get(1) == Some(&b':')).unwrap_or(&text));
    (dir, root)
}

#[test]
fn probe_tells_a_file_a_folder_and_nothing() {
    let (_d, root) = temp();
    fs::write(root.join("a b.exe"), b"MZ").unwrap();
    fs::create_dir(root.join("sub")).unwrap();
    assert_eq!(probe(&root.join("a b.exe")), Probe::File);
    assert_eq!(probe(&root.join("sub")), Probe::Dir);
    assert_eq!(probe(&root.join("missing.exe")), Probe::Missing);
    assert_eq!(probe(&root.join("a b.exe").join("below")), Probe::Missing, "a path below a file");
}

#[test]
fn probe_is_not_cached_a_file_created_later_is_found() {
    // R-1542 / AC-1529: the existence is asked at every launch.
    let (_d, root) = temp();
    let late = root.join("late.exe");
    assert_eq!(probe(&late), Probe::Missing);
    fs::write(&late, b"MZ").unwrap();
    assert_eq!(probe(&late), Probe::File);
    fs::remove_file(&late).unwrap();
    assert_eq!(probe(&late), Probe::Missing);
}

#[test]
fn probe_follows_a_junction_to_a_folder_and_a_broken_junction_is_missing() {
    let (_d, root) = temp();
    let target = root.join("real");
    fs::create_dir(&target).unwrap();
    let link = root.join("link");
    if !dir_link(&link, &target) {
        return skip("cannot create a junction here (mklink /J failed)");
    }
    assert_eq!(probe(&link), Probe::Dir, "AC-1516: a junction to a folder is a folder");
    fs::remove_dir(&target).unwrap();
    assert_eq!(probe(&link), Probe::Missing, "the junction's target is gone");
    let _ = fs::remove_dir(&link);
}

#[test]
fn probe_a_file_symlink_follows_to_a_file_and_a_broken_one_stays_a_file_q7() {
    let (_d, root) = temp();
    let target = root.join("real.exe");
    fs::write(&target, b"MZ").unwrap();
    let link = root.join("link.exe");
    if std::os::windows::fs::symlink_file(&target, &link).is_err() {
        return skip("cannot create a file symlink here (no privilege / developer mode)");
    }
    assert_eq!(probe(&link), Probe::File);
    fs::remove_file(&target).unwrap();
    // Q-7: a symlink without a link target is not special-cased: it counts as "a file" and the OS error comes at launch.
    assert_eq!(probe(&link), Probe::File);
    let _ = fs::remove_file(&link);
}

/// Spike S-1 on THIS machine, read-only (a stat; nothing is launched): the app-execution alias is "a file".
#[test]
fn the_app_execution_alias_wt_exe_is_a_file_when_it_exists_here() {
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return skip("LOCALAPPDATA is not set") };
    let alias = PathBuf::from(local).join("Microsoft").join("WindowsApps").join("wt.exe");
    if fs::symlink_metadata(&alias).is_err() {
        return skip("no wt.exe app-execution alias on this machine");
    }
    assert_eq!(probe(&alias), Probe::File, "R-1540 2 / D-03 / spike S-1");
}
