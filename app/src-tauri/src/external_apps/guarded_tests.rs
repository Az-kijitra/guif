//! TDD (unit-test-writer, 2026-10-17): the inner layer of `external_app_launch` (`external_apps/guarded.rs`).
//! Specs: SPEC-0300-0021 R-1582 + SPEC-0300-0011 R-89 (a non-absolute `path` is refused with `invalid_path` BEFORE the file system is
//! touched, shown as W-98), R-1581 / AC-1524 (only an index, a path and a kind come in), R-1543 / R-1571 / AC-1521 (an executable
//! that is not found: nothing else is started), R-1536 / R-1572 / AC-1516 (the target must still exist with the same kind),
//! R-1544 / AC-1520 (iv) (the plan handed to the process creation carries the RESOLVED absolute executable), R-1542 / AC-1529
//! (the existence is asked at launch time), R-1548 / R-1573 / AC-1528 (an OS error, e.g. 740, is returned as the OS's own text; no
//! elevation), R-1584 / R-1577 / AC-1525 (while the E2E scope is active both the executable and the target must be inside it);
//! SPEC-0200-0001 §3.16.2 (`guarded.rs`), §3.16.5 + §3.16.15 MUST-141 (order: ABS -> resolve -> scope check (ONE `check_launch(exe,
//! target)`) -> verify -> spawn), SHOULD-215.
//!
//! `spawn` is INJECTED here (as in `viewer::guarded::os_open_guarded`): no process is ever created by these tests.
//! Executables are empty files named `*.exe` in a temp folder; they are never run.
//!
//! Contract the implementer must satisfy (modules `external_apps::guarded` and `external_apps::error`, declared in
//! `external_apps/mod.rs` as `#[cfg(test)] mod guarded_tests;`):
//!
//! ```ignore
//! // error.rs
//! #[derive(Debug, Clone, PartialEq, Eq)]
//! pub enum LaunchError { UnknownApp, InvalidPath, ProgramNotFound { program: String /* the EXPANDED value */ }, TargetMissing,
//!                        ScopeViolation(String), Os { message: String /* io::Error::to_string(), untouched */ } }
//! // guarded.rs
//! pub fn launch_guarded(reg: &Registry, index: usize, path: &str, kind: Kind,
//!                       spawn: impl FnOnce(&LaunchPlan) -> std::io::Result<()>) -> Result<(), LaunchError>;
//! // e2e_scope.rs  (see shared/e2e_scope_launch_tests.rs)
//! pub fn check_launch(exe: &Path, target: &Path) -> Result<(), ScopeViolation>;
//! ```

use std::cell::{Cell, RefCell};
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::error::LaunchError;
use super::guarded::launch_guarded;
use super::launch::LaunchPlan;
use super::registry::Registry;
use super::target::Kind;
use crate::shared::e2e_scope::{set_test_scope, Scope};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

// ------------------------------------------------------------------ fixtures

struct Fx {
    _base: tempfile::TempDir,
    /// plain (no `\\?\`) long-name folder, the scope root of the scope tests
    root: PathBuf,
}

