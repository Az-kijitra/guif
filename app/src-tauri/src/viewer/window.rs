//! `viewer/window.rs` — glue over real `tauri::Window`/`AppHandle` objects,
//! binding `viewer::geometry`/`viewer::session` to the actual `"viewer"`
//! `WebviewWindow` (R-420~R-429, R-432). Not itself pinned by
//! `unit-test-writer`'s pure-function TDD suite (see `viewer/mod.rs`'s note);
//! `config::viewer_window::load`/`save` are injected as plain fn values so
//! this module never `use`s `crate::config` directly (§3.5.12.1 MUST-73).

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::shared::schema::viewer_window::ViewerWindowData;
use crate::shared::window_theme;

use super::geometry::{self, Rect};
use super::nav_guard;
use super::pending::PendingOpenSlot;
use super::session::{self, GenerationState, RequestKey, ViewerSession};

pub const VIEWER_WINDOW_LABEL: &str = "viewer";
pub const MAIN_WINDOW_LABEL: &str = "main";

/// R-425/§3.5.12.1 MUST-73: `config::viewer_window::load`/`save`, injected
/// from `lib.rs` (the only place allowed to `use` both `viewer` and
/// `config`) as CLOSURES (not plain `fn` pointers) so they can close over
/// `config::viewer_window::ViewerWindowIoLock` (an `Arc` clone) and serialize
/// concurrent load/save the same way `config::commands::NavigationIoLock`
/// does for `navigation.toml` (SHOULD-104/112) -- `viewer::window` itself
/// never names that lock type (it would have to `use crate::config`, which
/// MUST-73 forbids); it only ever sees `Box<dyn Fn>`. `path` needs no locking
/// (it only builds a path string), so it stays a plain `fn` pointer.
pub struct ViewerWindowIo {
    pub load: Box<dyn Fn(&std::path::Path) -> ViewerWindowData + Send + Sync>,
    pub save: Box<dyn Fn(&std::path::Path, &ViewerWindowData) -> std::io::Result<()> + Send + Sync>,
    pub path: fn(&AppHandle) -> std::io::Result<PathBuf>,
}

/// R-409/R-431/MUST-74/81/SHOULD-114: the session guarded together with the
/// `RequestKey` of the open request that produced it, so `viewer_open` can
/// apply `session::is_newer` ATOMICALLY under one lock (a slow, superseded
/// `viewer_open` must never overwrite a fresher one's session, even when the
/// async commands complete out of order at the backend itself -- not only in
/// the frontend's own `request-sequencer.ts`). `title` rides along so a
/// MUST-82 reopen (see `GenerationState` below) can rebuild the window
/// without depending on the (one-shot, consumable) pending-open slot.
#[derive(Default)]
pub struct ViewerSessionSlot {
    pub request_key: Option<RequestKey>,
    pub session: Option<ViewerSession>,
    pub title: String,
}

/// `.manage()`d once (R-441/R-491/R-492, MUST-74/76/81/82): the current
/// viewer session (the allow-set + sibling snapshot), the pending-open
/// handoff slot, and the window-generation state (§3.5.12.4).
#[derive(Default)]
pub struct ViewerRuntime {
    pub session: Mutex<ViewerSessionSlot>,
    pub pending: PendingOpenSlot,
    pub generation: Mutex<GenerationState>,
}

fn to_rect(data: &ViewerWindowData) -> Rect {
    Rect { x: data.x, y: data.y, width: data.width, height: data.height }
}

/// Monitor work areas in PHYSICAL pixels (`Monitor::work_area()` as-is).
/// Saved geometry, clamping and the restore (`set_position`/`set_size`
/// with `Physical*`) all stay in the one physical desktop coordinate space,
/// which is the only space in which monitors with DIFFERENT scale factors do
/// not overlap (converting each monitor to logical pixels via its own scale
/// factor would make e.g. a 150% secondary monitor's coordinates collide with
/// a 100% primary's). The logical minimum size (R-424-1) is enforced by
/// `set_min_size(LogicalSize)`, which Tauri scales per window.
fn work_areas(app: &AppHandle) -> (Vec<Rect>, Rect) {
    let monitors = app.available_monitors().unwrap_or_default();
    let logical_work_area = |m: &tauri::window::Monitor| {
        let wa = m.work_area();
        let physical = Rect { x: wa.position.x, y: wa.position.y, width: wa.size.width, height: wa.size.height };
        physical
    };
    let rects: Vec<Rect> = monitors.iter().map(logical_work_area).collect();
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| logical_work_area(&m))
        .or_else(|| rects.first().copied())
        .unwrap_or(Rect { x: 0, y: 0, width: geometry::DEFAULT_WIDTH, height: geometry::DEFAULT_HEIGHT });
    (rects, primary)
}

