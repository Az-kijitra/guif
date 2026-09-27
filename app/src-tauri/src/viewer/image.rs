//! `viewer/image.rs` (SPEC-0300-0015 R-444, R-484, R-485). Reads PNG/JPEG/BMP
//! bytes for the frontend's `<img>` (no asset protocol, R-484); the file
//! itself is never decoded on the Rust side (R-485's "failed to decode" is a
//! frontend `<img onerror>` concern, not this module's).
//!
//! Planned API (not yet implemented, TDD):
//!
//! ```ignore
//! pub fn validate_image_size(size_bytes: u64) -> Result<(), super::error::ViewerErrorCode>; // R-444
//! pub fn oversized_image_message(size_bytes: u64) -> String; // "X MiB / 上限 50 MiB", X ceil to 1 decimal
//! pub fn read_image(path: &std::path::Path) -> std::io::Result<Result<Vec<u8>, super::error::ViewerErrorCode>>;
//! ```
//!
//! Tests: `viewer/image_tests.rs`.

/// R-444: image read limit, exactly 50 MiB. A file of exactly this size is
/// still displayed (AC-454); only sizes STRICTLY GREATER are rejected.
pub const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

/// R-444: rejects sizes strictly greater than the limit.
pub fn validate_image_size(size_bytes: u64) -> Result<(), super::error::ViewerErrorCode> {
    if size_bytes > MAX_IMAGE_BYTES {
        Err(super::error::ViewerErrorCode::ViewerImageTooLarge)
    } else {
        Ok(())
    }
}

/// "X MiB / 上限 50 MiB" style message; X is rounded UP to one decimal place.
pub fn oversized_image_message(size_bytes: u64) -> String {
    let mib = size_bytes as f64 / (1024.0 * 1024.0);
    let rounded_up = (mib * 10.0).ceil() / 10.0;
    format!("画像が大きすぎるため表示できません({rounded_up:.1} MiB / 上限 50 MiB)")
}

/// Reads the file if it is within the limit (R-444). The outer `Result` is an
/// I/O error; the inner `Result` is `Err(ViewerImageTooLarge)` when the file
/// is over the limit (checked via metadata BEFORE reading the bytes).
pub fn read_image(
    path: &std::path::Path,
) -> std::io::Result<Result<Vec<u8>, super::error::ViewerErrorCode>> {
    let metadata = std::fs::metadata(path)?;
    if let Err(code) = validate_image_size(metadata.len()) {
        return Ok(Err(code));
    }
    let bytes = std::fs::read(path)?;
    Ok(Ok(bytes))
}
