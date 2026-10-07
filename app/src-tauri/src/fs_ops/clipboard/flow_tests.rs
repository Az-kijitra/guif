//! TDD (unit-test-writer, Phase 11, 2026-10-03): the clipboard flow over a fake
//! `ClipboardOps` (no OS). Order of calls, rollback, the RAII `Opened` guard
//! (exactly one `close` per successful `open` on EVERY path), the sequence
//! number taken AFTER close (0 = unknown), conditional write, clear-if-unchanged.
//! Specs: SPEC-0300-0011 R-15-2 (+L-5 rollback), R-17-1, R-17-2, R-18
//! (`expectedSequence`, `probeOnly`), R-19-3, R-19-6, AC-06-10, AC-06-12;
//! SPEC-0200-0001 §3.10.2 (flow), §3.10.17.5 (MUST-121 / MUST-122).

use std::collections::VecDeque;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::Duration;

use super::flow::{
    clear_if_unchanged, probe_files, read_files, write_files, Access, ClipboardOps, Effect, HdropRead, ReadOutcome,
    WriteFailure, WriteOutcome,
};
use super::hdrop::build_hdrop;

struct Fake {
    calls: Vec<String>,
    open_results: VecDeque<bool>,
    open_default: bool,
    is_open: bool,
    opens_ok: u32,
    closes: u32,
    waits: Vec<Duration>,
    accesses: Vec<Access>,
    empty_results: VecDeque<bool>,
    set_hdrop_ok: bool,
    set_effect_ok: bool,
    hdrop_bytes: Vec<Vec<u8>>,
    effects: Vec<Effect>,
    read: HdropRead,
    available: bool,
    seq_open: u32,
    seq_closed: u32,
    panic_at: Option<&'static str>,
}

impl Fake {
    fn new() -> Self {
        Fake {
            calls: vec![],
            open_results: VecDeque::new(),
            open_default: true,
            is_open: false,
            opens_ok: 0,
            closes: 0,
            waits: vec![],
            accesses: vec![],
            empty_results: VecDeque::new(),
            set_hdrop_ok: true,
            set_effect_ok: true,
            hdrop_bytes: vec![],
            effects: vec![],
            read: HdropRead::Absent,
            available: false,
            seq_open: 100,
            seq_closed: 200,
            panic_at: None,
        }
    }
    fn never_opens() -> Self {
        let mut f = Fake::new();
        f.open_default = false;
        f
    }
    fn log(&mut self, name: &'static str) {
        self.calls.push(name.to_string());
        if self.panic_at == Some(name) {
            panic!("fake panic in {name}");
        }
    }
    fn names(&self) -> Vec<&str> {
        self.calls.iter().map(String::as_str).collect()
    }
    fn count(&self, name: &str) -> usize {
        self.calls.iter().filter(|c| *c == name).count()
    }
    /// MUST-122: every successful open is matched by exactly one close.
    fn assert_balanced(&self) {
        assert_eq!(self.closes, self.opens_ok, "close count must equal successful open count: {:?}", self.calls);
        assert!(!self.is_open, "left open: {:?}", self.calls);
    }
}

impl ClipboardOps for Fake {
    fn open(&mut self, access: Access) -> bool {
        self.log("open");
        self.accesses.push(access);
        let ok = self.open_results.pop_front().unwrap_or(self.open_default);
        if ok {
            self.opens_ok += 1;
            self.is_open = true;
        }
        ok
    }
    fn close(&mut self) {
        self.log("close");
        self.closes += 1;
        self.is_open = false;
    }
    fn empty(&mut self) -> bool {
        self.log("empty");
        self.empty_results.pop_front().unwrap_or(true)
    }
    fn set_hdrop(&mut self, bytes: &[u8]) -> bool {
        self.log("set_hdrop");
        self.hdrop_bytes.push(bytes.to_vec());
        self.set_hdrop_ok
    }
    fn set_drop_effect(&mut self, effect: Effect) -> bool {
        self.log("set_drop_effect");
        self.effects.push(effect);
        self.set_effect_ok
    }
    fn read_hdrop(&mut self) -> HdropRead {
        self.log("read_hdrop");
        self.read.clone()
    }
    fn hdrop_available(&mut self) -> bool {
        self.log("hdrop_available");
        self.available
    }
    fn sequence(&mut self) -> u32 {
        self.log("sequence");
        if self.is_open {
            self.seq_open
        } else {
            self.seq_closed
        }
    }
    fn wait(&mut self, d: Duration) {
        self.log("wait");
        self.waits.push(d);
    }
}

