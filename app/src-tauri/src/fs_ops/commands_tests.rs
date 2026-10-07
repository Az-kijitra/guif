//! TDD (unit-test-writer, 2026-09-26): tests for `fs_ops::commands`
//! (included as the child module `commands::tests` via `#[path]` so that the
//! private `CancelRegistry` methods stay reachable).
//!
//! Specs: SPEC-0300-0011 (4th ed.) R-43, R-43-1, R-43-2, R-43-3, R-48, R-64,
//! R-85-1, AC-33-1, AC-33-2, AC-34-1; SPEC-0200-0001 §3.3.13-1 (MUST-58),
//! §3.3.13-7 (SHOULD-80).

use super::*;
use std::path::PathBuf;
use crate::fs_ops::test_support::*;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

fn is_cancelled(flag: &Arc<AtomicBool>) -> bool {
    flag.load(Ordering::Relaxed)
}

// R-43-2 / AC-33-1 / MUST-58: a cancel that arrives BEFORE the batch is
// registered is remembered and handed to `register` (no lost Escape).
#[test]
fn r43_2_a_cancel_that_arrives_before_register_is_kept_by_register() {
    let registry = CancelRegistry::default();

    registry.request_cancel("op-early");
    let flag = registry.register("op-early");

    assert!(is_cancelled(&flag), "register must keep the pre-recorded cancellation");
}

// AC-33-1: end to end -- with the pre-recorded cancel, EVERY item is reported
// `canceled` and NOTHING is copied.
#[test]
fn ac33_1_register_after_early_cancel_cancels_every_item_and_touches_nothing() {
    let root = tempdir();
    let items = vec![
        write(root.path(), "src/a.txt", "a"),
        write(root.path(), "src/b.txt", "b"),
        write(root.path(), "src/c.txt", "c"),
    ];
    std::fs::create_dir_all(root.path().join("dest")).unwrap();
    let registry = CancelRegistry::default();
    registry.request_cancel("op-early");
    let flag = registry.register("op-early");

    let summary = transfer::copy_batch_with_progress(
        &items,
        &root.path().join("dest"),
        ConflictResolution::Reject,
        move || flag.load(Ordering::Relaxed),
        |_| {},
    );

    assert_eq!((summary.ok, summary.failed, summary.total), (0, 3, 3), "{summary:?}");
    assert!(summary.failures.iter().all(|f| f.code == "canceled"), "{summary:?}");
    assert!(names(&root.path().join("dest")).is_empty(), "no item may be processed");
}

// R-43-3 / AC-33-2: a cancel for one operation_id never affects another.
#[test]
fn r43_3_cancelling_one_operation_id_does_not_affect_another() {
    let registry = CancelRegistry::default();
    let flag_a = registry.register("op-a");
    let flag_b = registry.register("op-b");

    registry.request_cancel("op-a");

    assert!(is_cancelled(&flag_a));
    assert!(!is_cancelled(&flag_b), "op-b must keep running");
}

// R-43-3: an early cancel recorded for op-a is not inherited by op-b.
#[test]
fn r43_3_an_early_cancel_for_one_id_is_not_inherited_by_a_different_id() {
    let registry = CancelRegistry::default();

    registry.request_cancel("op-a");
    let flag_b = registry.register("op-b");
    let flag_a = registry.register("op-a");

    assert!(!is_cancelled(&flag_b));
    assert!(is_cancelled(&flag_a));
}

// SPEC-0200-0001 §3.3.13-1 (`entry(id).or_insert`): registering an id that
// already has a flag keeps (shares) that flag instead of replacing it.
#[test]
fn register_keeps_an_existing_flag_for_the_same_id() {
    let registry = CancelRegistry::default();
    let first = registry.register("op-x");
    registry.request_cancel("op-x");

    let second = registry.register("op-x");

    assert!(is_cancelled(&first));
    assert!(is_cancelled(&second), "the existing (cancelled) flag must be kept");
}

// Cleanup on batch completion: `unregister` removes the entry, so the
// registry does not grow and a later batch reusing the id starts clean.
#[test]
fn unregister_removes_the_entry_and_a_reused_id_starts_uncancelled() {
    let registry = CancelRegistry::default();
    let flag = registry.register("op-done");
    registry.request_cancel("op-done");
    assert!(is_cancelled(&flag));

    registry.unregister("op-done");

    assert_eq!(registry.0.lock().unwrap().len(), 0, "entry must be removed after the batch");
    let fresh = registry.register("op-done");
    assert!(!is_cancelled(&fresh), "a finished operation's cancel must not leak into a new registration");
}

// The early-cancel entry is consumed by register and cleaned by unregister
// (bounded memory).
#[test]
fn an_early_cancel_entry_is_cleaned_up_when_the_registered_batch_finishes() {
    let registry = CancelRegistry::default();
    registry.request_cancel("op-early");
    let _flag = registry.register("op-early");

    registry.unregister("op-early");

    assert_eq!(registry.0.lock().unwrap().len(), 0);
}

// R-43: cancelling an unknown id is harmless and does not cancel others.
#[test]
fn cancelling_an_unknown_id_does_not_panic_and_does_not_cancel_others() {
    let registry = CancelRegistry::default();
    let flag = registry.register("running");

    registry.request_cancel("never-registered");

    assert!(!is_cancelled(&flag));
}

