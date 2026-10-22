//! TDD (unit-test-writer, 2026-10-20): `settings_file/open.rs` -- the order of "設定ファイルを開く" with every outside effect injected
//! (SPEC-0300-0022 R-1600 .. R-1607, R-1610, R-1613, R-1623, R-1681; AC-1600 / AC-1601 / AC-1604 / AC-1605 / AC-1607 / AC-1608 /
//! AC-1611 / AC-1612 / AC-1621; SPEC-0200-0001 §3.17.3 `settings_file/open.rs`). Nothing is launched: the launchers are closures.
//!
//! ```ignore
//! pub struct Paths { pub dir: PathBuf, pub config: PathBuf, pub local_app_data: Option<OsString> }
//! pub enum EditorLaunch { NotFound, Started, OutOfScope, Failed(String) }                   // PartialEq, Debug
//! pub struct OpenIo<'a> {
//!     pub write_sample: &'a dyn Fn(&Path /*dir*/, &str /*sample contents*/) -> io::Result<()>,
//!     pub launch_editor: &'a dyn Fn(&Path /*candidate Code.exe*/, &Path /*config.toml*/, &Path /*cwd = dir*/) -> EditorLaunch,
//!     pub open_by_association: &'a dyn Fn(&Path /*config.toml*/) -> Result<(), String>,
//!     pub scope_check: &'a dyn Fn(&Path) -> Result<(), ScopeViolation>,                      // shared::e2e_scope::ScopeViolation
//!     pub observe: &'a dyn Fn(&str),                                                          // "refused" | "vscode" | "association"
//! }
//! pub enum OpenResult { VsCode, Association, NotAFile, OutOfScope, OpenFailed(String), TemplateFailed(String) }   // PartialEq, Debug
//! pub struct OpenOutcome { pub template_created: bool, pub sample_error: Option<String>, pub result: OpenResult }  // PartialEq, Debug
//! pub fn open_settings_file(paths: &Paths, version: &str, io: &OpenIo) -> OpenOutcome;
//! ```
//! Order (R-1600): 1 sample (error -> `sample_error`, continue) -> 2 scaffold if missing (error -> `TemplateFailed`, STOP) -> 3 the path
//! is a regular file after following links, else `NotAFile` (STOP) -> 4 `scope_check` (Err -> `observe("refused")`, `OutOfScope`, STOP)
//! -> 5 VS Code: only if `vscode_candidate(local_app_data)` is Some: `observe("vscode")` then `launch_editor` (`Started` -> `VsCode`,
//! `Failed(m)` -> `OpenFailed(m)` with NO fallback (T-13), `OutOfScope` -> `OutOfScope`, `NotFound` -> 6) -> 6 `observe("association")`
//! then `open_by_association` (`Ok` -> `Association`, `Err(m)` -> `OpenFailed(m)`).

use std::cell::RefCell;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::open::{open_settings_file, EditorLaunch, OpenIo, OpenOutcome, OpenResult, Paths};
use super::source::{render, Kind};
use crate::shared::e2e_scope::ScopeViolation;

const VERSION: &str = "9.8.7";
const LOCAL: &str = r"C:\Users\u\AppData\Local";
const CODE: &str = r"C:\Users\u\AppData\Local\Programs\Microsoft VS Code\Code.exe";

struct Fixture {
    dir: tempfile::TempDir,
    log: RefCell<Vec<String>>,
}

