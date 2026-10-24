import { describe, expect, it } from "vitest";
import {
  INITIAL_UI_STATE,
  computeFileListAria,
  computeRowAria,
  computeTreeAria,
  computeTreeFocusReassignment,
  computeTreeItemAria,
} from "./aria";

// Spec: SPEC-0300-0009 (file list / tree view detail)
// Module under test (not yet implemented): ./aria.ts
//
// This module computes the *data* (role/attribute values) that the eventual
// Svelte components must render, so that the accessibility and screen-init
// acceptance criteria can be verified without a DOM rendering environment.
// R-24/R-25: ARIA roles/attributes for the file list and tree.
// R-10/R-11 (screen composition), R-12: 220/200/320px tree panel width.
// R-13/R-14: initial tree visibility + focus reassignment on hide.
// R-21/R-30/R-74 notes: initial display defaults (size shown, time hidden,
//   sort name/asc, hidden files off).

describe("INITIAL_UI_STATE (SPEC-0300-0009 R-13, R-21, R-30 note, R-74 note)", () => {
  it("AC-08: tree panel is visible on initial launch (ui_show_tree default true)", () => {
    expect(INITIAL_UI_STATE.showTree).toBe(true);
  });

  it("AC-10: size column is shown and modified-time column is hidden by default", () => {
    expect(INITIAL_UI_STATE.showSize).toBe(true);
    expect(INITIAL_UI_STATE.showTime).toBe(false);
  });

  it("initial sort defaults to name/asc (ISS-0022-c)", () => {
    expect(INITIAL_UI_STATE.sortKey).toBe("name");
    expect(INITIAL_UI_STATE.sortOrder).toBe("asc");
  });

  it("hidden files are not shown by default (ISS-0022-c)", () => {
    expect(INITIAL_UI_STATE.showHidden).toBe(false);
  });
});

// SPEC-0300-0023 R-1804 / SPEC-0200-0001 §3.18.8: the tree width is a PERCENTAGE of the body width (`tree_width_percent`, default 24), computed by
// `pane-layout.ts::treePanelWidthPx`. The fixed 220px (`TREE_PANEL_WIDTH`, SPEC-0300-0009 8th ed. R-12 / AC-55) is removed.
import * as ariaNs from "./aria";

describe("TREE_PANEL_WIDTH is removed (SPEC-0300-0023 R-1804 3)", () => {
  it("aria.ts no longer exports the fixed 220px width", () => {
    expect((ariaNs as Record<string, unknown>).TREE_PANEL_WIDTH).toBeUndefined();
  });
});

describe("computeTreeFocusReassignment (SPEC-0300-0009 R-14, AC-09)", () => {
  it("AC-09: hiding the tree while focus is inside it reassigns focus to the file list", () => {
    const result = computeTreeFocusReassignment({ focusRegion: "tree", treeNowVisible: false });
    expect(result.focusRegion).toBe("file-list");
  });

  it("does not move focus when it was already in the file list", () => {
    const result = computeTreeFocusReassignment({ focusRegion: "file-list", treeNowVisible: false });
    expect(result.focusRegion).toBe("file-list");
  });
});

describe("computeFileListAria (SPEC-0300-0009 R-24, AC-52)", () => {
  // SHOULD-39 (docs/architecture/proposals/SPEC-0200-0001.md §3.1.6):
  // computeFileListAria's signature is extended to
  // `{ focusedPath: string; isFocusedPathVisible: boolean }` so it can
  // express SPEC-0300-0012 R-119 (below). These 2 pre-existing calls pass
  // `isFocusedPathVisible: true`, i.e. the ordinary case where the focused
  // row is part of the currently displayed set (search inactive, or the
  // focused entry survives the filter) — AC-52's baseline behavior.
  it("AC-52: exposes role=listbox and aria-multiselectable=true", () => {
    const aria = computeFileListAria({ focusedPath: "C:/root/a", isFocusedPathVisible: true });
    expect(aria.role).toBe("listbox");
    expect(aria["aria-multiselectable"]).toBe(true);
  });

  it("AC-52: aria-activedescendant points at the focused row's id when that row is visible", () => {
    const aria = computeFileListAria({ focusedPath: "C:/root/a", isFocusedPathVisible: true });
    expect(aria["aria-activedescendant"]).toBe("C:/root/a");
  });
});

// SPEC-0300-0012 R-119 / AC-120 (ISS-0062-adjacent "form" confirmed by
// SHOULD-39 independently of ISS-0062's own resolution): when the focused
// entry has been filtered out of the currently visible set, the file list
// must not keep `aria-activedescendant` pointing at a hidden row.
describe("computeFileListAria — R-119 hidden-focus exception (SPEC-0300-0012 R-119, AC-120)", () => {
  it("AC-120: omits aria-activedescendant entirely when the focused entry is not part of the visible (filtered) set", () => {
    const aria = computeFileListAria({ focusedPath: "C:/root/a", isFocusedPathVisible: false });
    expect(aria["aria-activedescendant"]).toBeUndefined();
  });

  it("still exposes role=listbox and aria-multiselectable=true when aria-activedescendant is omitted", () => {
    const aria = computeFileListAria({ focusedPath: "C:/root/a", isFocusedPathVisible: false });
    expect(aria.role).toBe("listbox");
    expect(aria["aria-multiselectable"]).toBe(true);
  });
});

describe("computeRowAria (SPEC-0300-0009 R-24, AC-53)", () => {
  it("AC-53: exposes role=option with aria-selected matching the selection state", () => {
    expect(computeRowAria({ selected: true }).role).toBe("option");
    expect(computeRowAria({ selected: true })["aria-selected"]).toBe(true);
    expect(computeRowAria({ selected: false })["aria-selected"]).toBe(false);
  });
});

describe("computeTreeAria / computeTreeItemAria (SPEC-0300-0009 R-25, AC-54)", () => {
  it("AC-54: the tree root exposes role=tree", () => {
    expect(computeTreeAria().role).toBe("tree");
  });

  it("AC-54: each node exposes role=treeitem, aria-level and aria-expanded matching its state", () => {
    const aria = computeTreeItemAria({ level: 2, expanded: true });
    expect(aria.role).toBe("treeitem");
    expect(aria["aria-level"]).toBe(2);
    expect(aria["aria-expanded"]).toBe(true);
  });

  it("AC-54: aria-expanded reflects a collapsed node", () => {
    const aria = computeTreeItemAria({ level: 1, expanded: false });
    expect(aria["aria-expanded"]).toBe(false);
  });
});
