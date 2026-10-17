//! TDD (unit-test-writer, 2026-10-17): `external_apps/launch.rs` -- the launch plan (`plan`) and the process creation
//! (`spawn`).
//! Specs: SPEC-0300-0021 R-1520 / R-1521 (`args_for_file` only when the target is a FILE and it is written), R-1523 (every
//! element stays ONE argument), R-1524 (`%` is not expanded in `args`; no `{...}` in `program`), R-1525 (paths as the file list
//! has them; folder target passed as it is), R-1531 (a folder target: `{path}` = `{dir}`), R-1534 / AC-1541 (`.zip` is a normal
//! file), R-1544 (the process gets the RESOLVED absolute path; no shell), R-1545 (working folder = `{dir}`), R-1546 (stdin /
//! stdout / stderr all null, no waiting), R-1547 (no special console handling), R-1548 (no elevation), AC-1510, AC-1511, AC-1528
//! (the OS error 740 is just an OS error: see `guarded_tests.rs`, where `spawn` is injected);
//! SPEC-0200-0001 §3.16.2 (`launch.rs`), §3.16.4 3-4, §3.16.15 (no `creation_flags`).
//!
//! NOTHING IS LAUNCHED here. `plan` is pure. `spawn` is exercised only with an executable that does not exist (the OS refuses
//! before any process is created); its success path and its stdio / no-wait properties are pinned by the static tests in
//! `external_apps_structure_tests.rs` and by the CDP E2E with the test probe executable (AC-1522, AC-1527).
//!
//! Contract the implementer must satisfy (module `external_apps::launch`, declared in `external_apps/mod.rs` as
//! `#[cfg(test)] mod launch_tests;`):
//!
//! ```ignore
//! #[derive(Debug, Clone, PartialEq, Eq)]
//! pub struct LaunchPlan { pub exe: ResolvedExe, pub args: Vec<std::ffi::OsString>, pub cwd: std::path::PathBuf }
//! /// `app.args` / `app.args_for_file` are already validated templates (the registry parsed them); expect() is acceptable inside.
//! pub fn plan(app: &RegisteredApp, target: &Target, exe: ResolvedExe) -> LaunchPlan;
//! /// The ONLY place that creates a process (`std::process::Command::new(plan.exe.path())`): stdin / stdout / stderr = `Stdio::null()`,
//! /// `current_dir(plan.cwd)`, no `creation_flags`, no waiting, the child handle is dropped. Errors are returned unchanged (R-1573).
//! pub fn spawn(plan: &LaunchPlan) -> std::io::Result<()>;
//! ```

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use super::exists::Probe;
use super::launch::{plan, spawn, LaunchPlan};
use super::program::{resolve, ResolvedExe};
use super::registry::{RegisteredApp, Registry};
use super::target::{Kind, Target};
use crate::shared::schema::external_apps::{ExternalAppsRaw, RawExternalApp, RawValue};

// ------------------------------------------------------------------ builders

fn env(name: &str) -> Option<OsString> {
    match name.to_uppercase().as_str() {
        "LOCALAPPDATA" => Some(OsString::from(r"C:\Users\u\AppData\Local")),
        "SYSTEMROOT" => Some(OsString::from(r"C:\Windows")),
        _ => None,
    }
}

fn defaults() -> Vec<RegisteredApp> {
    Registry::from_raw(&ExternalAppsRaw::Missing, &env, Some(OsString::from(r"C:\bin"))).apps
}

fn exe_for(app: &RegisteredApp) -> ResolvedExe {
    // every candidate "exists": this is only to obtain the value `plan` needs
    resolve(&app.program, Some(OsStr::new(r"C:\bin")), &|_: &Path| Probe::File).expect("resolvable with an all-files probe")
}

fn custom(args: &[&str], args_for_file: Option<&[&str]>) -> RegisteredApp {
    let to_vec = |v: &[&str]| RawValue::Value(v.iter().map(|x| x.to_string()).collect::<Vec<_>>());
    let raw = RawExternalApp {
        name: RawValue::Value("custom".into()),
        program: RawValue::Value(r"C:\t\custom.exe".into()),
        args: to_vec(args),
        args_for_file: args_for_file.map_or(RawValue::Missing, to_vec),
        key: RawValue::Missing,
    };
    let r = Registry::from_raw(&ExternalAppsRaw::Array(vec![raw]), &env, None);
    assert_eq!(r.apps.len(), 1, "the fixture must be a valid registration: {:?}", r.invalid);
    r.apps.into_iter().next().unwrap()
}

fn target(path: &str, kind: Kind) -> Target {
    Target { path: path.to_string(), kind }
}

