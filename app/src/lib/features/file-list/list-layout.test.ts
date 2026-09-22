import { describe, expect, it } from "vitest";
import {
  computeColumnWidth,
  computeListLayout,
  computeOverflowMarkers,
  computeScrollSnapTarget,
} from "./list-layout";

// Spec: SPEC-0300-0009 (file list / tree view detail)
// Module under test (not yet implemented by code-generator): ./list-layout.ts
//
// R-16-1: rows = containerHeight / rowHeight
// R-16-2: cols = min(maxColsThatFitWidth, ceil(entryCount / rows))
// R-16-3: 1-column min width = 140 (name) + 72 (size, if shown) + 140 (time, if shown)
// R-17: layout recomputed on container resize
// R-18: horizontal scroll snaps to column boundaries once scrolling stops
// R-19: overflow markers (arrows) shown when columns are hidden off-screen

describe("computeListLayout (SPEC-0300-0009 R-16, R-16-1, R-16-2)", () => {
  it("AC-03: computes rows from container height and row height (R-16-1)", () => {
    const layout = computeListLayout({
      containerWidth: 1000,
      containerHeight: 320,
      rowHeight: 32,
      entryCount: 100,
      showSize: false,
      showTime: false,
    });
    expect(layout.rows).toBe(10); // 320 / 32
  });

  it("AC-04: computes cols as min(colsThatFitWidth, ceil(entryCount / rows)) (R-16-2)", () => {
    // rowHeight 32 -> rows = 320/32 = 10. colWidth (name only) = 140.
    // containerWidth 1000 -> colsThatFitWidth = floor(1000/140) = 7.
    // entryCount 45 -> ceil(45/10) = 5 (smaller than 7) -> cols should be 5.
    const layout = computeListLayout({
      containerWidth: 1000,
      containerHeight: 320,
      rowHeight: 32,
      entryCount: 45,
      showSize: false,
      showTime: false,
    });
    expect(layout.cols).toBe(5);
  });

  it("AC-05: does not create excess empty columns when all entries fit in one column (R-16-2)", () => {
    // rows = 10, entryCount = 3 -> ceil(3/10) = 1 required column, even though the
    // container is wide enough to fit many more columns.
    const layout = computeListLayout({
      containerWidth: 2000,
      containerHeight: 320,
      rowHeight: 32,
      entryCount: 3,
      showSize: false,
      showTime: false,
    });
    expect(layout.cols).toBe(1);
  });

  it("recomputes rows/cols when container height or width changes (R-17, AC-03/AC-04)", () => {
    const before = computeListLayout({
      containerWidth: 1000,
      containerHeight: 320,
      rowHeight: 32,
      entryCount: 100,
      showSize: false,
      showTime: false,
    });
    const afterResize = computeListLayout({
      containerWidth: 500,
      containerHeight: 640,
      rowHeight: 32,
      entryCount: 100,
      showSize: false,
      showTime: false,
    });
    expect(afterResize.rows).not.toBe(before.rows);
    expect(afterResize.cols).not.toBe(before.cols);
    expect(afterResize.rows).toBe(20); // 640 / 32
  });

  it("falls back to 32px row height when --list-row-height is not provided (R-16-1)", () => {
    const layout = computeListLayout({
      containerWidth: 1000,
      containerHeight: 320,
      rowHeight: undefined,
      entryCount: 10,
      showSize: false,
      showTime: false,
    });
    expect(layout.rows).toBe(10); // 320 / fallback 32
  });
});

describe("computeColumnWidth (SPEC-0300-0009 R-16-3)", () => {
  it("AC-11: name-only column width is 140px", () => {
    expect(computeColumnWidth({ showSize: false, showTime: false })).toBe(140);
  });

  it("AC-11: adds 72px when the size column is shown", () => {
    expect(computeColumnWidth({ showSize: true, showTime: false })).toBe(212);
  });

  it("AC-12: adds 140px when the modified-time column is shown", () => {
    expect(computeColumnWidth({ showSize: false, showTime: true })).toBe(280);
  });

  it("AC-11/AC-12: stacks both size and time additions", () => {
    expect(computeColumnWidth({ showSize: true, showTime: true })).toBe(352);
  });
});

describe("computeOverflowMarkers (SPEC-0300-0009 R-19)", () => {
  it("AC-07: shows no markers when all columns are visible", () => {
    const markers = computeOverflowMarkers({
      totalCols: 3,
      firstVisibleCol: 0,
      lastVisibleCol: 2,
    });
    expect(markers).toEqual({ showLeadingMarker: false, showTrailingMarker: false });
  });

  it("AC-07: shows a leading marker when earlier columns are scrolled out of view", () => {
    const markers = computeOverflowMarkers({
      totalCols: 5,
      firstVisibleCol: 2,
      lastVisibleCol: 4,
    });
    expect(markers.showLeadingMarker).toBe(true);
    expect(markers.showTrailingMarker).toBe(false);
  });

  it("AC-07: shows a trailing marker when later columns are hidden off-screen", () => {
    const markers = computeOverflowMarkers({
      totalCols: 5,
      firstVisibleCol: 0,
      lastVisibleCol: 2,
    });
    expect(markers.showLeadingMarker).toBe(false);
    expect(markers.showTrailingMarker).toBe(true);
  });

  it("AC-07: markers disappear once the hidden columns become visible", () => {
    const stillHidden = computeOverflowMarkers({ totalCols: 4, firstVisibleCol: 0, lastVisibleCol: 2 });
    const nowVisible = computeOverflowMarkers({ totalCols: 4, firstVisibleCol: 0, lastVisibleCol: 3 });
    expect(stillHidden.showTrailingMarker).toBe(true);
    expect(nowVisible.showTrailingMarker).toBe(false);
  });
});

describe("computeScrollSnapTarget (SPEC-0300-0009 R-18)", () => {
  it("AC-06: snaps to the nearest column boundary after scrolling stops", () => {
    // colWidth 212, scrollLeft 300 -> nearest multiple of 212 is 212 (round(300/212)=1 -> 212)
    expect(computeScrollSnapTarget({ scrollLeft: 300, colWidth: 212 })).toBe(212);
  });

  it("AC-06: snaps forward when scroll position is past the midpoint of a column", () => {
    // colWidth 212, scrollLeft 160 -> nearer to one column (212) than to 0
    expect(computeScrollSnapTarget({ scrollLeft: 160, colWidth: 212 })).toBe(212);
  });

  it("AC-06: snaps back to 0 when scroll position is near the start", () => {
    expect(computeScrollSnapTarget({ scrollLeft: 20, colWidth: 212 })).toBe(0);
  });
});
