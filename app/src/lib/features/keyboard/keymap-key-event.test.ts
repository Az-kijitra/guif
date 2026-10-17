import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1551 2 (a registration key is compared with the CURRENT keymap including the R-34 rescue match, e.g. `sort_menu` = `S`
//   makes a registration's `Shift+S` unusable), SPEC-0300-0010 R-33 / R-34 (the normal form and the rescue match -- reused, never copied).
// Architecture: SPEC-0200-0001 §3.16.6 (`keyRules.collides` "builds an event from the key string and matches it with `matchesAction`; the matcher is not
//   duplicated"), §3.16.15 SHOULD-218 (the key-string -> `KeydownLikeEvent` inverse sits next to `eventKeyToken` in `keymap-resolve.ts`, and a round-trip test
//   fixes it).
//
// Contract assumed (reported to the implementer):
//   export function keyStringToEvent(key: string): KeydownLikeEvent      // key = ONE comma element in the keymap grammar (R-45-4-1), any case of the
//                                                                        // modifier / body names; modifiers -> ctrlKey / altKey / shiftKey / metaKey;
//                                                                        // body: `Comma` -> ",", `Plus` -> "+", `Space` -> " ", names as they are,
//                                                                        // a single character as it is. isComposing is not set.
//   Round trip: matchesAction(keyStringToEvent(k), [k]) === true for every valid k, and eventKeyToken / normalizeKeyString stay the single source.
//
// Module under test (not yet implemented): ./keymap-resolve.ts (new export)

import { resolveActionForKey } from "./key-dispatch";
import { DEFAULT_KEYMAP } from "./keymap-defaults";
import { keyStringToEvent, matchesAction, normalizeKeyString } from "./keymap-resolve";

describe("keyStringToEvent: the fields", () => {
  it.each([
    ["Ctrl+Alt+C", { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }],
    ["Ctrl+Alt+Shift+G", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: false }],
    ["Alt+E", { ctrlKey: false, altKey: true, shiftKey: false, metaKey: false }],
    ["Shift+Enter", { ctrlKey: false, altKey: false, shiftKey: true, metaKey: false }],
    ["Meta+X", { ctrlKey: false, altKey: false, shiftKey: false, metaKey: true }],
    ["F10", { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }],
    ["Tab", { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }],
  ] as const)("%s -> modifiers %o", (key, mods) => {
    expect(keyStringToEvent(key)).toMatchObject(mods);
  });

  it("the key body: names as they are, Comma / Plus / Space as the characters, a letter as a letter", () => {
    expect(keyStringToEvent("F10").key).toBe("F10");
    expect(keyStringToEvent("Shift+Enter").key).toBe("Enter");
    expect(keyStringToEvent("Delete").key).toBe("Delete");
    expect(keyStringToEvent("ArrowUp").key).toBe("ArrowUp");
    expect(keyStringToEvent("Ctrl+Comma").key).toBe(",");
    expect(keyStringToEvent("Ctrl+Plus").key).toBe("+");
    expect(keyStringToEvent("Space").key).toBe(" ");
    expect(keyStringToEvent("Ctrl+Q").key.toUpperCase()).toBe("Q");
    expect(keyStringToEvent("/").key).toBe("/");
  });

  it("modifier and body names are case-insensitive like the keymap grammar", () => {
    expect(keyStringToEvent("ctrl+alt+t")).toMatchObject({ ctrlKey: true, altKey: true, shiftKey: false });
    expect(keyStringToEvent("CTRL+SHIFT+tab")).toMatchObject({ ctrlKey: true, shiftKey: true, key: "Tab" });
  });

  it("is a composing-free event", () => {
    expect(keyStringToEvent("Ctrl+Alt+C").isComposing).not.toBe(true);
  });
});

describe("round trip with matchesAction (the matcher is the real one)", () => {
  const KEYS = [
    "Ctrl+Alt+C", "Ctrl+Alt+V", "Ctrl+Alt+E", "Ctrl+Alt+Shift+G", "Ctrl+Q", "Ctrl+Comma", "Ctrl+Plus", "Shift+Enter", "Shift+Delete", "Tab", "Shift+Tab",
    "F1", "F10", "F12", "Alt+F", "Alt+E", "Alt+V", "Alt+G", "S", "Shift+S", "/", "Space", "Ctrl+Shift+B", "Escape", "ArrowUp", "PageDown", "Backspace",
    "Meta+Z", "Ctrl+Alt+Meta+X", "Z", "9",
  ];

  it.each(KEYS)("%s matches its own event", (k) => {
    expect(matchesAction(keyStringToEvent(k), [k])).toBe(true);
  });

  it.each(KEYS)("%s: the normal form is stable", (k) => {
    expect(normalizeKeyString(k)).toBe(k);
  });

  it("an event built from a key string does not match a different key", () => {
    expect(matchesAction(keyStringToEvent("Ctrl+Alt+C"), ["Ctrl+Alt+V"])).toBe(false);
    expect(matchesAction(keyStringToEvent("Ctrl+Alt+C"), ["Ctrl+C"])).toBe(false);
  });

  it("every binding of the default keymap resolves back to its own action (nothing is lost by the conversion)", () => {
    for (const [action, binding] of Object.entries(DEFAULT_KEYMAP)) {
      for (const one of binding.split(",").map((s) => s.trim()).filter((s) => s !== "")) {
        expect(resolveActionForKey(keyStringToEvent(one), {}), `${action}: ${one}`).toBe(action);
      }
    }
  });

  it("the R-34 rescue works through the conversion: Shift+S is caught by the `sort_menu` = S binding", () => {
    expect(resolveActionForKey(keyStringToEvent("Shift+S"), {})).toBe("sort_menu");
  });
});
