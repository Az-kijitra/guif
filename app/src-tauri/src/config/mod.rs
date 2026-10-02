pub mod atomic;
pub mod commands;
// SPEC-0200-0001 §3.6.11.9 MUST-92: `config/io.rs` (the old `config.toml`
// read/write module, `Config`/`save`) was deleted. `config/keymap.rs` is now
// the sole reader of `config.toml`, and there is no writer at all (R-77-4).
pub mod keymap;
pub mod navigation;
pub mod paths;
pub mod ui_state;
pub mod viewer_window;
// Phase 9 (SPEC-0400-0001 第2版 R-06~R-08): tests for the configuration-folder override.
#[cfg(test)]
mod paths_tests;