impl Fixture {
    fn new() -> Self {
        Fixture { dir: tempfile::tempdir().unwrap(), log: RefCell::new(Vec::new()) }
    }
    fn config(&self) -> PathBuf {
        self.dir.path().join("config.toml")
    }
    fn paths(&self, local: Option<&str>) -> Paths {
        Paths { dir: self.dir.path().to_path_buf(), config: self.config(), local_app_data: local.map(OsString::from) }
    }
    fn entry(&self, what: &str) {
        self.log.borrow_mut().push(what.to_string());
    }
    fn log(&self) -> Vec<String> {
        self.log.borrow().clone()
    }
    /// Runs with the given behaviours of the three outside effects; every call is logged.
    fn run(
        &self,
        local: Option<&str>,
        sample: io::Result<()>,
        editor: EditorLaunch,
        assoc: Result<(), String>,
        scope: Result<(), ScopeViolation>,
    ) -> OpenOutcome {
        let sample = RefCell::new(Some(sample));
        let (editor, assoc, scope) = (editor, assoc, scope);
        let write_sample = |dir: &Path, contents: &str| {
            self.entry(&format!("sample:{}:{}", dir == self.dir.path(), contents == render(Kind::Sample, VERSION)));
            sample.borrow_mut().take().unwrap_or(Ok(()))
        };
        let launch_editor = |candidate: &Path, file: &Path, cwd: &Path| {
            self.entry(&format!("editor:{}:{}:{}", candidate == Path::new(CODE), file == self.config(), cwd == self.dir.path()));
            match &editor {
                EditorLaunch::NotFound => EditorLaunch::NotFound,
                EditorLaunch::Started => EditorLaunch::Started,
                EditorLaunch::OutOfScope => EditorLaunch::OutOfScope,
                EditorLaunch::Failed(m) => EditorLaunch::Failed(m.clone()),
            }
        };
        let open_by_association = |file: &Path| {
            self.entry(&format!("assoc:{}", file == self.config()));
            assoc.clone()
        };
        let scope_check = |_: &Path| {
            self.entry("scope");
            scope.clone()
        };
        let observe = |e: &str| self.entry(&format!("observe:{e}"));
        let io = OpenIo { write_sample: &write_sample, launch_editor: &launch_editor, open_by_association: &open_by_association, scope_check: &scope_check, observe: &observe };
        open_settings_file(&self.paths(local), VERSION, &io)
    }
    fn ok(&self, editor: EditorLaunch) -> OpenOutcome {
        self.run(Some(LOCAL), Ok(()), editor, Ok(()), Ok(()))
    }
}

fn violation() -> ScopeViolation {
    ScopeViolation("launching other programs is refused during an E2E run".into())
}

// ------------------------------------------------------------------ the normal path (R-1600, R-1603)

// AC-1601 + R-1600 order: sample -> scaffold -> scope -> record -> VS Code; the file passed is config.toml, the cwd the folder.
#[test]
fn r1600_the_steps_run_in_the_specified_order_and_vs_code_gets_exactly_config_toml() {
    let f = Fixture::new();
    let out = f.ok(EditorLaunch::Started);
    assert_eq!(out, OpenOutcome { template_created: true, sample_error: None, result: OpenResult::VsCode });
    assert_eq!(f.log(), vec!["sample:true:true", "scope", "observe:vscode", "editor:true:true:true"]);
}

// AC-1601: the scaffold is the template rendering of the original, byte for byte (the check "続けて W-A9 + W-AA" needs this too).
#[test]
fn ac1601_the_created_config_toml_is_the_rendered_template() {
    let f = Fixture::new();
    f.ok(EditorLaunch::Started);
    assert_eq!(fs::read(f.config()).unwrap(), render(Kind::Template, VERSION).into_bytes());
    let names: Vec<_> = fs::read_dir(f.dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["config.toml"], "R-1614: this layer writes nothing else (the sample writer is a stub here)");
}

// AC-1600: a config.toml that is there is not created again and is opened as it is.
#[test]
fn ac1600_an_existing_config_toml_is_opened_unchanged() {
    let cases: [(&str, Vec<u8>); 3] =
        [("syntax error", b"this is = = not toml\n".to_vec()), ("0 bytes", Vec::new()), ("BOM", [&[0xEF, 0xBB, 0xBF][..], b"ui_theme = \"dark\"\r\n"].concat())];
    for (what, bytes) in cases {
        let f = Fixture::new();
        fs::write(f.config(), &bytes).unwrap();
        let mtime = fs::metadata(f.config()).unwrap().modified().unwrap();
        let out = f.ok(EditorLaunch::Started);
        assert_eq!(out, OpenOutcome { template_created: false, sample_error: None, result: OpenResult::VsCode }, "{what}");
        assert_eq!(fs::read(f.config()).unwrap(), bytes, "{what}");
        assert_eq!(fs::metadata(f.config()).unwrap().modified().unwrap(), mtime, "{what}");
    }
}

#[test]
fn ac1600_v_a_read_only_config_toml_keeps_its_attribute() {
    let f = Fixture::new();
    fs::write(f.config(), b"ui_theme = \"dark\"\n").unwrap();
    let mut perms = fs::metadata(f.config()).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(f.config(), perms).unwrap();
    let out = f.ok(EditorLaunch::Started);
    assert_eq!(out.result, OpenResult::VsCode);
    assert!(fs::metadata(f.config()).unwrap().permissions().readonly());
    let mut perms = fs::metadata(f.config()).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    perms.set_readonly(false);
    fs::set_permissions(f.config(), perms).unwrap();
}

// ------------------------------------------------------------------ association and failure (AC-1604, AC-1605, T-13)

