import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1792 (column dimensions in ch), R-1791 (min_col_width 10..80, default 24), R-1793 (page-wise switching),
//   R-1794 (vertical line on every drawn column but the last), R-1781 / R-1782 / R-1783 (cell widths 2ch / 10ch / 16ch, gap 1ch), AC-1790, AC-1792,
//   AC-1793, SPEC-0300-0009 R-16-1 / R-17 / R-59-1 (rows), R-1842.
//   Replaces the px model of SPEC-0300-0017 R-955 / R-956 (172 / 252 / 320 / 400, 720px cap, 16px gap) and R-958 (scroll/snap), R-959 (edge markers).
// Architecture: SPEC-0200-0001 §3.18.7 / §3.18.15 SHOULD-2: `features/file-list/list-layout.ts`, pure, takes VALUES only (no state, no appearanceState):
//   computeColumnPage({ width, height, rowHeight, ch, count, showSize, showTime, minColWidth, focusIndex })
//     -> { rows, totalCols, cols, startCol, shown, colWidths: number[], first, last }
//        colWidths[i] = floor(W / shown), the remainder r = W mod shown is added 1px each to the RIGHTMOST r columns (design Q-D, provisional);
//        first = startCol x rows, last = min((startCol + shown) x rows - 1, count - 1) (so `slice(first, last + 1)` is the drawn items)
//   buildGeometry({ frameWidth, frameHeight, rowHeight, entryCount, showSize, showTime, focusIndex, minColWidth, ch })
//     -> computeColumnPage's result + { bodyWidth: frameWidth, bodyHeight: rows x rowHeight }   (frameWidth / frameHeight ARE the inner W / H: no 6px padding)
//   computeNameCellWidth({ colWidth, ch, showSize, showTime }) = max(0, colWidth - ch x (2 + 10? + 16?) - ch x (1 + showSize + showTime))
//   rowGridTemplate(showSize, showTime) = "2ch minmax(0, 1fr)" + " 10ch" + " 16ch"
//   parseRowHeightPx stays (used by text-measure.ts). Removed: computeColumnWidth, computeOverflowMarkers, computeScrollSnapTarget,
//   computeScrollTargetForFocus, computeEdgeMarkerRows, computeListGeometry, LIST_COL_GAP_PX, COL_MAX_WIDTH_PX, SIZE_CELL_PX, TIME_CELL_PX, NAME_CELL_MIN_PX.
//
// Module under test (not yet implemented): ./list-layout.ts

import * as ns from "./list-layout";
import { buildGeometry, computeColumnPage, computeNameCellWidth, parseRowHeightPx, rowGridTemplate } from "./list-layout";

// ch = 10 and rowHeight = 21 keep the arithmetic exact.
const page = (over: Partial<Parameters<typeof computeColumnPage>[0]> = {}) =>
  computeColumnPage({ width: 1000, height: 420, rowHeight: 21, ch: 10, count: 100, showSize: true, showTime: false, minColWidth: 24, focusIndex: 0, ...over });

describe("rows (R-16-1)", () => {
  it("floor(H / row height): 420 / 21 = 20; 440 -> 20; 441 -> 21", () => {
    expect(page({ height: 420 }).rows).toBe(20);
    expect(page({ height: 440 }).rows).toBe(20);
    expect(page({ height: 441 }).rows).toBe(21);
  });

  it("at least 1 even when H is smaller than a row or 0", () => {
    expect(page({ height: 10 }).rows).toBe(1);
    expect(page({ height: 0 }).rows).toBe(1);
  });
});