fn planned(app: &RegisteredApp, t: &Target) -> LaunchPlan {
    plan(app, t, exe_for(app))
}

fn args_of(p: &LaunchPlan) -> Vec<String> {
    p.args.iter().map(|a| a.to_string_lossy().to_string()).collect()
}

fn strs(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| x.to_string()).collect()
}

// ------------------------------------------------------------------ AC-1510: the default four against four targets

#[test]
fn ac1510_i_a_folder_target_gives_the_folder_to_all_four() {
    let apps = defaults();
    let t = target(r"C:\t\d d", Kind::Dir);
    assert_eq!(args_of(&planned(&apps[0], &t)), strs(&["-d", r"C:\t\d d"]), "terminal");
    assert_eq!(args_of(&planned(&apps[1], &t)), strs(&[r"C:\t\d d"]), "VS Code");
    assert_eq!(args_of(&planned(&apps[2], &t)), strs(&[r"C:\t\d d"]), "explorer");
    assert_eq!(args_of(&planned(&apps[3], &t)), strs(&[r"C:\t\d d"]), "GitHub Desktop");
    for a in &apps {
        assert_eq!(planned(a, &t).cwd, PathBuf::from(r"C:\t\d d"), "R-1545");
    }
}

#[test]
fn ac1510_ii_a_file_target() {
    let apps = defaults();
    let t = target(r"C:\t\d d\a b.txt", Kind::File);
    assert_eq!(args_of(&planned(&apps[0], &t)), strs(&["-d", r"C:\t\d d"]), "terminal: the file's folder");
    assert_eq!(args_of(&planned(&apps[1], &t)), strs(&[r"C:\t\d d\a b.txt"]), "VS Code: the file itself");
    assert_eq!(
        args_of(&planned(&apps[2], &t)),
        strs(&["/select,", r"C:\t\d d\a b.txt"]),
        "explorer: the two-element args_for_file (spike S-2)"
    );
    assert_eq!(args_of(&planned(&apps[3], &t)), strs(&[r"C:\t\d d"]), "GitHub Desktop: the file's folder");
    for a in &apps {
        assert_eq!(planned(a, &t).cwd, PathBuf::from(r"C:\t\d d"), "R-1545: the working folder is {{dir}}");
    }
}

