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
