//! TDD (unit-test-writer, 2026-10-20): `external_apps/open_file.rs` -- "open ONE file with an absolute-path executable", independent of
//! any registration (SPEC-0300-0022 R-1602 / R-1603 / R-1603 T-13 / R-1681, AC-1603 / AC-1605; SPEC-0200-0001 §3.17.2 (e), §3.17.3,
//! H-3). It reuses `program::resolve` + `launch::spawn`; the process creation stays in `launch.rs`.
//!
//! ```ignore
//! #[derive(Debug)]
//! pub enum OpenFile { NotFound, Started, OutOfScope, Failed(std::io::Error) }
//! pub fn open_file_with(program: &Path, file: &Path, cwd: &Path,
//!                       probe: &dyn Fn(&Path) -> Probe,
//!                       spawn: impl FnOnce(&LaunchPlan) -> io::Result<()>) -> OpenFile;
//! ```
//! Order: `program::resolve(program-as-UTF-8, None, probe)` (not found => `NotFound`, `spawn` is never called) -> the E2E scope
//! (`shared::e2e_scope::check_external_launch(exe)`, an active scope => `OutOfScope`, `spawn` never called) -> `LaunchPlan { exe,
//! args: [file], cwd }` -> `spawn` (an `Err` => `Failed(that error, unchanged)`; Ok => `Started`). A program path that is not valid
//! UTF-8 is `NotFound` (the caller then falls back to the association). `PATH` is never searched (no `path_var`): AC-1603 (iii).

use std::cell::{Cell, RefCell};
use std::io;
use std::path::{Path, PathBuf};

use super::exists::Probe;
use super::launch::LaunchPlan;
use super::open_file::{open_file_with, OpenFile};
use crate::shared::e2e_scope::{set_test_scope, Scope};

const CODE: &str = r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe";
const FILE: &str = r"C:\Users\u\AppData\Roaming\dev.guif.app\config.toml";
const CWD: &str = r"C:\Users\u\AppData\Roaming\dev.guif.app";

fn probe_file(_: &Path) -> Probe {
    Probe::File
}

// AC-1600 / R-1603: the plan has the resolved executable, exactly ONE argument (the file), and the settings folder as the cwd.
#[test]
fn r1603_an_existing_executable_is_started_with_the_file_as_the_only_argument() {
    let seen: RefCell<Option<(PathBuf, Vec<std::ffi::OsString>, PathBuf)>> = RefCell::new(None);
    let out = open_file_with(Path::new(CODE), Path::new(FILE), Path::new(CWD), &probe_file, |plan: &LaunchPlan| {
        *seen.borrow_mut() = Some((plan.exe.path().to_path_buf(), plan.args.clone(), plan.cwd.clone()));
        Ok(())
    });
    assert!(matches!(out, OpenFile::Started), "{out:?}");
    let (exe, args, cwd) = seen.into_inner().expect("spawn must be called once");
    assert_eq!(exe, PathBuf::from(CODE));
    assert_eq!(args, vec![std::ffi::OsString::from(FILE)], "AC-1600: one argument, the absolute path of config.toml");
    assert_eq!(cwd, PathBuf::from(CWD));
}

// AC-1603 (i)(iv): the candidate must be a FILE; a folder or nothing is "not found" and nothing is started.
#[test]
fn ac1603_a_missing_or_folder_candidate_is_not_found_and_nothing_is_started() {
    for (what, probe) in [("missing", Probe::Missing), ("folder", Probe::Dir)] {
        let called = Cell::new(false);
        let out = open_file_with(Path::new(CODE), Path::new(FILE), Path::new(CWD), &|_| probe, |_| {
            called.set(true);
            Ok(())
        });
        assert!(matches!(out, OpenFile::NotFound), "{what}: {out:?}");
        assert!(!called.get(), "{what}: spawn must not be called");
    }
}

// R-1541 / AC-1603 (iii): `code.cmd` (or any non-.exe) and a bare name are never started; PATH is not searched.
#[test]
fn ac1603_a_cmd_a_bare_name_and_a_relative_path_are_not_found() {
    for program in [r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\bin\code.cmd", "code", "Code.exe", r"Programs\Code.exe", ""] {
        let called = Cell::new(false);
        let out = open_file_with(Path::new(program), Path::new(FILE), Path::new(CWD), &probe_file, |_| {
            called.set(true);
            Ok(())
        });
        assert!(matches!(out, OpenFile::NotFound), "{program:?}: {out:?}");
        assert!(!called.get(), "{program:?}");
    }
}

// R-1603 T-13: a process that cannot be created is `Failed` with the OS error unchanged (the caller shows W-A5, no fallback).
#[test]
fn t13_a_spawn_error_is_returned_unchanged() {
    let out = open_file_with(Path::new(CODE), Path::new(FILE), Path::new(CWD), &probe_file, |_| {
        Err(io::Error::from_raw_os_error(5))
    });
    match out {
        OpenFile::Failed(e) => assert_eq!(e.raw_os_error(), Some(5), "the OS error is passed through untouched"),
        other => panic!("expected Failed, got {other:?}"),
    }
}

// R-1681 / AC-1608: while the E2E scope is active nothing is started and the result is the dedicated `OutOfScope`.
#[test]
fn r1681_an_active_e2e_scope_refuses_before_spawn() {
    let tmp = tempfile::tempdir().unwrap();
    let _guard = set_test_scope(Scope::new(std::fs::canonicalize(tmp.path()).unwrap()));
    let called = Cell::new(false);
    let out = open_file_with(Path::new(CODE), Path::new(FILE), Path::new(CWD), &probe_file, |_| {
        called.set(true);
        Ok(())
    });
    assert!(matches!(out, OpenFile::OutOfScope), "{out:?}");
    assert!(!called.get());
}

// A candidate that is not found is `NotFound` even under a scope (the association fallback then reaches its own scope check).
#[test]
fn not_found_wins_over_the_scope_because_resolve_comes_first() {
    let tmp = tempfile::tempdir().unwrap();
    let _guard = set_test_scope(Scope::new(std::fs::canonicalize(tmp.path()).unwrap()));
    let out = open_file_with(Path::new(CODE), Path::new(FILE), Path::new(CWD), &|_| Probe::Missing, |_| Ok(()));
    assert!(matches!(out, OpenFile::NotFound), "{out:?}");
}

// A program path that is not valid UTF-8 is "not found" (design: Code.exe lives in an ASCII place; an odd environment falls back).
#[cfg(windows)]
#[test]
fn a_non_utf8_program_path_is_not_found() {
    use std::os::windows::ffi::OsStringExt;
    let odd = std::ffi::OsString::from_wide(&[b'C' as u16, b':' as u16, b'\\' as u16, 0xD800, b'.' as u16, b'e' as u16, b'x' as u16, b'e' as u16]);
    let out = open_file_with(Path::new(&odd), Path::new(FILE), Path::new(CWD), &probe_file, |_| Ok(()));
    assert!(matches!(out, OpenFile::NotFound), "{out:?}");
}
