import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0011 R-42-2 (Escape cancels the progress modal), R-55/R-35
//   (confirm dialogs default to the safe side: Enter must not run a
//   destructive action by itself), R-61 (Enter confirms / Escape cancels the
//   rename dialog), R-13 / SPEC-0300-0010 R-13, R-16-2, §3.1 classification
//   (c), AC-56 (overlay-local keys are independent of the keymap),
//   AC-30/AC-40 (default focus = cancel).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.2 (key
//   table), §3.3.13-6 (SHOULD-77: isComposing => every key is null; nextFocusIndex
//   resolves current=-1), §3.3.13-4 (placed at shared/modal-keys.ts).
// Module under test (not yet implemented): ./modal-keys.ts
//
// Contract assumed by these tests (see the handback report):
//   resolveModalKeyIntent(event, kind) -> "cancel" | "submit" | "focus_next" |
//     "focus_prev" | null
//   kind: "confirm" | "form" | "progress"
//   nextFocusIndex(current, count, dir) with dir: "next" | "prev"
// Fixed key judgment only: the function takes no keymap input, so custom
// keymap overrides cannot influence it (AC-56).

import { nextFocusIndex, resolveModalKeyIntent } from "./modal-keys";

type Kind = "confirm" | "form" | "progress";

function ev(
  key: string,
  mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing", boolean>> = {},
) {
  return { key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, ...mods };
}

const KINDS: Kind[] = ["confirm", "form", "progress"];

describe("Escape (R-42-2, R-61, R-16-2)", () => {
  it.each(KINDS)("Escape => cancel for kind=%s", (kind) => {
    expect(resolveModalKeyIntent(ev("Escape"), kind)).toBe("cancel");
  });
});

describe("Enter (R-61, R-35, AC-30/AC-40)", () => {
  it("form: Enter => submit", () => {
    expect(resolveModalKeyIntent(ev("Enter"), "form")).toBe("submit");
  });

  it("confirm: Enter => null (left to the focused button's native click; default focus is cancel so Enter alone never runs a destructive action)", () => {
    expect(resolveModalKeyIntent(ev("Enter"), "confirm")).toBeNull();
  });

  it("progress: Enter => null (native click of the focused cancel button)", () => {
    expect(resolveModalKeyIntent(ev("Enter"), "progress")).toBeNull();
  });
});

describe("Tab / Shift+Tab (focus trap, §3.3.2)", () => {
  it.each(KINDS)("Tab => focus_next for kind=%s", (kind) => {
    expect(resolveModalKeyIntent(ev("Tab"), kind)).toBe("focus_next");
  });

  it.each(KINDS)("Shift+Tab => focus_prev for kind=%s", (kind) => {
    expect(resolveModalKeyIntent(ev("Tab", { shiftKey: true }), kind)).toBe("focus_prev");
  });
});

describe("Arrow keys (ISS-0044-a provisional default, §3.3.2/§3.3.11-E)", () => {
  it("confirm: ArrowLeft / ArrowUp => focus_prev", () => {
    expect(resolveModalKeyIntent(ev("ArrowLeft"), "confirm")).toBe("focus_prev");
    expect(resolveModalKeyIntent(ev("ArrowUp"), "confirm")).toBe("focus_prev");
  });

  it("confirm: ArrowRight / ArrowDown => focus_next", () => {
    expect(resolveModalKeyIntent(ev("ArrowRight"), "confirm")).toBe("focus_next");
    expect(resolveModalKeyIntent(ev("ArrowDown"), "confirm")).toBe("focus_next");
  });

  it.each(["form", "progress"] as Kind[])("kind=%s: arrows => null (do not steal the text caret / no other buttons)", (kind) => {
    for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(resolveModalKeyIntent(ev(k), kind)).toBeNull();
    }
  });
});

