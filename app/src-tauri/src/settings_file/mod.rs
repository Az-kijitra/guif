//! `settings_file/` (SPEC-0300-0022 "設定ファイルを開く"; SPEC-0200-0001 §3.17). A vertical slice like `external_apps/`: it depends on
//! `shared/` and `std` only (no Tauri type, no environment, no process creation, never `config/` or `external_apps/`; the part of
//! the bootstrap that joins them is `config_bridge/`, H-2, which injects every outside effect as a function value).
//!
//! - `source`: the embedded original `templates/config.sample.toml` and its rendering as the scaffold / the sample (R-1611, R-1635, R-1637).
//! - `scaffold`: THE one writer of `config.toml` -- create it only when nothing is there (R-1601, R-1610, R-1613; MUST-92 as rewritten by H-1).
//! - `sample`: `config.sample.toml`, written only when missing or different (R-1620 .. R-1623) -- never receives `config.toml`'s path.
//! - `editor`: where VS Code is looked for (R-1602).
//! - `open`: the order of "設定ファイルを開く" with every effect injected (R-1600).

pub mod editor;
pub mod open;
pub mod sample;
pub mod scaffold;
pub mod source;

// TDD (unit-test-writer, 2026-10-20): behaviour tests of each module.
#[cfg(test)]
mod editor_tests;
#[cfg(test)]
mod open_tests;
#[cfg(test)]
mod sample_tests;
#[cfg(test)]
mod scaffold_tests;
#[cfg(test)]
mod source_tests;
