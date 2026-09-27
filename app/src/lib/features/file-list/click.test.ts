import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0009 R-50 (click selects), R-51 (Shift+click range), R-52
//   (Ctrl/Cmd+click toggle) -- SPEC-0300-0015 R-401-5 schedules their
//   IMPLEMENTATION (mouse wiring) for Phase 6 (ISS-0132: a Phase 1
//   implementation gap, closed here); AC-32/AC-33/AC-34 (SPEC-0300-0009,
//   the behavior's normative source) and AC-403/AC-403-1 (SPEC-0300-0015,
//   the double-click composition).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.5.3
//   (SHOULD-107/SHOULD-110): "clicking a row moves FOCUS to that row" is an
//   explicit 【導出】 contract pinned by this test file (SPEC-0300-0009 does
//   not say whether a click moves focus; without it, R-402-2 -- "double-click
//   opens the row that was double-clicked" -- could not hold). The click
//   handler DELEGATES to the existing pure selection functions in
//   `./selection.ts` (`selectSingle`/`selectRange`/`toggleSelection`) rather
//   than reimplementing them, per §3.5.3.
// Module under test (not yet implemented): ./click.ts (a NEW module; this
//   file intentionally does not touch the existing, already-implemented and
//   passing `./selection.test.ts`).
//
// Contract assumed (documented in the handback report):
//   export interface ClickRowState { selected: ReadonlySet<string>; anchor: string | null; }
//   export interface ClickRowResult { selected: Set<string>; anchor: string; focusedIndex: number; }
//   resolveRowClick(
//     visiblePaths: readonly string[],
//     state: ClickRowState,
//     clickedPath: string,
//     modifiers: { shiftKey: boolean; ctrlKey: boolean },
//   ): ClickRowResult
//   - plain click: selectSingle(clickedPath) (R-50), anchor = clickedPath
//   - shift+click: selectRange(visiblePaths, anchor ?? clickedPath, clickedPath)
//     (R-51); the anchor itself is NOT moved (so repeated Shift+clicks grow/
//     shrink the range from the same start) -- unless there was no anchor
//     yet, in which case the click establishes one
//   - ctrl/cmd+click: toggleSelection(selected, clickedPath) (R-52); the
//     anchor moves to clickedPath (so a FOLLOWING Shift+click ranges from
//     here -- an assumption not fixed by SPEC-0300-0009, called out in the
//     handback report)
//   - EVERY click (regardless of modifiers) moves focus to the clicked row's
//     index within `visiblePaths` (the 【導出】 contract above)

import { resolveRowClick } from "./click";

const visible = ["a", "b", "c", "d", "e"];

describe("resolveRowClick: plain click (SPEC-0300-0009 R-50, AC-32)", () => {
  it("selects only the clicked row and sets the anchor to it", () => {
    const result = resolveRowClick(visible, { selected: new Set(["a", "c"]), anchor: "a" }, "d", {
      shiftKey: false,
      ctrlKey: false,
    });
    expect(result.selected).toEqual(new Set(["d"]));
    expect(result.anchor).toBe("d");
  });

  it("moves focus to the clicked row (§3.5.3 SHOULD-110)", () => {
    const result = resolveRowClick(visible, { selected: new Set(), anchor: null }, "c", {
      shiftKey: false,
      ctrlKey: false,
    });
    expect(result.focusedIndex).toBe(2);
  });
});

describe("resolveRowClick: Shift+click (SPEC-0300-0009 R-51, AC-33)", () => {
  it("selects the inclusive range from the existing anchor to the clicked row", () => {
    const result = resolveRowClick(visible, { selected: new Set(["b"]), anchor: "b" }, "d", {
      shiftKey: true,
      ctrlKey: false,
    });
    expect(result.selected).toEqual(new Set(["b", "c", "d"]));
  });

  it("does not move the anchor (a later Shift+click still ranges from the original anchor)", () => {
    const result = resolveRowClick(visible, { selected: new Set(["b"]), anchor: "b" }, "d", {
      shiftKey: true,
      ctrlKey: false,
    });
    expect(result.anchor).toBe("b");
  });

  it("with no prior anchor, Shift+click behaves like a plain click (establishes the anchor)", () => {
    const result = resolveRowClick(visible, { selected: new Set(), anchor: null }, "c", {
      shiftKey: true,
      ctrlKey: false,
    });
    expect(result.selected).toEqual(new Set(["c"]));
    expect(result.anchor).toBe("c");
  });

  it("moves focus to the clicked (range end) row", () => {
    const result = resolveRowClick(visible, { selected: new Set(["b"]), anchor: "b" }, "d", {
      shiftKey: true,
      ctrlKey: false,
    });
    expect(result.focusedIndex).toBe(3);
  });
});

describe("resolveRowClick: Ctrl/Cmd+click (SPEC-0300-0009 R-52, AC-34)", () => {
  it("toggles the clicked row into the selection without clearing the rest", () => {
    const result = resolveRowClick(visible, { selected: new Set(["a"]), anchor: "a" }, "c", {
      shiftKey: false,
      ctrlKey: true,
    });
    expect(result.selected).toEqual(new Set(["a", "c"]));
  });

  it("toggles an already-selected row OFF, removing only that entry", () => {
    const result = resolveRowClick(visible, { selected: new Set(["a", "c"]), anchor: "a" }, "a", {
      shiftKey: false,
      ctrlKey: true,
    });
    expect(result.selected).toEqual(new Set(["c"]));
  });

  it("moves focus to the clicked row", () => {
    const result = resolveRowClick(visible, { selected: new Set(["a"]), anchor: "a" }, "e", {
      shiftKey: false,
      ctrlKey: true,
    });
    expect(result.focusedIndex).toBe(4);
  });
});

describe("AC-403-1: the double-click composition (1st click selects, 2nd click opens)", () => {
  it("a plain click followed by opening the SAME row leaves the selection exactly as the click set it", () => {
    // This pins the composition contract at the unit level: `resolveRowClick`
    // alone decides the post-click selection; `list-action-wiring.ts` (tested
    // separately) is responsible for calling `open-decision.ts`'s judgment on
    // dblclick WITHOUT calling resolveRowClick a second time (R-407: opening
    // must not further change focus/selection).
    const afterClick = resolveRowClick(visible, { selected: new Set(["a", "b"]), anchor: "a" }, "a", {
      shiftKey: false,
      ctrlKey: false,
    });
    expect(afterClick.selected).toEqual(new Set(["a"]));
    expect(afterClick.focusedIndex).toBe(0);
  });
});
