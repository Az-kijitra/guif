// Extracted from +page.svelte's `bootstrap()` (SPEC-0200-0001 §3.6.11.10
// MUST-93): assembles the single global `DispatchContext` + keydown handler.
// Every dependency is injected (getters for reactive Svelte state, plain
// functions for actions); this module imports only `features/keyboard`
// (the dispatch primitives themselves), matching the existing
// `viewer-open-wiring.ts`/`row-interaction-wiring.ts` "thin composition"
// pattern.

import {
  dispatchKeydown,
  type DispatchContext,
  type PathBarFixedKey,
  type PathBarOverlayAction,
  type SearchAction,
} from "$lib/features/keyboard/key-dispatch";
import type { MenuBarActivationKind } from "$lib/features/keyboard/menubar-activation";
import type { KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
import { computeDispatchOverlayFlags } from "./overlay-wiring";

// Also owns the 3-way overlay-key routing (modal -> sort menu -> history
// list, §3.2.8/§3.6.5) and the overlay-flags computation (MUST-84/93): both
// are tightly coupled to keydown dispatch and absorbing them here is what
// keeps +page.svelte's own composition within the 400-line guideline
// (§3.6.11.10 MUST-93).
export interface MainKeydownWiringDeps {
  isTreeFocused: () => boolean;
  customOverrides: () => Record<string, string>;
  modal: { readonly isOpen: boolean };
  history: { readonly isOpen: boolean };
  sortMenu: { readonly isOpen: boolean };
  // SPEC-0300-0018 / SPEC-0200-0001 §3.9.17.7: the right-click menu (optional).
  contextMenu?: { readonly isOpen: boolean; handleKey(event: KeydownLikeEvent): boolean };
  search: { readonly active: boolean; readonly inputFocused: boolean };
  // SPEC-0300-0022 R-1606: the event is passed so that an auto-repeat of Ctrl+, can be swallowed.
  onHardcodedShortcut: (action: "exit" | "settings", event: KeydownLikeEvent) => boolean;
  onExitAction: (action: string) => boolean;
  handleModalKey: (event: KeydownLikeEvent) => boolean;
  handleSortMenuKey: (event: KeydownLikeEvent) => boolean;
  // Bug fix (code-reviewer B1): closes the sort menu when the KEYMAP-RESOLVED
  // action is "sort_menu" (R-34-14's re-press-to-close, honoring a remapped
  // `input_keymap_custom.sort_menu`) -- checked BEFORE falling back to
  // `handleSortMenuKey` for the menu's own fixed keys (arrows/Enter/Escape/Tab).
  sortMenuToggle: () => void;
  resolveHistoryIntent: (event: KeydownLikeEvent, action: string | null) => boolean;
  onTreeAction: (action: string, event: KeydownLikeEvent) => boolean;
  onListAction: (action: string | null, event: KeydownLikeEvent) => boolean;
  onSearchAction: (action: SearchAction) => void;
  onTabStop: (direction: "next" | "prev") => boolean;
  // R-14-4 (Phase 8): path bar editing guard (optional so existing callers
  // and tests stay valid).
  pathBar?: {
    readonly editing: boolean;
    onKey: (key: PathBarFixedKey, event: KeydownLikeEvent) => void;
    onOverlayAction: (action: PathBarOverlayAction) => void;
  };
  // SPEC-0300-0020 / SPEC-0300-0010 第16版 R-14-5 (Phase 13): the menu bar (optional so existing callers stay valid).
  menuBar?: {
    readonly active: boolean;
    onKey: (action: string | null, event: KeydownLikeEvent) => boolean;
    onActivate: (kind: MenuBarActivationKind, event: KeydownLikeEvent) => boolean;
  };
  // SPEC-0300-0021 R-1550 / SPEC-0200-0001 §3.16.7: a registered external app's key (optional). The logic is in external-apps-wiring.ts.
  externalApps?: { onKey: (event: KeydownLikeEvent) => boolean };
}

// Builds the `(event: Event) => void` handler `attachGlobalKeydownListener`
// (R-10) registers on `window`.
export function createMainKeydownHandler(deps: MainKeydownWiringDeps): (event: Event) => void {
  return function keydownHandler(event: Event): void {
    const ke = event as KeyboardEvent;
    const keydownLike: KeydownLikeEvent = {
      key: ke.key,
      ctrlKey: ke.ctrlKey,
      altKey: ke.altKey,
      shiftKey: ke.shiftKey,
      metaKey: ke.metaKey,
      isComposing: ke.isComposing,
      keyCode: ke.keyCode, // R-764: IME marker 229 (MUST-99(c))
      repeat: ke.repeat, // R-1549: an auto-repeat keydown starts no external app
    };

    const flags = computeDispatchOverlayFlags({
      modalOpen: deps.modal.isOpen,
      historyOpen: deps.history.isOpen,
      searchActive: deps.search.active,
      searchInputFocused: deps.search.inputFocused,
      sortMenuOpen: deps.sortMenu.isOpen,
      contextMenuOpen: deps.contextMenu?.isOpen ?? false,
      pathBarEditing: deps.pathBar?.editing ?? false,
    });
    const ctx: DispatchContext = {
      isMenuBarActive: deps.menuBar?.active ?? false,
      // R-14-5-1: not while an overlay is shown or the path bar is being edited.
      canActivateMenuBar: deps.menuBar !== undefined && !flags.isOverlayOpen && !flags.isPathBarEditing,
      onMenuBarActivate: deps.menuBar?.onActivate,
      isTreeFocused: deps.isTreeFocused(),
      isOverlayOpen: flags.isOverlayOpen,
      isSearchActive: flags.isSearchActive,
      isSearchInputFocused: flags.isSearchInputFocused,
      customOverrides: deps.customOverrides(),
      onHardcodedShortcut: deps.onHardcodedShortcut,
      onExitAction: deps.onExitAction,
      onOverlayKey: (action, overlayEvent) => {
        if (deps.modal.isOpen) return deps.handleModalKey(overlayEvent);
        if (deps.contextMenu?.isOpen) return deps.contextMenu.handleKey(overlayEvent);
        if (deps.sortMenu.isOpen) {
          if (action === "sort_menu") {
            deps.sortMenuToggle();
            return true;
          }
          return deps.handleSortMenuKey(overlayEvent);
        }
        if (!deps.history.isOpen) return false;
        return deps.resolveHistoryIntent(overlayEvent, action);
      },
      onMenuBarKey: (action, menuEvent) => deps.menuBar?.onKey(action, menuEvent) ?? false,
      onTreeAction: deps.onTreeAction,
      onListAction: deps.onListAction,
      onSearchAction: deps.onSearchAction,
      onTabStop: deps.onTabStop,
      isPathBarEditing: flags.isPathBarEditing,
      onPathBarKey: deps.pathBar?.onKey,
      onPathBarOverlayAction: deps.pathBar?.onOverlayAction,
      onExternalAppKey: deps.externalApps?.onKey,
    };

    const handled = dispatchKeydown(keydownLike, ctx);
    if (handled) {
      ke.preventDefault();
    }
  };
}
