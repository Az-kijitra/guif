import { describe, expect, it } from "vitest";
import { resolveContextClick, resolveRestoredSelection } from "./click";

// Spec: SPEC-0300-0018 R-1020 (right click: unselected row -> selection replaced
//   by that one row + anchor moves; selected row -> selection and anchor kept;
//   the focus row is always the clicked row), R-1022 (hidden selection kept /
//   dropped), R-1003 (no modifier parameters), R-1056-1 (restore the menu's
//   targets before execution), AC-1000, AC-1001, AC-1042.
// Architecture: SPEC-0200-0001 §3.9.3, §3.9.17.2 + coordinator note (guardian
//   20th audit MUST-117): restoration applies to every row-menu item.
//   resolveRestoredSelection: selected = (current selection NOT in visible)
//   ∪ paths; anchor = current anchor if it is in paths, else paths[0]; paths
//   missing from visible are ignored.
// Modules under test (stubs in ./click.ts): resolveContextClick,
//   resolveRestoredSelection. (Separate file: click.test.ts is untouched.)

const visible = ["a", "b", "c", "d", "e"];

describe("resolveContextClick (R-1020, AC-1000, AC-1001)", () => {
  it("unselected row: selection becomes that one row, anchor = that row, focus = its index", () => {
    const r = resolveContextClick(visible, { selected: new Set(), anchor: "a" }, "b");
    expect(r.selected).toEqual(new Set(["b"]));
    expect(r.anchor).toBe("b");
    expect(r.focusedIndex).toBe(1);
  });

  it("unselected row replaces an existing different selection", () => {
    const r = resolveContextClick(visible, { selected: new Set(["a", "b"]), anchor: "a" }, "d");
    expect(r.selected).toEqual(new Set(["d"]));
    expect(r.anchor).toBe("d");
    expect(r.focusedIndex).toBe(3);
  });

  it("selected row: selection AND anchor are unchanged (AC-1001: 3 stay selected), focus moves to the row", () => {
    const r = resolveContextClick(visible, { selected: new Set(["a", "b", "c"]), anchor: "a" }, "c");
    expect(r.selected).toEqual(new Set(["a", "b", "c"]));
    expect(r.anchor).toBe("a");
    expect(r.focusedIndex).toBe(2);
  });

  it("selected row with no anchor keeps the anchor null", () => {
    const r = resolveContextClick(visible, { selected: new Set(["b"]), anchor: null }, "b");
    expect(r.anchor).toBeNull();
  });

  it("a selection entry that is not visible (hidden by a filter) is kept when the row is selected (R-1022)", () => {
    const r = resolveContextClick(["a", "b"], { selected: new Set(["a", "hidden"]), anchor: "a" }, "a");
    expect(r.selected).toEqual(new Set(["a", "hidden"]));
  });

  it("... and dropped when the selection is replaced (R-1020 'その1件に置き換え')", () => {
    const r = resolveContextClick(["a", "b"], { selected: new Set(["a", "hidden"]), anchor: "a" }, "b");
    expect(r.selected).toEqual(new Set(["b"]));
  });

  it("focusedIndex is the index in the VISIBLE (display) order", () => {
    const r = resolveContextClick(["e", "c", "a"], { selected: new Set(), anchor: null }, "a");
    expect(r.focusedIndex).toBe(2);
  });

  it("does not mutate the given selection set", () => {
    const sel = new Set(["a"]);
    resolveContextClick(visible, { selected: sel, anchor: "a" }, "c");
    expect(sel).toEqual(new Set(["a"]));
  });

  it("takes no modifier arguments: exactly three parameters (R-1003)", () => {
    expect(resolveContextClick.length).toBe(3);
  });
});

describe("resolveRestoredSelection (R-1056-1, AC-1042)", () => {
  it("after a reload emptied the selection: selection = the menu's targets, anchor = first target", () => {
    const r = resolveRestoredSelection(visible, { selected: new Set(), anchor: null }, ["a", "b"]);
    expect(r.selected).toEqual(new Set(["a", "b"]));
    expect(r.anchor).toBe("a");
  });

  it("replaces a changed visible selection with the targets", () => {
    const r = resolveRestoredSelection(visible, { selected: new Set(["d"]), anchor: "d" }, ["a", "b"]);
    expect(r.selected).toEqual(new Set(["a", "b"]));
    expect(r.anchor).toBe("a");
  });

  it("keeps the current selection that is NOT visible (hidden by a filter)", () => {
    const r = resolveRestoredSelection(["a", "b"], { selected: new Set(["hidden"]), anchor: null }, ["a"]);
    expect(r.selected).toEqual(new Set(["hidden", "a"]));
  });

  it("keeps the current anchor when it is one of the targets", () => {
    const r = resolveRestoredSelection(visible, { selected: new Set(), anchor: "b" }, ["a", "b"]);
    expect(r.anchor).toBe("b");
  });

  it("uses the first target as the anchor when the current anchor is not a target", () => {
    const r = resolveRestoredSelection(visible, { selected: new Set(), anchor: "e" }, ["c", "d"]);
    expect(r.anchor).toBe("c");
  });

  it("ignores targets that are not in visible (vanished entries)", () => {
    const r = resolveRestoredSelection(visible, { selected: new Set(), anchor: null }, ["a", "gone"]);
    expect(r.selected).toEqual(new Set(["a"]));
    expect(r.anchor).toBe("a");
  });

  it("does not mutate the given selection set", () => {
    const sel = new Set(["d"]);
    resolveRestoredSelection(visible, { selected: sel, anchor: "d" }, ["a"]);
    expect(sel).toEqual(new Set(["d"]));
  });
});
