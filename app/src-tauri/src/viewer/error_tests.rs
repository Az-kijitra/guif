//! TDD (unit-test-writer, 2026-09-27): the R-440 wire-string table, the
//! `ViewerError` -> `ViewerErrorDto` conversion, and the `io::Error` classifier.
//!
//! Specs: SPEC-0300-0015 R-440, R-447; SPEC-0300-0011 第6版 R-85 (viewer
//! codes: `not_a_file`, `viewer_path_not_allowed`, `viewer_image_too_large`,
//! ISS-0128); AC-450.

use super::error::*;
use std::io;

// R-440: the wire strings match the specified code table exactly.
#[test]
fn r440_wire_strings_match_the_specified_code_table() {
    let expected = [
        (ViewerErrorCode::NotFound, "not_found"),
        (ViewerErrorCode::NotAFile, "not_a_file"),
        (ViewerErrorCode::PermissionDenied, "permission_denied"),
        (ViewerErrorCode::ViewerPathNotAllowed, "viewer_path_not_allowed"),
        (ViewerErrorCode::ViewerImageTooLarge, "viewer_image_too_large"),
        (ViewerErrorCode::IoError, "io_error"),
        (ViewerErrorCode::Unknown, "unknown"),
    ];
    assert_eq!(expected.len(), ViewerErrorCode::ALL.len());
    for (code, wire) in expected {
        assert_eq!(code.as_str(), wire);
    }
}

// AC-450: `not_found` / `not_a_file` come from ErrorKind, never from message text.
#[test]
fn classify_io_error_not_found_is_not_found() {
    let e = io::Error::new(io::ErrorKind::NotFound, "x");
    assert_eq!(classify_io_error(&e), ViewerErrorCode::NotFound);
}

#[test]
fn classify_io_error_permission_denied_is_permission_denied() {
    let e = io::Error::new(io::ErrorKind::PermissionDenied, "x");
    assert_eq!(classify_io_error(&e), ViewerErrorCode::PermissionDenied);
}

#[test]
fn classify_io_error_everything_else_is_io_error() {
    let e = io::Error::new(io::ErrorKind::Other, "disk full, or whatever");
    assert_eq!(classify_io_error(&e), ViewerErrorCode::IoError);
}

// R-447: the DTO carries the wire string, not the Rust-only enum.
#[test]
fn dto_conversion_carries_the_wire_code_and_message() {
    let err = ViewerError { code: ViewerErrorCode::ViewerPathNotAllowed, message: "nope".into() };
    let dto: ViewerErrorDto = err.into();
    assert_eq!(dto.code, "viewer_path_not_allowed");
    assert_eq!(dto.message, "nope");
}

// R-447: internal representation (`code=...`) never leaks as the message text.
#[test]
fn the_dto_message_never_looks_like_the_internal_debug_form() {
    let err = ViewerError { code: ViewerErrorCode::IoError, message: "disk error".into() };
    let dto: ViewerErrorDto = err.into();
    assert!(!dto.message.starts_with("code="));
}
