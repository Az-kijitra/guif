//! Persisted viewer-window geometry schema (SPEC-0300-0015 R-424, R-425;
//! SPEC-0200-0001 §3.5.12.1: the DTO exchanged between `config::viewer_window`
//! and `viewer::window`'s injected fn values). Same convention as
//! `shared/schema/navigation.rs`: a plain, fully-written data shape (not
//! decision logic), so it round-trips through TOML directly.

use serde::{Deserialize, Serialize};

/// R-424/R-425: `x`/`y`/`width`/`height` are the LAST non-maximized geometry
/// (R-424-4); `maximized` is applied on top after restoring that geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViewerWindowData {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

impl Default for ViewerWindowData {
    // R-424-2: the fixed default SIZE (1024x768). The default POSITION
    // (centered on the main window's monitor) cannot be known from this type
    // alone (no AppHandle/monitor info here) -- `config::viewer_window::load`
    // is expected to replace `x`/`y` via `viewer::geometry::default_rect_centered_on`
    // when this default is returned; `x: 0, y: 0` here is a placeholder only.
    fn default() -> Self {
        ViewerWindowData { x: 0, y: 0, width: 1024, height: 768, maximized: false }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // R-424-2: default is 1024x768, not maximized.
    #[test]
    fn default_is_1024x768_not_maximized() {
        let d = ViewerWindowData::default();
        assert_eq!((d.width, d.height, d.maximized), (1024, 768, false));
    }

    // R-425: the four/five fields round-trip through TOML.
    #[test]
    fn toml_round_trip_preserves_every_field() {
        let d = ViewerWindowData { x: 10, y: 20, width: 800, height: 600, maximized: true };
        let s = toml::to_string_pretty(&d).expect("serialize");
        let back: ViewerWindowData = toml::from_str(&s).expect("parse");
        assert_eq!(back, d);
    }

    // A negative x/y (a monitor to the left of/above the primary) is valid.
    #[test]
    fn negative_coordinates_round_trip() {
        let d = ViewerWindowData { x: -500, y: -20, width: 640, height: 480, maximized: false };
        let s = toml::to_string_pretty(&d).expect("serialize");
        let back: ViewerWindowData = toml::from_str(&s).expect("parse");
        assert_eq!(back, d);
    }

    // R-424-4: `maximized` defaults to false when omitted from an older file.
    #[test]
    fn missing_maximized_field_defaults_to_false() {
        let d: ViewerWindowData = toml::from_str("x = 1\ny = 2\nwidth = 640\nheight = 480").expect("parse");
        assert!(!d.maximized);
    }
}