fn paths(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

fn p2() -> Vec<String> {
    paths(&[r"C:\a.txt", r"C:\d"])
}

// ===================================================================== write

// R-15-2 / M-1: order, and the sequence is taken AFTER close.
#[test]
fn write_calls_open_empty_set_hdrop_set_drop_effect_close_then_sequence() {
    let mut f = Fake::new();
    let out = write_files(&mut f, &p2(), Effect::Copy, None);
    assert_eq!(f.names(), ["open", "empty", "set_hdrop", "set_drop_effect", "close", "sequence"]);
    assert_eq!(out, WriteOutcome::Written { sequence: 200 }, "the value read after close (not the one while open)");
    f.assert_balanced();
}

#[test]
fn write_opens_for_write_and_passes_the_hdrop_bytes_and_effect() {
    let mut f = Fake::new();
    write_files(&mut f, &p2(), Effect::Move, None);
    assert_eq!(f.accesses, vec![Access::Write]);
    assert_eq!(f.hdrop_bytes, vec![build_hdrop(&p2()).unwrap()]);
    assert_eq!(f.effects, vec![Effect::Move]);
}

#[test]
fn write_with_copy_effect_passes_copy() {
    let mut f = Fake::new();
    write_files(&mut f, &p2(), Effect::Copy, None);
    assert_eq!(f.effects, vec![Effect::Copy]);
}

// R-15-2 L-5: DropEffect failure -> empty() rollback inside the same open, then close; failure.
#[test]
fn write_rolls_back_with_empty_when_set_drop_effect_fails() {
    let mut f = Fake::new();
    f.set_effect_ok = false;
    let out = write_files(&mut f, &p2(), Effect::Move, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::Rejected));
    assert_eq!(
        &f.names()[..6],
        ["open", "empty", "set_hdrop", "set_drop_effect", "empty", "close"],
        "rollback happens before close"
    );
    assert_eq!(f.count("close"), 1);
    f.assert_balanced();
}

#[test]
fn write_is_a_failure_even_if_the_rollback_empty_fails_too() {
    let mut f = Fake::new();
    f.set_effect_ok = false;
    f.empty_results = VecDeque::from([true, false]); // first empty ok, rollback fails
    let out = write_files(&mut f, &p2(), Effect::Move, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::Rejected));
    f.assert_balanced();
}

#[test]
fn write_stops_after_a_failed_set_hdrop_without_setting_the_effect() {
    let mut f = Fake::new();
    f.set_hdrop_ok = false;
    let out = write_files(&mut f, &p2(), Effect::Copy, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::Rejected));
    assert_eq!(&f.names()[..4], ["open", "empty", "set_hdrop", "close"]);
    assert_eq!(f.count("set_drop_effect"), 0);
    f.assert_balanced();
}

#[test]
fn write_stops_after_a_failed_empty() {
    let mut f = Fake::new();
    f.empty_results = VecDeque::from([false]);
    let out = write_files(&mut f, &p2(), Effect::Copy, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::Rejected));
    assert_eq!(&f.names()[..3], ["open", "empty", "close"]);
    assert_eq!(f.count("set_hdrop"), 0);
    f.assert_balanced();
}

