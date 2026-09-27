//! TDD (unit-test-writer, 2026-09-27): request freshness (R-409/R-431,
//! corrected per the coordinator's 2026-09-27 SHOULD-114 addendum: epoch
//! change always wins, same-epoch requires a strictly larger seq -- NOT plain
//! lexicographic `(epoch, seq)` order), the R-441 allow-set, and the MUST-82
//! single window-generation rule.
//!
//! Specs: SPEC-0300-0015 R-409, R-421, R-430, R-431, R-441, R-441-1~4;
//! AC-411, AC-430, AC-440, AC-451, AC-452, AC-453-1.
//! Architecture: SPEC-0200-0001 §3.5.12.2 (MUST-74/81), §3.5.12.4 (MUST-82),
//! and the coordinator's mid-task correction (SHOULD-114, adopted): "epoch が
//! 直前の値と異なれば適用して (epoch, seq) を更新、同じ epoch なら seq が
//! 大きい場合のみ適用" (not lexicographic; a clock moving backward and
//! producing a smaller epoch must still be applied, never discarded).

use super::session::*;
use std::path::PathBuf;

// ---------------------------------------------------------------------
// is_newer (R-409/R-431, SHOULD-114)
// ---------------------------------------------------------------------

#[test]
fn is_newer_the_first_ever_request_is_always_applied() {
    assert!(is_newer(None, RequestKey { epoch: 1, seq: 1 }));
}

#[test]
fn is_newer_same_epoch_larger_seq_is_applied() {
    let current = RequestKey { epoch: 5, seq: 10 };
    assert!(is_newer(Some(current), RequestKey { epoch: 5, seq: 11 }));
}

#[test]
fn is_newer_same_epoch_smaller_or_equal_seq_is_discarded() {
    // AC-411: a slow earlier request (a.txt) completing after a later one
    // (b.txt) must not win.
    let current = RequestKey { epoch: 5, seq: 10 };
    assert!(!is_newer(Some(current), RequestKey { epoch: 5, seq: 9 }));
    assert!(!is_newer(Some(current), RequestKey { epoch: 5, seq: 10 }), "equal seq is not newer (already applied)");
}

#[test]
fn is_newer_should_114_an_epoch_change_always_applies_even_with_a_smaller_seq() {
    // The main webview reloaded: its own seq counter restarted at a small
    // number, but the epoch changed, so this must NOT be discarded (that was
    // exactly the MUST-81 bug: lexicographic (epoch, seq) with a HIGHER epoch
    // and lower seq is fine under either rule, but SHOULD-114 additionally
    // covers the epoch going DOWN, below).
    let current = RequestKey { epoch: 5, seq: 100 };
    assert!(is_newer(Some(current), RequestKey { epoch: 6, seq: 1 }));
}

#[test]
fn is_newer_should_114_an_epoch_that_goes_backward_still_always_applies() {
    // SHOULD-114's specific correction: a clock moving backward (or any other
    // reason `epoch` decreases) must still be applied, never discarded, because
    // a DIFFERENT epoch always means a different page lifetime -- this is
    // deliberately NOT lexicographic order (which would discard this case).
    let current = RequestKey { epoch: 5, seq: 100 };
    assert!(is_newer(Some(current), RequestKey { epoch: 3, seq: 1 }));
}

#[test]
fn is_newer_should_114_same_epoch_is_still_governed_by_seq_even_after_an_epoch_change() {
    let current = RequestKey { epoch: 3, seq: 1 };
    assert!(!is_newer(Some(current), RequestKey { epoch: 3, seq: 1 }));
    assert!(is_newer(Some(current), RequestKey { epoch: 3, seq: 2 }));
    assert!(!is_newer(Some(current), RequestKey { epoch: 3, seq: 0 }));
}

// ---------------------------------------------------------------------
// is_allowed (R-441(a)(b), R-441-1~4)
// ---------------------------------------------------------------------

fn session_at(opened: &str, base: &str) -> ViewerSession {
    ViewerSession {
        opened_path: PathBuf::from(opened),
        base_dir: PathBuf::from(base),
        siblings: vec![],
        current_index: 0,
        generation: 0,
    }
}

#[test]
fn r441_a_the_just_opened_file_itself_is_always_allowed() {
    let session = session_at("C:\\d\\a.txt", "C:\\d");
    assert!(is_allowed(&session, std::path::Path::new("C:\\d\\a.txt")));
}

#[test]
fn r441_b_a_sibling_directly_under_base_dir_is_allowed() {
    // AC-451 (the second half): C:\d\b.txt can be read while C:\d\a.txt is open.
    let session = session_at("C:\\d\\a.txt", "C:\\d");
    assert!(is_allowed(&session, std::path::Path::new("C:\\d\\b.txt")));
}

#[test]
fn an_unrelated_path_is_rejected() {
    // AC-451 (the first half): C:\other\x.txt is outside both (a) and (b).
    let session = session_at("C:\\d\\a.txt", "C:\\d");
    assert!(!is_allowed(&session, std::path::Path::new("C:\\other\\x.txt")));
}

#[test]
fn ac452_after_replacing_the_session_the_old_files_folder_is_no_longer_allowed() {
    // Given C:\d\a.txt was open and then C:\e\z.txt was opened (a NEW session
    // replaces the old one wholesale, R-441-1): C:\d\b.txt is now rejected.
    let session = session_at("C:\\e\\z.txt", "C:\\e");
    assert!(!is_allowed(&session, std::path::Path::new("C:\\d\\b.txt")));
}

