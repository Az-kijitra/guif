//! TDD (unit-test-writer, 2026-10-17): the E2E scope check for launching a registered external app (`check_launch`).
//! Specs: SPEC-0300-0021 R-1584 / R-1577 / AC-1525 (while the scope is active, the executable (after resolution) AND the target must
//! BOTH be inside the scope folder; judged on normalised paths like R-10-3 / R-10-6; undecidable = refuse), R-1585 3;
//! SPEC-0400-0001 第6版 R-10-5 (the OS-association launch `viewer_os_open_path` stays "always refused": `check_external_launch` is
//! NOT changed), AC-10; SPEC-0200-0001 §3.16.5 (`Scope::check_launch(exe, target)`, the target by the `check_source` rule: parent
//! canonicalised + the name, and the link-resolved real path inside too; the executable: the same rule on the resolved file; no
//! scope = always allowed), §3.16.15 MUST-141 (c) (ONE call, after the resolution).
//!
//! Contract the implementer must satisfy (additions to `shared/e2e_scope.rs`; this file is declared in `shared/mod.rs` as
//! `#[cfg(test)] mod e2e_scope_launch_tests;`):
//!
//! ```ignore
//! impl Scope { pub fn check_launch(&self, exe: &Path, target: &Path) -> Result<(), ScopeViolation>; }
//! pub fn check_launch(exe: &Path, target: &Path) -> Result<(), ScopeViolation>;   // consults the scope like the other free check_* fns
//! ```
//!
//! A TARGET THAT NO LONGER EXISTS but whose parent is inside the scope is allowed here (the existence is `target::verify`'s job and
//! must produce W-96, AC-1517, instead of W-99): see `external_apps/guarded_tests.rs::ac1517_...`. A missing EXECUTABLE is refused
//! (it cannot be judged; the resolution already guaranteed it exists).
//!
//! No `env::set_var`; the junction tests print `SKIP: ...` when `mklink /J` is not available.

use std::fs;
use std::path::{Path, PathBuf};

use super::e2e_scope::{check_external_launch, check_launch, set_test_scope, Scope, ScopeViolation};

struct Env {
    _base: tempfile::TempDir,
    root: PathBuf,
    outside: PathBuf,
    evil: PathBuf,
    scope: Scope,
}

fn canon(p: &Path) -> PathBuf {
    fs::canonicalize(p).unwrap_or_else(|e| panic!("canonicalize {}: {e}", p.display()))
}

fn env() -> Env {
    let base = tempfile::tempdir().expect("tempdir");
    let root = base.path().join("root");
    let outside = base.path().join("outside");
    let evil = base.path().join("root-evil");
    for d in [&root, &outside, &evil] {
        fs::create_dir_all(d).unwrap();
    }
    fs::write(root.join("tool.exe"), b"MZ").unwrap();
    fs::write(root.join("in.txt"), "in").unwrap();
    fs::create_dir(root.join("sub")).unwrap();
    fs::write(outside.join("copy.exe"), b"MZ").unwrap();
    fs::write(outside.join("out.txt"), "out").unwrap();
    fs::write(evil.join("e.exe"), b"MZ").unwrap();
    let root = canon(&root);
    let scope = Scope::new(root.clone());
    Env { _base: base, root, outside: canon(&outside), evil: canon(&evil), scope }
}

fn dir_link(link: &Path, target: &Path) -> bool {
    std::process::Command::new("cmd").args(["/C", "mklink", "/J"]).arg(link).arg(target).output().map(|o| o.status.success()).unwrap_or(false)
}

fn ok(r: Result<(), ScopeViolation>, what: &str) {
    assert!(r.is_ok(), "{what} must be allowed, got {r:?}");
}

fn denied(r: Result<(), ScopeViolation>, what: &str) {
    assert!(r.is_err(), "{what} must be refused");
}

// ------------------------------------------------------------------ the four quadrants (AC-1525)

#[test]
fn both_inside_is_allowed() {
    let e = env();
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &e.root.join("in.txt")), "exe inside + file inside");
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &e.root.join("sub")), "exe inside + folder inside");
}

#[test]
fn the_scope_root_itself_is_a_valid_target() {
    // the current folder of an E2E run is usually the fixture root (R-1531 / AC-1513)
    let e = env();
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &e.root), "target = the scope root");
}

#[test]
fn an_executable_outside_the_scope_is_refused() {
    let e = env();
    denied(e.scope.check_launch(&e.outside.join("copy.exe"), &e.root.join("in.txt")), "exe outside + file inside (the copy outside the scope, AC-1525)");
}

#[test]
fn a_target_outside_the_scope_is_refused() {
    let e = env();
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &e.outside.join("out.txt")), "exe inside + file outside");
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &e.outside), "exe inside + folder outside");
}

#[test]
fn both_outside_is_refused() {
    let e = env();
    denied(e.scope.check_launch(&e.outside.join("copy.exe"), &e.outside.join("out.txt")), "both outside");
}

