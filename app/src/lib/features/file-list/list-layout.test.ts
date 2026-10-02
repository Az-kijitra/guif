import { describe, expect, it } from "vitest";
import {
  computeColumnWidth,
  computeEdgeMarkerRows,
  computeListGeometry,
  computeListLayout,
  computeNameCellWidth,
  computeOverflowMarkers,
  computeScrollSnapTarget,
  computeScrollTargetForFocus,
  parseRowHeightPx,
  rowGridTemplate,
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

// Phase 9 INTENTIONAL EXPECTATION CHANGE (SPEC-0300-0017 R-956 / P-05 approved,
// SPEC-0300-0009 第10版 R-16-3 note; SPEC-0200-0001 §3.8.17 MUST-110): the 1-column
// minimum width (minCol) now also adds 8px per inter-item gap and a 32px margin:
// 140+32 = 172 / +72+8 = 252 / +140+8 = 320 / both = 400. The previous
// 140/212/280/352 values were the pre-Phase-9 formula. These four are the ONLY
// pre-existing expectations in this file that change.
describe("computeColumnWidth (SPEC-0300-0009 R-16-3 / SPEC-0300-0017 R-956 minCol)", () => {
  it("AC-11 (revised, R-956): name-only minCol is 172px", () => {
    expect(computeColumnWidth({ showSize: false, showTime: false })).toBe(172);
  });

  it("AC-11 (revised, R-956): size shown -> 252px (+72 item, +8 gap)", () => {
    expect(computeColumnWidth({ showSize: true, showTime: false })).toBe(252);
  });

  it("AC-12 (revised, R-956): time shown -> 320px (+140 item, +8 gap)", () => {
    expect(computeColumnWidth({ showSize: false, showTime: true })).toBe(320);
  });

  it("AC-11/AC-12 (revised, R-956): both shown -> 400px", () => {
    expect(computeColumnWidth({ showSize: true, showTime: true })).toBe(400);
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

// ======================================================================
// Phase 9 (SPEC-0300-0017 R-946, R-949, R-955~R-959, R-956-2; SPEC-0200-0001
// §3.8.6, §3.8.17 MUST-110/SHOULD-157; AC-917, AC-921~AC-926, AC-943, AC-944).
// `computeListGeometry` takes the FRAME size: frameHeight is the outer frame's
// clientHeight and H = frameHeight - 6 happens ONLY inside it (MUST-110).
// ======================================================================

type GeomOver = Partial<Parameters<typeof computeListGeometry>[0]>;
function geom(over: GeomOver = {}) {
  return computeListGeometry({
    frameWidth: 760,
    frameHeight: 566, // H = 560
    rowHeight: 28,
    entryCount: 100,
    showSize: true,
    showTime: false,
    ...over,
  });
}

describe("computeListGeometry: AC-921 (W=760, H=560, size column, 100 entries)", () => {
  it("rows 20 / minCol 252 / maxFit 2 / needed 5 / cols 2 (R-956)", () => {
    const g = geom();
    expect(g.rows).toBe(20);
    expect(g.minCol).toBe(252);
    expect(g.maxFit).toBe(2);
    expect(g.needed).toBe(5);
    expect(g.cols).toBe(2);
  });

  it("colWidth = minCol when needed > maxFit; pitch 268; body width 520, body height 560", () => {
    const g = geom();
    expect(g.colWidth).toBe(252);
    expect(g.pitch).toBe(268);
    expect(g.bodyWidth).toBe(520);
    expect(g.bodyHeight).toBe(560);
  });

  it("AC-924/AC-924-1: maxScrollLeft = (needed - cols) * pitch = 804, a multiple of the pitch", () => {
    const g = geom();
    expect(g.maxScrollLeft).toBe(804);
    expect(g.maxScrollLeft % g.pitch).toBe(0);
  });
});

describe("computeListGeometry: AC-922 (everything fits => cols share W, up to 720)", () => {
  it("(i) 30 entries: needed 2 <= maxFit 2 -> colWidth 372, body width 760", () => {
    const g = geom({ entryCount: 30 });
    expect(g.needed).toBe(2);
    expect(g.cols).toBe(2);
    expect(g.colWidth).toBe(372);
    expect(g.bodyWidth).toBe(760);
    expect(g.maxScrollLeft).toBe(0);
  });

  it("(ii) 10 entries: one column, colWidth capped at 720, body width 720", () => {
    const g = geom({ entryCount: 10 });
    expect(g.needed).toBe(1);
    expect(g.cols).toBe(1);
    expect(g.colWidth).toBe(720);
    expect(g.bodyWidth).toBe(720);
  });

  it("(iii) 0 entries: needed is still 1, colWidth 720, rows * rowHeight body height", () => {
    const g = geom({ entryCount: 0 });
    expect(g.needed).toBe(1);
    expect(g.cols).toBe(1);
    expect(g.colWidth).toBe(720);
    expect(g.bodyHeight).toBe(560);
  });

  it("SPEC-0300-0009 AC-05: never more columns than needed (no empty columns)", () => {
    const g = geom({ frameWidth: 2000, entryCount: 3 });
    expect(g.cols).toBe(1);
    expect(g.colWidth).toBe(720);
  });
});

describe("computeListGeometry: AC-923 (display items change minCol / maxFit / width)", () => {
  it("(i) name only: 172 / 4 / 172 / 736", () => {
    const g = geom({ showSize: false, showTime: false });
    expect([g.minCol, g.maxFit, g.colWidth, g.bodyWidth]).toEqual([172, 4, 172, 736]);
  });

  it("(ii) time only: 320 / 2 / 320 / 656", () => {
    const g = geom({ showSize: false, showTime: true });
    expect([g.minCol, g.maxFit, g.colWidth, g.bodyWidth]).toEqual([320, 2, 320, 656]);
  });

  it("(iii) both: 400 / 1 / 400 / 400", () => {
    const g = geom({ showSize: true, showTime: true });
    expect([g.minCol, g.maxFit, g.colWidth, g.bodyWidth]).toEqual([400, 1, 400, 400]);
  });
});

describe("computeListGeometry: H excludes the 6px body padding, only here (R-956, MUST-110, AC-926)", () => {
  it("frameHeight 566 -> H 560 -> rows 20; frameHeight 565 -> H 559 -> rows 19", () => {
    expect(geom({ frameHeight: 566 }).rows).toBe(20);
    expect(geom({ frameHeight: 565 }).rows).toBe(19);
  });

  it("bodyHeight = rows * rowHeight", () => {
    expect(geom({ frameHeight: 565 }).bodyHeight).toBe(19 * 28);
  });

  it("rows never drops below 1 (frame shorter than the padding)", () => {
    const g = geom({ frameHeight: 10 });
    expect(g.rows).toBe(1);
    expect(g.bodyHeight).toBe(28);
  });

  it("rowHeight undefined falls back to 32 (kept from R-16-1)", () => {
    const g = geom({ rowHeight: undefined, frameHeight: 326 }); // H 320
    expect(g.rows).toBe(10);
    expect(g.bodyHeight).toBe(320);
  });

  it("R-957: rows equals computeListLayout().rows for the same H (one source for rows)", () => {
    const g = geom({ frameHeight: 565 });
    const l = computeListLayout({
      containerWidth: 760,
      containerHeight: 559,
      rowHeight: 28,
      entryCount: 100,
      showSize: true,
      showTime: false,
    });
    expect(l.rows).toBe(g.rows);
    expect(l.cols).toBe(g.cols);
  });
});

describe("computeListGeometry: W < minCol (R-956-2, G8 owner decision; AC-943/AC-944)", () => {
  it("AC-943: W=300, both columns -> cols 1, colWidth 300, body width 300, rows 20, needed 5", () => {
    const g = geom({ frameWidth: 300, showSize: true, showTime: true });
    expect(g.minCol).toBe(400);
    expect(g.cols).toBe(1);
    expect(g.maxFit).toBe(1);
    expect(g.colWidth).toBe(300);
    expect(g.bodyWidth).toBe(300);
    expect(g.rows).toBe(20);
    expect(g.needed).toBe(5);
  });

  it("AC-943: pitch is W + 16 = 316 and maxScrollLeft = (needed - 1) * 316", () => {
    const g = geom({ frameWidth: 300, showSize: true, showTime: true });
    expect(g.pitch).toBe(316);
    expect(g.maxScrollLeft).toBe(4 * 316);
  });

  it("colWidth = W even when a single column would otherwise stretch (needed 1)", () => {
    const g = geom({ frameWidth: 300, showSize: true, showTime: true, entryCount: 5 });
    expect(g.needed).toBe(1);
    expect(g.colWidth).toBe(300);
    expect(g.bodyWidth).toBe(300);
    expect(g.maxScrollLeft).toBe(0);
  });

  it("AC-944: W=200 -> colWidth 200", () => {
    const g = geom({ frameWidth: 200, showSize: true, showTime: true });
    expect(g.colWidth).toBe(200);
    expect(g.cols).toBe(1);
  });

  it("boundary: W = minCol - 1 is narrow (colWidth W), W = minCol is the normal path (colWidth minCol)", () => {
    expect(geom({ frameWidth: 399, showSize: true, showTime: true }).colWidth).toBe(399);
    const atMin = geom({ frameWidth: 400, showSize: true, showTime: true });
    expect(atMin.colWidth).toBe(400);
    expect(atMin.cols).toBe(1);
    expect(atMin.bodyWidth).toBe(400);
  });

  it("name-only narrow list: W=100 < 172 -> colWidth 100", () => {
    const g = geom({ frameWidth: 100, showSize: false, showTime: false });
    expect(g.colWidth).toBe(100);
    expect(g.bodyWidth).toBe(100);
  });

  it("R-991-1 check: W=411 (640x480 window, tree shown) with both columns is NOT narrow", () => {
    const g = geom({ frameWidth: 411, showSize: true, showTime: true });
    expect(g.colWidth).toBe(400);
  });
});

describe("computeListLayout cols lower bound (R-956 maxFit = max(1, ...), SPEC-0300-0009 R-16-2)", () => {
  it("never reports 0 columns for a narrow container", () => {
    const l = computeListLayout({
      containerWidth: 300,
      containerHeight: 560,
      rowHeight: 28,
      entryCount: 100,
      showSize: true,
      showTime: true,
    });
    expect(l.cols).toBe(1);
  });

  it("uses (W + 16) / (minCol + 16): W=760, name only, 100 entries -> floor(776/188) = 4 columns", () => {
    const l = computeListLayout({
      containerWidth: 760,
      containerHeight: 560,
      rowHeight: 28,
      entryCount: 100,
      showSize: false,
      showTime: false,
    });
    expect(l.cols).toBe(4);
  });
});

describe("rowGridTemplate (R-946 table, AC-917, R-956-2)", () => {
  it("name only: minmax(140px, 1fr)", () => {
    expect(rowGridTemplate(false, false)).toBe("minmax(140px, 1fr)");
  });

  it("size only: minmax(140px, 1fr) 64px", () => {
    expect(rowGridTemplate(true, false)).toBe("minmax(140px, 1fr) 64px");
  });

  it("time only: minmax(140px, 1fr) 140px", () => {
    expect(rowGridTemplate(false, true)).toBe("minmax(140px, 1fr) 140px");
  });

  it("both: minmax(140px, 1fr) 64px 140px", () => {
    expect(rowGridTemplate(true, true)).toBe("minmax(140px, 1fr) 64px 140px");
  });

  it("colWidth >= minCol keeps the normal template (AC-917 widths 172/252/320/400)", () => {
    expect(rowGridTemplate(false, false, 172)).toBe("minmax(140px, 1fr)");
    expect(rowGridTemplate(true, false, 252)).toBe("minmax(140px, 1fr) 64px");
    expect(rowGridTemplate(false, true, 320)).toBe("minmax(140px, 1fr) 140px");
    expect(rowGridTemplate(true, true, 400)).toBe("minmax(140px, 1fr) 64px 140px");
  });

  it("colWidth < minCol: the name column becomes minmax(0, 1fr), 64px / 140px kept (AC-943)", () => {
    expect(rowGridTemplate(true, true, 300)).toBe("minmax(0, 1fr) 64px 140px");
    expect(rowGridTemplate(true, true, 399)).toBe("minmax(0, 1fr) 64px 140px");
    expect(rowGridTemplate(true, false, 200)).toBe("minmax(0, 1fr) 64px");
    expect(rowGridTemplate(false, true, 200)).toBe("minmax(0, 1fr) 140px");
    expect(rowGridTemplate(false, false, 100)).toBe("minmax(0, 1fr)");
  });
});

describe("computeNameCellWidth (design §3.8.5, R-956-2, AC-917/AC-943/AC-944)", () => {
  it("AC-917: minCol widths give 160 / 174 / 166 / 180", () => {
    expect(computeNameCellWidth({ colWidth: 172, showSize: false, showTime: false })).toBe(160);
    expect(computeNameCellWidth({ colWidth: 252, showSize: true, showTime: false })).toBe(174);
    expect(computeNameCellWidth({ colWidth: 320, showSize: false, showTime: true })).toBe(166);
    expect(computeNameCellWidth({ colWidth: 400, showSize: true, showTime: true })).toBe(180);
  });

  it("AC-943: W=300, both -> 300 - 12 - 4 - 64 - 140 = 80", () => {
    expect(computeNameCellWidth({ colWidth: 300, showSize: true, showTime: true })).toBe(80);
  });

  it("AC-944: W=200, size only -> 200 - 12 - 2 - 64 = 122", () => {
    expect(computeNameCellWidth({ colWidth: 200, showSize: true, showTime: false })).toBe(122);
  });

  it("AC-944 / R-949-5: W=200, both -> negative result is floored at 0", () => {
    expect(computeNameCellWidth({ colWidth: 200, showSize: true, showTime: true })).toBe(0);
  });

  it("exactly 0 stays 0 (colWidth 220 with both columns)", () => {
    expect(computeNameCellWidth({ colWidth: 220, showSize: true, showTime: true })).toBe(0);
  });
});

describe("computeScrollTargetForFocus (R-958 auto column scroll, AC-924, AC-943)", () => {
  // AC-921 geometry: rows 20, cols 2, pitch 268, needed 5.
  const base = { rows: 20, cols: 2, pitch: 268, needed: 5 };

  it("AC-924 (i): focus 1st/21st item (columns 0/1) keeps scrollLeft 0", () => {
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 0, scrollLeft: 0 })).toBe(0);
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 20, scrollLeft: 0 })).toBe(0);
  });

  it("AC-924 (i): 41st item (column 2) scrolls to 268, then 61st (column 3) to 536", () => {
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 40, scrollLeft: 0 })).toBe(268);
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 60, scrollLeft: 268 })).toBe(536);
  });

  it("AC-924 (ii): 81st item (last column 4) scrolls to 804 = maxScrollLeft", () => {
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 80, scrollLeft: 536 })).toBe(804);
  });

  it("a column already fully visible does not move scrollLeft", () => {
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 40, scrollLeft: 268 })).toBe(268);
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 20, scrollLeft: 268 })).toBe(268);
  });

  it("moving back left aligns the column to the left edge (smallest multiple that shows it)", () => {
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 0, scrollLeft: 804 })).toBe(0);
    expect(computeScrollTargetForFocus({ ...base, focusIndex: 20, scrollLeft: 536 })).toBe(268);
  });

  it("the result is always a multiple of the pitch within [0, maxScrollLeft]", () => {
    for (const focusIndex of [0, 19, 20, 39, 40, 59, 60, 79, 80, 99]) {
      for (const scrollLeft of [0, 268, 536, 804]) {
        const t = computeScrollTargetForFocus({ ...base, focusIndex, scrollLeft });
        expect(t % 268).toBe(0);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(804);
      }
    }
  });

  it("G7: after the geometry shrinks to one column, a stale large scrollLeft is clamped back to 0", () => {
    expect(computeScrollTargetForFocus({ focusIndex: 0, rows: 20, cols: 1, pitch: 736, needed: 1, scrollLeft: 804 })).toBe(0);
  });

  it("AC-943: narrow list (cols 1, pitch 316): focusing the 21st item scrolls to 316", () => {
    expect(computeScrollTargetForFocus({ focusIndex: 20, rows: 20, cols: 1, pitch: 316, needed: 5, scrollLeft: 0 })).toBe(316);
  });
});

