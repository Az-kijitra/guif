import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0013 (jump list and visit history, detail) §3 (R-203~R-207),
//   §5 (R-212~R-214), §6 (R-218/R-219), §8 (R-227~R-231)
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.3 (public
//   surface), §3.2.8 (resolveListKeyIntent evaluation order/rationale),
//   §3.2.10 (normalizeStoredForm/pathComparisonKey algorithm, SHOULD-61/73
//   fixes)
//
// Module under test (not yet implemented): ./list-ops.ts
//
// This module owns ALL of the DOM/Tauri-independent pure logic for the
// visit-history/jump-list overlay (R-251-2): MRU/limit application via
// shared/mru-list.ts, path-identity normalization (ISS-0076), selection-index
// arithmetic, and the overlay's own fixed-key intent resolution (MUST-50).
//
// MUST-53 (§4.1 violation fix): `ListKeydownLikeEvent` is a *locally defined*
// structural type — this file must NOT import anything from
// features/keyboard/ (R-252, §3.2.0's self-declared "navigation-history never
// imports file-list/search/keyboard"). The tests below therefore construct
// plain object literals matching the 5-field shape rather than importing
// features/keyboard/keymap-resolve's KeydownLikeEvent.

import {
  addJumpEntry,
  addVisit,
  clampSelectionIndex,
  dedupeJumpList,
  dedupeVisitHistory,
  moveSelectionIndex,
  normalizeStoredForm,
  pathComparisonKey,
  removeAt,
  resolveListKeyIntent,
  type ListKeydownLikeEvent,
} from "./list-ops";

// A fully "no modifiers held" keydown-like event, spread-overridden per test.
function key(overrides: Partial<ListKeydownLikeEvent> & { key: string }): ListKeydownLikeEvent {
  return {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  };
}

describe("normalizeStoredForm / pathComparisonKey (ISS-0076, R-207, R-207-1, R-207-2, §3.2.10)", () => {
  // (a) case-only difference: normalizeStoredForm preserves case (R-207-2);
  // pathComparisonKey folds it (R-207/R-207-1 item 3).
  it("(a) preserves case in the stored form but folds it in the comparison key", () => {
    expect(normalizeStoredForm("C:\\Users\\Foo")).toBe("C:\\Users\\Foo");
    expect(normalizeStoredForm("C:\\users\\foo")).toBe("C:\\users\\foo");
    expect(pathComparisonKey("C:\\Users\\Foo")).toBe(pathComparisonKey("C:\\users\\foo"));
    expect(pathComparisonKey("C:\\Users\\Foo")).toBe("c:\\users\\foo");
  });

  // (b) `/` vs `\` mixed: separators are unified to `\` (item 1).
  it("(b) unifies forward slashes to backslashes", () => {
    expect(normalizeStoredForm("C:/Users/Foo/Bar")).toBe("C:\\Users\\Foo\\Bar");
    expect(pathComparisonKey("C:/Users/Foo/Bar")).toBe(pathComparisonKey("C:\\Users\\Foo\\Bar"));
  });

  // (c) trailing separator: stripped for an ordinary (non-root) path (item 2).
  it("(c) strips a trailing separator on an ordinary directory path", () => {
    expect(normalizeStoredForm("C:\\Users\\Foo\\")).toBe("C:\\Users\\Foo");
    expect(pathComparisonKey("C:\\Users\\Foo\\")).toBe(pathComparisonKey("C:\\Users\\Foo"));
  });

  // (d) drive root: a bare drive letter ("C:", no separator at all) is
  // completed to the full drive root ("C:\\") — SHOULD-61(a) regression
  // (guardian-found AC-207 violation: these previously compared unequal).
  it("(d) SHOULD-61(a) regression: a bare drive letter and the full drive root compare and normalize equal", () => {
    expect(normalizeStoredForm("C:")).toBe("C:\\");
    expect(normalizeStoredForm("C:\\")).toBe("C:\\");
    expect(pathComparisonKey("C:")).toBe(pathComparisonKey("C:\\"));
  });

  // (e) UNC paths: the bare share root and the same root with a trailing
  // separator normalize to the identical canonical form (no trailing
  // separator retained once collapsed).
  it("(e) normalizes a UNC share root with/without a trailing separator to the same form", () => {
    expect(normalizeStoredForm("\\\\server\\share")).toBe("\\\\server\\share");
    expect(normalizeStoredForm("\\\\server\\share\\")).toBe("\\\\server\\share");
    expect(pathComparisonKey("\\\\server\\share")).toBe(pathComparisonKey("\\\\server\\share\\"));
  });

  it("(e) normalizes a UNC path with a sub-directory, stripping only the trailing separator", () => {
    expect(normalizeStoredForm("\\\\server\\share\\sub\\")).toBe("\\\\server\\share\\sub");
  });

  // (f) consecutive separators: collapsed to a single separator (item 4).
  it("(f) collapses consecutive separators to a single one", () => {
    expect(normalizeStoredForm("C:\\a\\\\b")).toBe("C:\\a\\b");
    expect(pathComparisonKey("C:\\a\\\\b")).toBe(pathComparisonKey("C:\\a\\b"));
  });

  // (g) SHOULD-73 regression: consecutive separators BETWEEN the UNC server
  // and share name must not defeat UNC recognition (previously fell through
  // to the generic branch and had its leading "\\" collapsed to a single
  // "\", silently turning a UNC path into a root-relative path).
  it("(g) SHOULD-73 regression: a UNC path with consecutive separators between server and share stays a UNC path", () => {
    expect(normalizeStoredForm("\\\\server\\\\\\share")).toBe("\\\\server\\share");
    // Explicitly guard against the old bug's output.
    expect(normalizeStoredForm("\\\\server\\\\\\share")).not.toBe("\\server\\share");
  });

  it("leaves an already-canonical path unchanged", () => {
    expect(normalizeStoredForm("C:\\Users\\Foo\\Bar")).toBe("C:\\Users\\Foo\\Bar");
  });
});

describe("addVisit (R-203, R-205, R-206, R-206-1, AC-205, AC-206)", () => {
  const LIMIT = 50;

  it("adds a new path to the front of an empty list", () => {
    expect(addVisit([], "C:\\a")).toEqual(["C:\\a"]);
  });

  it("R-206: re-adding an already-present path (by comparison key) moves it to the front instead of duplicating it", () => {
    const list = ["C:\\b", "C:\\a"];
    expect(addVisit(list, "C:\\a")).toEqual(["C:\\a", "C:\\b"]);
  });

  it("R-206/R-207: the MRU key ignores case — re-adding a case-variant of an existing entry still dedupes it, and the newly-typed case wins in the stored form", () => {
    const list = ["C:\\Users\\Foo", "C:\\b"];
    expect(addVisit(list, "c:\\users\\foo")).toEqual(["c:\\users\\foo", "C:\\b"]);
  });

  it("AC-206: adding 51 distinct paths keeps only the 50 most recent, dropping the first-added path", () => {
    const paths = Array.from({ length: 51 }, (_, i) => `C:\\dir${i}`);
    let list: string[] = [];
    for (const p of paths) list = addVisit(list, p);
    expect(list).toHaveLength(LIMIT);
    expect(list).not.toContain(paths[0]);
    expect(list[0]).toBe(paths[50]); // most recently added is first
  });

  // AC-206-1: the persisted/held form is a plain path string, nothing else
  // (no timestamp/count/label wrapper) — this is implicit in the `string[]`
  // return type but is asserted explicitly for regression safety.
  it("AC-206-1: every element is a plain string (no extra fields)", () => {
    const list = addVisit([], "C:\\a");
    expect(typeof list[0]).toBe("string");
  });
});

describe("addJumpEntry (R-204, R-205, R-206, R-214, R-214-1, AC-209, AC-210)", () => {
  const LIMIT = 20;

  it("adds a new path to the front of an empty list", () => {
    expect(addJumpEntry([], "C:\\a")).toEqual(["C:\\a"]);
  });

  it("AC-209: re-registering an already-present path moves it to the front without increasing the count", () => {
    const list = ["C:\\b", "C:\\a"];
    const result = addJumpEntry(list, "C:\\a");
    expect(result).toEqual(["C:\\a", "C:\\b"]);
    expect(result).toHaveLength(2);
  });

  it("AC-210: registering 21 distinct paths keeps only the 20 most recent, dropping the first-registered path", () => {
    const paths = Array.from({ length: 21 }, (_, i) => `C:\\dir${i}`);
    let list: string[] = [];
    for (const p of paths) list = addJumpEntry(list, p);
    expect(list).toHaveLength(LIMIT);
    expect(list).not.toContain(paths[0]);
  });
});

describe("dedupeVisitHistory / dedupeJumpList (R-245-1, R-206, AC-240 — hydrate-time reconciliation, MUST-49(a)(b))", () => {
  it("dedupeVisitHistory keeps the first occurrence of a duplicate (by comparison key) and preserves relative order", () => {
    const loaded = ["C:\\Users\\A", "c:\\users\\a", "C:\\Users\\B"];
    expect(dedupeVisitHistory(loaded)).toEqual(["C:\\Users\\A", "C:\\Users\\B"]);
  });

  it("dedupeVisitHistory truncates to 50, keeping the head (already-MRU-ordered, newest-first) and dropping the tail (oldest)", () => {
    const loaded = Array.from({ length: 51 }, (_, i) => `C:\\dir${i}`); // index 0 = newest
    const result = dedupeVisitHistory(loaded);
    expect(result).toHaveLength(50);
    expect(result).toEqual(loaded.slice(0, 50));
    expect(result).not.toContain(loaded[50]); // oldest dropped
  });

  it("dedupeVisitHistory does NOT reverse order (regression guard: naively folding through applyMru from the front would reverse it)", () => {
    const loaded = ["C:\\first", "C:\\second", "C:\\third"];
    expect(dedupeVisitHistory(loaded)).toEqual(["C:\\first", "C:\\second", "C:\\third"]);
  });

  it("dedupeVisitHistory applies normalizeStoredForm to each element (e.g. separator unification)", () => {
    expect(dedupeVisitHistory(["C:/Users/A"])).toEqual(["C:\\Users\\A"]);
  });

  it("dedupeJumpList keeps the first occurrence and truncates to 20", () => {
    const loaded = Array.from({ length: 21 }, (_, i) => `C:\\dir${i}`);
    const result = dedupeJumpList(loaded);
    expect(result).toHaveLength(20);
    expect(result).toEqual(loaded.slice(0, 20));
  });

  it("dedupeJumpList: an empty input list yields an empty result", () => {
    expect(dedupeJumpList([])).toEqual([]);
  });
});

describe("removeAt (R-213, R-213-1)", () => {
  it("removes the item at the given index, leaving the rest in order", () => {
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("removing the only item yields an empty list", () => {
    expect(removeAt(["a"], 0)).toEqual([]);
  });

  it("an out-of-range index is a defensive no-op (list returned unchanged in content)", () => {
    expect(removeAt(["a", "b"], 5)).toEqual(["a", "b"]);
    expect(removeAt(["a", "b"], -1)).toEqual(["a", "b"]);
  });
});

describe("clampSelectionIndex (R-213-3, AC-225)", () => {
  it("leaves an in-range index untouched", () => {
    expect(clampSelectionIndex(1, 3)).toBe(1);
  });

  it("clamps an index at/after the deleted tail to the new last index", () => {
    expect(clampSelectionIndex(2, 2)).toBe(1); // was pointing at index 2 of a now-2-item list
    expect(clampSelectionIndex(10, 3)).toBe(2);
  });

  it("clamps a negative index up to 0", () => {
    expect(clampSelectionIndex(-1, 3)).toBe(0);
  });

  it("an empty list clamps to 0 (defensive; the overlay is expected to have already closed per R-224 #3)", () => {
    expect(clampSelectionIndex(0, 0)).toBe(0);
    expect(clampSelectionIndex(4, 0)).toBe(0);
  });
});

describe("moveSelectionIndex (R-227, R-228, AC-222 — no wrap, PageUp/PageDown = ±10, Home/End = ends)", () => {
  const LENGTH = 25;

  it("up/down move by 1 and do not wrap past the ends", () => {
    expect(moveSelectionIndex(5, "up", LENGTH)).toBe(4);
    expect(moveSelectionIndex(5, "down", LENGTH)).toBe(6);
    expect(moveSelectionIndex(0, "up", LENGTH)).toBe(0); // no wrap at top
    expect(moveSelectionIndex(LENGTH - 1, "down", LENGTH)).toBe(LENGTH - 1); // no wrap at bottom
  });

  it("pageUp/pageDown move by 10 and clamp at the ends when they would overshoot", () => {
    expect(moveSelectionIndex(15, "pageUp", LENGTH)).toBe(5);
    expect(moveSelectionIndex(15, "pageDown", LENGTH)).toBe(LENGTH - 1); // 15+10=25 overshoots -> clamp to 24
    expect(moveSelectionIndex(5, "pageUp", LENGTH)).toBe(0); // 5-10 undershoots -> clamp to 0
  });

  it("home/end jump straight to the first/last index", () => {
    expect(moveSelectionIndex(12, "home", LENGTH)).toBe(0);
    expect(moveSelectionIndex(12, "end", LENGTH)).toBe(LENGTH - 1);
  });

  it("a single-item list: every direction resolves to index 0", () => {
    expect(moveSelectionIndex(0, "down", 1)).toBe(0);
    expect(moveSelectionIndex(0, "pageDown", 1)).toBe(0);
    expect(moveSelectionIndex(0, "end", 1)).toBe(0);
  });
});

describe("resolveListKeyIntent (R-227, R-230-1, R-231, MUST-50, MUST-54, SHOULD-71, §3.2.8)", () => {
  describe("fixed keys with no modifiers (R-227)", () => {
    it.each([
      ["ArrowUp", "move_up"],
      ["ArrowDown", "move_down"],
      ["PageUp", "page_up"],
      ["PageDown", "page_down"],
      ["Home", "home"],
      ["End", "end"],
      ["Enter", "confirm"],
      ["Escape", "cancel"],
      ["Delete", "delete"],
    ] as const)("%s (no modifiers) resolves to %s", (k, intent) => {
      expect(resolveListKeyIntent(key({ key: k }), null)).toBe(intent);
    });
  });

  describe("MUST-54: a unified modifier guard — ANY of Ctrl/Alt/Meta/Shift disqualifies a fixed key, not just Delete/Enter/Escape", () => {
    it("R-230-1: Shift+Delete is not treated as a delete (safety: don't let it collide with the file-list's permanent-delete gesture)", () => {
      expect(resolveListKeyIntent(key({ key: "Delete", shiftKey: true }), null)).toBeNull();
    });

    it.each([
      ["ArrowUp", { shiftKey: true }],
      ["Home", { shiftKey: true }],
      ["PageDown", { shiftKey: true }],
      ["ArrowUp", { ctrlKey: true }],
      ["Enter", { altKey: true }],
      ["Escape", { metaKey: true }],
      ["End", { ctrlKey: true, shiftKey: true }],
    ] as const)("%s with a modifier (%o) does not resolve to a fixed-key intent", (k, mods) => {
      expect(resolveListKeyIntent(key({ key: k, ...mods }), null)).toBeNull();
    });
  });

  describe("SHOULD-71: Tab/Shift+Tab are trapped while the overlay is open (focus must not escape the listbox)", () => {
    it("Tab (no other modifiers) resolves to 'trap'", () => {
      expect(resolveListKeyIntent(key({ key: "Tab" }), null)).toBe("trap");
    });

    it("Shift+Tab also resolves to 'trap' (reverse tab order is still absorbed)", () => {
      expect(resolveListKeyIntent(key({ key: "Tab", shiftKey: true }), null)).toBe("trap");
    });

    it("Ctrl+Tab / Alt+Tab / Meta+Tab are NOT trapped (left to the OS/browser)", () => {
      expect(resolveListKeyIntent(key({ key: "Tab", ctrlKey: true }), null)).toBeNull();
      expect(resolveListKeyIntent(key({ key: "Tab", altKey: true }), null)).toBeNull();
      expect(resolveListKeyIntent(key({ key: "Tab", metaKey: true }), null)).toBeNull();
    });
  });

  describe("mode-switch keys (R-222, R-231): only consulted via the already-resolved keymap action, never a raw key match", () => {
    it("resolvedAction 'history' resolves to switch_history when the raw key doesn't match a fixed key", () => {
      expect(resolveListKeyIntent(key({ key: "y", ctrlKey: true }), "history")).toBe("switch_history");
    });

    it("resolvedAction 'history_jump_list' resolves to switch_jump", () => {
      expect(resolveListKeyIntent(key({ key: "j", ctrlKey: true }), "history_jump_list")).toBe(
        "switch_jump",
      );
    });

    it("an unrelated resolvedAction (e.g. 'search') resolves to null", () => {
      expect(resolveListKeyIntent(key({ key: "/" }), "search")).toBeNull();
    });

    it("resolvedAction null with an unmatched key resolves to null", () => {
      expect(resolveListKeyIntent(key({ key: "q" }), null)).toBeNull();
    });
  });

  describe("MUST-50(b): fixed keys are evaluated BEFORE the mode-switch action, so a custom keymap collision cannot disable overlay navigation", () => {
    it("a custom keymap that reassigns 'history' onto the physical Delete key still resolves to 'delete', not 'switch_history'", () => {
      expect(resolveListKeyIntent(key({ key: "Delete" }), "history")).toBe("delete");
    });

    it("a custom keymap that reassigns 'history_jump_list' onto ArrowUp still resolves to 'move_up'", () => {
      expect(resolveListKeyIntent(key({ key: "ArrowUp" }), "history_jump_list")).toBe("move_up");
    });
  });
});
