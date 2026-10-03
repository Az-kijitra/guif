// SPEC-0300-0018 R-1081, R-1090, R-1087 / SPEC-0200-0001 §3.9.1, §3.9.17.4.
// Feature-local state of the right-click menu (not shared state).

import type { MenuItemId, MenuSnapshot } from "./menu-model";
import { moveMenuHighlight, resolveEnterTarget } from "./menu-keys";

export interface OutsideClose {
  time: number;
  x: number;
  y: number;
}

export function createContextMenuState() {
  let snapshot = $state<MenuSnapshot | null>(null);
  let highlightedId = $state<MenuItemId | null>(null);
  let lastOutsideClose = $state<OutsideClose | null>(null);
  let token = 0;

  return {
    get isOpen(): boolean {
      return snapshot !== null;
    },
    get snapshot(): MenuSnapshot | null {
      return snapshot;
    },
    get highlightedId(): MenuItemId | null {
      return highlightedId;
    },
    get lastOutsideClose(): OutsideClose | null {
      return lastOutsideClose;
    },
    open(next: MenuSnapshot): void {
      snapshot = next;
      highlightedId = null; // R-1081: nothing highlighted on open
    },
    close(): void {
      snapshot = null;
      highlightedId = null;
    },
    moveHighlight(dir: "up" | "down"): void {
      if (snapshot === null) return;
      highlightedId = moveMenuHighlight(snapshot.entries, highlightedId, dir);
    },
    // R-1090: hover shares the key state; disabled items / unknown ids are ignored.
    highlight(id: MenuItemId): void {
      if (snapshot === null) return;
      const entry = snapshot.entries.find((e) => e.type === "item" && e.id === id);
      if (entry !== undefined && entry.type === "item" && entry.enabled) highlightedId = id;
    },
    confirmTarget(): MenuItemId | null {
      if (snapshot === null) return null;
      return resolveEnterTarget(snapshot.entries, highlightedId);
    },
    nextOpenToken(): number {
      token += 1;
      return token;
    },
    isLatestOpenToken(t: number): boolean {
      return t === token;
    },
    recordOutsideClose(c: OutsideClose): void {
      lastOutsideClose = c;
    },
  };
}
