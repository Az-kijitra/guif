// SPEC-0300-0020 §7 (R-1350 1 / 3, R-1351, R-1353, R-1354, R-1355) / SPEC-0300-0010 第16版 R-14-5-2 / SPEC-0200-0001 §3.14.1-1. Pure.
// The key state machine of the menu bar: `reduceMenuBarKey(state, event)` -> { state, effect, handled, preventDefault }.
// Alt-alone activation (a keyup tracker) is on hold and is NOT here.

import { firstEnabled, lastEnabled, nextEnabled, type NavEntry } from "$lib/shared/menu-navigation";
import type { MenuId } from "./menu-model";

export const MENU_ORDER: readonly MenuId[] = ["file", "edit", "view", "go"];

export interface MenuBarKeyState {
  active: boolean;
  // 0..3, the highlighted heading (index into MENU_ORDER).
  headingIndex: number;
  // The dropdown that is open, or null (heading level).
  openMenu: MenuId | null;
  highlightId: string | null;
  // Snapshot of the open dropdown taken when it was opened (R-1322); [] when closed.
  entries: readonly NavEntry<string>[];
}

export const INACTIVE_STATE: MenuBarKeyState = { active: false, headingIndex: 0, openMenu: null, highlightId: null, entries: [] };

export interface MenuBarKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export type MenuBarEffect =
  | { kind: "none" }
  | { kind: "activate" }
  | { kind: "open-menu"; menu: MenuId; highlight: "first" | "none" }
  | { kind: "execute"; id: string }
  | { kind: "deactivate" };

export interface MenuBarKeyResult {
  state: MenuBarKeyState;
  effect: MenuBarEffect;
  handled: boolean;
  preventDefault: boolean;
}

const NONE: MenuBarEffect = { kind: "none" };
const ACCESS_KEYS: Readonly<Record<string, number>> = { f: 0, e: 1, v: 2, g: 3 };

function result(state: MenuBarKeyState, effect: MenuBarEffect = NONE): MenuBarKeyResult {
  return { state, effect, handled: true, preventDefault: true };
}

function unhandled(state: MenuBarKeyState): MenuBarKeyResult {
  return { state, effect: NONE, handled: false, preventDefault: false };
}

const noModifier = (e: MenuBarKeyEvent): boolean => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;

// The access key index when the event is Alt + F/E/V/G (Alt only), else -1.
function accessIndex(e: MenuBarKeyEvent): number {
  if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return -1;
  return ACCESS_KEYS[e.key.toLowerCase()] ?? -1;
}

// R-1355 / R-14-5-2: keys the OS handles (Alt+F4, Alt+Tab, Alt+Space, anything with the Windows key) are not swallowed.
function isOsKey(e: MenuBarKeyEvent): boolean {
  if (e.metaKey || e.key === "Meta") return true;
  return e.altKey && (e.key === "F4" || e.key === "Tab" || e.key === " ");
}

function openMenuAt(index: number): MenuBarKeyResult {
  const menu = MENU_ORDER[index];
  return result(
    { active: true, headingIndex: index, openMenu: menu, highlightId: null, entries: [] },
    { kind: "open-menu", menu, highlight: "first" },
  );
}

function wrap(index: number, delta: number): number {
  return (index + delta + MENU_ORDER.length) % MENU_ORDER.length;
}

function reduceInactive(state: MenuBarKeyState, e: MenuBarKeyEvent): MenuBarKeyResult {
  if (e.isComposing === true || e.keyCode === 229) return unhandled(state);
  if (e.key === "F10" && noModifier(e)) {
    return result({ active: true, headingIndex: 0, openMenu: null, highlightId: null, entries: [] }, { kind: "activate" });
  }
  const index = accessIndex(e);
  return index >= 0 ? openMenuAt(index) : unhandled(state);
}

function reduceHeadingLevel(state: MenuBarKeyState, e: MenuBarKeyEvent): MenuBarKeyResult {
  if (noModifier(e)) {
    switch (e.key) {
      case "ArrowRight":
        return result({ ...state, headingIndex: wrap(state.headingIndex, 1) });
      case "ArrowLeft":
        return result({ ...state, headingIndex: wrap(state.headingIndex, -1) });
      case "ArrowDown":
      case "Enter":
      case " ":
        return openMenuAt(state.headingIndex);
      default:
        break;
    }
  }
  return result(state);
}

function reduceDropdown(state: MenuBarKeyState, e: MenuBarKeyEvent): MenuBarKeyResult {
  if (noModifier(e)) {
    const withHighlight = (highlightId: string | null): MenuBarKeyResult => result({ ...state, highlightId });
    switch (e.key) {
      case "ArrowDown":
        return withHighlight(nextEnabled(state.entries, state.highlightId, "down", true));
      case "ArrowUp":
        return withHighlight(nextEnabled(state.entries, state.highlightId, "up", true));
      case "Home":
        return withHighlight(firstEnabled(state.entries));
      case "End":
        return withHighlight(lastEnabled(state.entries));
      case "ArrowRight":
        return openMenuAt(wrap(state.headingIndex, 1));
      case "ArrowLeft":
        return openMenuAt(wrap(state.headingIndex, -1));
      case "Enter": {
        // A disabled highlight is never executed (defensive): fall back to the first enabled item.
        const highlighted = state.entries.some((x) => x.type === "item" && x.enabled && x.id === state.highlightId);
        const id = highlighted ? state.highlightId : firstEnabled(state.entries);
        if (id === null) return result(state);
        return result(INACTIVE_STATE, { kind: "execute", id });
      }
      default:
        break;
    }
  }
  return result(state);
}

export function reduceMenuBarKey(state: MenuBarKeyState, event: MenuBarKeyEvent): MenuBarKeyResult {
  if (!state.active) return reduceInactive(state, event);
  if (isOsKey(event)) return unhandled(state);
  // R-1351: Esc (one press) and F10 close everything and give the focus back.
  if ((event.key === "Escape" || event.key === "F10") && noModifier(event)) {
    return result(INACTIVE_STATE, { kind: "deactivate" });
  }
  // R-1354 5: Alt + an access key switches to that menu (also from heading level).
  const index = accessIndex(event);
  if (index >= 0) return openMenuAt(index);
  return state.openMenu === null ? reduceHeadingLevel(state, event) : reduceDropdown(state, event);
}