/// R-424-2/R-424-3: resolves the (physical-pixel) rect to apply to a freshly
/// created window, from the saved `viewer-window.toml` state (itself stored
/// in physical pixels, see `persist_current_geometry`; default when there is
/// none/it is unreadable, clamped against the current monitor layout
/// otherwise).
fn resolve_initial_rect(app: &AppHandle, io: &ViewerWindowIo, saved: &ViewerWindowData) -> (Rect, bool, bool) {
    let (areas, primary) = work_areas(app);
    let has_saved_position = (io.path)(app).map(|p| p.exists()).unwrap_or(false);
    let saved_rect = if has_saved_position { Some(to_rect(saved)) } else { None };
    (geometry::resolve_window_rect(saved_rect, &areas, primary), saved.maximized && has_saved_position, has_saved_position)
}

/// R-424-4/SHOULD-104: saves PHYSICAL pixels (`outer_position`/`inner_size`
/// as reported), in the same space as `work_areas`, so a later restore can
/// clamp and apply them with no scale conversion (see `work_areas`). Uses `inner_size` (not
/// `outer_size`) to match what `WebviewWindowBuilder::inner_size` sets on
/// restore -- `position`/`outer_position` are the matching OUTER pair for the
/// window's top-left corner (code-reviewer finding, 2026-09-27: the previous
/// version saved `outer_size` but restored via `inner_size`, drifting the
/// window's size by its title bar/border on every close-then-reopen).
fn persist_current_geometry(window: &tauri::WebviewWindow, app: &AppHandle) {
    let Some(io) = app.try_state::<ViewerWindowIo>() else { return };
    // R-424-4: save the last NON-maximized geometry; `maximized` is a
    // separate flag applied on top when restoring.
    let is_maximized = window.is_maximized().unwrap_or(false);
    let Ok(inner_size) = window.inner_size() else { return };
    let Ok(outer_position) = window.outer_position() else { return };
    let physical = Rect {
        x: outer_position.x,
        y: outer_position.y,
        width: inner_size.width,
        height: inner_size.height,
    };
    let data = ViewerWindowData {
        x: physical.x,
        y: physical.y,
        width: physical.width,
        height: physical.height,
        maximized: is_maximized,
    };
    if let Ok(path) = (io.path)(app) {
        // R-424-6: a save failure never blocks closing; not notified.
        let _ = (io.save)(&path, &data);
    }
}

/// R-500-8 (SPEC-0200-0001 §3.14.3): bring the viewer window to the front AND hand the keyboard focus to its webview
/// (the page then focuses its body element itself, see routes/viewer/focus-wiring.ts). `WebviewWindow::set_focus`
/// only focuses the native window; `Webview::set_focus` is stable API (no `unstable` feature).
fn focus_viewer(window: &tauri::WebviewWindow) {
    let _ = window.set_focus();
    let webview: &tauri::Webview = window.as_ref();
    let _ = webview.set_focus();
}

/// R-421/MUST-76/82: creates the viewer window (if absent) or shows/focuses/
/// switches the existing one. `title` is `ReflexViewer - <file name>` (R-423,
/// set on the Rust side); `generation` is the window-generation this build is
/// FOR (§3.5.12.4) -- captured by the `on_window_event` closure so a later
/// `Destroyed` can tell `session::on_destroyed` which generation just died.
/// Runs on the async runtime so it never blocks the caller (R-408) and is
/// NEVER called directly from inside an event handler (MUST-76): the
/// `Destroyed` handler below only decides to call this; the actual `.build()`
/// happens in this freshly spawned task. `ViewerWindowIo` must already be
/// `.manage()`d (by `lib.rs`).
pub fn open_or_focus_viewer_window(app: AppHandle, title: String, generation: u64) {
    tauri::async_runtime::spawn(async move {
        if let Some(existing) = app.get_webview_window(VIEWER_WINDOW_LABEL) {
            let _ = existing.unminimize();
            let _ = existing.show();
            focus_viewer(&existing);
            let _ = existing.set_title(&title);
            return;
        }

        let Some(io) = app.try_state::<ViewerWindowIo>() else { return };
        let saved = (io.load)(&(io.path)(&app).unwrap_or_default());
        let (rect, maximized, has_saved) = resolve_initial_rect(&app, &io, &saved);
        drop(io);

        let app_for_events = app.clone();
        // R-434: the dev server origin (debug builds only) counts as the app.
        let dev_url = if cfg!(debug_assertions) { app.config().build.dev_url.clone() } else { None };
        let build_result = WebviewWindowBuilder::new(&app, VIEWER_WINDOW_LABEL, WebviewUrl::App("viewer".into()))
            .title(title)
            // R-424-2: default 1024x768 (logical) centered; a saved geometry
            // is applied below in PHYSICAL pixels before the first show.
            .inner_size(geometry::DEFAULT_WIDTH as f64, geometry::DEFAULT_HEIGHT as f64)
            .min_inner_size(geometry::MIN_WIDTH as f64, geometry::MIN_HEIGHT as f64)
            .center()
            .visible(false)
            // R-434/§17: never navigate away from the app's own pages (the
            // initial load of `/viewer` itself must pass), never spawn a
            // second window from within the viewer webview.
            .on_navigation(move |url| nav_guard::is_app_origin(url, dev_url.as_ref()))
            .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Deny)
            // R-502: the WebView's own Ctrl+wheel/accelerator zoom is not used
            // (R-471/R-481-1 implement zoom in-app instead).
            .zoom_hotkeys_enabled(false)
            .build();

        let Ok(window) = build_result else { return };
        // R-919-1: the pre-paint background in the viewer's theme colour, before anything is shown.
        let _ = window_theme::apply_background(&window, window_theme::WindowKind::Viewer);
        if has_saved {
            let _ = window.set_position(tauri::PhysicalPosition::new(rect.x, rect.y));
            let _ = window.set_size(tauri::PhysicalSize::new(rect.width, rect.height));
        }
        if maximized {
            let _ = window.maximize();
        }
        window.on_window_event(move |event| handle_viewer_window_event(&app_for_events, generation, event));
        // R-422: apply saved geometry before the first paint (no flash).
        let _ = window.show();
        focus_viewer(&window);
        // MUST-82 rule 3: `closing` is lowered only once the (re)build this
        // generation needed has actually completed -- a no-op when this
        // build was not itself a reopen (closing was already false).
        if let Some(runtime) = app.try_state::<ViewerRuntime>() {
            let mut gen_state = runtime.generation.lock().expect("viewer generation mutex poisoned");
            *gen_state = session::on_reopen_complete(*gen_state);
        }
    });
}

