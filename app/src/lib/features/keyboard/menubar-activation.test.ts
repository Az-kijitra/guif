import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0010 第16版 R-14-5-1 / §3.1 #13 (classification (a), fixed: F10 without modifiers, Alt+F/E/V/G; IME composition is
//   excluded), SPEC-0300-0020 R-1350 1 / 3, R-1350-2 (確定 T-06: a user binding of F10 / Alt+letter does not win).
//   Alt-alone (keyup) is on hold and is NOT part of this predicate.
// Architecture: SPEC-0200-0001 §3.14.1-3: the predicate is `features/keyboard/menubar-activation.ts` (the menu-bar feature may not be imported by
//   keyboard; the state machine itself stays in `features/menu-bar`), pure, same layer as `KeydownLikeEvent`.
//
// Contract assumed (reported to the implementer):
//   matchesMenuBarActivation(event: KeydownLikeEvent): "f10" | "access" | null
//     "f10"    : key "F10" with NO ctrl / alt / shift / meta
//     "access" : key f / e / v / g (either case) with alt ONLY (no ctrl / shift / meta)
//     null     : everything else, and anything while `isComposing === true` or `keyCode === 229`
//
// Module under test (not yet implemented): ./menubar-activation.ts

import { matchesMenuBarActivation } from "./menubar-activation";

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number }> = {},
) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("F10", () => {
  it("plain F10 -> f10", () => {
    expect(matchesMenuBarActivation(ev("F10"))).toBe("f10");
  });
  it("F10 with any modifier is not an activation", () => {
    for (const m of ["ctrlKey", "altKey", "shiftKey", "metaKey"] as const) {
      expect(matchesMenuBarActivation(ev("F10", { [m]: true })), m).toBeNull();
    }
  });
});

describe("Alt + access key (T-04: F / E / V / G)", () => {
  it.each(["f", "e", "v", "g", "F", "E", "V", "G"])("Alt+%s -> access", (k) => {
    expect(matchesMenuBarActivation(ev(k, { altKey: true }))).toBe("access");
  });

  it("other letters are not access keys (there is no ヘルプ menu, and no item access keys): Alt+H, Alt+Z, Alt+A, Alt+1", () => {
    for (const k of ["h", "z", "a", "1", "x"]) expect(matchesMenuBarActivation(ev(k, { altKey: true })), k).toBeNull();
  });

  it("Alt+letter with another modifier is not an activation: Ctrl+Alt+Z style combinations (and AltGr, which reports ctrl+alt) are left alone", () => {
    expect(matchesMenuBarActivation(ev("f", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(matchesMenuBarActivation(ev("f", { altKey: true, metaKey: true }))).toBeNull();
    expect(matchesMenuBarActivation(ev("z", { altKey: true, ctrlKey: true }))).toBeNull();
  });

  it("the letter without Alt is not an activation (plain F / E / V / G belong to the file list)", () => {
    for (const k of ["f", "e", "v", "g"]) expect(matchesMenuBarActivation(ev(k)), k).toBeNull();
  });
});

describe("IME composition (R-14-5-1): never an activation", () => {
  it("isComposing true", () => {
    expect(matchesMenuBarActivation(ev("F10", { isComposing: true }))).toBeNull();
    expect(matchesMenuBarActivation(ev("f", { altKey: true, isComposing: true }))).toBeNull();
  });
  it("keyCode 229", () => {
    expect(matchesMenuBarActivation(ev("F10", { keyCode: 229 }))).toBeNull();
    expect(matchesMenuBarActivation(ev("e", { altKey: true, keyCode: 229 }))).toBeNull();
  });
});

describe("unrelated keys", () => {
  it("Alt alone (keydown of Alt), F9, F11, Enter, Escape, ArrowDown are not activations", () => {
    for (const k of ["Alt", "F9", "F11", "Enter", "Escape", "ArrowDown", "Tab"]) expect(matchesMenuBarActivation(ev(k)), k).toBeNull();
    expect(matchesMenuBarActivation(ev("Alt", { altKey: true }))).toBeNull();
  });
});