// AC-1604: VS Code not found => the association function gets config.toml.
#[test]
fn ac1604_vs_code_not_found_falls_back_to_the_association() {
    let f = Fixture::new();
    let out = f.ok(EditorLaunch::NotFound);
    assert_eq!(out.result, OpenResult::Association);
    assert_eq!(f.log(), vec!["sample:true:true", "scope", "observe:vscode", "editor:true:true:true", "observe:association", "assoc:true"]);
}

#[test]
fn ac1604_an_association_error_is_an_open_failure_with_the_message() {
    let f = Fixture::new();
    let out = f.run(Some(LOCAL), Ok(()), EditorLaunch::NotFound, Err("関連付けがありません".into()), Ok(()));
    assert_eq!(out.result, OpenResult::OpenFailed("関連付けがありません".into()));
}

// R-1602: no LOCALAPPDATA => no candidate: the editor function is not called, the association is used.
#[test]
fn r1602_without_local_app_data_the_editor_is_not_even_tried() {
    let f = Fixture::new();
    let out = f.run(None, Ok(()), EditorLaunch::Started, Ok(()), Ok(()));
    assert_eq!(out.result, OpenResult::Association);
    assert!(!f.log().iter().any(|l| l.starts_with("editor:") || l == "observe:vscode"), "{:?}", f.log());
}

// AC-1605 / T-13: Code.exe exists but cannot be started => W-A5, NO fallback to the association.
#[test]
fn ac1605_a_spawn_failure_does_not_fall_back() {
    let f = Fixture::new();
    let out = f.ok(EditorLaunch::Failed("アクセスが拒否されました。 (os error 5)".into()));
    assert_eq!(out.result, OpenResult::OpenFailed("アクセスが拒否されました。 (os error 5)".into()));
    assert!(!f.log().iter().any(|l| l.starts_with("assoc:") || l == "observe:association"), "{:?}", f.log());
}

// The editor layer's own scope refusal (design S-3) maps to W-A7 and does not fall back.
#[test]
fn s3_an_editor_layer_scope_refusal_is_out_of_scope_without_fallback() {
    let f = Fixture::new();
    let out = f.ok(EditorLaunch::OutOfScope);
    assert_eq!(out.result, OpenResult::OutOfScope);
    assert!(!f.log().iter().any(|l| l.starts_with("assoc:")));
}

// ------------------------------------------------------------------ scaffold failure (AC-1607)

// AC-1607 / R-1613: the config.toml cannot be created => nothing is opened, nothing half-made remains, the reason is kept.
#[test]
fn ac1607_a_scaffold_failure_opens_nothing_and_leaves_nothing() {
    let f = Fixture::new();
    let missing_dir = f.dir.path().join("no-such-folder");
    let paths = Paths { dir: missing_dir.clone(), config: missing_dir.join("config.toml"), local_app_data: Some(OsString::from(LOCAL)) };
    let calls = RefCell::new(Vec::<String>::new());
    let write_sample = |_: &Path, _: &str| Ok(());
    let launch_editor = |_: &Path, _: &Path, _: &Path| {
        calls.borrow_mut().push("editor".into());
        EditorLaunch::Started
    };
    let assoc = |_: &Path| {
        calls.borrow_mut().push("assoc".into());
        Ok(())
    };
    let scope = |_: &Path| Ok(());
    let observe = |_: &str| {};
    let io = OpenIo { write_sample: &write_sample, launch_editor: &launch_editor, open_by_association: &assoc, scope_check: &scope, observe: &observe };
    let out = open_settings_file(&paths, VERSION, &io);
    assert!(!out.template_created);
    assert!(matches!(&out.result, OpenResult::TemplateFailed(m) if !m.is_empty()), "{:?}", out.result);
    assert!(calls.borrow().is_empty(), "neither launcher is called");
    assert!(!missing_dir.exists(), "the folder is not created either");
}

// ------------------------------------------------------------------ not a regular file (AC-1611)

// AC-1611 (i)/(ii): a folder (a junction is judged by what it points at) => W-AD, no launcher, no scaffold.
#[test]
fn ac1611_a_folder_at_config_toml_is_not_a_file() {
    let f = Fixture::new();
    fs::create_dir(f.config()).unwrap();
    let out = f.ok(EditorLaunch::Started);
    assert_eq!(out, OpenOutcome { template_created: false, sample_error: None, result: OpenResult::NotAFile });
    assert!(f.config().is_dir());
    assert!(!f.log().iter().any(|l| l.starts_with("editor:") || l.starts_with("assoc:")), "{:?}", f.log());
}

