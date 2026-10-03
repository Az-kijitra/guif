// SPEC-0200-0001 §3.9.11: binds the right-click menu wiring to the main window's real
// collaborators (production defaults for the clipboard writer, ZIP rule, clock and DOM test),
// so +page.svelte passes only the objects it owns. No logic of its own.

import { isZipFileName } from "$lib/features/archive/target-rules";
import { writeClipboardText } from "$lib/shared/clipboard-text";
import { createContextMenuWiring, type ContextMenuWiringDeps } from "./context-menu-wiring.svelte";

export type MainContextMenuDeps = Omit<
  ContextMenuWiringDeps,
  "isOverlayOpen" | "writeClipboardText" | "isZip" | "now" | "isInsideMenu"
> & { overlays: ReadonlyArray<{ readonly isOpen: boolean }> };

export function createMainContextMenu(deps: MainContextMenuDeps) {
  const { overlays, ...rest } = deps;
  return createContextMenuWiring({
    ...rest,
    isOverlayOpen: () => overlays.some((o) => o.isOpen), // R-1101: dialog / history / sort menu
    writeClipboardText,
    isZip: isZipFileName,
    now: () => Date.now(),
    isInsideMenu: (target) => target?.closest('[role="menu"]') != null,
  });
}
