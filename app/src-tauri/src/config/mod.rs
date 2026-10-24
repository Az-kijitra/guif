pub mod atomic;
pub mod commands;
// SPEC-0200-0001 §3.6.11.9 MUST-92 (rewritten by §3.17.4, H-1): `config/io.rs` (the old `config.toml`
// read/write module, `Config`/`save`) was deleted. `config/config_toml.rs` is the sole READER of `config.toml`
// (`input_keymap_custom` + `ui_theme` + `external_apps`, one read); `config/` has no writer. The one writer of the whole crate is
// `settings_file/scaffold.rs` (create-new only, SPEC-0300-0022 R-1610).
pub mod config_toml;
// SPEC-0300-0022 R-1642 / R-1643 (SPEC-0200-0001 §3.17.5): the line of each key and the unknown settings.
pub mod config_toml_lines;
pub mod navigation;
pub mod paths;
// SPEC-0200-0001 §3.17.3: `StartupConfig` and its DTOs (moved from `commands.rs`), and `locate`, the one `config.toml` path resolution.
pub mod startup_config;
pub mod ui_state;
pub mod viewer_window;
// Phase 9 (SPEC-0400-0001 第2版 R-06~R-08): tests for the configuration-folder override.
#[cfg(test)]
mod paths_tests;

// SPEC-0300-0021 (TDD, unit-test-writer, 2026-10-17): the raw top-level `external_apps` of `config.toml`.
#[cfg(test)]
mod config_toml_external_apps_raw_tests;

// SPEC-0200-0001 §3.17.13 (S-7): the former inline tests of `config_toml.rs`, moved unchanged.
#[cfg(test)]
mod config_toml_inline_tests;

// SPEC-0300-0022 (TDD, unit-test-writer, 2026-10-20; SPEC-0200-0001 §3.17.3 / §3.17.5): line numbers and unknown settings.
#[cfg(test)]
mod config_toml_lines_keys_tests;
#[cfg(test)]
mod config_toml_load_keys_tests;
#[cfg(test)]
mod config_toml_appearance_tests;
#[cfg(test)]
mod config_toml_appearance_lines_tests;
#[cfg(test)]
mod startup_config_snapshot_tests;
pub mod appearance_raw;

// SPEC-0200-0001 §3.17.13: the former inline tests of `commands.rs`, moved unchanged (the DTO tests with the new fields).
#[cfg(test)]
mod commands_tests;