/// The title to use if `Destroyed` triggers a MUST-82 reopen (the pending
/// slot may already have been consumed by the frontend, so the title rides
/// along on `ViewerSessionSlot` instead, R-423).
fn current_session_title(app: &AppHandle) -> String {
    app.try_state::<ViewerRuntime>()
        .map(|runtime| runtime.session.lock().expect("viewer session mutex poisoned").title.clone())
        .unwrap_or_default()
}

fn handle_viewer_window_event(app: &AppHandle, generation: u64, event: &WindowEvent) {
    match event {
        // R-919-1: an OS theme switch (following the OS) also moves the base colour a resize exposes.
        // A fixed theme never sends this event.
        WindowEvent::ThemeChanged(_) => {
            if let Some(window) = app.get_webview_window(VIEWER_WINDOW_LABEL) {
                let _ = window_theme::apply_background(&window, window_theme::WindowKind::Viewer);
            }
        }
        WindowEvent::CloseRequested { .. } => {
            if let Some(window) = app.get_webview_window(VIEWER_WINDOW_LABEL) {
                persist_current_geometry(&window, app);
            }
            // MUST-82/§3.5.12.4: marks the CURRENT generation as closing so a
            // `viewer_open` that arrives before `Destroyed` actually fires
            // defers to a reopen instead of racing the OS's own close.
            if let Some(runtime) = app.try_state::<ViewerRuntime>() {
                let mut gen_state = runtime.generation.lock().expect("viewer generation mutex poisoned");
                *gen_state = session::on_close_requested(*gen_state);
            }
        }
        WindowEvent::Destroyed => {
            let Some(runtime) = app.try_state::<ViewerRuntime>() else { return };
            let action = {
                let mut gen_state = runtime.generation.lock().expect("viewer generation mutex poisoned");
                let (next, action) = session::on_destroyed(*gen_state, generation);
                *gen_state = next;
                action
            };
            match action {
                session::DestroyedAction::ClearSession => {
                    // R-441-3: allow-set/siblings are dropped with the session.
                    runtime.session.lock().expect("viewer session mutex poisoned").session = None;
                    runtime.pending.clear();
                    // R-429: return focus to the main window (best-effort;
                    // not attempted if the main window is minimized/gone).
                    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                        let _ = main.unminimize();
                        let _ = main.set_focus();
                    }
                }
                session::DestroyedAction::Reopen { generation: new_generation } => {
                    // MUST-82 rule 2: an open arrived while this (now-dead)
                    // generation was closing -- rebuild for `new_generation`
                    // instead of clearing anything. Never build inside this
                    // event handler itself (MUST-76): `open_or_focus_viewer_
                    // window` spawns its own task.
                    let title = current_session_title(app);
                    open_or_focus_viewer_window(app.clone(), title, new_generation);
                }
                session::DestroyedAction::NoOp => {}
            }
        }
        _ => {}
    }
}

/// R-428: called from `lib.rs`'s `setup` hook on the MAIN window's own
/// `CloseRequested`/`Destroyed` — closes the viewer window too, so it never
/// outlives the app.
pub fn close_viewer_on_main_exit(app: &AppHandle) {
    if let Some(viewer) = app.get_webview_window(VIEWER_WINDOW_LABEL) {
        let _ = viewer.close();
    }
}
