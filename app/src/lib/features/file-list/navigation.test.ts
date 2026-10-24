import { describe, expect, it } from "vitest";
import {
  extendRangeSelection,
  filterFocusableEntries,
  moveFocusColumn,
  moveFocusPage,
  moveFocusRow,
  resolveFocusIndexForVisibleSet,
  toRealIndex,
  toVisualIndex,
} from "./navigation";

// Spec: SPEC-0300-0009 (file list / tree view detail) R-56~R-60
// Per SPEC-0300-0009 AC-41~AC-44 (ISS-0025 dedup), the *result* of firing
// move_up/move_down/move_left/move_right/page_up/page_down/Shift+move is
// verified under SPEC-0300-0010's AC-06/AC-07/AC-08/AC-16 (this file). The
// *key press causing dispatch* is covered separately in key-dispatch.test.ts.
// SPEC-0300-0009 AC-45 (focus only traverses visible entries) is also covered
// here since it directly exercises the same navigation module.
//
// Module under test (not yet implemented): ./navigation.ts

describe("moveFocusRow (SPEC-0300-0009 R-56, R-57 / SPEC-0300-0010 AC-06)", () => {
  const visible = ["a", "b", "c", "d"];

  it("AC-06: move_down moves the focused index down by exactly one row in display order", () => {
    expect(moveFocusRow(visible, 1, "down")).toBe(2);
  });

  it("AC-06: move_up moves the focused index up by exactly one row in display order", () => {
    expect(moveFocusRow(visible, 2, "up")).toBe(1);
  });

  it("does not move past the last visible entry", () => {
    expect(moveFocusRow(visible, 3, "down")).toBe(3);
  });

  it("does not move before the first visible entry", () => {
    expect(moveFocusRow(visible, 0, "up")).toBe(0);
  });
});

describe("moveFocusColumn (SPEC-0300-0009 R-58 / SPEC-0300-0010 AC-07)", () => {
  // 6 entries laid out with rowsPerColumn=3: col0=[0,1,2], col1=[3,4,5]
  const rowsPerColumn = 3;
  const totalCount = 6;

  it("AC-07: move_right jumps to the same row position in the next column", () => {
    // index 1 (row 1, col 0) -> index 4 (row 1, col 1)
    expect(moveFocusColumn(1, "right", rowsPerColumn, totalCount)).toBe(4);
  });

  it("AC-07: move_left jumps to the same row position in the previous column", () => {
    // index 4 (row 1, col 1) -> index 1 (row 1, col 0)
    expect(moveFocusColumn(4, "left", rowsPerColumn, totalCount)).toBe(1);
  });

  it("does not move past the last column (index 5 is in the last column: stays)", () => {
    expect(moveFocusColumn(5, "right", rowsPerColumn, totalCount)).toBe(5);
  });

  it("does not move before the first column", () => {
    expect(moveFocusColumn(0, "left", rowsPerColumn, totalCount)).toBe(0);
  });
});

describe("moveFocusColumn: SPEC-0300-0023 R-1796 / R-1797 / AC-1796 (20 rows, 45 items; the 3rd column holds items 41..45)", () => {
  // 0-based indexes: the Nth item is index N - 1.
  it("(i) 15th item, right -> 35th (same row position)", () => {
    expect(moveFocusColumn(14, "right", 20, 45)).toBe(34);
  });

  it("(ii) 30th item, right: the 3rd column has no 10th row -> the LAST item (45th), not a no-op (replaces SPEC-0300-0009 R-58 up to the 19th edition)", () => {
    expect(moveFocusColumn(29, "right", 20, 45)).toBe(44);
  });

  it("(iii) 45th item (last column), right -> does not move", () => {
    expect(moveFocusColumn(44, "right", 20, 45)).toBe(44);
  });

  it("(iv) 25th item, left -> 5th", () => {
    expect(moveFocusColumn(24, "left", 20, 45)).toBe(4);
  });

  it("(v) 5th item (first column), left -> does not move", () => {
    expect(moveFocusColumn(4, "left", 20, 45)).toBe(4);
  });

  it("right from the 2nd column into a short 3rd column lands on the last item even for the first row of the missing part", () => {
    expect(moveFocusColumn(25, "right", 20, 45)).toBe(44); // 26th item (row 5) -> row 5 does not exist in column 3 (5 items: rows 0..4)
    expect(moveFocusColumn(24, "right", 20, 45)).toBe(44); // 25th item (row 4) -> 45th (exists, same position)
  });

  it("the left move from the last (short) column goes to the same row position, or does not move at the first column", () => {
    expect(moveFocusColumn(44, "left", 20, 45)).toBe(24);
    expect(moveFocusColumn(3, "left", 20, 45)).toBe(3);
  });

  it("an empty list or no rows does not move", () => {
    expect(moveFocusColumn(0, "right", 20, 0)).toBe(0);
    expect(moveFocusColumn(0, "right", 0, 5)).toBe(0);
  });
});

