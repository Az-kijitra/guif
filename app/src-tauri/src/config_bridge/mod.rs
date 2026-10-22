//! `config_bridge/` (SPEC-0200-0001 §3.17.3, H-2): the part of the bootstrap (`app/(bootstrap)`, §4.2) that `lib.rs` delegates, and
//! the ONLY place that joins `config/`, `external_apps/` and `settings_file/`. It is not a feature: nothing but `lib.rs` imports it,
//! and it holds exactly the files below (a structure test fixes the list).
//!
//! - `env`: the ONE reader of the process environment for config handling (`%NAME%` lookup, `PATH`, `LOCALAPPDATA`).
//! - `evaluate`: the function that start-up and "設定ファイルのチェック" share: `config.toml` -> `StartupConfig` + `Registry` (R-1651).
//! - `check`: the command `settings_file_check` (a non-reflecting read, R-1652; writes and manages nothing, R-1653).
//! - `open`: the command `settings_file_open` (R-1600; the real `OpenIo`, the wire form of the result).
//! - `sample_startup`: writes `config.sample.toml` in the background after the first window is shown (R-1621).

pub mod check;
pub mod env;
pub mod evaluate;
pub mod open;
pub mod sample_startup;

/// `lib.rs` calls this at start-up (R-917-8) and `check` calls the same function per check (R-1651).
pub use evaluate::snapshot;

#[cfg(test)]
mod check_tests;
#[cfg(test)]
mod env_tests;
#[cfg(test)]
mod evaluate_tests;
#[cfg(test)]
mod open_tests;
#[cfg(test)]
mod sample_startup_tests;
#[cfg(test)]
mod template_consistency_tests;
