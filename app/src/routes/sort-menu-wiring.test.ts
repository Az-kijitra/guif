import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-34-11~R-34-17, AC-616~AC-619-1.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.5,
//   §3.6.11.8 (MUST-91: backdrop-based outside-click close, DOM handling
//   lives in SortMenu.svelte, NOT here), §3.6.11.11 SHOULD-126 (this new
//   file holds `handleSortMenuKey`/`focus.sortMenu()`/`closeSortMenu()`,
//   unifying the API to `open()`/`close()`/`toggle()`).
//
// Module under test (not yet implemented): ./sort-menu-wiring.ts
//
// Contract assumed (documented in the handback report):
//   createSortMenuToggle(deps: {
//     state: { isOpen: boolean; open(key): void };
//     currentSortKey: () => SortKey;
//     closeSortMenu: () => void; // the standalone fn below, reused
//   }): () => void
//   createSortMenuKeyHandler(deps: {
//     state: { moveHighlight(dir): void; confirmHighlighted(): SortKey };
//     applySort: (key: SortKey) => void;
//     closeSortMenu: () => void;
//   }): (event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) => boolean
//   closeSortMenu(deps: { state: { close(): void }; focusContainer: () => void }): void

import { closeSortMenu, createSortMenuKeyHandler, createSortMenuToggle } from "./sort-menu-wiring";

function key(k: string) {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
}

describe("closeSortMenu (SPEC-0300-0009 R-34-17, AC-619)", () => {
  it("always closes the menu AND returns focus to the file list container", () => {
    const state = { close: vi.fn() };
    const focusContainer = vi.fn();
    closeSortMenu({ state, focusContainer });
    expect(state.close).toHaveBeenCalledTimes(1);
    expect(focusContainer).toHaveBeenCalledTimes(1);
  });
});

describe("createSortMenuToggle (SPEC-0300-0009 R-34-14 toggle semantics, AC-616)", () => {
  it("opens the menu with the current sort key when closed", () => {
    const state = { isOpen: false, open: vi.fn() };
    const closeSortMenuFn = vi.fn();
    const toggle = createSortMenuToggle({ state, currentSortKey: () => "size", closeSortMenu: closeSortMenuFn });
    toggle();
    expect(state.open).toHaveBeenCalledWith("size");
    expect(closeSortMenuFn).not.toHaveBeenCalled();
  });

  it("closes the menu (via the shared closeSortMenu, so focus returns to the list) when already open", () => {
    const state = { isOpen: true, open: vi.fn() };
    const closeSortMenuFn = vi.fn();
    const toggle = createSortMenuToggle({ state, currentSortKey: () => "size", closeSortMenu: closeSortMenuFn });
    toggle();
    expect(closeSortMenuFn).toHaveBeenCalledTimes(1);
    expect(state.open).not.toHaveBeenCalled();
  });
});

describe("createSortMenuKeyHandler (SPEC-0300-0009 R-34-13/R-34-14/R-34-17, AC-617/AC-618)", () => {
  function makeDeps() {
    const state = { moveHighlight: vi.fn(), confirmHighlighted: vi.fn(() => "size" as const) };
    const applySort = vi.fn();
    const closeSortMenuFn = vi.fn();
    const handler = createSortMenuKeyHandler({ state, applySort, closeSortMenu: closeSortMenuFn });
    return { handler, state, applySort, closeSortMenuFn };
  }

  it("AC-618: ArrowUp/ArrowDown move the highlight and do not apply a sort or close", () => {
    const { handler, state, applySort, closeSortMenuFn } = makeDeps();
    expect(handler(key("ArrowDown"))).toBe(true);
    expect(handler(key("ArrowUp"))).toBe(true);
    expect(state.moveHighlight).toHaveBeenNthCalledWith(1, "down");
    expect(state.moveHighlight).toHaveBeenNthCalledWith(2, "up");
    expect(applySort).not.toHaveBeenCalled();
    expect(closeSortMenuFn).not.toHaveBeenCalled();
  });

  it("AC-617: Enter applies the highlighted sort key, then closes (returning focus to the list)", () => {
    const { handler, applySort, closeSortMenuFn } = makeDeps();
    expect(handler(key("Enter"))).toBe(true);
    expect(applySort).toHaveBeenCalledWith("size");
    expect(closeSortMenuFn).toHaveBeenCalledTimes(1);
  });

  it("AC-619 (iii): Escape closes WITHOUT applying any sort", () => {
    const { handler, applySort, closeSortMenuFn } = makeDeps();
    expect(handler(key("Escape"))).toBe(true);
    expect(applySort).not.toHaveBeenCalled();
    expect(closeSortMenuFn).toHaveBeenCalledTimes(1);
  });

  // Test fix (code-reviewer B1, 2026-09-29): AC-619 (iv)'s "the sort_menu key
  // closes the menu" is now realized by routes/main-keydown-wiring.ts
  // checking the KEYMAP-RESOLVED action id (`action === "sort_menu"`) BEFORE
  // this handler is even called (see main-keydown-wiring.test.ts) -- a
  // hardcoded literal "s" comparison here would silently ignore a
  // remapped `input_keymap_custom.sort_menu` override. This handler itself
  // therefore does NOT recognize any bare key literal; an unrelated/unknown
  // key (including a literal "s" that no longer means anything to THIS
  // handler) is simply unhandled (`false`), consumed instead one level up.
  it("a key with no menu-specific meaning (e.g. a bare 's') is unhandled here -- AC-619 (iv) is realized by the caller via the resolved action id", () => {
    const { handler, applySort, closeSortMenuFn } = makeDeps();
    expect(handler(key("s"))).toBe(false);
    expect(applySort).not.toHaveBeenCalled();
    expect(closeSortMenuFn).not.toHaveBeenCalled();
  });

  it("AC-618: ArrowLeft/ArrowRight are consumed (no default browser action) but change nothing", () => {
    const { handler, state, applySort, closeSortMenuFn } = makeDeps();
    expect(handler(key("ArrowLeft"))).toBe(true);
    expect(handler(key("ArrowRight"))).toBe(true);
    expect(state.moveHighlight).not.toHaveBeenCalled();
    expect(applySort).not.toHaveBeenCalled();
    expect(closeSortMenuFn).not.toHaveBeenCalled();
  });

  it("Tab / Shift+Tab are trapped (consumed, no side effect) per R-14-11-3", () => {
    const { handler, state, closeSortMenuFn } = makeDeps();
    expect(handler(key("Tab"))).toBe(true);
    expect(state.moveHighlight).not.toHaveBeenCalled();
    expect(closeSortMenuFn).not.toHaveBeenCalled();
  });
});
