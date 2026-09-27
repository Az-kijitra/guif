//! TDD (unit-test-writer, 2026-09-27): window geometry clamp/centering math.
//!
//! Specs: SPEC-0300-0015 R-424, R-424-1, R-424-2, R-424-3; AC-433, AC-434,
//! AC-435.
//!
//! Contract pinned for the not-yet-implemented `clamp_into` (documented here
//! and in the handback report, since R-424-3's wording leaves the exact
//! order of operations to the design phase): (1) clamp width/height to at
//! most the work area's size (never below `MIN_WIDTH`/`MIN_HEIGHT`), THEN
//! (2) reposition x/y so the (possibly-shrunk) rect's right/bottom edge never
//! exceeds the work area's right/bottom edge, preferring to move the
//! left/top edge inward rather than resize further.

use super::geometry::*;

fn rect(x: i32, y: i32, width: u32, height: u32) -> Rect {
    Rect { x, y, width, height }
}

// ---------------------------------------------------------------------
// default_rect_centered_on (R-424-2)
// ---------------------------------------------------------------------

#[test]
fn ac433_default_is_1024x768_centered_on_the_work_area() {
    let work_area = rect(0, 0, 1920, 1080);
    let r = default_rect_centered_on(work_area);
    assert_eq!((r.width, r.height), (DEFAULT_WIDTH, DEFAULT_HEIGHT));
    assert_eq!(r.x, (1920 - 1024) / 2);
    assert_eq!(r.y, (1080 - 768) / 2);
}

#[test]
fn default_rect_never_exceeds_a_work_area_smaller_than_1024x768_but_stays_above_the_minimum() {
    let work_area = rect(0, 0, 800, 600);
    let r = default_rect_centered_on(work_area);
    assert!(r.width <= 800 && r.height <= 600);
    assert!(r.width >= MIN_WIDTH && r.height >= MIN_HEIGHT);
}

// ---------------------------------------------------------------------
// clamp_into (R-424-3 (b))
// ---------------------------------------------------------------------

#[test]
fn clamp_into_repositions_a_rect_that_pokes_out_the_left_edge() {
    let work_area = rect(0, 0, 1920, 1080);
    let saved = rect(-50, 100, 500, 400);
    let r = clamp_into(saved, work_area);
    assert_eq!(r, rect(0, 100, 500, 400));
}

#[test]
fn ac435_iii_clamp_into_shrinks_a_rect_larger_than_the_work_area() {
    let work_area = rect(0, 0, 1920, 1080);
    let saved = rect(0, 0, 3000, 2000);
    let r = clamp_into(saved, work_area);
    assert_eq!(r, rect(0, 0, 1920, 1080));
}

#[test]
fn clamp_into_never_shrinks_below_the_minimum_size_even_on_a_tiny_work_area() {
    let work_area = rect(0, 0, 500, 300);
    let saved = rect(0, 0, 3000, 2000);
    let r = clamp_into(saved, work_area);
    assert_eq!((r.width, r.height), (MIN_WIDTH, MIN_HEIGHT));
}

#[test]
fn clamp_into_on_a_secondary_monitor_shrinks_then_repositions_against_its_own_edges() {
    let work_area2 = rect(1920, 0, 1280, 720);
    let saved = rect(1970, 50, 1280, 800);
    let r = clamp_into(saved, work_area2);
    assert_eq!(r, work_area2, "size and position collapse exactly onto the monitor");
}

// ---------------------------------------------------------------------
// resolve_window_rect (R-424-3, the full decision)
// ---------------------------------------------------------------------

#[test]
fn ac433_no_saved_rect_uses_the_default_centered_on_primary() {
    let primary = rect(0, 0, 1920, 1080);
    let r = resolve_window_rect(None, &[primary], primary);
    assert_eq!(r, default_rect_centered_on(primary));
}

#[test]
fn ac435_i_a_saved_rect_intersecting_no_monitor_falls_back_to_the_default() {
    let primary = rect(0, 0, 1920, 1080);
    let saved = rect(5000, 5000, 800, 600);
    let r = resolve_window_rect(Some(saved), &[primary], primary);
    assert_eq!(r, default_rect_centered_on(primary));
}

