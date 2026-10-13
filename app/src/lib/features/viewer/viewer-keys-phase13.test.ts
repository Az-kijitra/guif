import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-500 (direction), R-500-6 (Home / End), R-500-7 (modifier exclusion, 確定 T-12;
//   Shift only changes the Arrow amount, 承認後の追補), R-500-9 (Ctrl+A selects the body only; image / error: nothing),
//   AC-516 (direction + modifiers), AC-500 / AC-517 (CDP side, not here).
// Architecture: SPEC-0200-0001 §3.14.3 (signed `amount`; scroll keys return null when ctrl / alt / meta is down),
//   §3.14.12-4(d) (Ctrl+A is NOT added to `shouldSuppressWebviewDefault`; the viewer's own keydown handler selects the body).
//
// The direction part lives in the existing viewer-keys.test.ts (edited: the old positive-amount
// expectation pinned the reported defect). This file holds the NEW cases.
//
// Contract assumed (reported to the implementer):
//   export type ViewerKeyAction = ... | { kind: "scroll"; axis: "y" | "x"; amount: number }   // signed
//                                 ... | { kind: "select_all" }                                 // NEW (Ctrl+A)
//   resolveViewerKeyAction({ctrl-only + "a"/"A"}, ctx) -> { kind: "select_all" }  in EVERY content kind
//   selectAllTarget(ctx: { contentKind: ContentKind; markdownMode?: "html" | "text" }): "code" | "markdown-html" | null
//     text -> "code"; markdown (mode "text") -> "code"; markdown (mode "html" / omitted) -> "markdown-html";
//     image / error -> null (the handler still preventDefault()s but creates no selection, R-500-9)
//
// Module under test: ./viewer-keys.ts

import { resolveViewerKeyAction, selectAllTarget, shouldSuppressWebviewDefault } from "./viewer-keys";

const key = (
  k: string,
  over: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {},
) => ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over });

const KINDS = ["text", "markdown", "image", "error"] as const;
const ctxOf = (contentKind: (typeof KINDS)[number]) => ({ contentKind });

describe("AC-516: Ctrl / Alt / Meta + a scroll key is NOT a scroll (R-500-7)", () => {
  const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"];

  it.each(SCROLL_KEYS.flatMap((k) => (["ctrlKey", "altKey", "metaKey"] as const).map((m) => [k, m] as const)))(
    "%s with %s resolves to a non-scroll result (null, or the navigate / other action that owns that combination)",
    (k, mod) => {
      for (const kind of KINDS) {
        const r = resolveViewerKeyAction(key(k, { [mod]: true }), ctxOf(kind));
        // The only legitimate non-null results are the navigations Alt+Left / Alt+Right / Ctrl+PageUp / Ctrl+PageDown.
        const isNav = r !== null && r.kind === "navigate";
        const allowedNav =
          (mod === "altKey" && (k === "ArrowLeft" || k === "ArrowRight")) ||
          (mod === "ctrlKey" && (k === "PageUp" || k === "PageDown"));
        if (allowedNav) expect(isNav, `${k}+${mod} must be a navigation`).toBe(true);
        else expect(r, `${k}+${mod} in ${kind}`).toBeNull();
      }
    },
  );

  it("the named examples of AC-516: Ctrl+Up, Ctrl+Right, Alt+Up, Alt+Down, Meta+Left, Ctrl+Home, Alt+PageDown", () => {
    for (const kind of KINDS) {
      const c = ctxOf(kind);
      expect(resolveViewerKeyAction(key("ArrowUp", { ctrlKey: true }), c)).toBeNull();
      expect(resolveViewerKeyAction(key("ArrowRight", { ctrlKey: true }), c)).toBeNull();
      expect(resolveViewerKeyAction(key("ArrowUp", { altKey: true }), c)).toBeNull();
      expect(resolveViewerKeyAction(key("ArrowDown", { altKey: true }), c)).toBeNull();
      expect(resolveViewerKeyAction(key("ArrowLeft", { metaKey: true }), c)).toBeNull();
      expect(resolveViewerKeyAction(key("Home", { ctrlKey: true }), c)).toBeNull();
      expect(resolveViewerKeyAction(key("PageDown", { altKey: true }), c)).toBeNull();
    }
  });

  it("Ctrl+Shift+Arrow is still not a scroll (Shift does not rescue a Ctrl combination)", () => {
    expect(resolveViewerKeyAction(key("ArrowDown", { ctrlKey: true, shiftKey: true }), ctxOf("text"))).toBeNull();
    expect(resolveViewerKeyAction(key("ArrowLeft", { metaKey: true, shiftKey: true }), ctxOf("text"))).toBeNull();
  });

  it("unchanged by the exclusion: Alt+Left / Alt+Right / Ctrl+PageUp / Ctrl+PageDown still navigate (R-490)", () => {
    const c = ctxOf("text");
    expect(resolveViewerKeyAction(key("ArrowLeft", { altKey: true }), c)).toEqual({ kind: "navigate", direction: "prev" });
    expect(resolveViewerKeyAction(key("ArrowRight", { altKey: true }), c)).toEqual({ kind: "navigate", direction: "next" });
    expect(resolveViewerKeyAction(key("PageUp", { ctrlKey: true }), c)).toEqual({ kind: "navigate", direction: "prev" });
    expect(resolveViewerKeyAction(key("PageDown", { ctrlKey: true }), c)).toEqual({ kind: "navigate", direction: "next" });
  });
});