// R-17-1: cannot open -> retries (5 opens, 4 waits of 20 ms), never empty(), no close.
#[test]
fn write_that_cannot_open_retries_five_times_and_never_touches_the_clipboard() {
    let mut f = Fake::never_opens();
    let out = write_files(&mut f, &p2(), Effect::Copy, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::CannotOpen));
    assert_eq!(f.count("open"), 5);
    assert_eq!(f.waits, vec![Duration::from_millis(20); 4]);
    for forbidden in ["empty", "set_hdrop", "set_drop_effect", "close"] {
        assert_eq!(f.count(forbidden), 0, "{forbidden} must not be called");
    }
    f.assert_balanced();
}

#[test]
fn write_succeeds_when_the_fifth_open_attempt_succeeds() {
    let mut f = Fake::new();
    f.open_results = VecDeque::from([false, false, false, false, true]);
    let out = write_files(&mut f, &p2(), Effect::Copy, None);
    assert!(matches!(out, WriteOutcome::Written { .. }));
    assert_eq!(f.count("open"), 5);
    assert_eq!(f.waits.len(), 4);
    f.assert_balanced();
}

// validation does not touch the OS at all
#[test]
fn write_with_no_paths_fails_without_any_os_call() {
    let mut f = Fake::new();
    assert_eq!(write_files(&mut f, &[], Effect::Copy, None), WriteOutcome::Failed(WriteFailure::NoPaths));
    assert!(f.calls.is_empty(), "{:?}", f.calls);
}

#[test]
fn write_with_a_nul_in_a_path_fails_without_any_os_call() {
    let mut f = Fake::new();
    let out = write_files(&mut f, &paths(&["C:\\ok", "C:\\a\0b"]), Effect::Copy, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::InvalidPath));
    assert!(f.calls.is_empty(), "{:?}", f.calls);
}

// ------------------------------------------------ expectedSequence (MUST-121)

#[test]
fn conditional_write_with_a_matching_sequence_compares_while_open_then_writes() {
    let mut f = Fake::new();
    f.seq_open = 7;
    let out = write_files(&mut f, &p2(), Effect::Move, Some(7));
    assert_eq!(
        f.names(),
        ["open", "sequence", "empty", "set_hdrop", "set_drop_effect", "close", "sequence"],
        "the check and the write share ONE open"
    );
    assert_eq!(out, WriteOutcome::Written { sequence: 200 });
    f.assert_balanced();
}

#[test]
fn conditional_write_with_a_different_sequence_does_not_empty_and_is_skipped() {
    let mut f = Fake::new();
    f.seq_open = 8;
    let out = write_files(&mut f, &p2(), Effect::Move, Some(7));
    assert_eq!(out, WriteOutcome::Skipped);
    assert_eq!(f.names(), ["open", "sequence", "close"]);
    f.assert_balanced();
}

#[test]
fn conditional_write_with_expected_zero_never_writes() {
    let mut f = Fake::new();
    f.seq_open = 0;
    let out = write_files(&mut f, &p2(), Effect::Move, Some(0));
    assert_eq!(out, WriteOutcome::Skipped, "0 = unknown is never 'equal'");
    assert_eq!(f.count("empty"), 0);
    f.assert_balanced();
}

#[test]
fn conditional_write_when_the_current_sequence_is_unknown_never_writes() {
    let mut f = Fake::new();
    f.seq_open = 0;
    let out = write_files(&mut f, &p2(), Effect::Move, Some(7));
    assert_eq!(out, WriteOutcome::Skipped);
    assert_eq!(f.count("empty"), 0);
    f.assert_balanced();
}

#[test]
fn conditional_write_that_cannot_open_is_a_failure_not_a_skip() {
    let mut f = Fake::never_opens();
    let out = write_files(&mut f, &p2(), Effect::Move, Some(7));
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::CannotOpen));
}

#[test]
fn unconditional_write_never_reads_the_sequence_while_open() {
    let mut f = Fake::new();
    write_files(&mut f, &p2(), Effect::Copy, None);
    let close_at = f.names().iter().position(|c| *c == "close").unwrap();
    let first_seq = f.names().iter().position(|c| *c == "sequence").unwrap();
    assert!(first_seq > close_at);
}