describe("IME composition (SHOULD-78: matchesSearchInputAction-style guard)", () => {
  it.each(KINDS)("kind=%s: every key is null while isComposing", (kind) => {
    for (const k of ["Escape", "Enter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a"]) {
      expect(resolveModalKeyIntent(ev(k, { isComposing: true }), kind)).toBeNull();
    }
    expect(resolveModalKeyIntent(ev("Tab", { shiftKey: true, isComposing: true }), kind)).toBeNull();
  });

  it("form: Escape during composition does not close the dialog (only cancels the conversion)", () => {
    expect(resolveModalKeyIntent(ev("Escape", { isComposing: true }), "form")).toBeNull();
  });

  it("form: Enter during composition does not submit (IME commit)", () => {
    expect(resolveModalKeyIntent(ev("Enter", { isComposing: true }), "form")).toBeNull();
  });
});

describe("modifier keys (§3.3.2: Ctrl/Alt/Meta => always null; Shift only allowed on Tab)", () => {
  it.each(KINDS)("kind=%s: Ctrl/Alt/Meta + Escape/Enter/Tab/arrows are null", (kind) => {
    for (const mod of ["ctrlKey", "altKey", "metaKey"] as const) {
      for (const k of ["Escape", "Enter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        expect(resolveModalKeyIntent(ev(k, { [mod]: true }), kind)).toBeNull();
      }
    }
  });

  it("Ctrl+C / Ctrl+V / Ctrl+A in the form fall through (input-field default behavior)", () => {
    for (const k of ["c", "v", "a", "x"]) {
      expect(resolveModalKeyIntent(ev(k, { ctrlKey: true }), "form")).toBeNull();
    }
  });

  it.each(KINDS)("kind=%s: Shift+Enter and Shift+Escape are null", (kind) => {
    expect(resolveModalKeyIntent(ev("Enter", { shiftKey: true }), kind)).toBeNull();
    expect(resolveModalKeyIntent(ev("Escape", { shiftKey: true }), kind)).toBeNull();
  });

  it("Ctrl+Shift+Tab is null (modifiers other than Shift on Tab are not allowed)", () => {
    expect(resolveModalKeyIntent(ev("Tab", { ctrlKey: true, shiftKey: true }), "confirm")).toBeNull();
  });
});

describe("other keys", () => {
  it.each(KINDS)("kind=%s: ordinary characters, Delete, F-keys, Space are null (typed into the input / ignored)", (kind) => {
    for (const k of ["a", "Q", "j", "Delete", "F2", " ", "Backspace"]) {
      expect(resolveModalKeyIntent(ev(k), kind)).toBeNull();
    }
  });
});

describe("AC-56: independent of the custom keymap", () => {
  it("resolveModalKeyIntent takes exactly (event, kind): no keymap parameter exists to influence it", () => {
    expect(resolveModalKeyIntent.length).toBe(2);
  });
});

describe("nextFocusIndex (§3.3.13-6: resolves current=-1 to the first/last element)", () => {
  it("next advances by one", () => {
    expect(nextFocusIndex(0, 3, "next")).toBe(1);
    expect(nextFocusIndex(1, 3, "next")).toBe(2);
  });

  it("next wraps from the last to the first", () => {
    expect(nextFocusIndex(2, 3, "next")).toBe(0);
  });

  it("prev moves back by one", () => {
    expect(nextFocusIndex(2, 3, "prev")).toBe(1);
    expect(nextFocusIndex(1, 3, "prev")).toBe(0);
  });

  it("prev wraps from the first to the last", () => {
    expect(nextFocusIndex(0, 3, "prev")).toBe(2);
  });

  it("current=-1 (focus is outside the dialog): next => first (0)", () => {
    expect(nextFocusIndex(-1, 3, "next")).toBe(0);
  });

  it("current=-1: prev => last (count-1)", () => {
    expect(nextFocusIndex(-1, 3, "prev")).toBe(2);
  });

  it("a single focusable element stays put", () => {
    expect(nextFocusIndex(0, 1, "next")).toBe(0);
    expect(nextFocusIndex(0, 1, "prev")).toBe(0);
    expect(nextFocusIndex(-1, 1, "next")).toBe(0);
    expect(nextFocusIndex(-1, 1, "prev")).toBe(0);
  });

  it("count=0 (nothing focusable) => -1 (no target)", () => {
    expect(nextFocusIndex(-1, 0, "next")).toBe(-1);
    expect(nextFocusIndex(0, 0, "prev")).toBe(-1);
  });
});
