//! `external_apps/` (SPEC-0300-0021 external-app launch; SPEC-0200-0001 §3.16). A vertical slice like `viewer/` and
//! `archive/`: it depends on `shared/` and `std` only (never `config/` or another feature; `lib.rs` is the one place that
//! joins `config/` and this module, by handing the RAW `external_apps` of `config.toml` to `registry::Registry::from_raw`).
//!
//! - `defaults`: the four default registrations as DATA (no wording, no special branches; AC-1534).
//! - `registry`: start-up validation of the registrations (R-1503 / R-1505) and the default four (R-1502 / R-1504).
//! - `template`: the `{path}` / `{dir}` / `{{` / `}}` argument template (R-1520 / R-1522).
//! - `program`: `%NAME%` expansion, the shape of `program`, and the executable lookup (`resolve`, R-1540).
//! - `exists`: "is there a file here" (`probe` / pure `classify`).
//! - `target`: the target value, `{dir}` of a file, the pre-launch check (R-1525 / R-1536).
//! - `launch`: the launch plan and the ONE process-creation site (`spawn`).
//! - `guarded`: the inner layer of `external_app_launch` (ABS -> resolve -> scope -> verify -> spawn).
//! - `error`: `LaunchError` and its wire DTO (codes only; the wording is on the screen).
//! - `commands`: the two Tauri commands (`external_apps_load`, `external_app_launch`).
//!
//! Dependency direction: `commands -> guarded -> {registry, program, target, launch}`, one way only (SHOULD-187).

pub mod commands;
pub mod defaults;
pub mod error;
pub mod exists;
pub mod guarded;
pub mod launch;
pub mod program;
pub mod registry;
pub mod target;
pub mod template;

// TDD (unit-test-writer, 2026-10-17): behaviour tests of each module.
#[cfg(test)]
mod commands_tests;
#[cfg(test)]
mod error_tests;
#[cfg(test)]
mod exists_tests;
#[cfg(test)]
mod guarded_tests;
#[cfg(test)]
mod launch_tests;
#[cfg(test)]
mod program_tests;
#[cfg(test)]
mod registry_tests;
#[cfg(test)]
mod target_tests;
#[cfg(test)]
mod template_tests;
