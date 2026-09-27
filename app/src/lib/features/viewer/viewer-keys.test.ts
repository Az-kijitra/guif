import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0015 §12 (R-500~R-503), R-500-1~5, R-471, R-471-1, R-481,
//   R-481-1, R-482, R-490, R-426, R-427, R-502. AC-500~AC-503.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.5.7/§3.5.8
//   (`features/viewer/viewer-keys.ts`: pure, NEVER imports
//   `features/keyboard` -- the fixed table is not keymap-driven, R-500).
// Module under test (not yet implemented): ./viewer-keys.ts
//
// Contract assumed (documented in the handback report):
//   export type ContentKind = "text" | "markdown" | "image" | "error";
//   export type ViewerKeyAction =
//     | { kind: "scroll"; axis: "y" | "x"; amount: 72 | 240 }
//     | { kind: "page"; direction: "up" | "down" }
//     | { kind: "home" } | { kind: "end" }
//     | { kind: "navigate"; direction: "prev" | "next" }
//     | { kind: "zoom"; op: "in" | "out" | "reset" | "fit" | "200" }
//     | { kind: "close" };
//   resolveViewerKeyAction(event: KeydownLikeEvent, ctx: { contentKind: ContentKind }): ViewerKeyAction | null
//   shouldSuppressWebviewDefault(event: KeydownLikeEvent): boolean   // R-502

import { resolveViewerKeyAction, shouldSuppressWebviewDefault } from "./viewer-keys";

const key = (
  k: string,
  over: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {},
) => ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over });

const textCtx = { contentKind: "text" as const };
const markdownCtx = { contentKind: "markdown" as const };
const imageCtx = { contentKind: "image" as const };
const errorCtx = { contentKind: "error" as const };

describe("resolveViewerKeyAction: scrolling (R-500 row 1/2/3, R-500-2, AC-500)", () => {
  it("Arrow keys scroll 72px; Shift+Arrow scrolls 240px, in every content kind", () => {
    for (const ctx of [textCtx, markdownCtx, imageCtx, errorCtx]) {
      expect(resolveViewerKeyAction(key("ArrowUp"), ctx)).toEqual({ kind: "scroll", axis: "y", amount: 72 });
      expect(resolveViewerKeyAction(key("ArrowDown"), ctx)).toEqual({ kind: "scroll", axis: "y", amount: 72 });
      expect(resolveViewerKeyAction(key("ArrowLeft"), ctx)).toEqual({ kind: "scroll", axis: "x", amount: 72 });
      expect(resolveViewerKeyAction(key("ArrowRight"), ctx)).toEqual({ kind: "scroll", axis: "x", amount: 72 });
      expect(resolveViewerKeyAction(key("ArrowDown", { shiftKey: true }), ctx)).toEqual({
        kind: "scroll",
        axis: "y",
        amount: 240,
      });
    }
  });

  it("PageUp/PageDown resolve to a page scroll (one screen height, R-500 row 3)", () => {
    expect(resolveViewerKeyAction(key("PageUp"), textCtx)).toEqual({ kind: "page", direction: "up" });
    expect(resolveViewerKeyAction(key("PageDown"), textCtx)).toEqual({ kind: "page", direction: "down" });
  });

  it("Home/End resolve to home/end (R-500 new row, MVP addition)", () => {
    expect(resolveViewerKeyAction(key("Home"), textCtx)).toEqual({ kind: "home" });
    expect(resolveViewerKeyAction(key("End"), textCtx)).toEqual({ kind: "end" });
  });
});

describe("resolveViewerKeyAction: previous/next file (R-490, AC-483's key list)", () => {
  it("Alt+Left / Ctrl+PageUp -> prev; Alt+Right / Ctrl+PageDown -> next", () => {
    expect(resolveViewerKeyAction(key("ArrowLeft", { altKey: true }), textCtx)).toEqual({
      kind: "navigate",
      direction: "prev",
    });
    expect(resolveViewerKeyAction(key("PageUp", { ctrlKey: true }), textCtx)).toEqual({
      kind: "navigate",
      direction: "prev",
    });
    expect(resolveViewerKeyAction(key("ArrowRight", { altKey: true }), textCtx)).toEqual({
      kind: "navigate",
      direction: "next",
    });
    expect(resolveViewerKeyAction(key("PageDown", { ctrlKey: true }), textCtx)).toEqual({
      kind: "navigate",
      direction: "next",
    });
  });
});

describe("resolveViewerKeyAction: close (R-426, R-427)", () => {
  it("Escape and Ctrl+Q both resolve to close, regardless of content kind", () => {
    expect(resolveViewerKeyAction(key("Escape"), imageCtx)).toEqual({ kind: "close" });
    expect(resolveViewerKeyAction(key("q", { ctrlKey: true }), errorCtx)).toEqual({ kind: "close" });
  });
});

