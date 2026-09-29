// SPEC-0300-0009 R-34-14; SPEC-0300-0010 §3.1 #9 (classification (c):
// overlay-local key handling, not customizable via the keymap).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.5,
// §3.6.11.11 SHOULD-123: a LOCAL structural event type, mirroring
// `navigation-history/list-ops.ts`'s `ListKeydownLikeEvent` -- this module
// must NOT import `features/keyboard`'s `KeydownLikeEvent` (§4.1).

export interface SortMenuKeydownLikeEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type SortMenuIntent = "move_up" | "move_down" | "confirm" | "cancel" | "trap";

// ArrowUp/ArrowDown -> move; Enter -> confirm; Escape -> cancel;
// Tab/Shift+Tab -> trap (R-14-11-3); ArrowLeft/ArrowRight -> null (R-34-14:
// do nothing, highlight unchanged); anything else -> null.
export function resolveSortMenuKeyIntent(event: SortMenuKeydownLikeEvent): SortMenuIntent | null {
  if (event.key === "Tab") {
    return "trap";
  }
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
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
      return null;
  }
}