// ===================================================================== read

#[test]
fn read_opens_for_read_reads_hdrop_closes_then_takes_the_sequence() {
    let mut f = Fake::new();
    f.read = HdropRead::Paths(paths(&[r"C:\a", r"D:\b"]));
    let out = read_files(&mut f);
    assert_eq!(f.names(), ["open", "read_hdrop", "close", "sequence"]);
    assert_eq!(f.accesses, vec![Access::Read]);
    assert_eq!(out, ReadOutcome::Files { paths: paths(&[r"C:\a", r"D:\b"]), sequence: 200 });
    f.assert_balanced();
}

#[test]
fn read_adopts_only_valid_paths_and_dedups_case_insensitively() {
    let mut f = Fake::new();
    f.read = HdropRead::Paths(paths(&[r"C:\a", "rel", r"c:\A", r"\\.\PhysicalDrive0", r"D:\b"]));
    assert_eq!(read_files(&mut f), ReadOutcome::Files { paths: paths(&[r"C:\a", r"D:\b"]), sequence: 200 });
}

#[test]
fn read_with_no_cf_hdrop_is_none() {
    let mut f = Fake::new();
    f.read = HdropRead::Absent;
    assert_eq!(read_files(&mut f), ReadOutcome::None { sequence: 200 });
}

#[test]
fn read_where_no_path_is_adoptable_is_none() {
    let mut f = Fake::new();
    f.read = HdropRead::Paths(paths(&["rel", "", r"\\.\pipe\x"]));
    assert_eq!(read_files(&mut f), ReadOutcome::None { sequence: 200 });
    f.read = HdropRead::Paths(vec![]);
    assert_eq!(read_files(&mut f), ReadOutcome::None { sequence: 200 });
}

#[test]
fn read_failure_is_unavailable_and_still_closes() {
    let mut f = Fake::new();
    f.read = HdropRead::Failed;
    assert_eq!(read_files(&mut f), ReadOutcome::Unavailable { sequence: 200 });
    f.assert_balanced();
}

// G-11 / R-19-2 step 1: even when the clipboard cannot be opened the sequence is returned.
#[test]
fn read_that_cannot_open_is_unavailable_but_still_returns_the_sequence() {
    let mut f = Fake::never_opens();
    let out = read_files(&mut f);
    assert_eq!(out, ReadOutcome::Unavailable { sequence: 200 });
    assert_eq!(f.count("open"), 5);
    assert_eq!(f.waits, vec![Duration::from_millis(20); 4]);
    assert_eq!(f.count("read_hdrop"), 0);
    assert_eq!(f.count("close"), 0);
    assert_eq!(f.count("sequence"), 1);
    f.assert_balanced();
}

#[test]
fn read_passes_an_unknown_sequence_zero_through() {
    let mut f = Fake::new();
    f.seq_closed = 0;
    f.read = HdropRead::Paths(paths(&[r"C:\a"]));
    assert_eq!(read_files(&mut f), ReadOutcome::Files { paths: paths(&[r"C:\a"]), sequence: 0 });
}

// ===================================================================== probe

#[test]
fn probe_neither_opens_nor_retries_and_reports_the_format_presence() {
    let mut f = Fake::new();
    f.available = true;
    let out = probe_files(&mut f);
    assert_eq!(f.names(), ["hdrop_available", "sequence"]);
    assert_eq!(out, ReadOutcome::Files { paths: vec![], sequence: 200 });
    assert!(f.waits.is_empty());
    f.assert_balanced();
}

#[test]
fn probe_without_the_format_is_none() {
    let mut f = Fake::new();
    f.available = false;
    assert_eq!(probe_files(&mut f), ReadOutcome::None { sequence: 200 });
    assert_eq!(f.count("open"), 0);
}

#[test]
fn probe_works_even_when_the_clipboard_is_held_by_another_app() {
    let mut f = Fake::never_opens();
    f.available = true;
    assert!(matches!(probe_files(&mut f), ReadOutcome::Files { .. }));
    assert_eq!(f.count("open"), 0);
    assert!(f.waits.is_empty());
}

