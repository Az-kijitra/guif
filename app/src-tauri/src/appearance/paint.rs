//! `appearance/paint.rs`: the paint of the windows, made from the resolved appearance (SPEC-0300-0023 R-1742;
//! SPEC-0200-0001 §3.18.12). The background of the native window is the `bg` colour; the viewer window gets its colour
//! variables as a small script that runs before its page is drawn (the viewer never loads the main window's style sheet).
//! Nothing is judged and nothing is read here: the value is built from the snapshot taken at startup.

use super::resolve::Appearance;
use super::vars::viewer_vars;
use crate::shared::window_paint::WindowPaint;

/// The window paint of `a`: the `bg` colour and the initialization script of the viewer window.
pub fn window_paint(a: &Appearance) -> WindowPaint {
    let bg = a.colors.get("bg").unwrap();
    let pairs: Vec<String> = viewer_vars(a).into_iter().map(|(n, v)| format!("[\"{n}\",\"{v}\"]")).collect();
    WindowPaint { bg: (bg.0, bg.1, bg.2), viewer_init_script: format!("window.__GUIF_APPEARANCE__={{\"vars\":[{}]}};", pairs.join(",")) }
}
