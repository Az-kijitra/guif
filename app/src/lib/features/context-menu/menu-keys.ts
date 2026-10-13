// SPEC-0300-0018 R-1080~R-1084 / SPEC-0200-0001 §3.9.5. Pure.

import { firstEnabled, nextEnabled } from "$lib/shared/menu-navigation";
import type { MenuEntry, MenuItemId } from "./menu-model";

export interface MenuKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

export type MenuKeyIntent = "move_up" | "move_down" | "confirm" | "cancel" | "trap" | "pass";

const BARE_MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

export function resolveContextMenuKey(event: MenuKeyEvent): MenuKeyIntent {
  // OS-level combinations (Alt+F4, Alt+Tab, Windows key) and bare modifiers are not stopped.
  if (event.altKey || event.metaKey || BARE_MODIFIERS.has(event.key)) return "pass";
  if (event.isComposing === true || event.ctrlKey || event.shiftKey) return "trap";
  switch (event.key) {
    case "ArrowUp":
      return "move_up";
    case "ArrowDown":
      return "move_down";
    case "Enter":
      return "confirm";
    case "Escape":
      return "cancel";
    default:
      return "trap";
  }
}

export function moveMenuHighlight(
  items: readonly MenuEntry[],
  current: MenuItemId | null,
  dir: "up" | "down",
): MenuItemId | null {
  return nextEnabled(items, current, dir, true);
}

export function resolveEnterTarget(items: readonly MenuEntry[], current: MenuItemId | null): MenuItemId | null {
  // `current` counts only when it is an enabled item of the list.
  const isEnabled = items.some((e) => e.type === "item" && e.enabled && e.id === current);
  return isEnabled ? current : firstEnabled(items);
}
