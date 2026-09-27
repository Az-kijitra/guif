//! TDD (unit-test-writer, 2026-09-27): the 50 MiB image size boundary (R-444)
//! and its warning message rounding.
//!
//! Specs: SPEC-0300-0015 R-444; AC-454.
//! `set_len` (sparse files) keeps these tests fast even at 50+ MiB.

use super::error::ViewerErrorCode;
use super::image::*;
use std::fs::File;

#[test]
fn r444_exactly_50_mib_is_allowed() {
    assert!(validate_image_size(MAX_IMAGE_BYTES).is_ok());
}

#[test]
fn r444_one_byte_over_50_mib_is_rejected() {
    let err = validate_image_size(MAX_IMAGE_BYTES + 1).expect_err("must reject");
    assert_eq!(err, ViewerErrorCode::ViewerImageTooLarge);
}

#[test]
fn r444_well_under_the_limit_is_allowed() {
    assert!(validate_image_size(1024).is_ok());
}

#[test]
fn oversized_message_rounds_the_size_up_to_one_decimal_and_states_the_50_mib_limit() {
    // 52,428,801 bytes = 50 MiB + 1 byte -> ceil to 50.1 MiB.
    let msg = oversized_image_message(MAX_IMAGE_BYTES + 1);
    assert!(msg.contains("50.1 MiB"), "{msg}");
    assert!(msg.contains("50 MiB"), "{msg}: must state the fixed 50 MiB limit");
}

#[test]
fn oversized_message_an_exact_multiple_of_a_mib_does_not_show_a_spurious_decimal_bump() {
    // 100 MiB exactly.
    let msg = oversized_image_message(100 * 1024 * 1024);
    assert!(msg.contains("100.0 MiB"), "{msg}");
}

#[test]
fn read_image_exactly_at_the_limit_is_read_in_full() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.png");
    let f = File::create(&path).unwrap();
    f.set_len(MAX_IMAGE_BYTES).unwrap();
    drop(f);

    let outer = read_image(&path).expect("io ok");
    let bytes = outer.expect("must not be ViewerImageTooLarge at exactly the limit");
    assert_eq!(bytes.len() as u64, MAX_IMAGE_BYTES);
}

#[test]
fn read_image_one_byte_over_the_limit_is_rejected_without_returning_the_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.png");
    let f = File::create(&path).unwrap();
    f.set_len(MAX_IMAGE_BYTES + 1).unwrap();
    drop(f);

    let outer = read_image(&path).expect("io ok");
    let err = outer.expect_err("must reject");
    assert_eq!(err, ViewerErrorCode::ViewerImageTooLarge);
}