describe("AC-1790: the column count (R-1792)", () => {
  it("default 24 + size: minCol = (24 + 10) x 10 = 340; W 1000 -> maxFit 2; 100 items / 20 rows = 5 total -> 2 columns of 500", () => {
    const r = page();
    expect([r.totalCols, r.cols, r.startCol, r.shown]).toEqual([5, 2, 0, 2]);
    expect(r.colWidths).toEqual([500, 500]);
  });

  it("both size and time: minCol = (24 + 10 + 20) x 10 = 540 -> maxFit 1", () => {
    const r = page({ showTime: true });
    expect([r.cols, r.colWidths]).toEqual([1, [1000]]);
  });

  it("name only: minCol = 240 -> maxFit 4", () => {
    expect(page({ showSize: false }).cols).toBe(4);
  });

  it("min_col_width = 10 (no size / time): minCol = 100 -> maxFit 10, but only 5 columns exist -> 5 columns of 200", () => {
    const r = page({ showSize: false, minColWidth: 10 });
    expect([r.cols, r.colWidths]).toEqual([5, [200, 200, 200, 200, 200]]);
  });

  it("min_col_width = 80 (size): minCol = 900 -> maxFit 1", () => {
    expect(page({ minColWidth: 80 }).cols).toBe(1);
  });

  it("the column count never exceeds the columns needed: 3 items on one page is 1 column, as wide as W (no 720px cap)", () => {
    const r = page({ count: 3, width: 1500 });
    expect([r.totalCols, r.cols, r.colWidths]).toEqual([1, 1, [1500]]);
  });

  it("W < minCol: one column as wide as W (the cells keep their widths, the name narrows)", () => {
    const r = page({ width: 300 });
    expect([r.cols, r.shown, r.colWidths]).toEqual([1, 1, [300]]);
  });

  it("W = minCol exactly fits one column", () => {
    expect(page({ width: 340 }).colWidths).toEqual([340]);
  });

  it("the ch scales the minimum: ch = 5 halves minCol (170) so W 1000 fits 5", () => {
    expect(page({ ch: 5, count: 1000 }).cols).toBe(5);
  });

  it("total is at least 1 for an empty list (cols 1, first 0, last -1: nothing drawn)", () => {
    const r = page({ count: 0 });
    expect([r.totalCols, r.cols, r.shown, r.first, r.last]).toEqual([1, 1, 1, 0, -1]);
  });

  it("an exact multiple: 40 items / 20 rows = 2 total", () => {
    expect(page({ count: 40 }).totalCols).toBe(2);
    expect(page({ count: 41 }).totalCols).toBe(3);
  });
});

describe("AC-1792: the page switches by whole pages (R-1793)", () => {
  // 100 items, 20 rows, 2 columns per page, 5 columns in all.
  const at = (focusIndex: number) => {
    const r = page({ focusIndex });
    return [r.startCol, r.shown, r.colWidths, r.first, r.last] as const;
  };

  it("items 1..40 (focus 0, 20, 39) -> columns 1-2", () => {
    for (const f of [0, 19, 20, 39]) expect(at(f)).toEqual([0, 2, [500, 500], 0, 39]);
  });

  it("21st item is still page 1; 41st and 61st -> columns 3-4", () => {
    expect(at(20)[0]).toBe(0);
    for (const f of [40, 60, 79]) expect(at(f)).toEqual([2, 2, [500, 500], 40, 79]);
  });

  it("81st item -> the last page has the 5th column only, as wide as W", () => {
    expect(at(80)).toEqual([4, 1, [1000], 80, 99]);
  });

  it("R-1793: the last page is divided among the REMAINING columns (3 columns per page, 5 total -> the last page shows 2)", () => {
    const r = page({ width: 1020, minColWidth: 24, showSize: false, ch: 10, focusIndex: 60 }); // minCol 240 -> maxFit 4; use 3 per page below
    expect(r.cols).toBe(4);
    const q = page({ width: 900, showSize: false, focusIndex: 80 }); // maxFit 3
    expect([q.cols, q.startCol, q.shown, q.colWidths]).toEqual([3, 3, 2, [450, 450]]);
  });

  it("a focus beyond the last item or negative (-1: the cursor is filtered out) is treated as the first page", () => {
    expect(page({ focusIndex: -1 }).startCol).toBe(0);
    expect(page({ focusIndex: 0 }).startCol).toBe(0);
  });

  it("the drawn range of a partly filled last column stops at the last item", () => {
    const r = page({ count: 45, focusIndex: 44 }); // 3 total columns, 2 per page -> page 2 = column 3 only
    expect([r.startCol, r.shown, r.first, r.last]).toEqual([2, 1, 40, 44]);
  });
});

describe("column widths: W divided into `shown` parts, the remainder to the right columns (R-1792)", () => {
  it("1001 / 2 -> [500, 501]", () => {
    expect(page({ width: 1001 }).colWidths).toEqual([500, 501]);
  });

  it("1000 / 3 columns -> [333, 333, 334]; 1002 / 3 -> [334, 334, 334]", () => {
    expect(page({ width: 1000, showSize: false, minColWidth: 10, count: 60 }).colWidths).toEqual([333, 333, 334]);
    expect(page({ width: 1002, showSize: false, minColWidth: 10, count: 60 }).colWidths).toEqual([334, 334, 334]);
  });

  it("the widths always add up to W (no gap between columns)", () => {
    for (const width of [341, 999, 1001, 1337, 2000]) {
      const r = page({ width });
      expect(r.colWidths.reduce((a, b) => a + b, 0)).toBe(width);
    }
  });
});

