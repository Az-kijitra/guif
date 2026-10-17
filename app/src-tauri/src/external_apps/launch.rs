//! The launch plan and the ONE place that creates a process (SPEC-0300-0021 R-1520 .. R-1525, R-1544 .. R-1548;
//! SPEC-0200-0001 §3.16.2, §3.16.4, §3.16.15).
//!
//! `plan` is pure. `spawn` runs the resolved executable directly (no shell, no hand-made command line: the standard library
//! quotes each element), with the working folder `{dir}`, stdin / stdout / stderr all null, no creation flags, no waiting
//! (the child handle is dropped), and no elevation: an OS error such as 740 is returned as it is (R-1573).

use std::ffi::OsString;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use super::program::ResolvedExe;
use super::registry::RegisteredApp;
use super::target::{dir_of, Kind, Target};
use super::template::parse;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchPlan {
    pub exe: ResolvedExe,
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
}

/// R-1521: `args_for_file` only for a FILE target and only when written; otherwise `args`. R-1531: a folder target is both
/// `{path}` and `{dir}`. R-1545: the working folder is `{dir}`. The templates were validated by the registry; an element that
/// somehow does not parse is passed as written rather than stopping the launch.
pub fn plan(app: &RegisteredApp, target: &Target, exe: ResolvedExe) -> LaunchPlan {
    let dir = match target.kind {
        Kind::Dir => target.path.clone(),
        Kind::File => dir_of(&target.path),
    };
    let templates = match (target.kind, &app.args_for_file) {
        (Kind::File, Some(for_file)) => for_file,
        _ => &app.args,
    };
    let args = templates
        .iter()
        .map(|text| parse(text).map_or_else(|_| text.clone(), |t| t.render(&target.path, &dir)))
        .map(OsString::from)
        .collect();
    LaunchPlan { exe, args, cwd: PathBuf::from(dir) }
}

/// Creates the process and does not wait for it. The error is the OS's own, unchanged.
pub fn spawn(plan: &LaunchPlan) -> io::Result<()> {
    Command::new(plan.exe.path())
        .args(&plan.args)
        .current_dir(&plan.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_child| ())
}
