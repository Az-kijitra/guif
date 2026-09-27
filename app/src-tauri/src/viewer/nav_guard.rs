//! `viewer/nav_guard.rs` (SPEC-0300-0015 R-434/§17, SPEC-0200-0001 §3.5.6
//! SHOULD-101): decides which navigations the viewer webview may perform.
//! Only the app's own origin is allowed -- the bundled frontend
//! (`tauri://localhost/...` / `http(s)://tauri.localhost/...`) and, in
//! development, the configured `devUrl` origin. Everything else (links in a
//! Markdown document, `file://`, external sites) is refused.
//!
//! A previous version refused EVERY navigation, including the webview's own
//! initial load of `/viewer`, which left the viewer window blank
//! (2026-09-27, found on a real device).
//!
//! Tests: `viewer/nav_guard_tests.rs`.

use tauri::Url;

/// `true` when `url` belongs to the app's own frontend.
pub fn is_app_origin(url: &Url, dev_url: Option<&Url>) -> bool {
    if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") {
        return true;
    }
    match dev_url {
        Some(dev) => url.origin() == dev.origin(),
        None => false,
    }
}