#[test]
fn ac1510_iii_a_file_in_a_drive_root() {
    let apps = defaults();
    let t = target(r"C:\x.txt", Kind::File);
    let terminal = planned(&apps[0], &t);
    assert_eq!(args_of(&terminal), strs(&["-d", r"C:\"]));
    assert_eq!(terminal.cwd, PathBuf::from(r"C:\"));
    assert_eq!(args_of(&planned(&apps[1], &t)), strs(&[r"C:\x.txt"]));
}

#[test]
fn ac1510_iv_a_file_at_the_top_of_a_unc_share() {
    let apps = defaults();
    let t = target(r"\\srv\sh\y.txt", Kind::File);
    let terminal = planned(&apps[0], &t);
    assert_eq!(args_of(&terminal), strs(&["-d", r"\\srv\sh\"]));
    assert_eq!(terminal.cwd, PathBuf::from(r"\\srv\sh\"));
}

#[test]
fn the_explorer_folder_target_uses_args_not_args_for_file() {
    let apps = defaults();
    let t = target(r"C:\t\d d", Kind::Dir);
    assert_eq!(args_of(&planned(&apps[2], &t)), strs(&[r"C:\t\d d"]), "R-1521: only a FILE uses args_for_file");
}

#[test]
fn ac1541_a_zip_file_is_a_normal_file_and_uses_args_for_file() {
    let apps = defaults();
    let t = target(r"C:\t\archive.zip", Kind::File);
    assert_eq!(args_of(&planned(&apps[2], &t)), strs(&["/select,", r"C:\t\archive.zip"]));
    assert_eq!(args_of(&planned(&apps[0], &t)), strs(&["-d", r"C:\t"]));
}

#[test]
fn a_folder_target_is_passed_exactly_as_the_file_list_has_it_r1525() {
    let apps = defaults();
    for path in [r"C:\t\", r"C:\", r"\\srv\sh", r"\\srv\sh\", r"C:\t\d d"] {
        let t = target(path, Kind::Dir);
        let terminal = planned(&apps[0], &t);
        assert_eq!(args_of(&terminal), strs(&["-d", path]), "{path}: no trailing `\\` added or removed");
        assert_eq!(terminal.cwd, PathBuf::from(path), "{path}");
    }
}

#[test]
fn r1531_for_a_folder_path_and_dir_are_the_same_value() {
    let app = custom(&["{path}", "{dir}"], None);
    let p = planned(&app, &target(r"C:\w\cur", Kind::Dir));
    assert_eq!(args_of(&p), strs(&[r"C:\w\cur", r"C:\w\cur"]));
}

// ------------------------------------------------------------------ args_for_file selection (R-1521)

#[test]
fn args_for_file_is_used_only_for_a_file_and_only_when_written() {
    let both = custom(&["A"], Some(&["F"]));
    assert_eq!(args_of(&planned(&both, &target(r"C:\w\a.txt", Kind::File))), strs(&["F"]));
    assert_eq!(args_of(&planned(&both, &target(r"C:\w\d", Kind::Dir))), strs(&["A"]));
    let only_args = custom(&["A"], None);
    assert_eq!(args_of(&planned(&only_args, &target(r"C:\w\a.txt", Kind::File))), strs(&["A"]));
}

#[test]
fn an_empty_args_gives_no_arguments_but_still_a_working_folder() {
    let app = custom(&[], None);
    let p = planned(&app, &target(r"C:\w\a.txt", Kind::File));
    assert!(p.args.is_empty());
    assert_eq!(p.cwd, PathBuf::from(r"C:\w"));
}

// ------------------------------------------------------------------ AC-1511, R-1523, R-1524

#[test]
fn ac1511_braces_and_odd_paths() {
    let app = custom(&["{{x}}", "a{path}b", "{path}{dir}"], None);
    let path = r"C:\w\{dir};&\%TEMP%";
    let p = planned(&app, &target(path, Kind::Dir));
    assert_eq!(args_of(&p), vec!["{x}".to_string(), format!("a{path}b"), format!("{path}{path}")]);
    assert_eq!(p.args.len(), 3, "the number of arguments never changes");
}

#[test]
fn every_element_is_one_argument_whatever_it_contains() {
    let app = custom(&["{path}", "x {dir} y", "{path}"], None);
    let t = target(r#"C:\a b\"q",;&%\f x.txt"#, Kind::File);
    let p = planned(&app, &t);
    assert_eq!(p.args.len(), 3);
    assert_eq!(p.args[0], OsString::from(r#"C:\a b\"q",;&%\f x.txt"#));
    assert_eq!(p.args[1], OsString::from(r#"x C:\a b\"q",;&% y"#));
}

#[test]
fn r1524_percent_signs_in_args_are_passed_as_they_are() {
    let app = custom(&["%TEMP%", "100%", "%LOCALAPPDATA%\\x"], None);
    let p = planned(&app, &target(r"C:\w", Kind::Dir));
    assert_eq!(args_of(&p), strs(&["%TEMP%", "100%", "%LOCALAPPDATA%\\x"]));
}

#[test]
fn r1522_a_substituted_path_is_never_rescanned() {
    let app = custom(&["{path}"], None);
    let p = planned(&app, &target(r"C:\w\{path}\{dir}\{{", Kind::Dir));
    assert_eq!(args_of(&p), strs(&[r"C:\w\{path}\{dir}\{{"]));
}

// ------------------------------------------------------------------ the executable (R-1544)

#[test]
fn the_plan_carries_the_resolved_executable_unchanged() {
    let apps = defaults();
    let exe = resolve("wt.exe", Some(OsStr::new(r"C:\bin")), &|_: &Path| Probe::File).unwrap();
    let p = plan(&apps[0], &target(r"C:\w", Kind::Dir), exe.clone());
    assert_eq!(p.exe, exe);
    assert_eq!(p.exe.path(), Path::new(r"C:\bin\wt.exe"));
}

// ------------------------------------------------------------------ spawn: errors only (nothing is launched)

#[test]
fn spawn_of_an_executable_that_does_not_exist_is_an_error_and_creates_no_process() {
    let exe = resolve(r"Z:\no\such\folder\rf-never-exists.exe", None, &|_: &Path| Probe::File).expect("the all-files probe lets it through");
    let p = LaunchPlan { exe, args: vec![OsString::from("x")], cwd: std::env::temp_dir() };
    let err = spawn(&p).expect_err("the OS must refuse a path that does not exist");
    // the error is the OS's own, handed back as it is (R-1573): it has an OS code and a message
    assert!(err.raw_os_error().is_some(), "{err:?}");
    assert!(!err.to_string().is_empty());
}

#[test]
fn spawn_with_a_working_folder_that_does_not_exist_is_an_error_too() {
    let exe = resolve(r"Z:\no\such\folder\rf-never-exists.exe", None, &|_: &Path| Probe::File).unwrap();
    let p = LaunchPlan { exe, args: vec![], cwd: PathBuf::from(r"Z:\no\such\cwd") };
    assert!(spawn(&p).is_err());
}