describe("buildGeometry (SPEC-0200-0001 §3.18.15 SHOULD-2: values only)", () => {
  const input = { frameWidth: 1000, frameHeight: 420, rowHeight: 21, entryCount: 100, showSize: true, showTime: false, focusIndex: 0, minColWidth: 24, ch: 10 };

  it("is computeColumnPage plus bodyWidth (= W) and bodyHeight (= rows x row height)", () => {
    const g = buildGeometry(input);
    expect(g).toMatchObject({ rows: 20, totalCols: 5, cols: 2, startCol: 0, shown: 2, colWidths: [500, 500], first: 0, last: 39, bodyWidth: 1000, bodyHeight: 420 });
  });

  it("the frame height is the INNER height: no 6px body padding is subtracted any more (420 -> 20 rows, not 19)", () => {
    expect(buildGeometry(input).rows).toBe(20);
  });

  it("an unknown row height (undefined, the CSS variable unreadable) falls back to 32", () => {
    const g = buildGeometry({ ...input, rowHeight: undefined, frameHeight: 320 });
    expect([g.rows, g.bodyHeight]).toEqual([10, 320]);
  });

  it("follows focusIndex (the position in the FILTERED array, -1 when hidden) and does not read any state", () => {
    expect(buildGeometry({ ...input, focusIndex: 85 }).startCol).toBe(4);
    expect(buildGeometry({ ...input, focusIndex: -1 }).startCol).toBe(0);
    expect(buildGeometry.length).toBe(1); // one object argument: no state parameter
  });
});

describe("cell widths in ch (R-1780 .. R-1783)", () => {
  it("computeNameCellWidth: the column minus mark 2ch, the icon 2.5ch (2ch + 0.5ch gap, R-1780-3), size 10ch, time 16ch and 1ch between the cells", () => {
    expect(computeNameCellWidth({ colWidth: 500, ch: 10, showSize: false, showTime: false })).toBe(500 - 20 - 25 - 10);
    expect(computeNameCellWidth({ colWidth: 500, ch: 10, showSize: true, showTime: false })).toBe(500 - 20 - 25 - 100 - 20);
    expect(computeNameCellWidth({ colWidth: 600, ch: 10, showSize: true, showTime: true })).toBe(600 - 20 - 25 - 100 - 160 - 30);
  });

  it("a column with a vertical rule has 1px less", () => {
    expect(computeNameCellWidth({ colWidth: 500, ch: 10, showSize: false, showTime: false, separator: true })).toBe(500 - 1 - 20 - 25 - 10);
  });

  it("never negative", () => {
    expect(computeNameCellWidth({ colWidth: 50, ch: 10, showSize: true, showTime: true })).toBe(0);
  });

  it("rowGridTemplate: mark 2ch, name flexible (can shrink to 0), size 10ch, time 16ch", () => {
    expect(rowGridTemplate(false, false)).toBe("2ch minmax(0, 1fr)");
    expect(rowGridTemplate(true, false)).toBe("2ch minmax(0, 1fr) 10ch");
    expect(rowGridTemplate(true, true)).toBe("2ch minmax(0, 1fr) 10ch 16ch");
    expect(rowGridTemplate(false, true)).toBe("2ch minmax(0, 1fr) 16ch");
  });
});

describe("the px model is gone", () => {
  it.each([
    "computeColumnWidth", "computeOverflowMarkers", "computeScrollSnapTarget", "computeScrollTargetForFocus", "computeEdgeMarkerRows",
    "computeListGeometry", "computeListLayout", "LIST_COL_GAP_PX", "COL_MAX_WIDTH_PX", "SIZE_CELL_PX", "TIME_CELL_PX", "NAME_CELL_MIN_PX", "LIST_BODY_PADDING_Y_PX",
  ])("%s is no longer exported", (name) => {
    expect((ns as Record<string, unknown>)[name]).toBeUndefined();
  });
});

describe("parseRowHeightPx (kept)", () => {
  it("reads a px length; undefined otherwise", () => {
    expect(parseRowHeightPx("21px")).toBe(21);
    expect(parseRowHeightPx(" 21.5px ")).toBe(21.5);
    expect(parseRowHeightPx("")).toBeUndefined();
    expect(parseRowHeightPx("2em")).toBeUndefined();
  });
});