describe("resolveViewerKeyAction: zoom on an IMAGE (R-481-1, R-500-1)", () => {
  it("Ctrl+'+'/'=' zooms in; Ctrl+'-' zooms out; Ctrl+0 resets; Ctrl+9 fits; Ctrl+2 sets 200%", () => {
    expect(resolveViewerKeyAction(key("+", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "in" });
    expect(resolveViewerKeyAction(key("=", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "in" });
    expect(resolveViewerKeyAction(key("-", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "out" });
    expect(resolveViewerKeyAction(key("0", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "reset" });
    expect(resolveViewerKeyAction(key("9", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "fit" });
    expect(resolveViewerKeyAction(key("2", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "200" });
  });

  it("R-500-1: the numpad +/- variants are accepted too", () => {
    expect(resolveViewerKeyAction(key("Add", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "in" });
    expect(resolveViewerKeyAction(key("Subtract", { ctrlKey: true }), imageCtx)).toEqual({ kind: "zoom", op: "out" });
  });
});

describe("resolveViewerKeyAction: zoom on MARKDOWN (R-471-1; Ctrl+9/2 are image-only)", () => {
  it("Ctrl+'+'/'-'/0 zoom the Markdown view", () => {
    expect(resolveViewerKeyAction(key("+", { ctrlKey: true }), markdownCtx)).toEqual({ kind: "zoom", op: "in" });
    expect(resolveViewerKeyAction(key("-", { ctrlKey: true }), markdownCtx)).toEqual({ kind: "zoom", op: "out" });
    expect(resolveViewerKeyAction(key("0", { ctrlKey: true }), markdownCtx)).toEqual({ kind: "zoom", op: "reset" });
  });

  it("R-500-5: Ctrl+9/2 do nothing while viewing Markdown (Fit/200% are image-only concepts)", () => {
    expect(resolveViewerKeyAction(key("9", { ctrlKey: true }), markdownCtx)).toBeNull();
    expect(resolveViewerKeyAction(key("2", { ctrlKey: true }), markdownCtx)).toBeNull();
  });
});

describe("resolveViewerKeyAction: R-500-5, zoom keys are inert while viewing plain text or an error/unsupported state", () => {
  it("Ctrl+'+'/'-'/0/9/2 all resolve to null for text and error content kinds", () => {
    for (const ctx of [textCtx, errorCtx]) {
      expect(resolveViewerKeyAction(key("+", { ctrlKey: true }), ctx)).toBeNull();
      expect(resolveViewerKeyAction(key("-", { ctrlKey: true }), ctx)).toBeNull();
      expect(resolveViewerKeyAction(key("0", { ctrlKey: true }), ctx)).toBeNull();
      expect(resolveViewerKeyAction(key("9", { ctrlKey: true }), ctx)).toBeNull();
      expect(resolveViewerKeyAction(key("2", { ctrlKey: true }), ctx)).toBeNull();
    }
  });
});

describe("resolveViewerKeyAction: R-501/R-501-1, Ctrl+F/Ctrl+O are never assigned", () => {
  it("Ctrl+F and Ctrl+O resolve to null in every content kind", () => {
    for (const ctx of [textCtx, markdownCtx, imageCtx, errorCtx]) {
      expect(resolveViewerKeyAction(key("f", { ctrlKey: true }), ctx)).toBeNull();
      expect(resolveViewerKeyAction(key("o", { ctrlKey: true }), ctx)).toBeNull();
    }
  });
});

describe("resolveViewerKeyAction: an unrecognized key resolves to null", () => {
  it("a plain character key with no modifiers is not one of the fixed R-500 bindings", () => {
    expect(resolveViewerKeyAction(key("a"), textCtx)).toBeNull();
  });
});

describe("shouldSuppressWebviewDefault (R-502, AC-503)", () => {
  it("suppresses reload (F5, Ctrl+R), print (Ctrl+P) and page-find (Ctrl+F)", () => {
    expect(shouldSuppressWebviewDefault(key("F5"))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("r", { ctrlKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("p", { ctrlKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("f", { ctrlKey: true }))).toBe(true);
  });

  it("suppresses the WebView's own Ctrl+'+'/'-'/'0' zoom accelerators", () => {
    expect(shouldSuppressWebviewDefault(key("+", { ctrlKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("-", { ctrlKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("0", { ctrlKey: true }))).toBe(true);
  });

  it("does NOT suppress copy (Ctrl+C) or select-all (Ctrl+A)", () => {
    expect(shouldSuppressWebviewDefault(key("c", { ctrlKey: true }))).toBe(false);
    expect(shouldSuppressWebviewDefault(key("a", { ctrlKey: true }))).toBe(false);
  });

  it("does not suppress an ordinary unmodified character key", () => {
    expect(shouldSuppressWebviewDefault(key("x"))).toBe(false);
  });
});
