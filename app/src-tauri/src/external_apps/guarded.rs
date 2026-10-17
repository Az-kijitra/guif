//! The inner layer of `external_app_launch` (SPEC-0300-0021 R-1582 / R-1584; SPEC-0300-0011 R-89; SPEC-0200-0001
//! §3.16.2, §3.16.5, §3.16.15 MUST-141).
//!
//! No Tauri types; `commands.rs` applies the caller-window guard and calls this (`commands -> guarded` only, SHOULD-187).
//! Order: absolute-path check -> the registration -> resolve the executable (a read-only lookup, Q-4) -> ONE E2E scope check
//! for (executable, target) -> the target must still exist with the same kind -> the injected process creation.
//! `spawn` is a parameter (as in `viewer::guarded::os_open_guarded`), so tests never create a process.

use std::io;
use std::path::Path;

use super::error::LaunchError;
use super::exists;
use super::launch::{plan, LaunchPlan};
use super::program;
use super::registry::Registry;
use super::target::{verify, Kind, Target};
use crate::shared::abs_path;
use crate::shared::e2e_scope;

pub fn launch_guarded(
    reg: &Registry,
    index: usize,
    path: &str,
    kind: Kind,
    spawn: impl FnOnce(&LaunchPlan) -> io::Result<()>,
) -> Result<(), LaunchError> {
    if abs_path::first_relative([path]).is_some() {
        return Err(LaunchError::InvalidPath);
    }
    let app = reg.apps.get(index).ok_or(LaunchError::UnknownApp)?;
    let exe = program::resolve(&app.program, reg.path_var(), &exists::probe)
        .ok_or_else(|| LaunchError::ProgramNotFound { program: app.program.clone() })?;
    e2e_scope::check_launch(exe.path(), Path::new(path)).map_err(|violation| LaunchError::ScopeViolation(violation.0))?;
    let target = Target { path: path.to_string(), kind };
    verify(&target).map_err(|_| LaunchError::TargetMissing)?;
    let launch_plan = plan(app, &target, exe);
    spawn(&launch_plan).map_err(|e| LaunchError::Os { message: e.to_string() })
}