#[test]
fn a_sibling_whose_name_starts_with_the_root_name_is_outside() {
    let e = env();
    denied(e.scope.check_launch(&e.evil.join("e.exe"), &e.root.join("in.txt")), "exe in root-evil");
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &e.evil), "target root-evil");
}

#[test]
fn the_comparison_ignores_case() {
    let e = env();
    let upper = PathBuf::from(e.root.to_string_lossy().to_uppercase());
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &upper.join("IN.TXT")), "upper-cased target path");
}

// ------------------------------------------------------------------ undecidable = refuse (R-10-3 / R-10-6)

#[test]
fn relative_empty_and_dotdot_paths_are_refused() {
    let e = env();
    let tool = e.root.join("tool.exe");
    for bad in ["in.txt", r".\in.txt", r"..\outside\out.txt", "", "C:in.txt"] {
        denied(e.scope.check_launch(&tool, Path::new(bad)), &format!("target {bad:?}"));
    }
    denied(e.scope.check_launch(Path::new("tool.exe"), &e.root.join("in.txt")), "a bare executable name");
    denied(e.scope.check_launch(Path::new(r"..\tool.exe"), &e.root.join("in.txt")), "a relative executable");
    let dotdot = PathBuf::from(format!(r"{}\sub\..\..\outside\out.txt", e.root.display()));
    denied(e.scope.check_launch(&tool, &dotdot), "a `..` that climbs out of the scope");
}

#[test]
fn a_missing_executable_is_refused_because_it_cannot_be_judged() {
    let e = env();
    denied(e.scope.check_launch(&e.root.join("not-there.exe"), &e.root.join("in.txt")), "exe that does not exist");
}

#[test]
fn a_target_that_vanished_inside_the_scope_is_not_a_violation() {
    // AC-1517: the file is deleted after the menu was opened. The scope is not what is wrong; `verify` reports W-96.
    let e = env();
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &e.root.join("deleted.txt")), "a missing file whose parent is inside");
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &e.root.join("sub").join("deleted.txt")), "a missing file in an existing sub folder");
}

#[test]
fn a_vanished_target_outside_the_scope_is_still_refused() {
    let e = env();
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &e.outside.join("deleted.txt")), "a missing file whose parent is outside");
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &e.root.join("no-such-dir").join("deleted.txt")), "a parent that cannot be resolved");
}

// ------------------------------------------------------------------ links (R-10-6)

#[test]
fn a_junction_inside_the_scope_that_leads_outside_is_refused_for_the_target_and_for_the_executable() {
    let e = env();
    let link = e.root.join("lnk");
    if !dir_link(&link, &e.outside) {
        return eprintln!("SKIP: cannot create a junction here (mklink /J failed)");
    }
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &link.join("out.txt")), "target reached through a junction that leaves the scope");
    denied(e.scope.check_launch(&e.root.join("tool.exe"), &link), "the junction itself as a folder target");
    denied(e.scope.check_launch(&link.join("copy.exe"), &e.root.join("in.txt")), "executable reached through a junction that leaves the scope");
    let _ = fs::remove_dir(&link);
}

#[test]
fn a_junction_inside_the_scope_that_stays_inside_is_fine() {
    let e = env();
    let link = e.root.join("lnk-in");
    if !dir_link(&link, &e.root.join("sub")) {
        return eprintln!("SKIP: cannot create a junction here (mklink /J failed)");
    }
    ok(e.scope.check_launch(&e.root.join("tool.exe"), &link), "a junction to a folder inside");
    let _ = fs::remove_dir(&link);
}

// ------------------------------------------------------------------ the free function and the OS-association launch

#[test]
fn the_free_function_follows_the_active_scope() {
    let e = env();
    let _guard = set_test_scope(e.scope.clone());
    ok(check_launch(&e.root.join("tool.exe"), &e.root.join("in.txt")), "inside");
    denied(check_launch(&e.outside.join("copy.exe"), &e.root.join("in.txt")), "exe outside");
    denied(check_launch(&e.root.join("tool.exe"), &e.outside.join("out.txt")), "target outside");
}

#[test]
fn without_a_scope_everything_is_allowed_as_in_a_release_build() {
    // no `set_test_scope` and the process-wide scope is never initialised by unit tests
    ok(check_launch(Path::new(r"Z:\no\where\x.exe"), Path::new(r"Z:\no\where\y")), "no scope: always allowed (R-1584: release builds)");
    ok(check_launch(Path::new("relative.exe"), Path::new("relative")), "no scope: not even the shape is judged");
}

#[test]
fn the_os_association_launch_is_still_always_refused_and_unchanged() {
    // SPEC-0400-0001 R-10-5: only the registered-app launch gets the new rule.
    let e = env();
    denied(e.scope.check_external_launch(&e.root.join("in.txt")), "check_external_launch on a path INSIDE the scope");
    denied(e.scope.check_external_launch(&e.outside.join("out.txt")), "check_external_launch outside");
    let _guard = set_test_scope(e.scope.clone());
    denied(check_external_launch(&e.root.join("in.txt")), "the free check_external_launch under an active scope");
}