describe("R-500-7 (承認後の追補): Shift changes the amount of the ARROW keys only", () => {
  it("Shift+PageUp / Shift+PageDown behave like PageUp / PageDown (one screen)", () => {
    for (const kind of KINDS) {
      expect(resolveViewerKeyAction(key("PageUp", { shiftKey: true }), ctxOf(kind))).toEqual({ kind: "page", direction: "up" });
      expect(resolveViewerKeyAction(key("PageDown", { shiftKey: true }), ctxOf(kind))).toEqual({ kind: "page", direction: "down" });
    }
  });

  it("Shift+Home / Shift+End behave like Home / End", () => {
    for (const kind of KINDS) {
      expect(resolveViewerKeyAction(key("Home", { shiftKey: true }), ctxOf(kind))).toEqual({ kind: "home" });
      expect(resolveViewerKeyAction(key("End", { shiftKey: true }), ctxOf(kind))).toEqual({ kind: "end" });
    }
  });

  it("the sign of a Shift+Arrow amount follows the direction, not the modifier (240 magnitude)", () => {
    const amounts = (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const).map((k) => {
      const r = resolveViewerKeyAction(key(k, { shiftKey: true }), ctxOf("text"));
      return r !== null && r.kind === "scroll" ? r.amount : NaN;
    });
    expect(amounts).toEqual([-240, 240, -240, 240]);
  });

  it("the axis is y for Up / Down and x for Left / Right", () => {
    const axis = (k: string) => {
      const r = resolveViewerKeyAction(key(k), ctxOf("text"));
      return r !== null && r.kind === "scroll" ? r.axis : null;
    };
    expect([axis("ArrowUp"), axis("ArrowDown"), axis("ArrowLeft"), axis("ArrowRight")]).toEqual(["y", "y", "x", "x"]);
  });
});

describe("R-500-6: Home / End in every content kind (image and error included)", () => {
  it("Home -> home, End -> end for text / markdown / image / error", () => {
    for (const kind of KINDS) {
      expect(resolveViewerKeyAction(key("Home"), ctxOf(kind))).toEqual({ kind: "home" });
      expect(resolveViewerKeyAction(key("End"), ctxOf(kind))).toEqual({ kind: "end" });
    }
  });
});

describe("R-500-9 / SPEC-0200-0001 §3.14.12-4(d): Ctrl+A selects the BODY only", () => {
  it("Ctrl+A (either letter case) resolves to select_all in every content kind", () => {
    for (const kind of KINDS) {
      expect(resolveViewerKeyAction(key("a", { ctrlKey: true }), ctxOf(kind))).toEqual({ kind: "select_all" });
      expect(resolveViewerKeyAction(key("A", { ctrlKey: true }), ctxOf(kind))).toEqual({ kind: "select_all" });
    }
  });

  it("plain 'a', Alt+A, Meta+A and Ctrl+Shift+A are not select_all", () => {
    expect(resolveViewerKeyAction(key("a"), ctxOf("text"))).toBeNull();
    expect(resolveViewerKeyAction(key("a", { altKey: true }), ctxOf("text"))).toBeNull();
    expect(resolveViewerKeyAction(key("a", { metaKey: true }), ctxOf("text"))).toBeNull();
    expect(resolveViewerKeyAction(key("a", { ctrlKey: true, shiftKey: true }), ctxOf("text"))).toBeNull();
  });

  it("R-502 / AC-503 is unchanged: Ctrl+A is NOT in the WebView-default suppression list (the handler preventDefault()s it itself)", () => {
    expect(shouldSuppressWebviewDefault(key("a", { ctrlKey: true }))).toBe(false);
  });

  it("selectAllTarget: text -> the code <pre>; Markdown Text mode -> the code <pre>; Markdown HTML mode -> the rendered HTML", () => {
    expect(selectAllTarget({ contentKind: "text" })).toBe("code");
    expect(selectAllTarget({ contentKind: "markdown", markdownMode: "text" })).toBe("code");
    expect(selectAllTarget({ contentKind: "markdown", markdownMode: "html" })).toBe("markdown-html");
  });

  it("selectAllTarget: image and error / no-body displays create no selection (null)", () => {
    expect(selectAllTarget({ contentKind: "image" })).toBeNull();
    expect(selectAllTarget({ contentKind: "error" })).toBeNull();
  });
});

describe("R-500-7 (E2E AC-516): the WebView's own scrolling is cancelled for modified scroll keys", () => {
  it("Alt+Up / Alt+Down / Ctrl+Home / Alt+PageDown / Meta+Left / Ctrl+Shift+Down are suppressed", () => {
    expect(shouldSuppressWebviewDefault(key("ArrowUp", { altKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("ArrowDown", { altKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("Home", { ctrlKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("PageDown", { altKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("ArrowLeft", { metaKey: true }))).toBe(true);
    expect(shouldSuppressWebviewDefault(key("ArrowDown", { ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("the navigations (Alt+Left / Alt+Right / Ctrl+PageUp / Ctrl+PageDown) are not in this list: the handler owns them", () => {
    expect(shouldSuppressWebviewDefault(key("ArrowLeft", { altKey: true }))).toBe(false);
    expect(shouldSuppressWebviewDefault(key("ArrowRight", { altKey: true }))).toBe(false);
    expect(shouldSuppressWebviewDefault(key("PageUp", { ctrlKey: true }))).toBe(false);
    expect(shouldSuppressWebviewDefault(key("PageDown", { ctrlKey: true }))).toBe(false);
  });

  it("unmodified and Shift-only scroll keys are not suppressed (they scroll through the viewer's own handler)", () => {
    for (const k of ["ArrowUp", "ArrowDown", "PageUp", "Home", "End"]) {
      expect(shouldSuppressWebviewDefault(key(k))).toBe(false);
      expect(shouldSuppressWebviewDefault(key(k, { shiftKey: true }))).toBe(false);
    }
  });
});
