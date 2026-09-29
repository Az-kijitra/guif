// SPEC-0300-0009 R-34-11~R-34-17, AC-616~AC-619-1. Architecture:
// docs/architecture/proposals/SPEC-0200-0001.md §3.6.5, §3.6.11.8 (MUST-91:
// backdrop-based outside-click close, DOM handling lives in SortMenu.svelte,
// not here), §3.6.11.11 SHOULD-126 (this file holds
// `handleSortMenuKey`/`focus.sortMenu()`/`closeSortMenu()`, unifying the API
// to `open()`/`close()`/`toggle()`). Every dependency is injected; this
// module imports no feature module other than the sort-key type/key-intent
// resolver, which are local, DOM-independent pure logic.

import type { SortKey } from "$lib/features/file-list/sort";
import { resolveSortMenuKeyIntent, type SortMenuKeydownLikeEvent } from "$lib/features/file-list/sort-menu-keys";

export interface CloseSortMenuDeps {
  state: { close(): void };
  focusContainer: () => void;
}

// R-34-17/AC-619: always closes the menu AND returns focus to the file list.
export function closeSortMenu(deps: CloseSortMenuDeps): void {
  deps.state.close();
  deps.focusContainer();
}

export interface SortMenuToggleDeps {
  state: { isOpen: boolean; open(key: SortKey): void };
  currentSortKey: () => SortKey;
  closeSortMenu: () => void;
}

// R-34-14: toggle semantics for the `sort_menu` action.
export function createSortMenuToggle(deps: SortMenuToggleDeps): () => void {
  return function toggle(): void {
    if (deps.state.isOpen) {
      deps.closeSortMenu();
    } else {
      deps.state.open(deps.currentSortKey());
    }
  };
}

export interface SortMenuKeyHandlerDeps {
  state: { moveHighlight(direction: "up" | "down"): void; confirmHighlighted(): SortKey };
  applySort: (key: SortKey) => void;
  closeSortMenu: () => void;
}

const KNOWN_MENU_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "Tab"]);

// Bug fix (code-reviewer B1, 2026-09-29): the `sort_menu` re-press close
// (R-34-14: "メニュー表示中の sort_menu はメニューを閉じる") MUST go through the
// keymap-resolved action id, not a hardcoded literal "s" comparison here --
// that broke a remapped `input_keymap_custom.sort_menu` (SPEC-0300-0010 §3.1
// #9 keys are keymap-driven, unlike the FIXED overlay-local keys below which
// are correctly hardcoded, R-14-11-3/classification (c)). The `action ===
// "sort_menu"` check now lives in routes/main-keydown-wiring.ts (which
// already has the resolved action id available), calling `sortMenuToggle()`
// there instead. This handler therefore no longer recognizes any bare key
// literal itself.
export function createSortMenuKeyHandler(
  deps: SortMenuKeyHandlerDeps,
): (event: SortMenuKeydownLikeEvent) => boolean {
  return function handleSortMenuKey(event: SortMenuKeydownLikeEvent): boolean {
    if (!KNOWN_MENU_KEYS.has(event.key)) return false;

    const intent = resolveSortMenuKeyIntent(event);
    switch (intent) {
      case "move_up":
        deps.state.moveHighlight("up");
        return true;
      case "move_down":
        deps.state.moveHighlight("down");
        return true;
      case "confirm": {
        const key = deps.state.confirmHighlighted();
        deps.applySort(key);
        deps.closeSortMenu();
        return true;
      }
      case "cancel":
        deps.closeSortMenu(); // AC-619 (iii): no sort applied
        return true;
      case "trap":
        return true; // R-14-11-3
      default:
        return true; // ArrowLeft/ArrowRight: consumed, no side effect (R-34-14)
    }
  };
}
