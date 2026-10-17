import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1551 (a registration's key is NOT used when it is: 1 a fixed key; 2 a key of the CURRENT keymap -- the §4.2 defaults with
//   `input_keymap_custom` applied (R-30) -- INCLUDING keys that the R-34 rescue match would send to an action, e.g. `Shift+S` while `sort_menu` is `S`;
//   [3 an earlier registration's key is the registry's job]; a comma list is judged per element), R-1503-1 / R-45-4-1 (the grammar of one element),
//   R-1512 + AC-1535 (the default four keys are free of all of that, so no notice appears on a plain install), AC-1532 (all four cases).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/keyboard/key-rules.ts`: `keyRules(customOverrides) -> { isValidKey, collides }`; `isValidKey` is the
//   element grammar (`isValidBindingElement`, exported from keymap-validate.ts: "no new grammar"); `collides` is true for a fixed key or when
//   `matchesAction` matches the key's own event against ANY action's CURRENT binding), §3.16.15 SHOULD-218 (the fixed keys are judged by passing a
//   synthesised event DIRECTLY through `matchesHardcodedShortcut` / `matchesMenuBarActivation`; the list `RESERVED_FIXED_KEYS` serves the four keys
//   without a predicate), MUST-86 (one grammar, one matcher).
//
// Contract assumed (reported to the implementer):
//   export function keyRules(customOverrides: Record<string, string>): { isValidKey(element: string): boolean; collides(element: string): boolean }
//   keymap-validate.ts additionally exports `isValidBindingElement(element: string): boolean` (the function that already exists, now exported).
//
// Module under test (not yet implemented): ./key-rules.ts

import { isValidBindingElement } from "./keymap-validate";
import { keyRules } from "./key-rules";

describe("isValidKey is the keymap's element grammar (no new grammar)", () => {
  const rules = keyRules({});

  it.each(["Ctrl+Alt+T", "Ctrl+Alt+Shift+G", "F9", "S", "Ctrl+Comma", "Ctrl+Plus", "ctrl+alt+t", "Alt+Space", "Meta+Z", "/"])("%s is valid", (k) => {
    expect(rules.isValidKey(k)).toBe(true);
  });

  it.each(["", "Bogus+X", "Ctrl+", "Ctrl+Ctrl+X", "Hyper+X", "Ctrl+Alt+NoSuchKey", "+", ",", "Ctrl++", "Ctrl+Alt+"])("%j is invalid", (k) => {
    expect(rules.isValidKey(k)).toBe(false);
  });

  it("gives the same answer as isValidBindingElement for every case (the same function underneath)", () => {
    for (const k of ["Ctrl+Alt+T", "", "Bogus+X", "F9", "Ctrl+Ctrl+X", "Alt+E", "Space"]) expect(rules.isValidKey(k), k).toBe(isValidBindingElement(k));
  });
});

describe("collides: the fixed keys (R-1551 1)", () => {
  const rules = keyRules({});

  it.each(["Ctrl+Q", "Ctrl+Comma", "Shift+Enter", "Shift+Delete", "Tab", "Shift+Tab", "F10", "Alt+F", "Alt+E", "Alt+V", "Alt+G"])("%s", (k) => {
    expect(rules.collides(k)).toBe(true);
  });

  it("a fixed key stays fixed when the keymap is customised so that no action uses it any more", () => {
    const r = keyRules({ exit: "F8", settings: "F7", open: "F3", delete: "F4" });
    for (const k of ["Ctrl+Q", "Ctrl+Comma", "Shift+Enter", "Shift+Delete", "Tab", "Shift+Tab"]) expect(r.collides(k), k).toBe(true);
  });

  it("the fixed keys are recognised in any spelling of the key string", () => {
    expect(rules.collides("ctrl+q")).toBe(true);
    expect(rules.collides("alt+e")).toBe(true);
    expect(rules.collides("CTRL+COMMA")).toBe(true);
  });
});

describe("collides: the current keymap (R-1551 2, R-34)", () => {
  it("AC-1532: the §4.2 defaults are taken (e.g. Ctrl+Alt+Z of zip_create, S of sort_menu, Ctrl+A, F2, Delete, /)", () => {
    const rules = keyRules({});
    for (const k of ["Ctrl+Alt+Z", "Ctrl+Alt+X", "S", "Ctrl+A", "F2", "Delete", "/", "Ctrl+C", "Ctrl+V", "Ctrl+Shift+B", "Enter", "Escape", "ArrowUp"]) {
      expect(rules.collides(k), k).toBe(true);
    }
  });

  it("AC-1532: the R-34 rescue counts -- while sort_menu is `S`, a registration's `Shift+S` is taken", () => {
    expect(keyRules({}).collides("Shift+S")).toBe(true);
    // ... but not once sort_menu has moved away
    expect(keyRules({ sort_menu: "F8" }).collides("Shift+S")).toBe(false);
    expect(keyRules({ sort_menu: "F8" }).collides("S")).toBe(false);
  });

  it("AC-1535 / R-1512: the four default registration keys collide with nothing", () => {
    const rules = keyRules({});
    for (const k of ["Ctrl+Alt+C", "Ctrl+Alt+V", "Ctrl+Alt+E", "Ctrl+Alt+Shift+G"]) expect(rules.collides(k), k).toBe(false);
  });

  it("AC-1532: a customised action takes its NEW key -- `sort_menu = Ctrl+Alt+C` makes the default terminal key unusable", () => {
    const rules = keyRules({ sort_menu: "Ctrl+Alt+C" });
    expect(rules.collides("Ctrl+Alt+C")).toBe(true);
    expect(rules.collides("Ctrl+Alt+V")).toBe(false);
  });

  it("R-1551 note: freeing a key by customising makes it usable -- `zip_create = Ctrl+Shift+Z` frees Ctrl+Alt+Z", () => {
    const rules = keyRules({ zip_create: "Ctrl+Shift+Z" });
    expect(rules.collides("Ctrl+Alt+Z")).toBe(false);
    expect(rules.collides("Ctrl+Shift+Z")).toBe(true);
  });

  it("a comma list in a custom binding takes every one of its elements", () => {
    const rules = keyRules({ search: "F6,Ctrl+Alt+K" });
    expect(rules.collides("F6")).toBe(true);
    expect(rules.collides("Ctrl+Alt+K")).toBe(true);
    expect(rules.collides("/")).toBe(false);
  });

  it("an action disabled with an empty string takes no key", () => {
    expect(keyRules({ zip_create: "" }).collides("Ctrl+Alt+Z")).toBe(false);
  });

  it("an unused, valid key is free", () => {
    const rules = keyRules({});
    for (const k of ["Ctrl+Alt+T", "F9", "Ctrl+Alt+Shift+K", "Alt+Shift+F9", "Ctrl+Alt+M"]) expect(rules.collides(k), k).toBe(false);
  });

  it("it is a pure function of the overrides: another call with other overrides is independent", () => {
    const a = keyRules({ sort_menu: "Ctrl+Alt+C" });
    const b = keyRules({});
    expect(a.collides("Ctrl+Alt+C")).toBe(true);
    expect(b.collides("Ctrl+Alt+C")).toBe(false);
  });
});
