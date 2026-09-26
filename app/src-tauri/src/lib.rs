//! Crate root — also plays the `app/` (bootstrap) role from
//! `docs/architecture/proposals/SPEC-0200-0001.md` §2/§3: it is the single
//! place that constructs the Tauri application and registers commands
//! (`invoke_handler`). Module declarations mirror the feature-module layout
//! approved there:
//! - `fs` (SPEC-0300-0009 query logic + the `fs_list_dir` Tauri command)
//! - `fs_ops` (SPEC-0300-0011 copy/move/delete/rename/create — Phase 2;
//!   `fs_ops::commands` registers the commands below, including R-40~R-45
//!   copy/move progress events and cancellation, ISS-0052)
//! - `keymap` (SPEC-0300-0010 defaults/key-processing logic, no persistence)
//! - `config` (persistence I/O, SPEC-0200-0001 §6)
//! - `shared::schema` (persisted schema types, SPEC-0200-0001 §6.1)
//!
//! `main.rs` is a thin entry point that calls `run()` below (the standard
//! Tauri 2 desktop template split, so `lib.rs` stays the single source of
//! bootstrap wiring and can also be exercised by integration tests later).

pub mod config;
pub mod fs;
pub mod fs_ops;
pub mod keymap;
pub mod shared;

// MUST-64: generate_handler! / build.rs / capabilities 3-way consistency check.
#[cfg(test)]
mod acl_consistency;

/// Builds and runs the Tauri application. This is the sole place in the
/// backend that `use`s more than one feature module's public command
/// surface at once (SPEC-0200-0001 §4.2: `app/(bootstrap) -> <feature>/`),
/// consistent with feature modules never `use`-ing each other directly.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // R-42/R-43 (ISS-0052): per-operation-id cancellation flags for
        // in-flight copy/move batches (fs_ops::commands::CancelRegistry).
        .manage(fs_ops::commands::CancelRegistry::default())
        // MUST-48(c): serializes navigation.toml load/save.
        .manage(config::commands::NavigationIoLock::default())
        .invoke_handler(tauri::generate_handler![
            fs::commands::fs_list_dir,
            fs_ops::commands::fs_ops_copy,
            fs_ops::commands::fs_ops_move,
            fs_ops::commands::fs_ops_cancel,
            fs_ops::commands::fs_ops_delete_trash,
            fs_ops::commands::fs_ops_delete_permanently,
            fs_ops::commands::fs_ops_rename,
            fs_ops::commands::fs_ops_create,
            fs_ops::commands::fs_ops_detect_conflicts,
            config::commands::config_load_navigation,
            config::commands::config_save_navigation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
