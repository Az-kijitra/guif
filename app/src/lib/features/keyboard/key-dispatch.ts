// SPEC-0300-0010 §3 (R-10~R-17, §3.1): global keydown capture and the fixed
// priority-chain dispatch. This module only resolves "which action does this
// key correspond to" and "which handler in the priority chain gets it" — the
// action *implementations* live in their owning features and are injected
// into the dispatch context by the caller (R-17: no central action
// dispatcher/store).

import { ACTION_IDS, VIM_DEFAULTS, WINDOWS_DEFAULTS } from "./keymap-defaults";
import { matchesAction, resolveBinding, type KeydownLikeEvent } from "./keymap-resolve";

export type Profile = "windows" | "vim";

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
// the given profile and custom overrides (R-30~R-34 via keymap-resolve.ts).
export function resolveActionForKey(
  event: KeydownLikeEvent,
  profile: Profile,
  customOverrides: Record<string, string>,
): string | null {
  const defaults = profile === "vim" ? VIM_DEFAULTS : WINDOWS_DEFAULTS;

  for (const actionId of ACTION_IDS) {
    const profileDefault = defaults[actionId];
    if (profileDefault === undefined) {
      continue;
    }
    const bindings = resolveBinding({ profile, customOverrides, actionId, profileDefault });
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
  if (matchesAction(event, ["Ctrl+,"])) {
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

export interface DispatchContext {
  isSettingsOpen: boolean;
  isOverlayOpen: boolean;
  isMenuBarActive: boolean;
  isTreeFocused: boolean;
  profile: Profile;
  customOverrides: Record<string, string>;
  onHardcodedShortcut: (action: "exit" | "settings") => boolean;
  onExitAction: (action: string) => boolean;
  onOverlayKey: (action: string | null, event: KeydownLikeEvent) => boolean;
  onMenuBarKey: (action: string | null, event: KeydownLikeEvent) => boolean;
  onTreeAction: (action: string, event: KeydownLikeEvent) => boolean;
  onListAction: (action: string | null, event: KeydownLikeEvent) => boolean;
}

// R-11/R-12: dispatch a keydown event through the fixed priority chain,
// stopping at the first handler that reports the event as handled.
//
// Priority order (R-12):
//   1. hardcoded shortcuts (Ctrl+Q / Ctrl+,) — independent of keymap/state
//   2. settings screen open -> suppress all further processing (R-14)
//   3. exit action resolved via the keymap (in case it's rebound)
//   4. overlay (modal/dropdown/sort menu/context menu) — traps all keys (R-13)
//   5. menu bar
//   6. tree (only the 7 TREE_HANDLED_ACTIONS, only while tree-focused, R-15)
//   7. file list (fallback)
export function dispatchKeydown(event: KeydownLikeEvent, ctx: DispatchContext): boolean {
  const hardcoded = matchesHardcodedShortcut(event);
  if (hardcoded !== null) {
    return !!ctx.onHardcodedShortcut(hardcoded);
  }

  if (ctx.isSettingsOpen) {
    return false;
  }

  const action = resolveActionForKey(event, ctx.profile, ctx.customOverrides);

  if (action === "exit") {
    if (ctx.onExitAction(action)) {
      return true;
    }
  }

  if (ctx.isOverlayOpen) {
    return !!ctx.onOverlayKey(action, event);
  }

  if (ctx.isMenuBarActive) {
    if (ctx.onMenuBarKey(action, event)) {
      return true;
    }
  }

  if (action !== null && ctx.isTreeFocused && isTreeHandledAction(action)) {
    if (ctx.onTreeAction(action, event)) {
      return true;
    }
  }

  return !!ctx.onListAction(action, event);
}