describe("moveFocusPage (SPEC-0300-0009 R-59 / SPEC-0300-0010 AC-08)", () => {
  const visible = Array.from({ length: 50 }, (_, i) => `entry-${i}`);
  const rows = 10;

  it("AC-08: page_down moves the focus forward by one page (rows) worth of entries", () => {
    expect(moveFocusPage(visible, 5, "down", rows)).toBe(15);
  });

  it("AC-08: page_up moves the focus backward by one page (rows) worth of entries", () => {
    expect(moveFocusPage(visible, 25, "up", rows)).toBe(15);
  });

  it("clamps to the last entry when a page-down would overshoot the list", () => {
    expect(moveFocusPage(visible, 45, "down", rows)).toBe(49);
  });

  it("clamps to the first entry when a page-up would undershoot the list", () => {
    expect(moveFocusPage(visible, 5, "up", rows)).toBe(0);
  });
});

describe("extendRangeSelection (SPEC-0300-0009 R-60 / SPEC-0300-0010 AC-16)", () => {
  const visible = ["a", "b", "c", "d", "e"];

  it("AC-16: Shift+move extends the selection from the anchor to the new focus position", () => {
    const result = extendRangeSelection(visible, "b", "d");
    expect(result).toEqual(new Set(["b", "c", "d"]));
  });

  it("AC-16: Shift+move in the opposite direction still selects the inclusive range", () => {
    const result = extendRangeSelection(visible, "d", "b");
    expect(result).toEqual(new Set(["b", "c", "d"]));
  });
});

describe("filterFocusableEntries (SPEC-0300-0009 R-56, AC-45)", () => {
  it("AC-45: focus traversal only considers entries that are currently visible (post-filter)", () => {
    const all = ["a", "b", "c", "d", "e"];
    const visible = ["a", "c", "e"]; // "b" and "d" are hidden by a search filter
    const focusable = filterFocusableEntries(all, visible);
    expect(focusable).toEqual(["a", "c", "e"]);
    expect(focusable).not.toContain("b");
    expect(focusable).not.toContain("d");
  });
});

// SPEC-0300-0012 (search) / docs/architecture/proposals/SPEC-0200-0001.md
// §3.1.3 (MUST-37): `focusedIndex` is always stored on the `entries`
// (real/unfiltered) basis. Movement math (moveFocusRow/moveFocusColumn
// above) instead operates in "visual index" space (position within the
// currently visible/filtered array). `toVisualIndex`/`toRealIndex` are the
// two conversion functions bridging real <-> visual index spaces, matched
// by path identity (not by array position, since the same path generally
// sits at different positions in `entries` vs. `visible`).
//
// Module under test (not yet implemented): ./navigation.ts (new exports)

describe("toVisualIndex (SPEC-0200-0001 §3.1.3, R-56)", () => {
  const entries = [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }, { path: "e" }];
  const visible = [{ path: "a" }, { path: "c" }, { path: "e" }]; // "b"/"d" filtered out

  it("converts a real index whose entry is visible into its position within `visible`", () => {
    // entries[2] = "c", which is visible[1]
    expect(toVisualIndex(2, entries, visible)).toBe(1);
  });

  it("returns -1 when the entry at realIndex is currently filtered out (not present in `visible`)", () => {
    // entries[1] = "b", which is not part of `visible`
    expect(toVisualIndex(1, entries, visible)).toBe(-1);
  });

  it("returns -1 for a realIndex outside the bounds of `entries`", () => {
    expect(toVisualIndex(99, entries, visible)).toBe(-1);
  });
});

describe("toRealIndex (SPEC-0200-0001 §3.1.3, R-56)", () => {
  const entries = [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }, { path: "e" }];
  const visible = [{ path: "a" }, { path: "c" }, { path: "e" }];

  it("converts a visual index back into the matching real (entries-basis) index", () => {
    // visible[1] = "c", which is entries[2]
    expect(toRealIndex(1, entries, visible)).toBe(2);
  });

  it("returns -1 for a visualIndex outside the bounds of `visible`", () => {
    expect(toRealIndex(5, entries, visible)).toBe(-1);
    expect(toRealIndex(-1, entries, visible)).toBe(-1);
  });

  it("§3.1.4-2 (MUST-44) primitive case: returns -1 for any visualIndex when `visible` is empty", () => {
    expect(toRealIndex(0, entries, [])).toBe(-1);
  });
});

describe("resolveFocusIndexForVisibleSet (SPEC-0300-0012 R-109-2-1 ONLY — see SHOULD-45: this is NOT the same rule as R-107-1's close-time focus restoration, which moves DOM focus to the listbox container without touching focusedIndex at all)", () => {
  const entries = [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }, { path: "e" }];
  const visible = [{ path: "a" }, { path: "c" }, { path: "e" }];

  it("rule 1: keeps the current real index unchanged when its entry is present in `visible`", () => {
    // entries[2] = "c", which is in `visible`
    expect(resolveFocusIndexForVisibleSet(entries, visible, 2)).toBe(2);
  });

  it("rule 2: falls back to the real index of visible[0] when the current entry is filtered out", () => {
    // entries[1] = "b" is not in `visible`; visible[0] = "a" = entries[0]
    expect(resolveFocusIndexForVisibleSet(entries, visible, 1)).toBe(0);
  });

  it("rule 3: returns null (do not move focus into the list) when `visible` is empty", () => {
    expect(resolveFocusIndexForVisibleSet(entries, [], 2)).toBeNull();
  });
});
