pub mod atomic;
pub mod commands;
// SPEC-0200-0001 §3.6.11.9 MUST-92: `config/io.rs` (the old `config.toml`
// read/write module, `Config`/`save`) was deleted. `config/config_toml.rs` is now
// the sole reader of `config.toml` (`input_keymap_custom` + `ui_theme`, one read), and there is no
// writer at all (R-77-4; SPEC-0200-0001 §3.11.3 H-1).
pub mod config_toml;
pub mod navigation;
pub mod paths;
pub mod ui_state;
pub mod viewer_window;
// Phase 9 (SPEC-0400-0001 第2版 R-06~R-08): tests for the configuration-folder override.
#[cfg(test)]
mod paths_tests;

// Phase 12 (SPEC-0300-0017 R-917): tests for `config_toml` (renamed from `keymap`) and `StartupConfig`.
#[cfg(test)]
mod config_toml_tests;
#[cfg(test)]
mod startup_config_tests;
