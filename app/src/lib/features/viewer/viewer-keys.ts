// SPEC-0300-0015 §12 (R-500~R-503), R-500-1~5, R-471, R-471-1, R-481,
// R-481-1, R-482, R-490, R-426, R-427, R-502 (SPEC-0200-0001 §3.5.7/§3.5.8):
// the viewer's FIXED key table. Pure, DOM-free, and never imports
// `features/keyboard` -- this table is hardcoded (R-500), not keymap-driven.

export type ContentKind = "text" | "markdown" | "image" | "error";

export type ViewerKeyAction =
  | { kind: "scroll"; axis: "y" | "x"; amount: 72 | 240 }
  | { kind: "page"; direction: "up" | "down" }
  | { kind: "home" }
  | { kind: "end" }
  | { kind: "navigate"; direction: "prev" | "next" }
  | { kind: "zoom"; op: "in" | "out" | "reset" | "fit" | "200" }
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
  const { key, ctrlKey, shiftKey, altKey } = event;

  // R-490: previous/next file navigation.
  if (altKey && key === "ArrowLeft") return { kind: "navigate", direction: "prev" };
  if (altKey && key === "ArrowRight") return { kind: "navigate", direction: "next" };
  if (ctrlKey && key === "PageUp") return { kind: "navigate", direction: "prev" };
  if (ctrlKey && key === "PageDown") return { kind: "navigate", direction: "next" };

  // R-426/R-427: close the viewer, regardless of content kind.
  if (key === "Escape") return { kind: "close" };
  if (ctrlKey && (key === "q" || key === "Q")) return { kind: "close" };

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

  // R-500 rows 1~4: scrolling/paging/home-end, valid in every content kind.
  if (key === "ArrowUp" || key === "ArrowDown") {
    return { kind: "scroll", axis: "y", amount: shiftKey ? 240 : 72 };
  }
  if (key === "ArrowLeft" || key === "ArrowRight") {
    return { kind: "scroll", axis: "x", amount: shiftKey ? 240 : 72 };
  }
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
  return event.ctrlKey && SUPPRESSED_WITH_CTRL.has(event.key);
}