// AC-1611 (iii): a link whose target is missing => W-AD and no scaffold (the link is "there"). Skipped without symlink privilege.
#[cfg(windows)]
#[test]
fn ac1611_a_dangling_link_is_not_a_file() {
    let f = Fixture::new();
    if std::os::windows::fs::symlink_file(f.dir.path().join("gone.toml"), f.config()).is_err() {
        eprintln!("SKIP: creating a symlink needs a privilege that is not available");
        return;
    }
    let out = f.ok(EditorLaunch::Started);
    assert_eq!(out.result, OpenResult::NotAFile);
    assert!(!out.template_created);
    assert!(!f.dir.path().join("gone.toml").exists());
    assert!(!f.log().iter().any(|l| l.starts_with("editor:") || l.starts_with("assoc:")));
}

// ------------------------------------------------------------------ sample failure (AC-1621, R-1623)

// AC-1621: the sample cannot be written => the open continues; the message is carried for W-A8.
#[test]
fn ac1621_a_sample_failure_does_not_stop_the_open() {
    let f = Fixture::new();
    let out = f.run(Some(LOCAL), Err(io::Error::other("フォルダーがあります")), EditorLaunch::Started, Ok(()), Ok(()));
    assert_eq!(out.result, OpenResult::VsCode);
    assert!(out.template_created);
    assert_eq!(out.sample_error.as_deref().map(|m| m.contains("フォルダーがあります")), Some(true), "{:?}", out.sample_error);
}

// R-1623 + R-1613 together: both messages are reported, nothing is opened.
#[test]
fn a_sample_failure_and_a_scaffold_failure_are_both_reported() {
    let f = Fixture::new();
    let gone = f.dir.path().join("gone");
    let paths = Paths { dir: gone.clone(), config: gone.join("config.toml"), local_app_data: Some(OsString::from(LOCAL)) };
    let write_sample = |_: &Path, _: &str| Err(io::Error::other("sample trouble"));
    let launch_editor = |_: &Path, _: &Path, _: &Path| EditorLaunch::Started;
    let assoc = |_: &Path| Ok(());
    let scope = |_: &Path| Ok(());
    let observe = |_: &str| {};
    let io = OpenIo { write_sample: &write_sample, launch_editor: &launch_editor, open_by_association: &assoc, scope_check: &scope, observe: &observe };
    let out = open_settings_file(&paths, VERSION, &io);
    assert!(out.sample_error.is_some());
    assert!(matches!(out.result, OpenResult::TemplateFailed(_)));
}

// ------------------------------------------------------------------ E2E scope (R-1681, AC-1608)

// AC-1608: scope active => the scaffold and the sample ARE written (W-A4 + W-A7), nothing is launched, "refused" is recorded once.
#[test]
fn ac1608_an_active_scope_still_writes_but_launches_nothing_and_records_a_refusal() {
    let f = Fixture::new();
    let out = f.run(Some(LOCAL), Ok(()), EditorLaunch::Started, Ok(()), Err(violation()));
    assert_eq!(out, OpenOutcome { template_created: true, sample_error: None, result: OpenResult::OutOfScope });
    assert!(f.config().is_file(), "the scaffold exists");
    assert_eq!(f.log(), vec!["sample:true:true", "scope", "observe:refused"], "no editor, no association, no vscode/association record");
}

// ------------------------------------------------------------------ twice (AC-1612, R-1606)

// AC-1612: running twice launches twice; only the first run creates the scaffold; the sample is offered each time.
#[test]
fn ac1612_two_runs_launch_twice_and_scaffold_once() {
    let f = Fixture::new();
    let first = f.ok(EditorLaunch::Started);
    let second = f.ok(EditorLaunch::Started);
    assert!(first.template_created && !second.template_created);
    assert_eq!(f.log().iter().filter(|l| l.starts_with("editor:")).count(), 2);
    assert_eq!(f.log().iter().filter(|l| l.starts_with("sample:")).count(), 2);
}

// R-1607: opening never alters the settings; the layer has no access to them (only the file and the folder).
#[test]
fn r1614_nothing_but_config_toml_is_written_in_the_folder_by_this_layer() {
    let f = Fixture::new();
    fs::write(f.dir.path().join("navigation.toml"), b"x").unwrap();
    fs::write(f.dir.path().join("ui-state.toml"), b"y").unwrap();
    f.ok(EditorLaunch::Started);
    assert_eq!(fs::read(f.dir.path().join("navigation.toml")).unwrap(), b"x");
    assert_eq!(fs::read(f.dir.path().join("ui-state.toml")).unwrap(), b"y");
    assert!(!f.dir.path().join("config.toml.bak").exists());
}
