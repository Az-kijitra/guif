import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-14-11/R-14-11-1/R-14-11-2, AC-609~AC-611.
//   SPEC-0300-0010 R-10-1/R-10-1-1.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.4
//   (new routes/focus-wiring.ts, DOM-independent pure functions +
//   a thin DI controller; `+page.svelte` wires `treeContainerEl?.focus()`
//   etc. into `TabStopControllerDeps.focus`).
//
// Module under test (not yet implemented): ./focus-wiring.ts

import { computeTabStops, createTabStopController, nextTabStop } from "./focus-wiring";

describe("computeTabStops (SPEC-0300-0009 R-14-11-2)", () => {
  it("AC-610: tree visible + search visible -> tree, search, list in that order", () => {
    expect(computeTabStops({ treeVisible: true, searchVisible: true })).toEqual(["tree", "search", "list"]);
  });

  it("AC-609: tree visible, search hidden -> tree, list", () => {
    expect(computeTabStops({ treeVisible: true, searchVisible: false })).toEqual(["tree", "list"]);
  });

  it("tree hidden, search visible -> search, list", () => {
    expect(computeTabStops({ treeVisible: false, searchVisible: true })).toEqual(["search", "list"]);
  });

  it("AC-609: both hidden -> list only", () => {
    expect(computeTabStops({ treeVisible: false, searchVisible: false })).toEqual(["list"]);
  });
});

describe("nextTabStop (SPEC-0300-0009 R-14-11-2: wraps, never leaves the Webview)", () => {
  const stops = ["tree", "search", "list"] as const;

  it("moves to the next stop in order", () => {
    expect(nextTabStop(stops, "tree", "next")).toBe("search");
    expect(nextTabStop(stops, "search", "next")).toBe("list");
  });

  it("wraps from the last stop back to the first going 'next'", () => {
    expect(nextTabStop(stops, "list", "next")).toBe("tree");
  });

  it("moves to the previous stop in order", () => {
    expect(nextTabStop(stops, "list", "prev")).toBe("search");
  });

  it("wraps from the first stop to the last going 'prev'", () => {
    expect(nextTabStop(stops, "tree", "prev")).toBe("list");
  });

  it("a single-stop list wraps to itself in either direction", () => {
    expect(nextTabStop(["list"], "list", "next")).toBe("list");
    expect(nextTabStop(["list"], "list", "prev")).toBe("list");
  });

  it("a current stop not present in the list (e.g. the tree just became hidden) falls back to the first stop", () => {
    expect(nextTabStop(["search", "list"], "tree", "next")).toBe("search");
  });
});

describe("createTabStopController (SPEC-0200-0001 §3.6.4)", () => {
  function makeDeps(overrides: Partial<{ treeVisible: boolean; searchVisible: boolean; currentStop: "tree" | "search" | "list" }> = {}) {
    const focus = { tree: vi.fn(), search: vi.fn(), list: vi.fn() };
    const opts = { treeVisible: true, searchVisible: true, currentStop: "tree" as const, ...overrides };
    const deps = {
      treeVisible: () => opts.treeVisible,
      searchVisible: () => opts.searchVisible,
      currentStop: () => opts.currentStop,
      focus,
    };
    return { deps, focus };
  }

  it("AC-611: from the tree, 'next' moves focus to search (when visible)", () => {
    const { deps, focus } = makeDeps({ currentStop: "tree" });
    const onTabStop = createTabStopController(deps);
    expect(onTabStop("next")).toBe(true);
    expect(focus.search).toHaveBeenCalledTimes(1);
    expect(focus.tree).not.toHaveBeenCalled();
    expect(focus.list).not.toHaveBeenCalled();
  });

  it("from the list, 'next' wraps around to the tree", () => {
    const { deps, focus } = makeDeps({ currentStop: "list" });
    const onTabStop = createTabStopController(deps);
    onTabStop("next");
    expect(focus.tree).toHaveBeenCalledTimes(1);
  });

  it("'prev' from the tree wraps to the list", () => {
    const { deps, focus } = makeDeps({ currentStop: "tree" });
    const onTabStop = createTabStopController(deps);
    onTabStop("prev");
    expect(focus.list).toHaveBeenCalledTimes(1);
  });

  it("AC-609: with the tree hidden, 'next' from the list goes straight to search, skipping tree", () => {
    const { deps, focus } = makeDeps({ treeVisible: false, currentStop: "list" });
    const onTabStop = createTabStopController(deps);
    onTabStop("next");
    expect(focus.search).toHaveBeenCalledTimes(1);
    expect(focus.tree).not.toHaveBeenCalled();
  });

  it("always reports the key as consumed (never lets Tab escape the Webview)", () => {
    const { deps } = makeDeps({ treeVisible: false, searchVisible: false, currentStop: "list" });
    const onTabStop = createTabStopController(deps);
    expect(onTabStop("next")).toBe(true);
    expect(onTabStop("prev")).toBe(true);
  });
});
