// SPEC-0300-0010 §3 (R-10~R-17, §3.1): global keydown capture and the fixed
// priority-chain dispatch. This module only resolves "which action does this
// key correspond to" and "which handler in the priority chain gets it" — the
// action *implementations* live in their owning features and are injected
// into the dispatch context by the caller (R-17: no central action
// dispatcher/store).

import { matchesMenuBarActivation, type MenuBarActivationKind } from "./menubar-activation";
import { ACTION_IDS, DEFAULT_KEYMAP } from "./keymap-defaults";
import { matchesAction, resolveBinding, type KeydownLikeEvent } from "./keymap-resolve";

// R-10: a single capture-phase `keydown` listener on the given target
// (normally `window`), per R-10/AC-01. Individual components never register
// their own `keydown` handlers.
export function attachGlobalKeydownListener(
  target: EventTarget,
  handler: (event: Event) => void,
): void {
  target.addEventListener("keydown", handler, { capture: true });
}

// §4.2: resolve which action id (if any) a keydown event maps to, honoring
// the custom overrides on top of the single default keymap (R-20-1) (R-30~R-34 via keymap-resolve.ts).
export function resolveActionForKey(
  event: KeydownLikeEvent,
  customOverrides: Record<string, string>,
): string | null {

  for (const actionId of ACTION_IDS) {
    const defaultBinding = DEFAULT_KEYMAP[actionId];
    if (defaultBinding === undefined) {
      continue;
    }
    const bindings = resolveBinding({ customOverrides, actionId, defaultBinding });
    if (bindings.length === 0) {
      continue;
    }
    if (matchesAction(event, bindings)) {
      return actionId;
    }
  }
  return null;
}

// §3.1: the only hardcoded (keymap-independent) shortcuts are Ctrl+Q (exit)
// and Ctrl+, (settings) — priority 1 in the dispatch chain (R-12).
export function matchesHardcodedShortcut(event: KeydownLikeEvent): "exit" | "settings" | null {
  if (matchesAction(event, ["Ctrl+Q"])) {
    return "exit";
  }
  // MUST-86: eventKeyToken(",") now maps to "Comma" (word form), so the
  // hardcoded literal must say "Ctrl+Comma" or this shortcut stops matching.
  if (matchesAction(event, ["Ctrl+Comma"])) {
    return "settings";
  }
  return null;
}

// R-15: the tree handler only handles these 7 actions; everything else falls
// through to the file-list handler.
export const TREE_HANDLED_ACTIONS = [
  "move_up",
  "move_down",
  "page_up",
  "page_down",
  "move_right",
  "move_left",
  "open",
] as const;

export function isTreeHandledAction(actionId: string): boolean {
  return (TREE_HANDLED_ACTIONS as readonly string[]).includes(actionId);
}

// SPEC-0300-0012 R-121 action identifiers, resolved by the search bar's 4
// dedicated keys (R-14-2 below).
export type SearchAction = "cancel" | "confirm" | "history_prev" | "query_clear";

export interface DispatchContext {
  isSettingsOpen: boolean;
  isOverlayOpen: boolean;
  isMenuBarActive: boolean;
  isTreeFocused: boolean;
  // R-14-2 (SPEC-0300-0010 addendum, ISS-0064, SPEC-0200-0001 §3.1.4/§3.1.4-1):
  // true while the search <input> is focused. Owned/derived by
  // features/search/search-state.svelte.ts's `inputFocused` getter.
  isSearchInputFocused: boolean;
  // true while the search bar is open, regardless of where focus is.
  isSearchActive?: boolean;
  customOverrides: Record<string, string>;
  onHardcodedShortcut: (action: "exit" | "settings") => boolean;
  onExitAction: (action: string) => boolean;
  onOverlayKey: (action: string | null, event: KeydownLikeEvent) => boolean;
  onMenuBarKey: (action: string | null, event: KeydownLikeEvent) => boolean;
  // SPEC-0300-0010 第16版 R-14-5-1: whether F10 / Alt+F/E/V/G may activate the menu bar now (the wiring decides), and the activation callback.
  canActivateMenuBar?: boolean;
  onMenuBarActivate?: (kind: MenuBarActivationKind, event: KeydownLikeEvent) => boolean;
  onTreeAction: (action: string, event: KeydownLikeEvent) => boolean;
  onListAction: (action: string | null, event: KeydownLikeEvent) => boolean;
  // R-14-2/R-121: fired for Escape/Enter/ArrowUp/ArrowDown while the search
  // input is focused.
  onSearchAction: (action: SearchAction) => void;
  // SPEC-0300-0009 R-10-1/R-10-1-1; SPEC-0200-0001 §3.6.11.2 (MUST-85):
  // Tab/Shift+Tab moves focus between the tree/search/list Tab stops, but
  // ONLY when keymap matching resolved NO action at all (never when a
  // resolved-but-unimplemented action's handler merely returned `false`).
  // Optional so existing DispatchContext builders/tests are unaffected.
  onTabStop?: (direction: "next" | "prev") => boolean;
  // R-14-4 (SPEC-0300-0010 第12版, SPEC-0300-0016 R-760~R-765): path bar
  // editing guard. All three are optional (SHOULD-141) so existing context
  // builders/tests are unaffected. `isPathBarEditing` is expected to be
  // already masked by `isOverlayOpen` (computeDispatchOverlayFlags).
  isPathBarEditing?: boolean;
  onPathBarKey?: (key: PathBarFixedKey, event: KeydownLikeEvent) => void;
  onPathBarOverlayAction?: (action: PathBarOverlayAction) => void;
  // SPEC-0300-0021 R-1550 / SPEC-0200-0001 §3.16.7: a registered external app's key. Asked LAST: after every keymap action failed to match and the
  // file-list handler had its chance, before the Tab fallback. Only a result of `true` handles the key. Injected (no import of the feature).
  onExternalAppKey?: (event: KeydownLikeEvent) => boolean;
}

