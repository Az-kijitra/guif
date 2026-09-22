import { describe, expect, it } from "vitest";
import { DEFAULT_SORT_STATE, SORT_KEYS, nextSortState, renderEntriesInBackendOrder } from "./sort";

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
