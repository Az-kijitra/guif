//! TDD (unit-test-writer, 2026-10-17): `external_apps/program.rs` -- `%NAME%` expansion, the shape check of `program`,
//! and the executable lookup (`resolve`).
//! Specs: SPEC-0300-0021 R-1540 (1 expand, 2 absolute path, 3 a bare name searched in the start-up `PATH`: empty and non-absolute
//! elements skipped, never the current folder or the app folder, `.exe` added to a name without an extension, 4 anything else with a
//! separator is not valid), R-1540-1 (expansion form `%name%`, name = letters / digits / `_` / `(` / `)` with a letter or `_` first,
//! case-insensitive; a `%` that does not form it stays literal; one pass; an undefined variable = invalid registration; the displayed
//! `{program}` is the expanded value), R-1541 (`.exe` only, any case), R-1542 / AC-1529 (existence is asked at every launch),
//! R-1543, R-1544 (the process gets the RESOLVED absolute path), AC-1520 (i)(ii)(iii), AC-1503, AC-1529;
//! SPEC-0200-0001 §3.16.2 `program.rs` / §3.16.4 / §3.16.15 SHOULD-215 (c) (`resolve` never looks at the current folder: the
//! "current folder has tool.exe" case is checked by an injected `probe`, not by `set_current_dir`).
//!
//! Contract the implementer must satisfy (module `external_apps::program`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod program_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Eq)] pub enum ProgramError { .. }                       // any payload
//! /// R-1540-1: expand `%name%` with the injected environment (one pass, no re-expansion).
//! pub fn expand_env(spec: &str, env: &dyn Fn(&str) -> Option<std::ffi::OsString>) -> Result<String, ProgramError>;  // Err = undefined variable
//! /// R-1540 2-4 + R-1541 on the EXPANDED value: Ok for an absolute path / a bare name whose extension is `.exe` (any case) or missing.
//! /// A "bare name" has NO `\`, `/` and NO `:` -- `C:x.exe` (drive-relative) is a relative PATH in the sense of R-1540 4, and is refused
//! /// by `validate_program`; `resolve` returns None for it without probing anything.
//! pub fn validate_program(expanded: &str) -> Result<(), ProgramError>;
//! #[derive(Debug, Clone, PartialEq, Eq)] pub struct ResolvedExe { /* private field: only this module can build one (AC-1520-1) */ }
//! impl ResolvedExe { pub fn path(&self) -> &std::path::Path; }
//! /// R-1540 2 / 3. `probe` is `exists::probe` in production. Returns the ABSOLUTE path of the first `File`.
//! pub fn resolve(program: &str, path_var: Option<&std::ffi::OsStr>, probe: &dyn Fn(&std::path::Path) -> super::exists::Probe) -> Option<ResolvedExe>;
//! ```

use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use super::exists::Probe;
use super::program::{expand_env, resolve, validate_program};

fn env_of(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
    // Windows environment lookups ignore case: the closure does too, so the test does not depend on which spelling the
    // implementation passes (the name as written, or upper-cased).
    let map: BTreeMap<String, String> = pairs.iter().map(|(k, v)| (k.to_uppercase(), v.to_string())).collect();
    move |name: &str| map.get(&name.to_uppercase()).map(OsString::from)
}

fn expanded(spec: &str, pairs: &[(&str, &str)]) -> String {
    expand_env(spec, &env_of(pairs)).unwrap_or_else(|e| panic!("`{spec}` must expand: {e:?}"))
}

// ------------------------------------------------------------------ expand_env (R-1540-1)