#[test]
fn ac453_1_a_symlinks_own_canonicalized_target_is_allowed_via_rule_a_even_outside_base_dir() {
    // R-441-4/M-5: the base folder is the FILER's folder (C:\d), not the
    // symlink target's folder (C:\other); opening `link.txt` itself succeeds
    // via rule (a) because the caller passes the canonicalized path of the
    // just-opened file (whatever canonicalize resolved it to), regardless of
    // where that lands.
    let session = session_at("C:\\other\\real.txt", "C:\\d");
    assert!(is_allowed(&session, std::path::Path::new("C:\\other\\real.txt")));
}

#[test]
fn ac453_a_different_sibling_symlink_pointing_elsewhere_is_rejected() {
    // R-441-2/R-495: `link.txt` sits in `C:\d` but its OS-canonicalized target
    // is `C:\other\secret.txt` -- once canonicalized (by the caller, before
    // this pure check), its parent is `C:\other`, not the base dir `C:\d`.
    let session = session_at("C:\\d\\a.txt", "C:\\d");
    assert!(!is_allowed(&session, std::path::Path::new("C:\\other\\secret.txt")));
}

// ---------------------------------------------------------------------
// Window-generation lifecycle (§3.5.12.4 MUST-82's unified rule)
// ---------------------------------------------------------------------

#[test]
fn normal_close_destroyed_of_the_current_generation_clears_the_session() {
    let state = GenerationState { generation: 0, closing: false, reopen_pending: false };
    let state = on_close_requested(state);
    assert!(state.closing);

    let (next, action) = on_destroyed(state, 0);
    assert_eq!(action, DestroyedAction::ClearSession);
    assert!(!next.closing);
    assert!(!next.reopen_pending);
}

#[test]
fn must82_an_open_request_that_arrives_while_closing_bumps_the_generation_and_marks_reopen_pending() {
    let state = GenerationState { generation: 0, closing: false, reopen_pending: false };
    let state = on_close_requested(state);
    let state = on_open_while_closing(state);
    assert_eq!(state.generation, 1, "the new request is generation g+1");
    assert!(state.reopen_pending);
    assert!(state.closing, "still closing the OLD (generation 0) window");
}

#[test]
fn must82_destroyed_of_the_old_generation_does_not_clear_the_new_generations_session_and_reopens_instead() {
    // The exact scenario MUST-82 fixes: Destroyed carries the OLD generation
    // (0), but state.generation is already 1 (reopen_pending). The old
    // Destroyed must trigger a reopen for generation 1, not a ClearSession
    // that would wipe out the (already-replaced) pending/session.
    let state = GenerationState { generation: 1, closing: true, reopen_pending: true };
    let (next, action) = on_destroyed(state, 0);
    assert_eq!(action, DestroyedAction::Reopen { generation: 1 });
    assert!(next.closing, "closing is not lowered until the reopen completes (rule 3)");
    assert!(!next.reopen_pending, "the flag is consumed");
    assert_eq!(next.generation, 1, "generation 1's session/pending survive");
}

#[test]
fn must82_the_closing_flag_is_lowered_only_when_the_reopen_actually_completes() {
    let state = GenerationState { generation: 1, closing: true, reopen_pending: false };
    let state = on_reopen_complete(state);
    assert!(!state.closing);
    assert_eq!(state.generation, 1);
}

#[test]
fn must82_a_destroyed_event_for_a_generation_that_no_longer_matches_and_no_reopen_pending_is_a_no_op() {
    // A defensive/stale-event case: neither rule 1's match nor rule 2's
    // reopen_pending applies -- nothing must be cleared or rebuilt.
    let state = GenerationState { generation: 2, closing: false, reopen_pending: false };
    let (next, action) = on_destroyed(state, 0);
    assert_eq!(action, DestroyedAction::NoOp);
    assert_eq!(next, state);
}

// ---------------------------------------------------------------------
// decide_open_action (MUST-82 rule 2, the open-request side): what
// `viewer_open` must do with a just-arrived request, given the current
// window-generation state. Pure/DI-testable wiring decision (coordinator
// review, 2026-09-27): `viewer::commands`/`viewer::window` call this instead
// of inlining the `state.closing` branch.
// ---------------------------------------------------------------------

#[test]
fn decide_open_action_when_nothing_is_closing_proceeds_now_at_the_current_generation() {
    let state = GenerationState { generation: 0, closing: false, reopen_pending: false };
    let (next, action) = decide_open_action(state);
    assert_eq!(action, OpenWhileAction::ProceedNow { generation: 0 });
    assert_eq!(next, state, "no state change when there is nothing to defer");
}

#[test]
fn decide_open_action_while_closing_defers_and_bumps_to_generation_plus_one() {
    let state = GenerationState { generation: 0, closing: true, reopen_pending: false };
    let (next, action) = decide_open_action(state);
    assert_eq!(action, OpenWhileAction::DeferUntilDestroyed { generation: 1 });
    assert_eq!(next, GenerationState { generation: 1, closing: true, reopen_pending: true });
}

#[test]
fn decide_open_action_composes_with_on_destroyed_to_reopen_at_the_new_generation() {
    // The full MUST-82 round trip: close requested, an open arrives before
    // Destroyed fires (deferred to g+1), then the OLD generation's Destroyed
    // event triggers the actual reopen at g+1.
    let state = GenerationState { generation: 0, closing: false, reopen_pending: false };
    let state = on_close_requested(state);
    let (state, action) = decide_open_action(state);
    assert_eq!(action, OpenWhileAction::DeferUntilDestroyed { generation: 1 });

    let (next, destroyed_action) = on_destroyed(state, 0);
    assert_eq!(destroyed_action, DestroyedAction::Reopen { generation: 1 });
    assert_eq!(next.generation, 1);
}
