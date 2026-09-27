//! `viewer/geometry.rs` (SPEC-0300-0015 R-424, R-424-1~424-3;
//! SPEC-0200-0001 §3.5.12.10 SHOULD-104: split out of `window.rs` so the
//! clamp math is a pure function testable without a real `tauri::Window`).
//! All rectangles use the SAME pixel unit consistently; tests below use plain
//! integers. In production (`viewer::window`) that unit is PHYSICAL pixels
//! (`Monitor::work_area()`, `outer_position`/`inner_size`, and the restore via
//! `set_position`/`set_size` with `Physical*`): the physical desktop space is
//! the only one in which monitors with different scale factors never overlap.
//! Consequently the `MIN_WIDTH`/`MIN_HEIGHT` floor applied here is a physical
//! lower bound only; the real logical minimum (R-424-1) is enforced by the
//! window itself via `min_inner_size` (logical, scaled by Tauri per window).
//! `scale_rect` remains available for unit conversion where needed.
//!
//! Planned API (not yet implemented, TDD):
//!
//! ```ignore
//! pub fn intersects(a: Rect, b: Rect) -> bool; // non-empty overlap
//!
//! // R-424-2: centered on `work_area`, 1024x768 (or `work_area`'s size if
//! // smaller than that, but never below MIN_WIDTH/MIN_HEIGHT).
//! pub fn default_rect_centered_on(work_area: Rect) -> Rect;
//!
//! // Shrinks/repositions `rect` so it fits entirely inside `work_area`,
//! // never below MIN_WIDTH/MIN_HEIGHT even if `work_area` itself is smaller.
//! pub fn clamp_into(rect: Rect, work_area: Rect) -> Rect;
//!
//! // R-424-3's full decision: (a) no monitor's work area intersects `saved`
//! // (or there is no saved rect at all) -> default_rect_centered_on(primary);
//! // (b) intersects exactly one -> clamp_into(saved, that work area).
//! pub fn resolve_window_rect(
//!     saved: Option<Rect>,
//!     work_areas: &[Rect],
//!     primary_work_area: Rect,
//! ) -> Rect;
//!
//! // R-424-1: used while live-resizing; the window may never be smaller than
//! // this regardless of what the OS/user asks for.
//! pub fn clamp_min_size(width: u32, height: u32) -> (u32, u32);
//! ```
//!
//! Tests: `viewer/geometry_tests.rs`.

/// A window rectangle. `width`/`height` are always > 0 in valid inputs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// R-424-1: the window may never be resized smaller than this (logical
/// pixels; physical-pixel conversion by scale factor happens at the call
/// site, SHOULD-104).
pub const MIN_WIDTH: u32 = 640;
pub const MIN_HEIGHT: u32 = 480;
/// R-424-2: the default (first-ever-open / unreadable-state) size.
pub const DEFAULT_WIDTH: u32 = 1024;
pub const DEFAULT_HEIGHT: u32 = 768;

/// R-424-1: clamps `(width, height)` so neither dimension is below the
/// minimum, independently.
pub fn clamp_min_size(width: u32, height: u32) -> (u32, u32) {
    (width.max(MIN_WIDTH), height.max(MIN_HEIGHT))
}

/// SHOULD-104: converts `rect` from one pixel unit to another via `factor`
/// (physical -> logical: `factor = 1.0 / scale_factor`; logical -> physical:
/// `factor = scale_factor`). The ONLY place unit conversion happens; every
/// other function in this module assumes its inputs are already in one
/// consistent unit and never converts anything itself.
pub fn scale_rect(rect: Rect, factor: f64) -> Rect {
    Rect {
        x: (rect.x as f64 * factor).round() as i32,
        y: (rect.y as f64 * factor).round() as i32,
        width: ((rect.width as f64 * factor).round() as i64).max(0) as u32,
        height: ((rect.height as f64 * factor).round() as i64).max(0) as u32,
    }
}

/// Non-empty-overlap test (edge-touching rects do not intersect).
pub fn intersects(a: Rect, b: Rect) -> bool {
    let a_right = a.x as i64 + a.width as i64;
    let b_right = b.x as i64 + b.width as i64;
    let a_bottom = a.y as i64 + a.height as i64;
    let b_bottom = b.y as i64 + b.height as i64;
    (a.x as i64) < b_right && (b.x as i64) < a_right && (a.y as i64) < b_bottom && (b.y as i64) < a_bottom
}

/// R-424-2: 1024x768 (or `work_area`'s size if smaller), centered, never
/// below the minimum size.
pub fn default_rect_centered_on(work_area: Rect) -> Rect {
    let (width, height) = clamp_min_size(DEFAULT_WIDTH.min(work_area.width), DEFAULT_HEIGHT.min(work_area.height));
    let x = work_area.x + (work_area.width as i64 - width as i64) as i32 / 2;
    let y = work_area.y + (work_area.height as i64 - height as i64) as i32 / 2;
    Rect { x, y, width, height }
}

/// R-424-3(b): (1) clamp size to at most the work area's size (never below
/// the minimum), THEN (2) reposition so the (possibly-shrunk) rect fits
/// entirely inside the work area, preferring to move the left/top edge
/// inward rather than resize further.
pub fn clamp_into(rect: Rect, work_area: Rect) -> Rect {
    // The minimum-size floor applies only when the work area actually forces
    // a shrink; a rect that already fits (even if smaller than MIN_*) is left
    // at its own size (AC-435's plain reposition case relies on this).
    let width = if rect.width > work_area.width { work_area.width.max(MIN_WIDTH) } else { rect.width };
    let height = if rect.height > work_area.height { work_area.height.max(MIN_HEIGHT) } else { rect.height };
    let work_right = work_area.x as i64 + work_area.width as i64;
    let work_bottom = work_area.y as i64 + work_area.height as i64;
    let mut x = rect.x;
    let mut y = rect.y;
    if x < work_area.x {
        x = work_area.x;
    }
    if (x as i64 + width as i64) > work_right {
        x = (work_right - width as i64) as i32;
    }
    if y < work_area.y {
        y = work_area.y;
    }
    if (y as i64 + height as i64) > work_bottom {
        y = (work_bottom - height as i64) as i32;
    }
    Rect { x, y, width, height }
}

/// R-424-3: the full decision. `saved` is `None` on first-ever-open; `None`
/// or a rect that intersects no monitor falls back to the default centered
/// on the primary monitor. A rect that intersects exactly one monitor's work
/// area is clamped into that monitor (not necessarily the primary).
pub fn resolve_window_rect(saved: Option<Rect>, work_areas: &[Rect], primary_work_area: Rect) -> Rect {
    let Some(saved) = saved else {
        return default_rect_centered_on(primary_work_area);
    };
    match work_areas.iter().find(|area| intersects(saved, **area)) {
        Some(area) => clamp_into(saved, *area),
        None => default_rect_centered_on(primary_work_area),
    }
}
