// SPEC-0300-0009 R-34-11/R-34-12/R-34-14, AC-616/AC-618. Architecture:
// docs/architecture/proposals/SPEC-0200-0001.md §3.6.5, §3.6.11.11
// SHOULD-126 (API named `open()`/`close()`). Feature-local state (factory,
// like `features/search/search-state.svelte.ts`): tracks only
// `{isOpen, highlightedKey}`. DOM handling for "always focus the file list
// when closed" (R-34-17) lives in `routes/sort-menu-wiring.ts`, not here.

import { DEFAULT_SORT_STATE, moveSortMenuHighlight, type SortKey } from "./sort";

export function createSortMenuState() {
  let isOpen = $state(false);
  let highlightedKey = $state<SortKey>(DEFAULT_SORT_STATE.key);

  // R-34-11/AC-616: opens the menu, highlighting the current sort key.
  function open(currentKey: SortKey): void {
    isOpen = true;
    highlightedKey = currentKey;
  }

  function close(): void {
    isOpen = false;
  }

  // AC-618: moves the highlight with wraparound.
  function moveHighlight(direction: "up" | "down"): void {
    highlightedKey = moveSortMenuHighlight(highlightedKey, direction);
  }

  // Returns the currently highlighted key; closing is the caller's job
  // (SHOULD-126).
  function confirmHighlighted(): SortKey {
    return highlightedKey;
  }

  return {
    get isOpen() {
      return isOpen;
    },
    get highlightedKey() {
      return highlightedKey;
    },
    open,
    close,
    moveHighlight,
    confirmHighlighted,
  };
}
