//! TDD (unit-test-writer, 2026-09-27): the pre-flight validation shared by
//! the OS-association launch command (R-405-2) and by `viewer_open` (R-440) —
//! same error codes, same rules (not_found / not_a_file / permission_denied).
//!
//! Specs: SPEC-0300-0015 R-405-2, R-440; AC-405-3, AC-450.

use super::error::ViewerErrorCode;
use super::os_open::*;
use std::fs;

#[test]
fn a_regular_existing_file_validates_to_its_canonicalized_path() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.txt");
    fs::write(&path, b"x").unwrap();

    let resolved = validate_target_path(&path).expect("must validate");
    assert_eq!(resolved, fs::canonicalize(&path).unwrap());
}

#[test]
fn ac405_3_a_missing_path_is_not_found() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("nope.txt");
    let err = validate_target_path(&missing).expect_err("must reject");
    assert_eq!(err, ViewerErrorCode::NotFound);
}

#[test]
fn ac405_3_a_directory_is_not_a_file() {
    let dir = tempfile::tempdir().unwrap();
    let err = validate_target_path(dir.path()).expect_err("must reject");
    assert_eq!(err, ViewerErrorCode::NotAFile);
}

#[test]
fn r405_4_an_executable_extension_is_not_special_cased_a_regular_exe_file_validates_fine() {
    // R-405-4: `.exe`/`.msi`/etc. are launched exactly like any other file,
    // no extra confirmation step -- there is nothing exe-specific to reject
    // at the validation layer.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("setup.exe");
    fs::write(&path, b"MZ").unwrap();
    assert!(validate_target_path(&path).is_ok());
}
