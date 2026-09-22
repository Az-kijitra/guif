import { describe, expect, it } from "vitest";
import {
  applySelectToggle,
  clearSelection,
  invertSelectionVisible,
  selectAllVisible,
  selectRange,
  selectSingle,
  toggleSelection,
} from "./selection";

// Spec: SPEC-0300-0009 (file list / tree view detail)
// Module under test (not yet implemented): ./selection.ts
//
// Entries are represented by their `path` (string) for these pure-logic tests.
//
// R-50: clicking a row selects only that entry and updates the range anchor
// R-51: Shift+click selects a range from the anchor to the clicked row
// R-52: Ctrl/Cmd+click toggles the clicked row without touching other selections
// R-54: select_all / clear_selection / invert selection are provided
// R-55 (R-55, 4th version — ISS-0029 resolved): select_all / invert operate on the
//        *visible* (post-filter) entries only, not the full enumerated set

const paths = ["a", "b", "c", "d", "e"];

describe("selectSingle (SPEC-0300-0009 R-50)", () => {
  it("AC-32: selects only the clicked entry", () => {
    const result = selectSingle("b");
    expect(result.selected).toEqual(new Set(["b"]));
  });

  it("AC-32: updates the range-selection anchor to the clicked entry", () => {
    const result = selectSingle("b");
    expect(result.anchor).toBe("b");
  });
});

describe("selectRange (SPEC-0300-0009 R-51)", () => {
  it("AC-33: Shift+click selects the inclusive range from anchor to the clicked entry", () => {
    const result = selectRange(paths, "b", "d");
    expect(result).toEqual(new Set(["b", "c", "d"]));
  });

  it("AC-33: selecting backwards (target before anchor) still selects the inclusive range", () => {
    const result = selectRange(paths, "d", "b");
    expect(result).toEqual(new Set(["b", "c", "d"]));
  });
});

describe("toggleSelection (SPEC-0300-0009 R-52)", () => {
  it("AC-34: Ctrl/Cmd+click adds the entry to an existing selection without clearing it", () => {
    const before = new Set(["a"]);
    const after = toggleSelection(before, "c");
    expect(after).toEqual(new Set(["a", "c"]));
  });

  it("AC-34: Ctrl/Cmd+click on an already-selected entry removes only that entry", () => {
    const before = new Set(["a", "c"]);
    const after = toggleSelection(before, "a");
    expect(after).toEqual(new Set(["c"]));
  });
});

describe("selectAllVisible (SPEC-0300-0009 R-54, R-55, AC-38/AC-39)", () => {
  it("AC-39: selects every visible (filtered) entry", () => {
    const visible = ["a", "c", "e"]; // e.g. filtered by search
    const result = selectAllVisible(visible);
    expect(result).toEqual(new Set(["a", "c", "e"]));
  });

  it("AC-39: does not include entries that are hidden by the current filter", () => {
    const visible = ["a", "c"];
    const result = selectAllVisible(visible);
    expect(result.has("b")).toBe(false);
    expect(result.has("d")).toBe(false);
    expect(result.has("e")).toBe(false);
  });
});

describe("invertSelectionVisible (SPEC-0300-0009 R-54, R-55, AC-38)", () => {
  it("AC-38: flips selected<->unselected only among the visible entries", () => {
    const visible = ["a", "b", "c"];
    const selected = new Set(["a"]);
    const result = invertSelectionVisible(visible, selected);
    expect(result).toEqual(new Set(["b", "c"]));
  });

  it("AC-38: leaves the selection state of hidden (non-visible) entries unchanged", () => {
    // "d" is selected but not part of the visible (filtered) set; it must remain
    // selected after inverting, since inversion is scoped to visible entries only.
    const visible = ["a", "b"];
    const selected = new Set(["a", "d"]);
    const result = invertSelectionVisible(visible, selected);
    expect(result.has("d")).toBe(true);
    expect(result.has("a")).toBe(false);
    expect(result.has("b")).toBe(true);
  });
});

describe("clearSelection (SPEC-0300-0009 R-54)", () => {
  it("returns an empty selection set", () => {
    expect(clearSelection()).toEqual(new Set());
  });
});

describe("applySelectToggle (SPEC-0300-0009 R-53 / SPEC-0300-0010 AC-13)", () => {
  // AC-13 (0010): "Space キーでフォーカス行の選択をトグルでき、フォーカスが次の行へ
  // 進むこと" — the *result* of the select_toggle action (this module), as
  // opposed to "Space resolves to the select_toggle action" which is verified
  // in features/keyboard/key-dispatch.test.ts (ISS-0025 role split).
  it("AC-13: toggles the focused row's selection state on", () => {
    const result = applySelectToggle({ selected: new Set(), focusedIndex: 1, visibleCount: 5 }, "b");
    expect(result.selected).toEqual(new Set(["b"]));
  });

  it("AC-13: toggles the focused row's selection state off when already selected", () => {
    const result = applySelectToggle(
      { selected: new Set(["b"]), focusedIndex: 1, visibleCount: 5 },
      "b",
    );
    expect(result.selected).toEqual(new Set());
  });

  it("AC-13: moves focus to the next row at the same time", () => {
    const result = applySelectToggle({ selected: new Set(), focusedIndex: 1, visibleCount: 5 }, "b");
    expect(result.focusedIndex).toBe(2);
  });

  it("AC-13: does not move focus past the last visible row", () => {
    const result = applySelectToggle({ selected: new Set(), focusedIndex: 4, visibleCount: 5 }, "e");
    expect(result.focusedIndex).toBe(4);
  });
});
