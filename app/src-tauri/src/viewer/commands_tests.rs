//! TDD (unit-test-writer, 2026-09-27): the caller-window guard shared by all
//! seven viewer commands.
//!
//! Specs: SPEC-0300-0015 R-432-3 (main-only: `viewer_classify_path`,
//! `viewer_open`, `viewer_os_open_path`), R-432-4 (viewer-only:
//! `viewer_take_pending`, `viewer_read_text`, `viewer_read_image`,
//! `viewer_navigate`), R-405-3 (the OS-association launch command is
//! main-only too); AC-405-3, AC-443-1.

use super::commands::*;
use super::error::ViewerErrorCode;

#[test]
fn ac443_1_a_main_only_command_called_from_main_is_allowed() {
    assert!(check_caller_window("main", "main").is_ok());
}

#[test]
fn ac443_1_a_main_only_command_called_from_the_viewer_window_is_rejected() {
    let err = check_caller_window("viewer", "main").expect_err("must reject");
    assert_eq!(err, ViewerErrorCode::ViewerPathNotAllowed);
}

#[test]
fn ac443_1_a_viewer_only_command_called_from_viewer_is_allowed() {
    assert!(check_caller_window("viewer", "viewer").is_ok());
}

#[test]
fn ac443_1_a_viewer_only_command_called_from_main_is_rejected() {
    let err = check_caller_window("main", "viewer").expect_err("must reject");
    assert_eq!(err, ViewerErrorCode::ViewerPathNotAllowed);
}

#[test]
fn a_third_unexpected_window_label_is_rejected_either_way() {
    assert!(check_caller_window("some-other-window", "main").is_err());
    assert!(check_caller_window("some-other-window", "viewer").is_err());
}