// R-761: the path bar's own fixed keys (keymap-independent, §3.1 (a)).
export type PathBarFixedKey = "confirm" | "cancel" | "complete" | "exit_to_list" | "open_history";
export type PathBarOverlayAction = "history" | "history_jump_list" | "jump_add";

// R-764 / MUST-99(c): IME composition (isComposing, or keyCode 229).
function isImeComposing(event: KeydownLikeEvent): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

// R-761/R-761-1: only without Ctrl/Alt/Meta; Shift+Enter / Shift+ArrowDown
// are not fixed keys (they go to the input's default behavior, R-763).
export function matchesPathBarFixedKey(event: KeydownLikeEvent): PathBarFixedKey | null {
  if (isImeComposing(event)) return null;
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  switch (event.key) {
    case "Enter":
      return event.shiftKey ? null : "confirm";
    case "Escape":
      return "cancel";
    case "Tab":
      return event.shiftKey ? "exit_to_list" : "complete";
    case "ArrowDown":
      return event.shiftKey ? null : "open_history";
    default:
      return null;
  }
}

// R-10-1-1/R-14-2-7: Tab is a tab-stop move only when unmodified (Ctrl/Alt/
// Meta excluded -- left to the OS/browser) and not mid IME composition.
function isPlainTab(event: KeydownLikeEvent): boolean {
  return (
    event.key === "Tab" && event.isComposing !== true && !event.ctrlKey && !event.altKey && !event.metaKey
  );
}

// SPEC-0300-0012 R-121: the search bar's own 4 keys, resolved by fixed key
// identity — this bypasses keymap matching entirely (SPEC-0300-0010 §3.1
// classification (a), explicitly extended for R-14-2 per the architecture
// addendum, ISS-0064, human-approved 2026-09-24).
function matchesSearchInputAction(event: KeydownLikeEvent): SearchAction | null {
  // IME composition (e.g. Enter to commit a conversion, arrows to pick a
  // candidate) and modified keys must reach the input untouched.
  if (event.isComposing === true) return null;
  if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return null;
  switch (event.key) {
    case "Escape":
      return "cancel";
    case "Enter":
      return "confirm";
    case "ArrowUp":
      return "history_prev";
    case "ArrowDown":
      return "query_clear";
    default:
      return null;
  }
}