// R-48 / AC-34-1 (logic level): a cancel issued from ANOTHER thread while the
// batch is running is observed at the next item boundary. (The command's
// thread model is checked by the `async` attribute test below.)
#[test]
fn r48_a_cancel_from_another_thread_stops_the_running_batch_at_an_item_boundary() {
    let root = tempdir();
    let items: Vec<PathBuf> = (0..4).map(|i| write(root.path(), &format!("src/f{i}.txt"), "x")).collect();
    std::fs::create_dir_all(root.path().join("dest")).unwrap();
    let registry = Arc::new(CancelRegistry::default());
    let flag = registry.register("op-live");
    let canceller = registry.clone();
    let mut cancelled_once = false;

    let summary = transfer::copy_batch_with_progress(
        &items,
        &root.path().join("dest"),
        ConflictResolution::Reject,
        move || flag.load(Ordering::Relaxed),
        |event| {
            if !cancelled_once && event.kind == transfer::ProgressEventKind::Done {
                cancelled_once = true;
                let c = canceller.clone();
                std::thread::spawn(move || c.request_cancel("op-live")).join().expect("cancel thread");
            }
        },
    );

    assert_eq!(summary.ok, 1, "{summary:?}");
    assert_eq!(summary.failed, 3, "{summary:?}");
    assert!(summary.failures.iter().all(|f| f.code == "canceled"));
}

// MUST-58 / R-48 (source inspection): the blocking commands must run off the
// UI thread: `#[tauri::command(async)]` on a sync fn (or an `async fn`). A
// plain `#[tauri::command] pub fn` runs on the WebView2 main thread and
// freezes the UI (no progress, no cancel until the batch ends).
#[test]
fn must58_blocking_commands_are_declared_async() {
    let source = include_str!("commands.rs");
    let commands = [
        "fs_ops_copy",
        "fs_ops_move",
        "fs_ops_delete_trash",
        "fs_ops_delete_permanently",
        "fs_ops_rename",
        "fs_ops_create",
        "fs_ops_detect_conflicts",
    ];
    let mut problems = Vec::new();
    for name in commands {
        if source.contains(&format!("pub async fn {name}(")) {
            continue; // the `async fn` form is accepted too
        }
        let signature = format!("pub fn {name}(");
        let Some(at) = source.find(&signature) else {
            problems.push(format!("{name}: command not found in commands.rs"));
            continue;
        };
        let head = &source[..at];
        let Some(attr_start) = head.rfind("#[tauri::command") else {
            problems.push(format!("{name}: no #[tauri::command] attribute"));
            continue;
        };
        let between = &head[attr_start..];
        let attr = between.split(']').next().unwrap_or("");
        if between.contains("fn ") || !attr.contains("async") {
            problems.push(format!("{name}: attribute is `{}` (needs `(async)`)", attr.trim()));
        }
    }
    assert!(problems.is_empty(), "MUST-58 violations: {problems:#?}");
}

// The header doc comment wrongly claimed sync commands run on a worker pool
// ("誤りなので訂正", SPEC-0200-0001 §3.3.13-1). The phrase is assembled at run
// time so this test does not match its own source.
#[test]
fn must58_the_incorrect_worker_pool_claim_is_removed_from_the_doc_comment() {
    let source = include_str!("commands.rs");
    let wrong_claim = ["async", "-friendly"].concat();
    let production_part = source.split("#[cfg(test)]").next().unwrap_or(source);
    assert!(
        !production_part.contains(&wrong_claim),
        "the doc comment still claims the sync commands are `{wrong_claim}`"
    );
}

// SHOULD-80 / R-64: `rename_entry` reports the NEW full path. Compared via
// `Debug` so the test does not depend on PathBuf vs String and compiles
// against the current `()` return (RED at run time, not at compile time).
#[test]
fn should80_rename_entry_returns_the_new_full_path() {
    let root = tempdir();
    let original = write(root.path(), "old.txt", "1");
    let expected = root.path().join("new.txt");

    let returned = crate::fs_ops::rename::rename_entry(&original, "new.txt").expect("rename");

    assert_eq!(format!("{returned:?}"), format!("{expected:?}"));
    assert!(expected.exists());
}

// SHOULD-80: the Tauri command returns the new full path as a String
// (`Result<String, String>`), with the name trimmed (R-62).
#[test]
fn should80_fs_ops_rename_command_returns_the_new_full_path_string() {
    let root = tempdir();
    let original = write(root.path(), "a.txt", "1");
    let expected = root.path().join("b.txt").to_string_lossy().into_owned();

    let returned = fs_ops_rename(original.to_string_lossy().into_owned(), " b.txt ".to_string()).expect("rename");

    assert_eq!(format!("{returned:?}"), format!("{expected:?}"));
}

// SHOULD-80: the error path is unchanged -- the command still returns the code.
#[test]
fn should80_fs_ops_rename_command_still_reports_error_codes() {
    let root = tempdir();
    let a = write(root.path(), "a.txt", "1");
    write(root.path(), "b.txt", "2");

    let err = fs_ops_rename(a.to_string_lossy().into_owned(), "b.txt".to_string()).unwrap_err();

    assert_eq!(err, "already_exists");
    assert!(a.exists(), "the original stays untouched");
}
