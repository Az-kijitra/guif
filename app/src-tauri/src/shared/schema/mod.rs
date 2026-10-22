pub mod navigation;
pub mod ui_state;
pub mod ui_theme;
pub mod viewer_window;

// Phase 12 (SPEC-0300-0017 R-917): `ui_theme` interpretation tests.
#[cfg(test)]
mod ui_theme_tests;

// SPEC-0300-0021 (external-app launch): the RAW `external_apps` of `config.toml` (pure data; judged by `external_apps/registry.rs`).
pub mod external_apps;

// SPEC-0300-0022 (SPEC-0200-0001 §3.17.3): line numbers and unknown settings of `config.toml` (pure data).
pub mod config_lines;
