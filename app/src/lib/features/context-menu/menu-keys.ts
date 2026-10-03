// SPEC-0300-0018 R-1080~R-1084 / SPEC-0200-0001 §3.9.5. Pure.

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

function enabledIds(items: readonly MenuEntry[]): MenuItemId[] {
  const ids: MenuItemId[] = [];
  for (const e of items) if (e.type === "item" && e.enabled) ids.push(e.id);
  return ids;
}

export function moveMenuHighlight(
  items: readonly MenuEntry[],
  current: MenuItemId | null,
  dir: "up" | "down",
): MenuItemId | null {
  const ids = enabledIds(items);
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return dir === "down" ? ids[0] : ids[ids.length - 1];
  const next = dir === "down" ? (at + 1) % ids.length : (at - 1 + ids.length) % ids.length;
  return ids[next];
}

export function resolveEnterTarget(items: readonly MenuEntry[], current: MenuItemId | null): MenuItemId | null {
  const ids = enabledIds(items);
  if (current !== null && ids.includes(current)) return current;
  return ids.length > 0 ? ids[0] : null;
}
