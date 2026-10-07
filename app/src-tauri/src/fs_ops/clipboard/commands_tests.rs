//! TDD (unit-test-writer, Phase 11, 2026-10-03): DTOs and the six `error` kinds
//! of the clipboard commands. The `*_with` functions are what the thin
//! `#[tauri::command]` fns call (names are this test's contract; the Tauri
//! command fns themselves are checked by `acl_consistency.rs`).
//! Specs: SPEC-0300-0011 R-18 (3 commands, `expectedSequence`, `probeOnly`),
//! R-19-3 (0 = unknown); SPEC-0200-0001 §3.10.6, §3.10.14 G-10,
//! §3.10.17.5 (six error kinds).

use std::time::Duration;

use super::commands::{get_files_with, parse_effect, set_files_with, ClipboardReadDto, ClipboardWriteDto};
use super::flow::{Access, ClipboardOps, Effect, HdropRead};

struct Ops {
    opens: u32,
    can_open: bool,
    set_hdrop_ok: bool,
    set_effect_ok: bool,
    read: HdropRead,
    available: bool,
    seq_open: u32,
    seq_closed: u32,
    open: bool,
    touched: u32,
}

impl Ops {
    fn new() -> Self {
        Ops {
            opens: 0,
            can_open: true,
            set_hdrop_ok: true,
            set_effect_ok: true,
            read: HdropRead::Absent,
            available: false,
            seq_open: 10,
            seq_closed: 11,
            open: false,
            touched: 0,
        }
    }
}

impl ClipboardOps for Ops {
    fn open(&mut self, _a: Access) -> bool {
        self.touched += 1;
        self.opens += 1;
        self.open = self.can_open;
        self.can_open
    }
    fn close(&mut self) {
        self.touched += 1;
        self.open = false;
    }
    fn empty(&mut self) -> bool {
        self.touched += 1;
        true
    }
    fn set_hdrop(&mut self, _b: &[u8]) -> bool {
        self.touched += 1;
        self.set_hdrop_ok
    }
    fn set_drop_effect(&mut self, _e: Effect) -> bool {
        self.touched += 1;
        self.set_effect_ok
    }
    fn read_hdrop(&mut self) -> HdropRead {
        self.touched += 1;
        self.read.clone()
    }
    fn hdrop_available(&mut self) -> bool {
        self.touched += 1;
        self.available
    }
    fn sequence(&mut self) -> u32 {
        self.touched += 1;
        if self.open {
            self.seq_open
        } else {
            self.seq_closed
        }
    }
    fn wait(&mut self, _d: Duration) {}
}

fn p() -> Vec<String> {
    vec![r"C:\a.txt".to_string()]
}

// ------------------------------------------------------------ effect argument

#[test]
fn parse_effect_accepts_exactly_copy_and_move() {
    assert_eq!(parse_effect("copy"), Some(Effect::Copy));
    assert_eq!(parse_effect("move"), Some(Effect::Move));
    for bad in ["", "COPY", "Move", "cut", "link", " copy", "copy "] {
        assert_eq!(parse_effect(bad), None, "{bad:?}");
    }
}

// ------------------------------------------------------------ set -> DTO / error kinds

#[test]
fn a_successful_set_is_ok_with_the_after_close_sequence_and_no_error() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, p(), "move", None);
    assert_eq!(dto, ClipboardWriteDto { ok: true, sequence: 11, error: None });
}

#[test]
fn error_no_paths() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, vec![], "copy", None);
    assert_eq!(dto, ClipboardWriteDto { ok: false, sequence: 0, error: Some("no_paths".into()) });
    assert_eq!(ops.touched, 0);
}

#[test]
fn error_invalid_path() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, vec!["C:\\a\0".into()], "copy", None);
    assert_eq!(dto.error.as_deref(), Some("invalid_path"));
    assert!(!dto.ok);
    assert_eq!(ops.touched, 0);
}

