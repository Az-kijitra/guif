//! Tests for `viewer/nav_guard.rs` (R-434/§17, SHOULD-101).

use super::nav_guard::is_app_origin;
use tauri::Url;

fn u(s: &str) -> Url {
    Url::parse(s).unwrap()
}

#[test]
fn allows_bundled_frontend_origins() {
    assert!(is_app_origin(&u("tauri://localhost/viewer"), None));
    assert!(is_app_origin(&u("http://tauri.localhost/viewer"), None));
    assert!(is_app_origin(&u("https://tauri.localhost/"), None));
}

#[test]
fn allows_dev_url_origin_only_when_configured() {
    let dev = u("http://localhost:5173");
    assert!(is_app_origin(&u("http://localhost:5173/viewer"), Some(&dev)));
    assert!(!is_app_origin(&u("http://localhost:5173/viewer"), None));
    assert!(!is_app_origin(&u("http://localhost:9999/viewer"), Some(&dev)));
}

#[test]
fn refuses_external_and_file_urls() {
    let dev = u("http://localhost:5173");
    assert!(!is_app_origin(&u("https://example.com/"), Some(&dev)));
    assert!(!is_app_origin(&u("file:///C:/secret.txt"), Some(&dev)));
    assert!(!is_app_origin(&u("http://tauri.localhost.evil.com/"), Some(&dev)));
    assert!(!is_app_origin(&u("tauri://evil/"), Some(&dev)));
}
