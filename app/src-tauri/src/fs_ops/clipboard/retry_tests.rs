//! TDD (unit-test-writer, Phase 11, 2026-10-03): open retry. The wait is
//! injected and its argument is checked; no real time is used.
//! Specs: SPEC-0300-0011 CB-01, R-17-1, AC-06-10; SPEC-0200-0001 §3.10.5.

use std::time::Duration;

use super::retry::{open_with_retry, OPEN_ATTEMPTS, OPEN_RETRY_INTERVAL_MS};

/// Runs `open_with_retry` where attempt `n` (1-based) succeeds iff
/// `succeed_on == Some(n)`. Returns (result, opens, waits).
fn run(succeed_on: Option<u32>) -> (bool, u32, Vec<Duration>) {
    let mut opens = 0u32;
    let mut waits: Vec<Duration> = Vec::new();
    let result = open_with_retry(
        || {
            opens += 1;
            succeed_on == Some(opens)
        },
        |d| waits.push(d),
    );
    (result, opens, waits)
}

#[test]
fn constants_are_five_attempts_and_20_ms() {
    assert_eq!(OPEN_ATTEMPTS, 5);
    assert_eq!(OPEN_RETRY_INTERVAL_MS, 20);
}

#[test]
fn first_attempt_success_does_not_wait() {
    let (ok, opens, waits) = run(Some(1));
    assert!(ok);
    assert_eq!(opens, 1);
    assert!(waits.is_empty());
}

// AC-06-10 (i): four failures, fifth succeeds -> 5 opens, 4 waits of 20 ms.
#[test]
fn ac06_10_four_failures_then_success_opens_five_times_and_waits_four_times_20ms() {
    let (ok, opens, waits) = run(Some(5));
    assert!(ok);
    assert_eq!(opens, 5);
    assert_eq!(waits, vec![Duration::from_millis(20); 4]);
}

// AC-06-10 (ii): five failures -> 5 opens, 4 waits (none after the last failure), false.
#[test]
fn ac06_10_five_failures_opens_five_times_waits_four_times_and_returns_false() {
    let (ok, opens, waits) = run(None);
    assert!(!ok);
    assert_eq!(opens, 5);
    assert_eq!(waits.len(), 4, "no wait after the final failure");
    assert!(waits.iter().all(|d| *d == Duration::from_millis(20)));
}

#[test]
fn success_on_the_middle_attempts_waits_once_per_earlier_failure() {
    for n in 2..=4u32 {
        let (ok, opens, waits) = run(Some(n));
        assert!(ok);
        assert_eq!(opens, n);
        assert_eq!(waits.len() as u32, n - 1);
    }
}

#[test]
fn it_stops_opening_after_the_first_success() {
    let (_, opens, _) = run(Some(2));
    assert_eq!(opens, 2, "never opens again after success");
}

// The maximum total wait stays about 80 ms (R-17-1 / CB-01).
#[test]
fn the_maximum_total_wait_is_80_ms() {
    let (_, _, waits) = run(None);
    assert_eq!(waits.iter().sum::<Duration>(), Duration::from_millis(80));
}

// The wait happens after the failed open (interleaving), not all at the end.
#[test]
fn waits_are_interleaved_after_each_failed_open() {
    let log = std::cell::RefCell::new(Vec::<&'static str>::new());
    let _ = open_with_retry(
        || {
            log.borrow_mut().push("open");
            false
        },
        |_| log.borrow_mut().push("wait"),
    );
    assert_eq!(
        *log.borrow(),
        vec!["open", "wait", "open", "wait", "open", "wait", "open", "wait", "open"]
    );
}