#[test]
fn a_defined_variable_is_expanded_anywhere_in_the_value() {
    let env = [("LOCALAPPDATA", r"C:\Users\u\AppData\Local"), ("SystemRoot", r"C:\Windows")];
    assert_eq!(
        expanded(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe", &env),
        r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe"
    );
    assert_eq!(expanded(r"%SystemRoot%\explorer.exe", &env), r"C:\Windows\explorer.exe");
    assert_eq!(expanded("no variables.exe", &env), "no variables.exe");
}

#[test]
fn the_variable_name_is_case_insensitive() {
    assert_eq!(expanded(r"%localappdata%\x.exe", &[("LOCALAPPDATA", r"C:\L")]), r"C:\L\x.exe");
    assert_eq!(expanded(r"%LocalAppData%\x.exe", &[("localappdata", r"C:\L")]), r"C:\L\x.exe");
}

#[test]
fn names_may_contain_parentheses_and_start_with_an_underscore() {
    assert_eq!(expanded(r"%ProgramFiles(x86)%\a.exe", &[("ProgramFiles(x86)", r"C:\PF86")]), r"C:\PF86\a.exe");
    assert_eq!(expanded(r"%_MY1%\a.exe", &[("_MY1", r"C:\M")]), r"C:\M\a.exe");
}

#[test]
fn several_variables_and_adjacent_variables() {
    let env = [("A", r"C:\a"), ("B", "b")];
    assert_eq!(expanded(r"%A%\%B%.exe", &env), r"C:\a\b.exe");
    assert_eq!(expanded("%A%%B%", &env), r"C:\ab");
}

#[test]
fn an_undefined_variable_is_an_error() {
    let env = env_of(&[("A", "x")]);
    for spec in [r"%UNDEFINED_VAR%\x.exe", r"%A%\%NOPE%.exe", "%nope%"] {
        assert!(expand_env(spec, &env).is_err(), "`{spec}` names an undefined variable (R-1540-1 3, AC-1503)");
    }
}

#[test]
fn a_percent_that_does_not_form_a_name_stays_literal_and_is_not_an_error() {
    let env = [("A", "x")];
    // a single `%`, a doubled `%%`, a name that starts with a digit, a name with a space or a backslash in it
    for literal in [r"C:\100%\x.exe", "50%.exe", "%%", r"C:\a%%b.exe", "%1%", r"%1A%\x.exe", "%a b%", r"C:\10%\a\5%\x.exe", "%", "%-%"] {
        assert_eq!(expanded(literal, &env), literal, "`{literal}` has no `%name%` and must stay as it is");
    }
}

#[test]
fn an_expanded_value_is_not_expanded_again() {
    let env = [("ONE", "%TWO%"), ("TWO", "x")];
    assert_eq!(expanded(r"%ONE%\a.exe", &env), r"%TWO%\a.exe");
    // and a `%` produced by an expansion does not pair with a later `%`
    let env = [("P", "100%")];
    assert_eq!(expanded(r"%P%\a%.exe", &env), r"100%\a%.exe");
}

#[test]
fn the_env_function_is_asked_only_for_names_that_have_the_expansion_form() {
    let asked = RefCell::new(Vec::<String>::new());
    let env = |name: &str| {
        asked.borrow_mut().push(name.to_string());
        Some(OsString::from("v"))
    };
    let out = expand_env(r"C:\100%\%A_1%\%1%\x.exe", &env).unwrap();
    assert_eq!(out, r"C:\100%\v\%1%\x.exe");
    assert_eq!(asked.borrow().len(), 1, "{:?}", asked.borrow());
}

// ------------------------------------------------------------------ validate_program (R-1540 2-4, R-1541, AC-1503)

#[test]
fn valid_programs() {
    for ok in [
        r"C:\Tools\x.exe",
        r"C:\Program Files\a b\x.exe",
        r"X.EXE",
        r"C:\X\Y.Exe",
        r"\\srv\share\tools\x.exe",
        r"C:\100%\x.exe", // an unpaired `%` was left literal by the expansion (AC-1503)
        "wt.exe",
        "tool", // no extension: `.exe` is added when it is looked up in PATH
        "TOOL",
    ] {
        assert!(validate_program(ok).is_ok(), "`{ok}` must be valid");
    }
}

#[test]
fn only_the_exe_extension_is_allowed_r1541() {
    for bad in [
        "x.bat", "x.cmd", "x.ps1", "x.lnk", "x.com", "x.vbs", r"C:\t\x.bat", r"C:\t\X.CMD", r"C:\t\x.lnk", "x.exe.bat", r"C:\t\x",
    ] {
        assert!(validate_program(bad).is_err(), "`{bad}` must be rejected (R-1541)");
    }
}

#[test]
fn relative_paths_are_rejected_r1540_4() {
    for bad in [r"bin\x.exe", r"..\x.exe", r".\x.exe", "bin/x.exe", "C:x.exe", r"\x.exe", "/x.exe", r"..\..\x.exe", r"sub\dir\x.exe"] {
        assert!(validate_program(bad).is_err(), "`{bad}` is not an absolute path nor a bare name (R-1540 4)");
    }
}

#[test]
fn empty_and_blank_programs_are_rejected() {
    for bad in ["", " ", "\t"] {
        assert!(validate_program(bad).is_err(), "{bad:?}");
    }
}

// ------------------------------------------------------------------ resolve: absolute paths (R-1540 2)

fn files(list: &[&str]) -> impl Fn(&Path) -> Probe {
    let set: BTreeSet<String> = list.iter().map(|p| p.to_lowercase()).collect();
    move |p: &Path| {
        if set.contains(&p.to_string_lossy().to_lowercase()) {
            Probe::File
        } else {
            Probe::Missing
        }
    }
}

fn path_of(program: &str, path_var: Option<&str>, probe: &dyn Fn(&Path) -> Probe) -> Option<PathBuf> {
    resolve(program, path_var.map(OsStr::new), probe).map(|r| r.path().to_path_buf())
}

#[test]
fn an_existing_absolute_file_resolves_to_itself() {
    let probe = files(&[r"D:\p2\tool.exe"]);
    assert_eq!(path_of(r"D:\p2\tool.exe", None, &probe), Some(PathBuf::from(r"D:\p2\tool.exe")));
}

#[test]
fn a_missing_absolute_file_and_a_folder_are_not_found() {
    let probe = files(&[]);
    assert_eq!(path_of(r"D:\p2\tool.exe", None, &probe), None);
    let folder = |p: &Path| if p == Path::new(r"D:\p2") { Probe::Dir } else { Probe::Missing };
    assert_eq!(path_of(r"D:\p2", None, &folder), None, "AC-1520 (ii): the path names a folder");
    let dir_named_exe = |_: &Path| Probe::Dir;
    assert_eq!(path_of(r"D:\p2\tool.exe", None, &dir_named_exe), None, "a folder called tool.exe is not a program");
}

#[test]
fn an_absolute_path_never_consults_path() {
    let asked = RefCell::new(Vec::<PathBuf>::new());
    let probe = |p: &Path| {
        asked.borrow_mut().push(p.to_path_buf());
        Probe::Missing
    };
    assert_eq!(path_of(r"D:\p2\tool.exe", Some(r"D:\p1;D:\p3"), &probe), None);
    assert_eq!(asked.borrow().as_slice(), [PathBuf::from(r"D:\p2\tool.exe")]);
}

#[test]
fn a_unc_absolute_path_is_used_as_it_is() {
    let probe = files(&[r"\\srv\share\t\x.exe"]);
    assert_eq!(path_of(r"\\srv\share\t\x.exe", None, &probe), Some(PathBuf::from(r"\\srv\share\t\x.exe")));
}

// ------------------------------------------------------------------ resolve: a bare name in PATH (R-1540 3, AC-1520)

const PATH_VAR: &str = r"D:\p1;;.;bin;D:\p2";

/// `D:\p2\tool.exe` is the only real one; every "wrong place" also has a `tool.exe` (the current folder, the app folder,
/// `.`, `bin`) -- they must never be chosen (M-3, SHOULD-215 (c)).
fn decoy_probe(asked: &RefCell<Vec<PathBuf>>) -> impl Fn(&Path) -> Probe + '_ {
    move |p: &Path| {
        asked.borrow_mut().push(p.to_path_buf());
        let s = p.to_string_lossy().to_lowercase();
        let decoys = ["tool.exe", r".\tool.exe", r"bin\tool.exe", r"c:\app\tool.exe", r"c:\cwd\tool.exe", "./tool.exe"];
        if s == r"d:\p2\tool.exe" || decoys.contains(&s.as_str()) {
            Probe::File
        } else {
            Probe::Missing
        }
    }
}