// ===================================================================== clear_if_unchanged

#[test]
fn clear_with_matching_sequence_checks_while_open_then_empties() {
    let mut f = Fake::new();
    f.seq_open = 42;
    assert!(clear_if_unchanged(&mut f, 42));
    assert_eq!(f.names(), ["open", "sequence", "empty", "close"]);
    assert_eq!(f.accesses, vec![Access::Write], "emptying needs the owner window");
    f.assert_balanced();
}

#[test]
fn clear_with_a_different_sequence_does_not_empty() {
    let mut f = Fake::new();
    f.seq_open = 43;
    assert!(!clear_if_unchanged(&mut f, 42));
    assert_eq!(f.names(), ["open", "sequence", "close"]);
    f.assert_balanced();
}

#[test]
fn clear_with_sequence_zero_does_nothing_at_all() {
    let mut f = Fake::new();
    f.seq_open = 0;
    assert!(!clear_if_unchanged(&mut f, 0));
    assert!(f.calls.is_empty(), "{:?}", f.calls);
}

#[test]
fn clear_when_the_current_sequence_is_unknown_does_not_empty() {
    let mut f = Fake::new();
    f.seq_open = 0;
    assert!(!clear_if_unchanged(&mut f, 42));
    assert_eq!(f.count("empty"), 0);
    f.assert_balanced();
}

#[test]
fn clear_that_cannot_open_is_false_and_never_empties() {
    let mut f = Fake::never_opens();
    assert!(!clear_if_unchanged(&mut f, 42));
    assert_eq!(f.count("open"), 5);
    assert_eq!(f.waits.len(), 4);
    assert_eq!(f.count("empty"), 0);
    assert_eq!(f.count("close"), 0);
}

#[test]
fn clear_reports_false_when_empty_fails_but_still_closes() {
    let mut f = Fake::new();
    f.seq_open = 42;
    f.empty_results = VecDeque::from([false]);
    assert!(!clear_if_unchanged(&mut f, 42));
    f.assert_balanced();
}

// ===================================================================== RAII (MUST-122)

#[test]
fn every_path_closes_exactly_once_per_successful_open() {
    // write: success / each failure / skipped
    let mut cases: Vec<Fake> = vec![];
    let mut ok = Fake::new();
    write_files(&mut ok, &p2(), Effect::Move, None);
    cases.push(ok);
    let mut e = Fake::new();
    e.empty_results = VecDeque::from([false]);
    write_files(&mut e, &p2(), Effect::Move, None);
    cases.push(e);
    let mut h = Fake::new();
    h.set_hdrop_ok = false;
    write_files(&mut h, &p2(), Effect::Move, None);
    cases.push(h);
    let mut d = Fake::new();
    d.set_effect_ok = false;
    write_files(&mut d, &p2(), Effect::Move, None);
    cases.push(d);
    let mut s = Fake::new();
    s.seq_open = 1;
    write_files(&mut s, &p2(), Effect::Move, Some(2));
    cases.push(s);
    // read: failed read
    let mut r = Fake::new();
    r.read = HdropRead::Failed;
    read_files(&mut r);
    cases.push(r);
    // not openable: close 0 times
    let mut n = Fake::never_opens();
    write_files(&mut n, &p2(), Effect::Move, None);
    read_files(&mut n);
    clear_if_unchanged(&mut n, 1);
    cases.push(n);
    for c in cases {
        c.assert_balanced();
    }
}

