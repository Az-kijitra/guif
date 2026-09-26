// Fixed key judgment for modal dialogs (SPEC-0200-0001 §3.3.2, §3.3.13-6;
// SPEC-0300-0010 R-13, R-16-2, §3.1 classification (c)). Overlay-local keys
// are NOT keymap-customisable (AC-56), hence no keymap parameter.
//
// Pure functions only: no DOM, no state.

export type ModalKind = "confirm" | "form" | "progress";
export type ModalKeyIntent = "cancel" | "submit" | "focus_next" | "focus_prev";

export interface ModalKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

// SHOULD-77/78: while an IME composition is in progress every key is left to
// the input (Escape only cancels the conversion, Enter only commits it).
// Ctrl/Alt/Meta combinations always fall through (Ctrl+C/V/A in the input);
// Shift is only meaningful on Tab.
export function resolveModalKeyIntent(event: ModalKeyEvent, kind: ModalKind): ModalKeyIntent | null {
  if (event.isComposing === true) return null;
  if (event.ctrlKey || event.altKey || event.metaKey) return null;

  if (event.key === "Tab") return event.shiftKey ? "focus_prev" : "focus_next";
  if (event.shiftKey) return null;

  switch (event.key) {
    case "Escape":
      return "cancel";
    case "Enter":
      // confirm/progress: left to the focused button's native click (the
      // default focus is the safe side, R-35/AC-30/AC-40).
      return kind === "form" ? "submit" : null;
    case "ArrowLeft":
    case "ArrowUp":
      return kind === "confirm" ? "focus_prev" : null;
    case "ArrowRight":
    case "ArrowDown":
      return kind === "confirm" ? "focus_next" : null;
    default:
      return null;
  }
}

// Focus-trap helper. `current` = -1 means the focus is outside the dialog:
// next => first, prev => last. count = 0 => -1 (no target).
export function nextFocusIndex(current: number, count: number, dir: "next" | "prev"): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return dir === "next" ? 0 : count - 1;
  return dir === "next" ? (current + 1) % count : (current - 1 + count) % count;
}