#[test]
fn ac1520_i_a_name_is_found_in_the_first_absolute_path_element_that_has_it() {
    let asked = RefCell::new(Vec::new());
    let probe = decoy_probe(&asked);
    for program in ["tool", "tool.exe", "TOOL", "Tool.EXE"] {
        // the file system ignores case, so the resolved path keeps the spelling of the program; compare without case
        let found = path_of(program, Some(PATH_VAR), &probe).map(|p| p.to_string_lossy().to_lowercase());
        assert_eq!(found.as_deref(), Some(r"d:\p2\tool.exe"), "{program}");
    }
}

#[test]
fn ac1520_i_a_program_made_of_an_expanded_variable_resolves_the_same_way() {
    let asked = RefCell::new(Vec::new());
    let probe = decoy_probe(&asked);
    let value = expanded(r"%MYDIR%\tool.exe", &[("MYDIR", r"D:\p2")]);
    assert_eq!(path_of(&value, Some(PATH_VAR), &probe), Some(PathBuf::from(r"D:\p2\tool.exe")));
}

#[test]
fn empty_dot_and_relative_path_elements_are_skipped_without_even_being_asked() {
    let asked = RefCell::new(Vec::new());
    let probe = decoy_probe(&asked);
    let _ = path_of("tool", Some(PATH_VAR), &probe);
    for p in asked.borrow().iter() {
        let s = p.to_string_lossy();
        assert!(
            s.len() > 2 && s.as_bytes()[1] == b':' && (s.as_bytes()[2] == b'\\' || s.as_bytes()[2] == b'/'),
            "only absolute paths may be probed, but `{s}` was (M-3: no current folder, no app folder, no `.` / `bin`)"
        );
    }
    assert_eq!(asked.borrow().len(), 2, "D:\\p1\\tool.exe and D:\\p2\\tool.exe only: {:?}", asked.borrow());
}