#[test]
fn a_panic_inside_any_step_still_closes_the_clipboard_exactly_once() {
    for step in ["empty", "set_hdrop", "set_drop_effect"] {
        let mut f = Fake::new();
        f.panic_at = Some(step);
        let r = catch_unwind(AssertUnwindSafe(|| write_files(&mut f, &p2(), Effect::Move, None)));
        assert!(r.is_err(), "{step} must propagate the panic");
        assert_eq!(f.closes, 1, "write panic in {step}: {:?}", f.calls);
        assert!(!f.is_open);
    }
    let mut f = Fake::new();
    f.panic_at = Some("read_hdrop");
    let r = catch_unwind(AssertUnwindSafe(|| read_files(&mut f)));
    assert!(r.is_err());
    assert_eq!(f.closes, 1, "read panic: {:?}", f.calls);

    let mut f = Fake::new();
    f.seq_open = 5;
    f.panic_at = Some("empty");
    let r = catch_unwind(AssertUnwindSafe(|| clear_if_unchanged(&mut f, 5)));
    assert!(r.is_err());
    assert_eq!(f.closes, 1, "clear panic: {:?}", f.calls);
}

// ===================================================================== AC-86 / R-89-1 #20 (T-07)
// SPEC-0300-0011 第9版 AC-86 / R-15-4 注記 / T-07; SPEC-0200-0001 §3.12.3 #20 / §3.12.4
// (unit-test-writer, 2026-10-07).
// `abs_path::first_relative` before `build_hdrop` and before any `ops` call.

// AC-86: ONE path that is not absolute refuses the whole write; the fake is never touched (not even `open`).
#[test]
fn ac86_a_relative_path_among_absolute_ones_fails_with_invalid_path_and_touches_nothing() {
    let mut f = Fake::new();
    let out = write_files(&mut f, &paths(&[r"C:\a.txt", "b.txt"]), Effect::Copy, None);
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::InvalidPath));
    assert!(f.calls.is_empty(), "no open / empty / set_hdrop / close / sequence: {:?}", f.calls);
}

#[test]
fn ac86_every_non_absolute_form_is_refused_wherever_it_stands_in_the_list() {
    for bad in ["b.txt", "C:", "C:src", r"\foo", "", r".\x", "..", "C:/foo", r"\\server", r"\\.\pipe\x", r"\\.\PhysicalDrive0"] {
        for list in [paths(&[bad]), paths(&[bad, r"C:\ok"]), paths(&[r"C:\ok", bad]), paths(&[r"C:\ok", bad, r"C:\ok2"])] {
            let mut f = Fake::new();
            let out = write_files(&mut f, &list, Effect::Move, None);
            assert_eq!(out, WriteOutcome::Failed(WriteFailure::InvalidPath), "{list:?}");
            assert!(f.calls.is_empty(), "{list:?} touched the clipboard: {:?}", f.calls);
        }
    }
}

// The check is before the conditional-write comparison: `expectedSequence` does not reach the OS either.
#[test]
fn ac86_the_refusal_comes_before_the_expected_sequence_comparison() {
    let mut f = Fake::new();
    let out = write_files(&mut f, &paths(&[r"C:\a.txt", "b.txt"]), Effect::Move, Some(7));
    assert_eq!(out, WriteOutcome::Failed(WriteFailure::InvalidPath), "not Skipped");
    assert!(f.calls.is_empty(), "{:?}", f.calls);
}

#[test]
fn ac86_all_absolute_paths_are_written_as_before_including_the_extended_and_unc_forms() {
    let mut f = Fake::new();
    let list = paths(&[r"C:\a.txt", r"\\server\share\b", r"\\?\C:\long\c", r"\\.\C:\d"]);
    let out = write_files(&mut f, &list, Effect::Copy, None);
    assert_eq!(out, WriteOutcome::Written { sequence: 200 });
    assert_eq!(f.names(), ["open", "empty", "set_hdrop", "set_drop_effect", "close", "sequence"]);
    f.assert_balanced();
}

// An empty list stays `no_paths` (first_relative of nothing is None), also without any OS call.
#[test]
fn ac86_an_empty_list_is_still_no_paths() {
    let mut f = Fake::new();
    assert_eq!(write_files(&mut f, &[], Effect::Copy, None), WriteOutcome::Failed(WriteFailure::NoPaths));
    assert!(f.calls.is_empty());
}
