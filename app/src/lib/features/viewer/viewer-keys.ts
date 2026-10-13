// SPEC-0300-0015 §12 (R-500~R-503), R-500-1~5, R-471, R-471-1, R-481,
// R-481-1, R-482, R-490, R-426, R-427, R-502 (SPEC-0200-0001 §3.5.7/§3.5.8):
// the viewer's FIXED key table. Pure, DOM-free, and never imports
// `features/keyboard` -- this table is hardcoded (R-500), not keymap-driven.

export type ContentKind = "text" | "markdown" | "image" | "error";

export type ViewerKeyAction =
  | { kind: "scroll"; axis: "y" | "x"; amount: number } // signed: Up / Left negative (R-500)
  | { kind: "page"; direction: "up" | "down" }
  | { kind: "home" }
  | { kind: "end" }
  | { kind: "navigate"; direction: "prev" | "next" }
  | { kind: "zoom"; op: "in" | "out" | "reset" | "fit" | "200" }
  | { kind: "select_all" }
  | { kind: "close" };

export interface KeydownLikeEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

interface ViewerKeyContext {
  contentKind: ContentKind;
}

// R-500-1: `+` (Shift-less `=`) and the numpad `+`/`-` are all accepted.
const ZOOM_IN_KEYS = new Set(["+", "=", "Add"]);
const ZOOM_OUT_KEYS = new Set(["-", "Subtract"]);
const ZOOM_KEYS = new Set([...ZOOM_IN_KEYS, ...ZOOM_OUT_KEYS, "0", "9", "2"]);

export function resolveViewerKeyAction(event: KeydownLikeEvent, ctx: ViewerKeyContext): ViewerKeyAction | null {
  const { key, ctrlKey, shiftKey, altKey, metaKey } = event;

  // R-490: previous/next file navigation.
  if (altKey && key === "ArrowLeft") return { kind: "navigate", direction: "prev" };
  if (altKey && key === "ArrowRight") return { kind: "navigate", direction: "next" };
  if (ctrlKey && key === "PageUp") return { kind: "navigate", direction: "prev" };
  if (ctrlKey && key === "PageDown") return { kind: "navigate", direction: "next" };

  // R-426/R-427: close the viewer, regardless of content kind.
  if (key === "Escape") return { kind: "close" };
  if (ctrlKey && (key === "q" || key === "Q")) return { kind: "close" };

  // R-500-9: Ctrl+A selects the body only (Ctrl alone; Shift / Alt / Meta make it a different combination).
  if (ctrlKey && !shiftKey && !altKey && !metaKey && (key === "a" || key === "A")) return { kind: "select_all" };

  // R-501/R-501-1: Ctrl+F (search) / Ctrl+O (file open) are never assigned.
  if (ctrlKey && (key === "f" || key === "F" || key === "o" || key === "O")) return null;

  // R-471/R-481-1/R-500-5: zoom, gated by content kind.
  if (ctrlKey && ZOOM_KEYS.has(key)) {
    // R-500-5: inert while viewing plain text or an error/unsupported state.
    if (ctx.contentKind === "text" || ctx.contentKind === "error") return null;
    if (ZOOM_IN_KEYS.has(key)) return { kind: "zoom", op: "in" };
    if (ZOOM_OUT_KEYS.has(key)) return { kind: "zoom", op: "out" };
    if (key === "0") return { kind: "zoom", op: "reset" };
    // Fit (Ctrl+9) / 200% (Ctrl+2) are image-only concepts (R-500-5).
    if (ctx.contentKind !== "image") return null;
    return key === "9" ? { kind: "zoom", op: "fit" } : { kind: "zoom", op: "200" };
  }

  // R-500-7: a scroll key with Ctrl / Alt / Meta is not a scroll (the navigation combinations are handled above).
  if (ctrlKey || altKey || metaKey) return null;

  // R-500 rows 1~4: scrolling/paging/home-end, valid in every content kind. Shift only changes the amount of the
  // Arrow keys (72 -> 240); the sign follows the direction (Up / Left negative).
  const step = shiftKey ? 240 : 72;
  if (key === "ArrowUp") return { kind: "scroll", axis: "y", amount: -step };
  if (key === "ArrowDown") return { kind: "scroll", axis: "y", amount: step };
  if (key === "ArrowLeft") return { kind: "scroll", axis: "x", amount: -step };
  if (key === "ArrowRight") return { kind: "scroll", axis: "x", amount: step };
  if (key === "PageUp") return { kind: "page", direction: "up" };
  if (key === "PageDown") return { kind: "page", direction: "down" };
  if (key === "Home") return { kind: "home" };
  if (key === "End") return { kind: "end" };

  return null;
}

const SUPPRESSED_UNMODIFIED = new Set(["F5"]);
// R-502: reload/print/page-find/zoom accelerators the WebView would otherwise
// handle itself; copy (Ctrl+C) and select-all (Ctrl+A) are deliberately
// excluded (not suppressed).
const SUPPRESSED_WITH_CTRL = new Set(["r", "R", "p", "P", "f", "F", "0", ...ZOOM_IN_KEYS, ...ZOOM_OUT_KEYS]);

// R-502/AC-503: whether the WebView's own default handling for this key must
// be prevented (independent of whether `resolveViewerKeyAction` also assigns
// it an in-app meaning).
export function shouldSuppressWebviewDefault(event: KeydownLikeEvent): boolean {
  if (!event.ctrlKey && SUPPRESSED_UNMODIFIED.has(event.key)) return true;
  if (event.ctrlKey && SUPPRESSED_WITH_CTRL.has(event.key)) return true;
  return isModifiedScrollKey(event);
}

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);

// R-500-7: a scroll key with Ctrl / Alt / Meta must NOT scroll, so the WebView's own scrolling is cancelled too
// (resolveViewerKeyAction returns null for it). The previous / next file keys (Alt+Left / Alt+Right, Ctrl+PageUp /
// Ctrl+PageDown) are handled by the viewer itself and are cancelled by that handler, so they are left out here.
function isModifiedScrollKey(event: KeydownLikeEvent): boolean {
  if (!SCROLL_KEYS.has(event.key)) return false;
  if (!event.ctrlKey && !event.altKey && !event.metaKey) return false;
  return resolveViewerKeyAction(event, { contentKind: "text" }) === null;
}

// R-500-9 / SPEC-0200-0001 §3.14.12-4(d): what Ctrl+A selects. Only the body text; the header and the line numbers are
// never part of the selection. Image and error displays have nothing to select (the handler still cancels the default).
export function selectAllTarget(ctx: {
  contentKind: ContentKind;
  markdownMode?: "html" | "text";
}): "code" | "markdown-html" | null {
  if (ctx.contentKind === "text") return "code";
  if (ctx.contentKind === "markdown") return ctx.markdownMode === "text" ? "code" : "markdown-html";
  return null;
}
