import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0009 R-34-14; SPEC-0300-0010 §3.1 #9 (classification (c):
//   overlay-local key handling, not customizable via the keymap).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.5,
//   §3.6.11.11 SHOULD-123 (a LOCAL structural event type, mirroring
//   navigation-history/list-ops.ts's ListKeydownLikeEvent -- this module
//   must NOT import features/keyboard's KeydownLikeEvent, §4.1).
//
// Module under test (not yet implemented): ./sort-menu-keys.ts

import { resolveSortMenuKeyIntent } from "./sort-menu-keys";

function key(k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods };
}

describe("resolveSortMenuKeyIntent (SPEC-0300-0009 R-34-14)", () => {
  it("ArrowUp/ArrowDown resolve to move_up/move_down", () => {
    expect(resolveSortMenuKeyIntent(key("ArrowUp"))).toBe("move_up");
    expect(resolveSortMenuKeyIntent(key("ArrowDown"))).toBe("move_down");
  });

  it("Enter resolves to confirm", () => {
    expect(resolveSortMenuKeyIntent(key("Enter"))).toBe("confirm");
  });

  it("Escape resolves to cancel", () => {
    expect(resolveSortMenuKeyIntent(key("Escape"))).toBe("cancel");
  });

  it("Tab / Shift+Tab resolve to trap (R-14-11-3: no focus escape while an overlay is open)", () => {
    expect(resolveSortMenuKeyIntent(key("Tab"))).toBe("trap");
    expect(resolveSortMenuKeyIntent(key("Tab", { shiftKey: true }))).toBe("trap");
  });

  it("ArrowLeft/ArrowRight resolve to null (R-34-14: do nothing, highlight unchanged)", () => {
    expect(resolveSortMenuKeyIntent(key("ArrowLeft"))).toBeNull();
    expect(resolveSortMenuKeyIntent(key("ArrowRight"))).toBeNull();
  });

  it("an unrelated key resolves to null", () => {
    expect(resolveSortMenuKeyIntent(key("a"))).toBeNull();
  });

  it("does not import features/keyboard's KeydownLikeEvent -- a bare structural object works", () => {
    // If this module imported the real KeydownLikeEvent type and required a
    // class instance or a branded type, a plain literal like the one below
    // would fail type-checking; passing it here (and it resolving normally)
    // is itself the structural-typing assertion (see also
    // src/import-boundary.test.ts's static import-boundary checks).
    const plain = { key: "Enter", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    expect(resolveSortMenuKeyIntent(plain)).toBe("confirm");
  });
});