#[test]
fn ac435_ii_iii_a_saved_rect_intersecting_a_secondary_monitor_is_clamped_to_it_not_the_primary() {
    let primary = rect(0, 0, 1920, 1080);
    let secondary = rect(1920, 0, 1280, 720);
    let saved = rect(1970, 50, 1280, 800); // pokes past the secondary monitor's bottom/right
    let r = resolve_window_rect(Some(saved), &[primary, secondary], primary);
    assert_eq!(r, clamp_into(saved, secondary));
    assert_ne!(r, default_rect_centered_on(primary));
}

// ---------------------------------------------------------------------
// intersects
// ---------------------------------------------------------------------

#[test]
fn intersects_true_for_overlapping_rects() {
    assert!(intersects(rect(0, 0, 100, 100), rect(50, 50, 100, 100)));
}

#[test]
fn intersects_false_for_disjoint_rects() {
    assert!(!intersects(rect(0, 0, 100, 100), rect(200, 200, 100, 100)));
}

#[test]
fn intersects_false_for_rects_that_only_touch_at_an_edge() {
    // Edge-touching (zero-area overlap) does not count as "intersects".
    assert!(!intersects(rect(0, 0, 100, 100), rect(100, 0, 100, 100)));
}

// ---------------------------------------------------------------------
// clamp_min_size (R-424-1, live resize)
// ---------------------------------------------------------------------

#[test]
fn ac434_clamp_min_size_never_goes_below_640x480() {
    assert_eq!(clamp_min_size(300, 200), (MIN_WIDTH, MIN_HEIGHT));
}

#[test]
fn clamp_min_size_leaves_a_larger_size_untouched() {
    assert_eq!(clamp_min_size(700, 500), (700, 500));
}

#[test]
fn clamp_min_size_at_exactly_the_minimum_is_untouched() {
    assert_eq!(clamp_min_size(MIN_WIDTH, MIN_HEIGHT), (MIN_WIDTH, MIN_HEIGHT));
}

#[test]
fn clamp_min_size_clamps_each_dimension_independently() {
    assert_eq!(clamp_min_size(600, 900), (MIN_WIDTH, 900));
    assert_eq!(clamp_min_size(900, 300), (900, MIN_HEIGHT));
}

// ---------------------------------------------------------------------
// scale_rect (SHOULD-104: the ONLY unit conversion in this module;
// code-reviewer finding, 2026-09-27)
// ---------------------------------------------------------------------

#[test]
fn scale_rect_converts_physical_to_logical_at_200_percent_scaling() {
    // A 200%-scaled monitor: physical 3840x2160 work area -> logical 1920x1080.
    let physical = rect(0, 0, 3840, 2160);
    let logical = scale_rect(physical, 1.0 / 2.0);
    assert_eq!(logical, rect(0, 0, 1920, 1080));
}

#[test]
fn scale_rect_converts_logical_back_to_physical() {
    let logical = rect(100, 50, 1024, 768);
    let physical = scale_rect(logical, 1.5);
    assert_eq!(physical, rect(150, 75, 1536, 1152));
}

#[test]
fn scale_rect_round_trips_within_rounding_error_at_an_awkward_scale_factor() {
    // 125% scaling (a common Windows DPI setting): round-tripping physical ->
    // logical -> physical must land back on the original (integers only lose
    // information when the intermediate logical value itself isn't exact).
    let physical = rect(10, 20, 1000, 800);
    let logical = scale_rect(physical, 1.0 / 1.25);
    assert_eq!(logical, rect(8, 16, 800, 640));
    let back = scale_rect(logical, 1.25);
    assert_eq!(back, physical);
}

#[test]
fn scale_rect_negative_position_rounds_toward_the_nearest_integer_symmetrically() {
    // A monitor to the left of the primary: negative x/y must scale the same
    // way as positive coordinates (no sign-dependent truncation surprises).
    assert_eq!(scale_rect(rect(-100, -50, 200, 200), 0.5), rect(-50, -25, 100, 100));
}

#[test]
fn scale_rect_by_1_is_the_identity() {
    let r = rect(12, 34, 560, 780);
    assert_eq!(scale_rect(r, 1.0), r);
}
