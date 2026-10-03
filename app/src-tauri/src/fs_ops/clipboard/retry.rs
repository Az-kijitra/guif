//! CB-01 / R-17-1: 5 attempts, 20 ms apart. Pure (SPEC-0200-0001 §3.10.5).

use std::time::Duration;

pub const OPEN_ATTEMPTS: u32 = 5;
pub const OPEN_RETRY_INTERVAL_MS: u64 = 20;

/// Calls `open` up to `OPEN_ATTEMPTS` times; after each FAILED attempt except
/// the last it calls `wait(20 ms)`. Returns whether an attempt succeeded.
pub fn open_with_retry(mut open: impl FnMut() -> bool, mut wait: impl FnMut(Duration)) -> bool {
    for attempt in 1..=OPEN_ATTEMPTS {
        if open() {
            return true;
        }
        if attempt < OPEN_ATTEMPTS {
            wait(Duration::from_millis(OPEN_RETRY_INTERVAL_MS));
        }
    }
    false
}
