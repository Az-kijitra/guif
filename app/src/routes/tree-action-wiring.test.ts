import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-43/R-43-1/R-65/R-66/R-14-14/R-59-2, AC-25/AC-49~
//   AC-51/AC-614/AC-615/AC-623.
//   SPEC-0300-0010 R-15/R-15-1, AC-59-1.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.6
//   (routes/tree-action-wiring.ts::createTreeActionHandler, the tree-side
//   counterpart of routes/list-action-wiring.ts), §3.6.11.4 (d) (MUST-87:
//   "open" must use pathsEqual, not !==, to decide whether to reload).
//
// Module under test (not yet implemented): ./tree-action-wiring.ts

import type { NavigateResult } from "$lib/shared/navigation-result";
import { createTreeActionHandler } from "./tree-action-wiring";

function ev(shiftKey = false) {
  return { shiftKey };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const tree = {
    moveFocus: vi.fn(),
    moveFocusPage: vi.fn(),
    handleMoveRight: vi.fn(),
    handleMoveLeft: vi.fn(),
    selectFocused: vi.fn(() => ({ path: "C:\\A\\B" }) as { path: string } | null),
  };
  const deps = {
    tree,
    afterUserNavigation: vi.fn(async (p: Promise<NavigateResult>) => p),
    navigate: vi.fn(async (path: string): Promise<NavigateResult> => ({ status: "success", path })),
    fullyVisibleRows: () => 10,
    currentPath: () => "C:\\A",
    ...overrides,
  };
  return { deps, tree };
}

describe("createTreeActionHandler: movement (SPEC-0300-0009 R-57 analog/R-59-2)", () => {
  it("move_up / move_down forward to tree.moveFocus", () => {
    const { deps, tree } = makeDeps();
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("move_up", ev())).toBe(true);
    expect(onTreeAction("move_down", ev())).toBe(true);
    expect(tree.moveFocus).toHaveBeenNthCalledWith(1, "up");
    expect(tree.moveFocus).toHaveBeenNthCalledWith(2, "down");
  });

  // Test fix (code-reviewer B2, 2026-09-29): R-59-2/AC-623 defines the page
  // step as fullyVisibleRows-1 (min 1, via tree.ts::treePageStep), not
  // fullyVisibleRows itself -- 10 fully-visible rows moves the focus by 9,
  // matching AC-623's own worked example. The previous expectation (10) was
  // simply wrong against the spec (a copy-paste of the file list's R-59-1,
  // which does NOT subtract 1).
  it("AC-623: page_up / page_down move by treePageStep(fullyVisibleRows()) -- fullyVisibleRows MINUS 1", () => {
    const { deps, tree } = makeDeps({ fullyVisibleRows: () => 10 });
    const onTreeAction = createTreeActionHandler(deps as never);
    onTreeAction("page_up", ev());
    onTreeAction("page_down", ev());
    expect(tree.moveFocusPage).toHaveBeenNthCalledWith(1, "up", 9);
    expect(tree.moveFocusPage).toHaveBeenNthCalledWith(2, "down", 9);
  });
});

describe("createTreeActionHandler: expand/collapse (SPEC-0300-0009 R-65/R-66, AC-49~AC-51)", () => {
  it("move_right delegates to tree.handleMoveRight", () => {
    const { deps, tree } = makeDeps();
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("move_right", ev())).toBe(true);
    expect(tree.handleMoveRight).toHaveBeenCalledTimes(1);
  });

  it("move_left delegates to tree.handleMoveLeft", () => {
    const { deps, tree } = makeDeps();
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("move_left", ev())).toBe(true);
    expect(tree.handleMoveLeft).toHaveBeenCalledTimes(1);
  });
});

describe('createTreeActionHandler: "open" (SPEC-0300-0009 R-43/R-43-1, AC-25/AC-614; MUST-87(d))', () => {
  it("AC-614/R-43-1: a different path is loaded through afterUserNavigation, focus stays on the tree (no tree-side focus call)", () => {
    const { deps, tree } = makeDeps({ currentPath: () => "C:\\OTHER" });
    tree.selectFocused = vi.fn(() => ({ path: "C:\\A\\B" }));
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("open", ev())).toBe(true);
    expect(deps.navigate).toHaveBeenCalledWith("C:\\A\\B");
    expect(deps.afterUserNavigation).toHaveBeenCalledTimes(1);
  });

  it("AC-25/MUST-87(d): selecting the node for the ALREADY-open path does not reload (pathsEqual, not !==)", () => {
    const { deps, tree } = makeDeps({ currentPath: () => "c:\\a\\b\\" }); // same path, different case + trailing sep
    tree.selectFocused = vi.fn(() => ({ path: "C:\\A\\B" }));
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("open", ev())).toBe(true);
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
  });

  it("no focused node (empty tree) => consumed but nothing navigates", () => {
    const { deps, tree } = makeDeps();
    tree.selectFocused = vi.fn(() => null);
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("open", ev())).toBe(true);
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});

describe("createTreeActionHandler: Shift+Enter is a no-op (SPEC-0300-0010 R-15-1, AC-59-1/AC-615)", () => {
  it("'open' with shiftKey true does nothing at all -- no navigation, no tree call", () => {
    const { deps, tree } = makeDeps();
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("open", ev(true))).toBe(true); // consumed (matches AC-615: "nothing happens", not "unhandled")
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
    expect(tree.selectFocused).not.toHaveBeenCalled();
  });
});

describe("createTreeActionHandler: unknown action falls through (SHOULD-125: no file-operation cases at all)", () => {
  it("an action outside the 7 tree-handled ones returns false", () => {
    const { deps } = makeDeps();
    const onTreeAction = createTreeActionHandler(deps as never);
    expect(onTreeAction("delete", ev())).toBe(false);
    expect(onTreeAction("copy", ev())).toBe(false);
    expect(onTreeAction("rename", ev())).toBe(false);
  });
});
