//! Crate root — also plays the `app/` (bootstrap) role from
//! `docs/architecture/proposals/SPEC-0200-0001.md` §2/§3: it is the single
//! place that constructs the Tauri application and registers commands
//! (`invoke_handler`). Module declarations mirror the feature-module layout
//! approved there:
//! - `fs` (SPEC-0300-0009 query logic + the `fs_list_dir` Tauri command)
//! - `fs_ops` (SPEC-0300-0011 copy/move/delete/rename/create — Phase 2;
//!   `fs_ops::commands` registers the commands below, including R-40~R-45
//!   copy/move progress events and cancellation, ISS-0052)
//! - `config` (persistence I/O, SPEC-0200-0001 §6; `config/config_toml.rs` is the
//!   sole reader of `config.toml` (`input_keymap_custom` + `ui_theme`, read once into
//!   `config::commands::StartupConfig`), SPEC-0200-0001
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

// SPEC-0200-0001 §3.4.13-7 / §3.7.1 (ISS-0161) / §3.10.11: the only unsafe in the crate lives in
// archive/win_fs.rs, fs/win_drives.rs and fs_ops/clipboard/clipboard_win.rs.
#![deny(unsafe_code)]

pub mod archive;
pub mod config;
pub mod fs;
pub mod external_apps;
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

// AC-89 structure tests of the absolute-path check (SPEC-0200-0001 §3.12.8).
#[cfg(test)]
mod abs_path_structure_tests;

// SPEC-0300-0021 (external-app launch): crate-wide structure tests of `external_apps/` (single process-creation site, dependency
// direction, the environment is read in one place, defaults are data, capabilities). Source text scans: RED until the module exists.
// TDD (unit-test-writer, 2026-10-17). code-generator: ALSO add `pub mod external_apps;` above, and wire the behaviour tests the
// first test of this file lists (`external_apps/mod.rs`, `shared/mod.rs`, `config/mod.rs`, `shared/schema/mod.rs`).
#[cfg(test)]
mod external_apps_structure_tests;

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

    // SPEC-0200-0001 §3.11.2: `Builder::run(ctx)` is `build(ctx)` + `run()`; the split leaves room for the
    // theme request between the two (windows are created inside `run()`).
    let app = tauri::Builder::default()
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
        // SPEC-0300-0011 R-18 / SPEC-0200-0001 §3.10.4: the main window's HWND (the OS clipboard
        // owner), stored in `.setup`.
        .manage(fs_ops::clipboard::commands::ClipboardOwner::default())
        .setup(|app| {
            // SPEC-0400-0001 R-06-2: a bad `REFLEXFILES_CONFIG_DIR` (debug builds) is a startup
            // error; it never falls back to the real config folder.
            config::paths::config_dir_override()?;
            // SPEC-0400-0001 R-10-1 (debug builds only): an invalid E2E file scope also stops start-up.
            shared::e2e_scope::init_from_env()?;
            #[cfg(windows)]
            fs_ops::clipboard::commands::register_owner(app);
            // The main window comes from tauri.conf.json (`visible: false`); a missing one must stop the
            // start-up rather than leave a hidden process (§3.11.16 SHOULD-182 (2)).
            let main = app.get_webview_window("main").expect("the main window is created from tauri.conf.json");
            // R-919-1: the pre-paint background in the window's theme colour. A failure is ignored so that the
            // window is shown below regardless.
            let _ = shared::window_theme::apply_background(&main, shared::window_theme::WindowKind::Main);
            // R-428: closing the MAIN window also closes the viewer window,
            // so it never outlives the app (best-effort; does not block the
            // main window's own close).
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                // SHOULD-171: never open the clipboard with a destroyed (reusable) HWND.
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    handle.state::<fs_ops::clipboard::commands::ClipboardOwner>().set(0);
                }
                if matches!(event, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
                    viewer::window::close_viewer_on_main_exit(&handle);
                }
                // R-919-1: an OS theme switch (following the OS) also moves the background that a resize exposes.
                if matches!(event, tauri::WindowEvent::ThemeChanged(_)) {
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = shared::window_theme::apply_background(&window, shared::window_theme::WindowKind::Main);
                    }
                }
            });
            // R-919-1: the window is created hidden and shown from here, after the background colour is set.
            // Rust decides when (no front-end round trip, no `core:window:allow-show`).
            main.show()?;
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
            fs_ops::clipboard::commands::clipboard_set_files,
            fs_ops::clipboard::commands::clipboard_get_files,
            fs_ops::clipboard::commands::clipboard_clear_if_unchanged,
            external_apps::commands::external_apps_load,
            external_apps::commands::external_app_launch,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // R-917-8: `config.toml` is read here, once, before any window exists. A bad
    // `REFLEXFILES_CONFIG_DIR` (SPEC-0400-0001 R-06-2) is a start-up error, distinct from an unreadable file.
    config::paths::config_dir_override().expect("invalid REFLEXFILES_CONFIG_DIR (SPEC-0400-0001 R-06-2)");
    let startup = config::commands::StartupConfig::load(app.handle());
    // R-917 / R-918: a fixed theme becomes the event loop's preferred theme, so tao creates the title bar
    // and the WebView (main and viewer alike) in it and ignores OS switches. Following the OS requests
    // nothing (never `set_theme(None)`), so the platform keeps tracking the OS.
    if let Some(theme) = shared::window_theme::requested_theme(startup.theme.setting) {
        app.set_theme(Some(theme));
    }
    // SPEC-0300-0021 / SPEC-0200-0001 §3.16.15 MUST-142: `lib.rs` is the ONE reader of the environment for the external apps.
    // The raw `external_apps` of the start-up snapshot, the start-up `PATH` and the lookup of `%NAME%` variables are injected;
    // `external_apps/` itself reads nothing (and `config/` and `external_apps/` never import each other).
    let external_apps_registry = external_apps::registry::Registry::from_raw(
        &startup.loaded.external_apps,
        &|name| std::env::var_os(name),
        std::env::var_os("PATH"),
    );
    app.manage(startup);
    app.manage(external_apps_registry);
    app.run(|_app, _event| {});
}