#[test]
fn error_invalid_effect_is_a_value_not_an_exception_and_touches_nothing() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, p(), "cut", None);
    assert_eq!(dto, ClipboardWriteDto { ok: false, sequence: 0, error: Some("invalid_effect".into()) });
    assert_eq!(ops.touched, 0);
}

#[test]
fn error_cannot_open() {
    let mut ops = Ops::new();
    ops.can_open = false;
    let dto = set_files_with(&mut ops, p(), "copy", None);
    assert_eq!(dto, ClipboardWriteDto { ok: false, sequence: 0, error: Some("cannot_open".into()) });
    assert_eq!(ops.opens, 5, "CB-01: five attempts");
}

#[test]
fn error_rejected_for_hdrop_and_for_drop_effect_failures() {
    let mut a = Ops::new();
    a.set_hdrop_ok = false;
    assert_eq!(set_files_with(&mut a, p(), "copy", None).error.as_deref(), Some("rejected"));
    let mut b = Ops::new();
    b.set_effect_ok = false;
    let dto = set_files_with(&mut b, p(), "move", None);
    assert_eq!((dto.ok, dto.sequence, dto.error.as_deref()), (false, 0, Some("rejected")));
}

#[test]
fn error_changed_when_expected_sequence_differs() {
    let mut ops = Ops::new();
    ops.seq_open = 10;
    let dto = set_files_with(&mut ops, p(), "move", Some(99));
    assert_eq!(dto, ClipboardWriteDto { ok: false, sequence: 0, error: Some("changed".into()) });
}

#[test]
fn a_matching_expected_sequence_writes() {
    let mut ops = Ops::new();
    ops.seq_open = 10;
    let dto = set_files_with(&mut ops, p(), "move", Some(10));
    assert!(dto.ok);
    assert_eq!(dto.sequence, 11);
}

#[test]
fn expected_sequence_zero_is_changed() {
    let mut ops = Ops::new();
    ops.seq_open = 0;
    let dto = set_files_with(&mut ops, p(), "move", Some(0));
    assert_eq!(dto.error.as_deref(), Some("changed"));
}

#[test]
fn a_successful_write_never_reports_sequence_zero_as_ok_unless_the_os_said_zero() {
    // 0 is "unknown": it is passed through as 0 (the front end then never matches).
    let mut ops = Ops::new();
    ops.seq_closed = 0;
    let dto = set_files_with(&mut ops, p(), "copy", None);
    assert!(dto.ok);
    assert_eq!(dto.sequence, 0);
}

// ------------------------------------------------------------ get -> DTO

#[test]
fn get_maps_files_none_and_unavailable() {
    let mut f = Ops::new();
    f.read = HdropRead::Paths(vec![r"C:\a".into(), "rel".into()]);
    assert_eq!(
        get_files_with(&mut f, false),
        ClipboardReadDto { state: "files".into(), paths: vec![r"C:\a".into()], sequence: 11 }
    );
    let mut n = Ops::new();
    n.read = HdropRead::Absent;
    assert_eq!(get_files_with(&mut n, false), ClipboardReadDto { state: "none".into(), paths: vec![], sequence: 11 });
    let mut u = Ops::new();
    u.can_open = false;
    assert_eq!(
        get_files_with(&mut u, false),
        ClipboardReadDto { state: "unavailable".into(), paths: vec![], sequence: 11 }
    );
}

#[test]
fn probe_only_answers_from_the_format_presence_with_empty_paths_and_never_opens() {
    let mut ops = Ops::new();
    ops.available = true;
    ops.read = HdropRead::Paths(vec![r"C:\a".into()]);
    let dto = get_files_with(&mut ops, true);
    assert_eq!(dto, ClipboardReadDto { state: "files".into(), paths: vec![], sequence: 11 });
    assert_eq!(ops.opens, 0);
    ops.available = false;
    assert_eq!(get_files_with(&mut ops, true).state, "none");
}