fn plain(p: &Path) -> PathBuf {
    let canonical = fs::canonicalize(p).expect("canonicalize");
    let text = canonical.to_string_lossy().to_string();
    PathBuf::from(text.strip_prefix(r"\\?\").filter(|rest| rest.as_bytes().get(1) == Some(&b':')).unwrap_or(&text))
}

fn fx() -> Fx {
    let base = tempfile::tempdir().expect("tempdir");
    let root = plain(base.path());
    fs::write(root.join("tool.exe"), b"MZ").unwrap();
    fs::write(root.join("a b.txt"), "x").unwrap();
    fs::create_dir(root.join("sub dir")).unwrap();
    Fx { _base: base, root }
}

fn text(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

fn raw_app(program: &str, args: &[&str], args_for_file: Option<&[&str]>) -> RawExternalApp {
    let v = |a: &[&str]| RawValue::Value(a.iter().map(|x| x.to_string()).collect::<Vec<_>>());
    RawExternalApp {
        name: RawValue::Value("Tool".into()),
        program: RawValue::Value(program.into()),
        args: v(args),
        args_for_file: args_for_file.map_or(RawValue::Missing, v),
        key: RawValue::Missing,
    }
}

fn registry_of(apps: Vec<RawExternalApp>, path_var: Option<&str>) -> Registry {
    Registry::from_raw(&ExternalAppsRaw::Array(apps), &|_: &str| None::<OsString>, path_var.map(OsString::from))
}

/// One registration `Tool` -> `<root>\tool.exe`, args `["{path}"]` / `["{dir}"]` for a file.
fn reg(fx: &Fx) -> Registry {
    registry_of(vec![raw_app(&text(&fx.root.join("tool.exe")), &["--p", "{path}"], Some(&["--f", "{dir}", "{path}"]))], None)
}

/// Runs `launch_guarded` with a recording `spawn`; returns the result and the plans handed to it.
fn run(reg: &Registry, index: usize, path: &str, kind: Kind) -> (Result<(), LaunchError>, Vec<LaunchPlan>) {
    let plans = RefCell::new(Vec::new());
    let result = launch_guarded(reg, index, path, kind, |plan: &LaunchPlan| {
        plans.borrow_mut().push(plan.clone());
        Ok(())
    });
    (result, plans.into_inner())
}

/// `Scope::new` takes the CANONICAL (verbatim, `\\?\`) root, like `shared/e2e_scope_tests.rs` does.
fn scope_of(root: &Path) -> Scope {
    Scope::new(fs::canonicalize(root).expect("canonicalize"))
}

fn dir_link(link: &Path, target: &Path) -> bool {
    std::process::Command::new("cmd").args(["/C", "mklink", "/J"]).arg(link).arg(target).output().map(|o| o.status.success()).unwrap_or(false)
}

// ------------------------------------------------------------------ success: what the process creation receives

#[test]
fn a_file_target_hands_the_resolved_plan_to_spawn_exactly_once() {
    let f = fx();
    let r = reg(&f);
    let path = text(&f.root.join("a b.txt"));
    let (result, plans) = run(&r, 0, &path, Kind::File);
    assert_eq!(result, Ok(()));
    assert_eq!(plans.len(), 1);
    let plan = &plans[0];
    assert_eq!(plan.exe.path(), f.root.join("tool.exe").as_path(), "AC-1520 (iv): the resolved absolute path");
    let args: Vec<String> = plan.args.iter().map(|a| a.to_string_lossy().to_string()).collect();
    assert_eq!(args, vec!["--f".to_string(), text(&f.root), path.clone()], "args_for_file for a file");
    assert_eq!(plan.cwd, f.root, "R-1545");
}

#[test]
fn a_folder_target_uses_args() {
    let f = fx();
    let r = reg(&f);
    let dir = text(&f.root.join("sub dir"));
    let (result, plans) = run(&r, 0, &dir, Kind::Dir);
    assert_eq!(result, Ok(()));
    let args: Vec<String> = plans[0].args.iter().map(|a| a.to_string_lossy().to_string()).collect();
    assert_eq!(args, vec!["--p".to_string(), dir.clone()]);
    assert_eq!(plans[0].cwd, PathBuf::from(&dir));
}

#[test]
fn the_current_folder_itself_is_a_valid_folder_target() {
    let f = fx();
    let (result, plans) = run(&reg(&f), 0, &text(&f.root), Kind::Dir);
    assert_eq!(result, Ok(()));
    assert_eq!(plans.len(), 1);
}

#[test]
fn ac1520_iv_a_bare_name_is_resolved_with_the_start_up_path_snapshot_into_an_absolute_path() {
    let f = fx();
    let r = registry_of(vec![raw_app("tool", &["{path}"], None)], Some(&text(&f.root)));
    let (result, plans) = run(&r, 0, &text(&f.root.join("a b.txt")), Kind::File);
    assert_eq!(result, Ok(()));
    assert_eq!(plans[0].exe.path(), f.root.join("tool.exe").as_path());
    assert!(plans[0].exe.path().is_absolute(), "the process creation never receives a bare name");
}

#[test]
fn ac1529_an_executable_placed_after_the_registry_was_built_can_be_launched() {
    let f = fx();
    let late = f.root.join("late.exe");
    let r = registry_of(vec![raw_app(&text(&late), &[], None)], None);
    let path = text(&f.root.join("a b.txt"));
    assert_eq!(run(&r, 0, &path, Kind::File).0, Err(LaunchError::ProgramNotFound { program: text(&late) }));
    fs::write(&late, b"MZ").unwrap();
    let (result, plans) = run(&r, 0, &path, Kind::File);
    assert_eq!(result, Ok(()), "no restart needed (R-1542)");
    assert_eq!(plans.len(), 1);
}

// ------------------------------------------------------------------ R-1582 / AC-1524: a non-absolute path

#[test]
fn ac1524_a_path_that_is_not_absolute_is_invalid_path_and_nothing_is_started() {
    let f = fx();
    let r = reg(&f);
    for bad in ["a.txt", "", r".\a.txt", r"..\a.txt", "C:a.txt", r"\a.txt", "C:", "zz-no-such-relative-name"] {
        let (result, plans) = run(&r, 0, bad, Kind::File);
        assert_eq!(result, Err(LaunchError::InvalidPath), "{bad:?}");
        assert!(plans.is_empty(), "{bad:?}: spawn must not run");
    }
}

#[test]
fn a_non_absolute_path_is_refused_even_when_the_executable_is_missing_the_check_comes_first() {
    let f = fx();
    let r = registry_of(vec![raw_app(&text(&f.root.join("missing.exe")), &[], None)], None);
    assert_eq!(run(&r, 0, "a.txt", Kind::File).0, Err(LaunchError::InvalidPath));
}

// ------------------------------------------------------------------ unknown index

#[test]
fn an_index_past_the_registrations_is_unknown_app() {
    let f = fx();
    let r = reg(&f);
    let (result, plans) = run(&r, 1, &text(&f.root.join("a b.txt")), Kind::File);
    assert_eq!(result, Err(LaunchError::UnknownApp));
    assert!(plans.is_empty());
    assert_eq!(run(&r, usize::MAX, &text(&f.root), Kind::Dir).0, Err(LaunchError::UnknownApp));
    let empty = Registry::from_raw(&ExternalAppsRaw::Array(vec![]), &|_: &str| None::<OsString>, None);
    assert_eq!(run(&empty, 0, &text(&f.root), Kind::Dir).0, Err(LaunchError::UnknownApp));
}

// ------------------------------------------------------------------ AC-1521: the executable is not found

#[test]
fn ac1521_a_missing_executable_starts_nothing_and_reports_the_expanded_program() {
    let f = fx();
    let missing = text(&f.root.join("missing.exe"));
    let r = registry_of(vec![raw_app(&missing, &[], None)], None);
    let (result, plans) = run(&r, 0, &text(&f.root.join("a b.txt")), Kind::File);
    assert_eq!(result, Err(LaunchError::ProgramNotFound { program: missing }));
    assert!(plans.is_empty(), "R-1543: no other program is substituted");
}

#[test]
fn a_bare_name_that_is_not_in_path_is_not_found_and_the_current_folder_is_not_searched() {
    let f = fx();
    // `tool.exe` exists in `f.root` but PATH does not name it; the process's current folder is whatever cargo gave us.
    let r = registry_of(vec![raw_app("tool", &[], None)], Some(r"Z:\nowhere;;.;bin"));
    let (result, plans) = run(&r, 0, &text(&f.root.join("a b.txt")), Kind::File);
    assert_eq!(result, Err(LaunchError::ProgramNotFound { program: "tool".to_string() }));
    assert!(plans.is_empty());
}

#[test]
fn a_folder_at_the_executable_path_is_not_found() {
    let f = fx();
    fs::create_dir(f.root.join("dir.exe")).unwrap();
    let program = text(&f.root.join("dir.exe"));
    let r = registry_of(vec![raw_app(&program, &[], None)], None);
    let (result, plans) = run(&r, 0, &text(&f.root.join("a b.txt")), Kind::File);
    assert_eq!(result, Err(LaunchError::ProgramNotFound { program }));
    assert!(plans.is_empty());
}

// ------------------------------------------------------------------ AC-1516: the target must still be there

#[test]
fn ac1516_a_target_that_vanished_or_changed_kind_is_target_missing_and_nothing_is_started() {
    let f = fx();
    let r = reg(&f);
    let gone = f.root.join("gone.txt");
    assert_eq!(run(&r, 0, &text(&gone), Kind::File), (Err(LaunchError::TargetMissing), vec![]));
    assert_eq!(run(&r, 0, &text(&f.root.join("sub dir")), Kind::File), (Err(LaunchError::TargetMissing), vec![]), "a folder where a file was decided");
    assert_eq!(run(&r, 0, &text(&f.root.join("a b.txt")), Kind::Dir), (Err(LaunchError::TargetMissing), vec![]), "a file where a folder was decided");
    assert_eq!(run(&r, 0, &text(&f.root.join("no").join("deeper")), Kind::Dir), (Err(LaunchError::TargetMissing), vec![]));
}

#[test]
fn ac1516_a_junction_to_a_folder_is_treated_as_a_folder_and_launches() {
    let f = fx();
    let link = f.root.join("link");
    if !dir_link(&link, &f.root.join("sub dir")) {
        eprintln!("SKIP: cannot create a junction here (mklink /J failed)");
        return;
    }
    let (result, plans) = run(&reg(&f), 0, &text(&link), Kind::Dir);
    assert_eq!(result, Ok(()));
    assert_eq!(plans.len(), 1);
    assert_eq!(run(&reg(&f), 0, &text(&link), Kind::File).0, Err(LaunchError::TargetMissing));
    let _ = fs::remove_dir(&link);
}

#[test]
fn the_executable_is_checked_before_the_target_so_both_missing_reports_the_program() {
    let f = fx();
    let missing = text(&f.root.join("missing.exe"));
    let r = registry_of(vec![raw_app(&missing, &[], None)], None);
    let (result, plans) = run(&r, 0, &text(&f.root.join("gone.txt")), Kind::File);
    assert_eq!(result, Err(LaunchError::ProgramNotFound { program: missing }));
    assert!(plans.is_empty());
}

// ------------------------------------------------------------------ AC-1528 / R-1573: OS errors come back untouched

#[test]
fn ac1528_an_os_error_740_is_returned_with_the_os_text_and_no_elevation_is_attempted() {
    let f = fx();
    let r = reg(&f);
    let path = text(&f.root.join("a b.txt"));
    let calls = Cell::new(0);
    let result = launch_guarded(&r, 0, &path, Kind::File, |_: &LaunchPlan| {
        calls.set(calls.get() + 1);
        Err(io::Error::from_raw_os_error(740))
    });
    let expected = io::Error::from_raw_os_error(740).to_string();
    assert_eq!(result, Err(LaunchError::Os { message: expected.clone() }));
    assert!(expected.contains("740"), "the `(os error N)` tail is kept: {expected}");
    assert_eq!(calls.get(), 1, "one attempt, no retry through another route (R-1548)");
}

#[test]
fn an_arbitrary_io_error_text_is_not_translated_trimmed_or_shortened() {
    let f = fx();
    let r = reg(&f);
    let path = text(&f.root.join("a b.txt"));
    let message = "  アクセスが拒否されました。 (os error 5)  ";
    let result = launch_guarded(&r, 0, &path, Kind::File, |_: &LaunchPlan| Err(io::Error::new(io::ErrorKind::PermissionDenied, message)));
    assert_eq!(result, Err(LaunchError::Os { message: io::Error::new(io::ErrorKind::PermissionDenied, message).to_string() }));
}

// ------------------------------------------------------------------ the order: spawn is the last step

#[test]
fn spawn_is_not_called_when_any_earlier_step_fails() {
    let f = fx();
    let r = reg(&f);
    let called = Cell::new(false);
    for (index, path, kind) in [
        (0, "rel.txt".to_string(), Kind::File),
        (9, text(&f.root.join("a b.txt")), Kind::File),
        (0, text(&f.root.join("gone.txt")), Kind::File),
    ] {
        let _ = launch_guarded(&r, index, &path, kind, |_: &LaunchPlan| {
            called.set(true);
            Ok(())
        });
    }
    assert!(!called.get());
}

// ------------------------------------------------------------------ AC-1525: the E2E scope (debug builds; `set_test_scope`)

fn outside_fx() -> (tempfile::TempDir, PathBuf) {
    let base = tempfile::tempdir().expect("tempdir");
    let root = plain(base.path());
    fs::write(root.join("copy.exe"), b"MZ").unwrap();
    fs::write(root.join("out.txt"), "x").unwrap();
    (base, root)
}

#[test]
fn ac1525_inside_the_scope_both_inside_launches() {
    let f = fx();
    let _scope = set_test_scope(scope_of(&f.root));
    let (result, plans) = run(&reg(&f), 0, &text(&f.root.join("a b.txt")), Kind::File);
    assert_eq!(result, Ok(()));
    assert_eq!(plans.len(), 1);
}

#[test]
fn ac1525_an_executable_outside_the_scope_is_refused_and_not_started() {
    let f = fx();
    let (_o, outside) = outside_fx();
    let r = registry_of(vec![raw_app(&text(&outside.join("copy.exe")), &[], None)], None);
    let _scope = set_test_scope(scope_of(&f.root));
    let (result, plans) = run(&r, 0, &text(&f.root.join("a b.txt")), Kind::File);
    assert!(matches!(result, Err(LaunchError::ScopeViolation(_))), "{result:?}");
    assert!(plans.is_empty(), "the copy outside the scope records nothing (AC-1525)");
}

#[test]
fn ac1525_a_target_outside_the_scope_is_refused_even_with_an_executable_inside() {
    let f = fx();
    let (_o, outside) = outside_fx();
    let _scope = set_test_scope(scope_of(&f.root));
    let (result, plans) = run(&reg(&f), 0, &text(&outside.join("out.txt")), Kind::File);
    assert!(matches!(result, Err(LaunchError::ScopeViolation(_))), "{result:?}");
    assert!(plans.is_empty());
}

#[test]
fn without_a_scope_nothing_is_refused_for_being_outside() {
    let (_o, outside) = outside_fx();
    let r = registry_of(vec![raw_app(&text(&outside.join("copy.exe")), &[], None)], None);
    let (result, plans) = run(&r, 0, &text(&outside.join("out.txt")), Kind::File);
    assert_eq!(result, Ok(()), "release builds / no scope: R-1584 does not apply");
    assert_eq!(plans.len(), 1);
}

#[test]
fn the_scope_check_comes_after_the_resolution_and_before_the_target_check() {
    // MUST-141 (c): ABS -> resolve -> check_launch(exe, target) -> verify -> spawn.
    let f = fx();
    let (_o, outside) = outside_fx();
    let _scope = set_test_scope(scope_of(&f.root));

    // 1. resolution first: an executable that does not exist is "not found", not a scope violation
    let missing = text(&f.root.join("missing.exe"));
    let r = registry_of(vec![raw_app(&missing, &[], None)], None);
    assert_eq!(run(&r, 0, &text(&outside.join("out.txt")), Kind::File).0, Err(LaunchError::ProgramNotFound { program: missing }));

    // 2. the scope before the target check: a vanished target OUTSIDE the scope is a violation, not TargetMissing
    let (result, _) = run(&reg(&f), 0, &text(&outside.join("never-existed.txt")), Kind::File);
    assert!(matches!(result, Err(LaunchError::ScopeViolation(_))), "{result:?}");
}

#[test]
fn ac1517_with_the_scope_active_a_target_deleted_inside_the_scope_is_target_missing_not_a_violation() {
    // CDP AC-1517 deletes a file INSIDE the scope after the menu was opened and expects W-96 (R-1536), not W-99.
    let f = fx();
    let _scope = set_test_scope(scope_of(&f.root));
    let gone = f.root.join("deleted-after-menu-open.txt");
    fs::write(&gone, "x").unwrap();
    fs::remove_file(&gone).unwrap();
    let (result, plans) = run(&reg(&f), 0, &text(&gone), Kind::File);
    assert_eq!(result, Err(LaunchError::TargetMissing), "{result:?}");
    assert!(plans.is_empty());
}
