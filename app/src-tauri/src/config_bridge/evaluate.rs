//! The ONE function that turns `config.toml` into the start-up snapshot and the external-app registry, shared by start-up and by
//! "設定ファイルのチェック" (SPEC-0300-0022 R-1651 1-2, R-1656; SPEC-0200-0001 §3.17.3, H-2).
//!
//! `Registry::from_raw(` is called in this file only. Start-up (`lib.rs`) takes the snapshot once and `.manage()`s it (R-917-8);
//! the check (`check.rs`) takes one per run and reflects nothing (R-1652). Either way the file is read by
//! `config_toml::load`, and the `%NAME%` expansion and the `PATH` snapshot of THIS call are used (R-1656).

use std::ffi::OsString;
use std::path::Path;

use tauri::AppHandle;

use super::env;
use crate::appearance::Appearance;
use crate::config::startup_config::StartupConfig;
use crate::external_apps::registry::Registry;

/// What `lib.rs` and `check.rs` call. The path is resolved by `config::startup_config::locate` inside `StartupConfig::load`.
pub fn snapshot(app: &AppHandle) -> (StartupConfig, Registry, Appearance) {
    let startup = StartupConfig::load(app);
    let registry = registry_of(&startup, &env::lookup, env::path_var());
    let appearance = appearance_of(&startup);
    (startup, registry, appearance)
}

/// The `AppHandle`-free seam of `snapshot` (a unit test cannot build an `AppHandle`): the file at `path`, the given environment.
pub fn snapshot_at(path: &Path, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> (StartupConfig, Registry, Appearance) {
    let startup = StartupConfig::from_path(path);
    let registry = registry_of(&startup, env, path_var);
    let appearance = appearance_of(&startup);
    (startup, registry, appearance)
}

fn registry_of(startup: &StartupConfig, env: &dyn Fn(&str) -> Option<OsString>, path_var: Option<OsString>) -> Registry {
    let loaded = &startup.loaded;
    Registry::from_raw(&loaded.external_apps, &loaded.lines.external_apps, env, path_var)
}

fn appearance_of(startup: &StartupConfig) -> Appearance {
    crate::appearance::resolve(&startup.loaded.appearance)
}
