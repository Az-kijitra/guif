import { describe, expect, it, vi } from "vitest";
import { attachContextMenuGuard, isEditableTarget } from "./contextmenu-guard";

// Spec: SPEC-0300-0018 R-1010 (no WebView menu except in input fields), R-1011
//   (input fields: path bar, search input, dialog inputs keep the native menu),
//   R-1012 (one global guard, input fields excluded), R-1013 (viewer window too),
//   AC-1010, AC-1012.
// Architecture: SPEC-0200-0001 §3.9.9 (isEditableTarget pure; attach on a
//   document with a capture listener; returns an unsubscribe).
// Module under test (stub): ./contextmenu-guard.ts

describe("isEditableTarget (AC-1010 / AC-1012)", () => {
  it("text-like inputs and textarea are editable", () => {
    for (const type of ["text", "search", "url", "tel", "email", "password", "number"]) {
      expect(isEditableTarget({ tagName: "INPUT", type }), type).toBe(true);
    }
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
  });

  it("an input with no type (defaults to text) is editable; tag name case does not matter", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "input", type: "TEXT" })).toBe(true);
  });

  it("contenteditable elements are editable", () => {
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("checkbox / radio / button / range / file inputs are NOT editable", () => {
    for (const type of ["checkbox", "radio", "button", "submit", "range", "file", "color"]) {
      expect(isEditableTarget({ tagName: "INPUT", type }), type).toBe(false);
    }
  });

  it("div, button, span, null are not editable", () => {
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget({ tagName: "SPAN", isContentEditable: false })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({})).toBe(false);
  });
});

function fakeDoc() {
  const listeners: Array<{ type: string; handler: (e: unknown) => void; options: unknown }> = [];
  const doc = {
    addEventListener: vi.fn((type: string, handler: (e: unknown) => void, options?: unknown) => {
      listeners.push({ type, handler, options });
    }),
    removeEventListener: vi.fn((type: string, handler: (e: unknown) => void) => {
      const i = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (i >= 0) listeners.splice(i, 1);
    }),
  };
  return { doc: doc as unknown as Parameters<typeof attachContextMenuGuard>[0], listeners, raw: doc };
}

describe("attachContextMenuGuard (R-1012, R-1013)", () => {
  it("subscribes to `contextmenu` once, in the capture phase", () => {
    const { doc, raw } = fakeDoc();
    attachContextMenuGuard(doc);
    expect(raw.addEventListener).toHaveBeenCalledTimes(1);
    const [type, , options] = raw.addEventListener.mock.calls[0];
    expect(type).toBe("contextmenu");
    const capture = options === true || (typeof options === "object" && options !== null && (options as { capture?: boolean }).capture === true);
    expect(capture).toBe(true);
  });

  it("calls preventDefault for non-input targets (div, list row, status bar, menu itself)", () => {
    const { doc, listeners } = fakeDoc();
    attachContextMenuGuard(doc);
    for (const target of [{ tagName: "DIV" }, { tagName: "BUTTON" }, { tagName: "INPUT", type: "checkbox" }]) {
      const preventDefault = vi.fn();
      listeners[0].handler({ target, preventDefault });
      expect(preventDefault, JSON.stringify(target)).toHaveBeenCalledTimes(1);
    }
  });

  it("does NOT preventDefault for input fields (native cut / copy / paste menu stays)", () => {
    const { doc, listeners } = fakeDoc();
    attachContextMenuGuard(doc);
    for (const target of [
      { tagName: "INPUT", type: "text" },
      { tagName: "INPUT", type: "search" },
      { tagName: "TEXTAREA" },
    ]) {
      const preventDefault = vi.fn();
      listeners[0].handler({ target, preventDefault });
      expect(preventDefault, JSON.stringify(target)).not.toHaveBeenCalled();
    }
  });

  it("a null target is prevented (nothing editable)", () => {
    const { doc, listeners } = fakeDoc();
    attachContextMenuGuard(doc);
    const preventDefault = vi.fn();
    listeners[0].handler({ target: null, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("returns an unsubscribe that removes the very same handler", () => {
    const { doc, listeners, raw } = fakeDoc();
    const off = attachContextMenuGuard(doc);
    const handler = listeners[0].handler;
    off();
    expect(raw.removeEventListener).toHaveBeenCalledTimes(1);
    expect(raw.removeEventListener.mock.calls[0][0]).toBe("contextmenu");
    expect(raw.removeEventListener.mock.calls[0][1]).toBe(handler);
    expect(listeners).toHaveLength(0);
  });
});
