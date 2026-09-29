import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0009 R-34-11/R-34-12/R-34-14, AC-616/AC-618.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.5,
//   §3.6.11.11 SHOULD-126 (API named `open()`/`close()`, not the withdrawn
//   `openMenu()`/`closeMenu()`/`toggle()` naming). Feature-local state
//   (factory, like features/search/search-state.svelte.ts), so each test
//   builds an isolated instance.
//
// DOM handling for "always focus the file list when closed" (R-34-17) lives
// in routes/sort-menu-wiring.ts (SHOULD-126), NOT here -- this module only
// tracks {isOpen, highlightedKey}.
//
// Module under test (not yet implemented): ./sort-menu-state.svelte.ts

import { createSortMenuState } from "./sort-menu-state.svelte";

describe("createSortMenuState (SPEC-0200-0001 §3.6.5)", () => {
  it("starts closed", () => {
    const state = createSortMenuState();
    expect(state.isOpen).toBe(false);
  });

  it("AC-616: open(currentKey) opens the menu and highlights the current sort key", () => {
    const state = createSortMenuState();
    state.open("size");
    expect(state.isOpen).toBe(true);
    expect(state.highlightedKey).toBe("size");
  });

  it("close() closes the menu", () => {
    const state = createSortMenuState();
    state.open("name");
    state.close();
    expect(state.isOpen).toBe(false);
  });

  it("AC-618: moveHighlight('down') advances through SORT_KEYS with wraparound", () => {
    const state = createSortMenuState();
    state.open("modified");
    state.moveHighlight("down");
    expect(state.highlightedKey).toBe("name"); // wraps from the last key
  });

  it("AC-618: moveHighlight('up') goes backward with wraparound", () => {
    const state = createSortMenuState();
    state.open("name");
    state.moveHighlight("up");
    expect(state.highlightedKey).toBe("modified"); // wraps from the first key
  });

  it("confirmHighlighted() returns the currently highlighted key without closing the menu itself", () => {
    const state = createSortMenuState();
    state.open("name");
    state.moveHighlight("down");
    expect(state.confirmHighlighted()).toBe("size");
    expect(state.isOpen).toBe(true); // closing is routes' job (SHOULD-126)
  });

  it("re-opening with a different current key re-highlights it (does not keep the stale highlight)", () => {
    const state = createSortMenuState();
    state.open("name");
    state.moveHighlight("down"); // now highlighting "size"
    state.close();
    state.open("modified");
    expect(state.highlightedKey).toBe("modified");
  });

  it("two instances are independent", () => {
    const a = createSortMenuState();
    const b = createSortMenuState();
    a.open("size");
    expect(b.isOpen).toBe(false);
  });
});