// R-11/R-12: dispatch a keydown event through the fixed priority chain,
// stopping at the first handler that reports the event as handled.
//
// Priority order (R-12, unchanged — R-14-2 is an independent guard next to
// R-14, not a new numbered row, MUST-41/42):
//   1. hardcoded shortcuts (Ctrl+Q / Ctrl+,) — independent of keymap/state
//   2. settings screen open -> suppress all further processing (R-14)
//   R-14-2. search input focused -> only its own 4 keys are processed
//      (SPEC-0300-0012 R-120/R-121, SPEC-0200-0001 §3.1.4). Evaluated
//      immediately after R-14 and before priority 2 below, so R-14's
//      guarantee (nothing fires while settings is open) is never weakened.
//   R-14-4. path bar editing -> its own fixed keys / 3 overlay actions only
//      (SPEC-0300-0016 R-760~R-765); evaluated before the search-active Escape.
//   3. exit action resolved via the keymap (in case it's rebound)
//   4. overlay (modal/dropdown/sort menu/context menu) — traps all keys (R-13)
//   5. menu bar (moved: active -> right after priority 1 and stops, R-14-5-2; activation keys R-14-5-1 follow it)
//   6. tree (only the 7 TREE_HANDLED_ACTIONS, only while tree-focused, R-15)
//   7. file list (fallback)
export function dispatchKeydown(event: KeydownLikeEvent, ctx: DispatchContext): boolean {
  const hardcoded = matchesHardcodedShortcut(event);
  if (hardcoded !== null) {
    return !!ctx.onHardcodedShortcut(hardcoded);
  }

  // R-14-5-2: while the menu bar is active the key goes to it right after priority 1 and the chain stops there.
  if (ctx.isMenuBarActive) {
    return !!ctx.onMenuBarKey(null, event);
  }

  // R-14-5-1: the activation keys are evaluated before R-14 / R-14-2 / R-14-4 / R-14-3.
  if (ctx.canActivateMenuBar === true && ctx.onMenuBarActivate !== undefined) {
    const kind = matchesMenuBarActivation(event);
    if (kind !== null) {
      ctx.onMenuBarActivate(kind, event);
      return true;
    }
  }

  if (ctx.isSettingsOpen) {
    return false;
  }

  if (ctx.isSearchInputFocused) {
    // R-14-2-7: Tab moves between Tab stops even while the search input is
    // focused, ahead of the 4 recognized search keys.
    if (isPlainTab(event)) {
      return ctx.onTabStop?.(event.shiftKey ? "prev" : "next") ?? false;
    }
    const searchAction = matchesSearchInputAction(event);
    if (searchAction !== null) {
      ctx.onSearchAction(searchAction);
      return true;
    }
    // Not one of the 4 recognized search keys: stop the dispatch chain here
    // (mirrors the isSettingsOpen `return false` pattern) without
    // preventDefault, so the <input> keeps handling it as ordinary text
    // entry (AC-123).
    return false;
  }

  // R-14-4 (MUST-99(a)): path bar editing. Placed BEFORE the isSearchActive
  // Escape branch below so a path bar entered by click (R-703, search bar
  // still open) gets its own Escape. Ends the chain either handled or
  // untouched (R-763: the <input> keeps its default behavior).
  if (ctx.isPathBarEditing === true && ctx.onPathBarKey !== undefined) {
    const fixed = matchesPathBarFixedKey(event);
    if (fixed !== null) {
      ctx.onPathBarKey(fixed, event);
      return true;
    }
    if (isImeComposing(event)) return false;
    const pathBarAction = resolveActionForKey(event, ctx.customOverrides);
    const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
    if (
      hasModifier &&
      ctx.onPathBarOverlayAction !== undefined &&
      (pathBarAction === "history" || pathBarAction === "history_jump_list" || pathBarAction === "jump_add")
    ) {
      ctx.onPathBarOverlayAction(pathBarAction);
      return true;
    }
    return false;
  }

  // Search bar still open (e.g. after Enter moved focus to the list): Escape
  // leaves the search (user-confirmed 2026-09-24, revises R-109-2-4).
  if (
    ctx.isSearchActive === true &&
    matchesSearchInputAction(event) === "cancel"
  ) {
    ctx.onSearchAction("cancel");
    return true;
  }

  const action = resolveActionForKey(event, ctx.customOverrides);

  // R-14-3: while an overlay is open the keymap-routed `exit` is not
  // evaluated; dispatch falls through to the overlay handler. Ctrl+Q
  // (priority 1 above) stays always active.
  if (action === "exit" && !ctx.isOverlayOpen) {
    if (ctx.onExitAction(action)) {
      return true;
    }
  }

  if (ctx.isOverlayOpen) {
    return !!ctx.onOverlayKey(action, event);
  }

  if (action !== null && ctx.isTreeFocused && isTreeHandledAction(action)) {
    if (ctx.onTreeAction(action, event)) {
      return true;
    }
  }

  const listHandled = !!ctx.onListAction(action, event);
  if (listHandled) return true;

  // SPEC-0300-0021 R-1550 3 (SPEC-0300-0010 §3.1 #15): a registered external app's key is asked only when no keymap action matched,
  // and before the Tab fallback (Tab is a fixed key, never a registration key). Only `true` handles the key.
  if (action === null && ctx.onExternalAppKey?.(event) === true) return true;

  // MUST-85: the Tab fallback condition is keymap-match FAILURE
  // (`action === null`), never "onListAction returned false" -- a
  // resolved-but-unimplemented action (e.g. `refresh`, R-26) legitimately
  // returns false from onListAction, and Tab must not steal focus then.
  if (action === null && isPlainTab(event)) {
    return ctx.onTabStop?.(event.shiftKey ? "prev" : "next") ?? false;
  }
  return false;
}
