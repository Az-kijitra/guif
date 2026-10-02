import { describe, expect, it } from "vitest";
import { DEFAULT_SORT_STATE, SORT_KEYS, nextSortState, renderEntriesInBackendOrder } from "./sort";

// Phase 7 addition (SPEC-0300-0009 R-34-14, AC-618; SPEC-0200-0001 §3.6.5).
// `moveSortMenuHighlight` is a NEW export -- a second import so the tests
// above (against the existing exports) keep passing unaffected.
import { moveSortMenuHighlight } from "./sort";

// Spec: SPEC-0300-0009 (file list / tree view detail)
// Module under test (not yet implemented): ./sort.ts
//
// R-30: sortable keys are name / size / type / modified (4 keys)
// R-31: re-selecting the current key toggles asc<->desc; selecting a different key resets to asc
// R-32: the actual sort is performed by the backend; the frontend must not re-sort
// R-30 note (ISS-0022-c resolved): initial default sort key = name, order = asc

describe("SORT_KEYS (SPEC-0300-0009 R-30)", () => {
  it("AC-16: exposes exactly the 4 sortable keys: name / size / type / modified", () => {
    expect(SORT_KEYS).toEqual(["name", "size", "type", "modified"]);
  });
});

describe("DEFAULT_SORT_STATE (SPEC-0300-0009 R-30 note, ISS-0022-c)", () => {
  it("defaults to sortKey=name, sortOrder=asc on initial display", () => {
    expect(DEFAULT_SORT_STATE).toEqual({ key: "name", order: "asc" });
  });
});

describe("nextSortState (SPEC-0300-0009 R-31)", () => {
  it("AC-18: reversing the same key toggles asc -> desc", () => {
    expect(nextSortState({ key: "name", order: "asc" }, "name")).toEqual({
      key: "name",
      order: "desc",
    });
  });

  it("AC-18: reversing the same key toggles desc -> asc", () => {
    expect(nextSortState({ key: "name", order: "desc" }, "name")).toEqual({
      key: "name",
      order: "asc",
    });
  });

  it("AC-19: selecting a different key resets order to asc regardless of previous order", () => {
    expect(nextSortState({ key: "name", order: "desc" }, "size")).toEqual({
      key: "size",
      order: "asc",
    });
  });
});

describe("renderEntriesInBackendOrder (SPEC-0300-0009 R-32)", () => {
  it("AC-23: returns entries in the exact order provided by the backend without re-sorting", () => {
    const backendOrder = [
      { name: "b.txt" },
      { name: "a.txt" },
      { name: "c.txt" },
    ];
    const rendered = renderEntriesInBackendOrder(backendOrder);
    expect(rendered).toEqual(backendOrder);
    expect(rendered.map((e) => e.name)).toEqual(["b.txt", "a.txt", "c.txt"]);
  });

  it("AC-23: returns a value that does not mutate/reorder the input array", () => {
    const backendOrder = [{ name: "z.txt" }, { name: "a.txt" }];
    const original = [...backendOrder];
    renderEntriesInBackendOrder(backendOrder);
    expect(backendOrder).toEqual(original);
  });
});

describe("moveSortMenuHighlight (SPEC-0300-0009 R-34-14, AC-618)", () => {
  it("AC-618: ArrowDown moves to the next key in SORT_KEYS order", () => {
    expect(moveSortMenuHighlight("name", "down")).toBe("size");
    expect(moveSortMenuHighlight("size", "down")).toBe("type");
    expect(moveSortMenuHighlight("type", "down")).toBe("modified");
  });

  it("AC-618: ArrowDown on the last key wraps to the first", () => {
    expect(moveSortMenuHighlight("modified", "down")).toBe("name");
  });

  it("AC-618: ArrowUp moves to the previous key", () => {
    expect(moveSortMenuHighlight("size", "up")).toBe("name");
  });

  it("AC-618: ArrowUp on the first key wraps to the last", () => {
    expect(moveSortMenuHighlight("name", "up")).toBe("modified");
  });
});

// ======================================================================
// Phase 9 (SPEC-0300-0017 R-971 #2, R-983, AC-932, AC-933; SPEC-0200-0001
// §3.8.8, §3.8.17 SHOULD-148: `sortKeyLabel` lives in sort.ts).
// The status bar and the sort menu share ONE pair of order marks: ascending
// "↑", descending "↓" (P-20; the old ▲/▼ are retired). The helper name
// `sortOrderMark` is the test author's choice (design leaves it open).
// ======================================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sortKeyLabel, sortOrderMark } from "./sort";

describe("sortKeyLabel (R-971 #2)", () => {
  it("name -> 名前, size -> サイズ, type -> 種類, modified -> 更新日時", () => {
    expect(sortKeyLabel("name")).toBe("名前");
    expect(sortKeyLabel("size")).toBe("サイズ");
    expect(sortKeyLabel("type")).toBe("種類");
    expect(sortKeyLabel("modified")).toBe("更新日時");
  });

  it("every sort key has a distinct non-empty label", () => {
    const labels = SORT_KEYS.map((k) => sortKeyLabel(k));
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(SORT_KEYS.length);
  });
});

describe("sortOrderMark (R-971 #2, R-983, AC-933)", () => {
  it("ascending is ↑ and descending is ↓", () => {
    expect(sortOrderMark("asc")).toBe("↑");
    expect(sortOrderMark("desc")).toBe("↓");
  });
});

describe("SortMenu.svelte uses the shared marks, not ▲/▼ ([静的], R-983 / P-20)", () => {
  const src = readFileSync(resolve(__dirname, "SortMenu.svelte"), "utf-8");

  it("the retired ▲ / ▼ marks are gone from the menu source", () => {
    expect(src.includes("▲")).toBe(false);
    expect(src.includes("▼")).toBe(false);
  });

  it("the menu derives its mark from sortOrderMark (one source with the status bar)", () => {
    expect(src.includes("sortOrderMark")).toBe(true);
  });
});
