//! Crate root — also plays the `app/` (bootstrap) role from
//! `docs/architecture/proposals/SPEC-0200-0001.md` §2/§3: it is the single
//! place that constructs the Tauri application and registers commands
//! (`invoke_handler`). Module declarations mirror the feature-module layout
//! approved there:
//! - `fs` (SPEC-0300-0009 query logic + the `fs_list_dir` Tauri command)
//! - `fs_ops` (SPEC-0300-0011 copy/move/delete/rename/create — Phase 2;
//!   `fs_ops::commands` registers the commands below, including R-40~R-45
//!   copy/move progress events and cancellation, ISS-0052)
//! - `config` (persistence I/O, SPEC-0200-0001 §6; `config/keymap.rs` is the
//!   sole reader of `config.toml`'s `input_keymap_custom` table, SPEC-0200-0001
//!   §3.6.11.3 MUST-92 — the former `keymap/` module was removed once
//!   `config/io.rs`'s deletion left it with no remaining caller)
//! - `shared::schema` (persisted schema types, SPEC-0200-0001 §6.1)
//! - `archive` (SPEC-0300-0014 ZIP create/extract — Phase 5; see
//!   `archive/mod.rs`)
//! - `viewer` (SPEC-0300-0015 ReflexViewer integration — Phase 6, not yet
//!   implemented; see `viewer/mod.rs`)
//!
//! `main.rs` is a thin entry point that calls `run()` below (the standard
//! Tauri 2 desktop template split, so `lib.rs` stays the single source of
//! bootstrap wiring and can also be exercised by integration tests later).

// SPEC-0200-0001 §3.4.13-7 / §3.7.1 (ISS-0161): the only unsafe in the crate lives in
// archive/win_fs.rs and fs/win_drives.rs.
#![deny(unsafe_code)]

pub mod archive;
pub mod config;
pub mod fs;
pub mod fs_ops;
pub mod shared;
// SPEC-0300-0015 (Phase 6, ReflexViewer): not implemented yet (TDD). See
// `viewer/mod.rs` for the planned submodule list; this declaration alone is
// enough for `viewer/*_tests.rs` to be picked up by `cargo test`, and is
// expected to make the WHOLE crate fail to compile until code-generator fills
// in the bodies (same "red" state Phase 2's `fs_ops/` TDD pass produced).
pub mod viewer;

// MUST-64: generate_handler! / build.rs / capabilities 3-way consistency check.
#[cfg(test)]
mod acl_consistency;

/// Builds and runs the Tauri application. This is the sole place in the
/// backend that `use`s more than one feature module's public command
/// surface at once (SPEC-0200-0001 §4.2: `app/(bootstrap) -> <feature>/`),
/// consistent with feature modules never `use`-ing each other directly.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::Arc;
    use tauri::Manager;

    // §3.5.12.1 MUST-73: `viewer::window` never imports `crate::config`
    // directly; `lib.rs` (the one place allowed to use both) injects
    // `config::viewer_window::load`/`save` as CLOSURES that close over a
    // shared `config::viewer_window::ViewerWindowIoLock` (SHOULD-104/112,
    // the same serialization `config::commands::NavigationIoLock` gives
    // `navigation.toml`), plus `config::paths::viewer_window_path`.
    let viewer_window_io_lock = Arc::new(config::viewer_window::ViewerWindowIoLock::default());
    let load_lock = viewer_window_io_lock.clone();
    let save_lock = viewer_window_io_lock.clone();
    let viewer_window_io = viewer::window::ViewerWindowIo {
        load: Box::new(move |path| {
            let _guard = load_lock.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            config::viewer_window::load(path)
        }),
        save: Box::new(move |path, data| {
            let _guard = save_lock.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            config::viewer_window::save(path, data)
        }),
        path: config::paths::viewer_window_path,
    };

    tauri::Builder::default()
        // R-42/R-43 (ISS-0052): per-operation-id cancellation flags for
        // in-flight copy/move/ZIP operations (ONE instance shared by fs_ops and archive, §3.4.1).
        .manage(shared::cancel::CancelRegistry::default())
        // MUST-48(c): serializes navigation.toml load/save.
        .manage(config::commands::NavigationIoLock::default())
        // SPEC-0200-0001 §3.6.1/§3.6.11.11 (SHOULD-117): serializes
        // ui-state.toml load/save.
        .manage(config::commands::UiStateIoLock::default())
        // R-441/R-491/R-492/R-430: the viewer's session (allow-set + sibling
        // snapshot) and pending-open handoff slot (single instance, R-421).
        .manage(viewer::window::ViewerRuntime::default())
        // R-425: `viewer-window.toml` load/save fn-value injection.
        .manage(viewer_window_io)
        .setup(|app| {
            // R-428: closing the MAIN window also closes the viewer window,
            // so it never outlives the app (best-effort; does not block the
            // main window's own close).
            if let Some(main) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
                        viewer::window::close_viewer_on_main_exit(&handle);
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs::commands::fs_list_dir,
            fs::commands::fs_list_drives,
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
            config::commands::config_load_keymap,
            config::commands::ui_state_load,
            config::commands::ui_state_save,
            archive::commands::archive_check_create,
            archive::commands::archive_create,
            archive::commands::archive_detect_conflicts,
            archive::commands::archive_extract,
            archive::commands::archive_cancel,
            viewer::commands::viewer_classify_path,
            viewer::commands::viewer_open,
            viewer::commands::viewer_os_open_path,
            viewer::commands::viewer_take_pending,
            viewer::commands::viewer_read_text,
            viewer::commands::viewer_read_image,
            viewer::commands::viewer_navigate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
