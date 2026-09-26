import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0009 R-72 (a directory change resets selection/focus — NOT
//   what a reload does), R-76-2 (preserving state across reloads),
//   SPEC-0300-0011 R-76/R-77 (after create: reload, no focus move by default),
//   §3.3.6 provisional defaults (ISS-0044-d / ISS-0022-g / ISS-0039-f: after
//   paste/delete the selection is cleared and focus is clamped; after rename
//   focus follows the renamed entry).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.6:
//   reconcileAfterReload({ prevEntries, prevSelected, prevFocusedPath,
//   nextEntries, focusPath?, clearSelection? }) (MUST-60 adds clearSelection):
//   - selection is limited to paths that still exist in the new listing;
//   - focus = focusPath if given (and present), else the previous focused
//     path (if still present), else the previous index clamped into range.
// Module under test (not yet implemented): reconcileAfterReload in
//   ./dir-load.ts (pure function).
//
// Return shape assumed: { selected: Set<string>; focusedIndex: number }
// (focusedIndex is on the `nextEntries` basis; 0 for an empty listing).

import { reconcileAfterReload } from "./dir-load";

const e = (path: string) => ({ path });
const list = (...paths: string[]) => paths.map(e);

describe("selection (§3.3.6)", () => {
  it("keeps selected paths that still exist and drops those that vanished", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b", "c"),
      prevSelected: new Set(["a", "b"]),
      prevFocusedPath: "a",
      nextEntries: list("a", "c"),
    });
    expect([...r.selected].sort()).toEqual(["a"]);
  });

  it("never introduces paths that were not selected before (new entries are not selected)", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a"),
      prevSelected: new Set(["a"]),
      prevFocusedPath: "a",
      nextEntries: list("a", "new"),
    });
    expect([...r.selected]).toEqual(["a"]);
  });

  it("MUST-60: clearSelection = true empties the selection even if everything still exists", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b"),
      prevSelected: new Set(["a", "b"]),
      prevFocusedPath: "a",
      nextEntries: list("a", "b"),
      clearSelection: true,
    });
    expect(r.selected.size).toBe(0);
  });

  it("clearSelection defaults to false (selection kept)", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b"),
      prevSelected: new Set(["b"]),
      prevFocusedPath: "a",
      nextEntries: list("a", "b"),
    });
    expect([...r.selected]).toEqual(["b"]);
  });

  it("does not mutate the input selection set", () => {
    const prevSelected = new Set(["a", "gone"]);
    reconcileAfterReload({
      prevEntries: list("a", "gone"),
      prevSelected,
      prevFocusedPath: "a",
      nextEntries: list("a"),
    });
    expect([...prevSelected].sort()).toEqual(["a", "gone"]);
  });
});

describe("focus (§3.3.6)", () => {
  it("focusPath (e.g. the renamed entry) wins when it exists in the new listing", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b", "c"),
      prevSelected: new Set(),
      prevFocusedPath: "a",
      nextEntries: list("b", "c", "z"),
      focusPath: "z",
    });
    expect(r.focusedIndex).toBe(2);
  });

  it("without focusPath the previous focused path is kept, wherever it moved to", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b", "c"),
      prevSelected: new Set(),
      prevFocusedPath: "c",
      nextEntries: list("c", "a", "b"),
    });
    expect(r.focusedIndex).toBe(0);
  });

  it("a focusPath that is not in the new listing falls back to the previous focused path", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b"),
      prevSelected: new Set(),
      prevFocusedPath: "b",
      nextEntries: list("a", "b"),
      focusPath: "missing",
    });
    expect(r.focusedIndex).toBe(1);
  });

  it("when the previously focused entry vanished, the previous index is kept (clamped into range)", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b", "c", "d"),
      prevSelected: new Set(),
      prevFocusedPath: "b", // index 1 in prev
      nextEntries: list("a", "c", "d"),
    });
    expect(r.focusedIndex).toBe(1); // lands on "c", the entry that slid into the slot
  });

  it("previous index beyond the new end is clamped to the last entry (e.g. the last entry was deleted)", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b", "c"),
      prevSelected: new Set(),
      prevFocusedPath: "c", // index 2
      nextEntries: list("a", "b"),
    });
    expect(r.focusedIndex).toBe(1);
  });

  it("an empty new listing yields focusedIndex 0 and an empty selection", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a"),
      prevSelected: new Set(["a"]),
      prevFocusedPath: "a",
      nextEntries: [],
    });
    expect(r.focusedIndex).toBe(0);
    expect(r.selected.size).toBe(0);
  });

  it("no previous focus (null) and no focusPath => index 0", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b"),
      prevSelected: new Set(),
      prevFocusedPath: null,
      nextEntries: list("a", "b"),
    });
    expect(r.focusedIndex).toBe(0);
  });

  it("after paste/delete (clearSelection) the focus still follows the clamp rule", () => {
    const r = reconcileAfterReload({
      prevEntries: list("a", "b", "c"),
      prevSelected: new Set(["b", "c"]),
      prevFocusedPath: "c",
      nextEntries: list("a"),
      clearSelection: true,
    });
    expect(r.selected.size).toBe(0);
    expect(r.focusedIndex).toBe(0);
  });
});