// ------------------------------------------------------------ DTO wire shape (camelCase)

fn toml_of<T: serde::Serialize>(v: &T) -> String {
    toml::to_string(v).expect("serialize")
}

#[test]
fn write_dto_serialises_ok_sequence_error() {
    let t = toml_of(&ClipboardWriteDto { ok: false, sequence: 5, error: Some("changed".into()) });
    for key in ["ok = false", "sequence = 5", "error = \"changed\""] {
        assert!(t.contains(key), "{key} in\n{t}");
    }
}

#[test]
fn read_dto_serialises_state_paths_sequence() {
    let t = toml_of(&ClipboardReadDto { state: "files".into(), paths: vec![r"C:\a".into()], sequence: 9 });
    for key in ["state = \"files\"", "sequence = 9", "paths ="] {
        assert!(t.contains(key), "{key} in\n{t}");
    }
}

// The camelCase contract for the command ARGUMENTS (`probeOnly`, `expectedSequence`) is the
// Rust parameter names (Tauri maps snake_case <-> camelCase): checked in the source text of
// the command fns, which are not callable without a Tauri runtime.
#[test]
fn command_parameters_are_named_so_that_the_wire_names_are_camel_case() {
    let src = include_str!("commands.rs");
    let production = src.split("#[cfg(test)]").next().unwrap_or(src);
    let code: String = production.lines().map(|l| l.split("//").next().unwrap_or("")).collect::<Vec<_>>().join("\n");
    for needle in ["pub fn clipboard_set_files", "pub fn clipboard_get_files", "pub fn clipboard_clear_if_unchanged"] {
        assert!(code.contains(needle), "{needle} must exist in commands.rs (R-18)");
    }
    assert!(code.contains("probe_only: bool"), "R-18 probeOnly");
    assert!(code.contains("expected_sequence: Option<u32>"), "R-18 expectedSequence (optional)");
    assert!(code.contains("sequence: u32"), "clipboard_clear_if_unchanged(sequence)");
    assert!(code.contains("State<ClipboardOwner>") || code.contains("State<'_, ClipboardOwner>"), "owner HWND state");
    assert_eq!(code.matches("rename_all = \"camelCase\"").count() >= 2, true, "both DTOs are camelCase");
}

// ------------------------------------------------------------ AC-86 (SPEC-0300-0011 第9版)
// unit-test-writer, 2026-10-07.

// AC-86: `["C:\a.txt", "b.txt"]` -> ok:false / invalid_path; the fake saw NOTHING (no open, no empty).
#[test]
fn ac86_a_relative_path_gives_invalid_path_and_the_fake_is_never_touched() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, vec![r"C:\a.txt".into(), "b.txt".into()], "copy", None);
    assert_eq!(dto, ClipboardWriteDto { ok: false, sequence: 0, error: Some("invalid_path".into()) });
    assert_eq!(ops.opens, 0, "open must not be called");
    assert_eq!(ops.touched, 0, "no call at all (empty / set_hdrop / close / sequence either)");
}

#[test]
fn ac86_a_single_absolute_path_is_still_written() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, vec![r"C:\a.txt".into()], "copy", None);
    assert_eq!(dto, ClipboardWriteDto { ok: true, sequence: 11, error: None });
}

// §3.12.4: `invalid_effect` (argument shape, looks at no path) is judged first.
#[test]
fn ac86_invalid_effect_wins_over_a_relative_path() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, vec!["b.txt".into()], "cut", None);
    assert_eq!(dto.error.as_deref(), Some("invalid_effect"));
    assert_eq!(ops.touched, 0);
}

// `[]` stays `no_paths` (first_relative of nothing is None).
#[test]
fn ac86_an_empty_list_stays_no_paths() {
    let mut ops = Ops::new();
    let dto = set_files_with(&mut ops, vec![], "copy", None);
    assert_eq!(dto.error.as_deref(), Some("no_paths"));
    assert_eq!(ops.touched, 0);
}