#[test]
fn drive_relative_root_relative_and_parent_elements_are_skipped_too() {
    let asked = RefCell::new(Vec::new());
    let probe = decoy_probe(&asked);
    let found = path_of("tool", Some(r"C:rel;\rooted;..\up;D:\p2"), &probe);
    assert_eq!(found, Some(PathBuf::from(r"D:\p2\tool.exe")));
    assert_eq!(asked.borrow().len(), 1, "{:?}", asked.borrow());
}

#[test]
fn the_first_match_wins() {
    let probe = files(&[r"D:\p1\tool.exe", r"D:\p2\tool.exe"]);
    assert_eq!(path_of("tool", Some(r"D:\p1;D:\p2"), &probe), Some(PathBuf::from(r"D:\p1\tool.exe")));
    assert_eq!(path_of("tool", Some(r"D:\p2;D:\p1"), &probe), Some(PathBuf::from(r"D:\p2\tool.exe")));
}

#[test]
fn ac1520_iii_an_alias_that_the_probe_reports_as_a_file_is_used() {
    // The probe stands for `exists::probe` where the alias reparse point answers `File` (see exists_tests).
    let probe = files(&[r"D:\p1\tool.exe"]);
    assert_eq!(path_of("tool", Some(PATH_VAR), &probe), Some(PathBuf::from(r"D:\p1\tool.exe")));
}

#[test]
fn a_folder_called_like_the_program_is_skipped_and_the_search_goes_on() {
    let probe = |p: &Path| match p.to_string_lossy().to_lowercase().as_str() {
        r"d:\p1\tool.exe" => Probe::Dir,
        r"d:\p2\tool.exe" => Probe::File,
        _ => Probe::Missing,
    };
    assert_eq!(path_of("tool", Some(r"D:\p1;D:\p2"), &probe), Some(PathBuf::from(r"D:\p2\tool.exe")));
}

#[test]
fn exe_is_added_only_when_the_name_has_no_extension() {
    let asked = RefCell::new(Vec::<String>::new());
    let probe = |p: &Path| {
        asked.borrow_mut().push(p.to_string_lossy().to_lowercase());
        Probe::Missing
    };
    let _ = path_of("tool", Some(r"D:\p2"), &probe);
    let _ = path_of("tool.exe", Some(r"D:\p2"), &probe);
    let _ = path_of("TOOL.EXE", Some(r"D:\p2"), &probe);
    assert_eq!(asked.borrow().as_slice(), [r"d:\p2\tool.exe", r"d:\p2\tool.exe", r"d:\p2\tool.exe"]);
}

#[test]
fn a_trailing_separator_in_a_path_element_is_fine() {
    let probe = files(&[r"D:\p2\tool.exe"]);
    assert_eq!(path_of("tool", Some(r"D:\p2\"), &probe), Some(PathBuf::from(r"D:\p2\tool.exe")));
}

#[test]
fn nothing_found_or_no_path_is_none() {
    let probe = files(&[]);
    assert_eq!(path_of("tool", Some(PATH_VAR), &probe), None);
    assert_eq!(path_of("tool", None, &probe), None);
    assert_eq!(path_of("tool", Some(""), &probe), None);
    assert_eq!(path_of("tool", Some(";;"), &probe), None);
}

#[test]
fn a_value_with_a_separator_that_is_not_absolute_is_never_looked_up() {
    // R-1540 4 is a registration error, but `resolve` must still be safe on such a value (R-1544).
    let asked = Cell::new(0);
    let probe = |_: &Path| {
        asked.set(asked.get() + 1);
        Probe::File
    };
    for bad in [r"bin\x.exe", r"..\x.exe", r".\x.exe", "C:x.exe", r"\x.exe"] {
        assert_eq!(path_of(bad, Some(r"D:\p2"), &probe), None, "{bad}");
    }
    assert_eq!(asked.get(), 0);
}

#[test]
fn ac1529_resolve_asks_again_every_time_so_a_program_installed_later_is_found() {
    let installed = Cell::new(false);
    let probe = |p: &Path| {
        if installed.get() && p == Path::new(r"D:\p2\late.exe") {
            Probe::File
        } else {
            Probe::Missing
        }
    };
    assert_eq!(path_of("late", Some(r"D:\p2"), &probe), None);
    installed.set(true);
    assert_eq!(path_of("late", Some(r"D:\p2"), &probe), Some(PathBuf::from(r"D:\p2\late.exe")));
}

#[test]
fn the_resolved_exe_is_always_an_absolute_path() {
    let probe = |_: &Path| Probe::File;
    for (program, path_var) in [(r"C:\a\x.exe", None), ("x", Some(r"C:\bin")), ("x.exe", Some(r"\\srv\share\bin"))] {
        let resolved = path_of(program, path_var, &probe).expect("resolved");
        let s = resolved.to_string_lossy().to_string();
        assert!(s.starts_with(r"\\") || (s.len() > 2 && &s[1..3] == r":\"), "`{s}` must be absolute (R-1544)");
    }
}