describe("computeEdgeMarkerRows (R-959 / AC-925)", () => {
  const base = { pitch: 268, rows: 20, cols: 2, needed: 5, entryCount: 100 };

  it("AC-925: scrollLeft 0 -> right marker on the 21st item (index 20), no left marker", () => {
    expect(computeEdgeMarkerRows({ ...base, scrollLeft: 0 })).toEqual({ leftIndex: null, rightIndex: 20 });
  });

  it("AC-925: scrollLeft 804 -> left marker on the 61st item (index 60), no right marker", () => {
    expect(computeEdgeMarkerRows({ ...base, scrollLeft: 804 })).toEqual({ leftIndex: 60, rightIndex: null });
  });

  it("a middle position shows both: leftmost visible column head and rightmost visible column head", () => {
    expect(computeEdgeMarkerRows({ ...base, scrollLeft: 268 })).toEqual({ leftIndex: 20, rightIndex: 40 });
  });

  it("no hidden columns (needed <= cols) -> no markers", () => {
    expect(computeEdgeMarkerRows({ ...base, needed: 2, entryCount: 30, scrollLeft: 0 })).toEqual({ leftIndex: null, rightIndex: null });
  });

  it("an empty list has no markers", () => {
    expect(computeEdgeMarkerRows({ ...base, needed: 1, entryCount: 0, scrollLeft: 0 })).toEqual({ leftIndex: null, rightIndex: null });
  });

  it("narrow single visible column (AC-943 geometry): the same row carries both markers when scrolled to a middle column", () => {
    const r = computeEdgeMarkerRows({ scrollLeft: 316, pitch: 316, rows: 20, cols: 1, needed: 5, entryCount: 100 });
    expect(r).toEqual({ leftIndex: 20, rightIndex: 20 });
  });
});

describe("parseRowHeightPx (SPEC-0200-0001 §3.8.1, SHOULD-157: lives in list-layout.ts)", () => {
  it('"28px" -> 28', () => {
    expect(parseRowHeightPx("28px")).toBe(28);
  });

  it("tolerates surrounding whitespace (getPropertyValue returns a leading space)", () => {
    expect(parseRowHeightPx(" 28px ")).toBe(28);
  });

  it("empty / non-numeric / non-px values -> undefined (caller falls back to 32)", () => {
    expect(parseRowHeightPx("")).toBeUndefined();
    expect(parseRowHeightPx("auto")).toBeUndefined();
    expect(parseRowHeightPx("2rem")).toBeUndefined();
    expect(parseRowHeightPx("px")).toBeUndefined();
  });
});
