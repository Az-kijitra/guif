import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1551 1 (the keys a registration may NOT use: the fixed keys of SPEC-0300-0010 §3.1 -- Ctrl+Q, Ctrl+, , Shift+Enter,
//   Shift+Delete, Tab, Shift+Tab and the menu bar's F10 / Alt+F / Alt+E / Alt+V / Alt+G; "the concrete list is made in the design"),
//   R-1512 (the default registration keys are none of them), SPEC-0300-0010 §3.1 (a) / #13, R-14-5-1, R-1350 3 (access keys are Alt + letter
//   WITHOUT Ctrl / Meta); AC-1532 (unit part).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/keyboard/fixed-keys.ts`: `RESERVED_FIXED_KEYS` -- "unit-tested against `matchesHardcodedShortcut` /
//   `matchesMenuBarActivation` so that a drift is detected"), §3.16.13 Q-5 (`Shift+Enter` / `Shift+Delete` are caught by the R-34 rescue match even
//   if `open` / `delete` are remapped, so they are listed explicitly), §3.16.15 SHOULD-218 (the key-string -> event inverse sits next to `eventKeyToken`
//   in keymap-resolve.ts: `keyStringToEvent`, tested in keymap-key-event.test.ts).
//
// Contract assumed (reported to the implementer):
//   export const RESERVED_FIXED_KEYS: readonly string[]     // normal-form key strings, exactly these 11, in this order:
//     ["Ctrl+Q", "Ctrl+Comma", "Shift+Enter", "Shift+Delete", "Tab", "Shift+Tab", "F10", "Alt+F", "Alt+E", "Alt+V", "Alt+G"]
//
// Module under test (not yet implemented): ./fixed-keys.ts

import { DEFAULT_KEYMAP } from "./keymap-defaults";
import { matchesHardcodedShortcut, resolveActionForKey } from "./key-dispatch";
import { RESERVED_FIXED_KEYS } from "./fixed-keys";
import { matchesAction, normalizeKeyString, type KeydownLikeEvent } from "./keymap-resolve";
import { matchesMenuBarActivation } from "./menubar-activation";

const EXPECTED = ["Ctrl+Q", "Ctrl+Comma", "Shift+Enter", "Shift+Delete", "Tab", "Shift+Tab", "F10", "Alt+F", "Alt+E", "Alt+V", "Alt+G"];

const ev = (key: string, mods: Partial<Pick<KeydownLikeEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">> = {}): KeydownLikeEvent => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("the list", () => {
  it("is exactly the eleven fixed keys of R-1551 1", () => {
    expect([...RESERVED_FIXED_KEYS]).toEqual(EXPECTED);
  });

  it("is written in the normal form of keymap-resolve (so it can be compared with the registrations' keys)", () => {
    for (const k of RESERVED_FIXED_KEYS) expect(normalizeKeyString(k), k).toBe(k);
  });

  it("has no duplicates", () => {
    expect(new Set(RESERVED_FIXED_KEYS).size).toBe(RESERVED_FIXED_KEYS.length);
  });
});

describe("agreement with the real predicates (a drift is detected)", () => {
  it("Ctrl+Q and Ctrl+, are the hard-coded shortcuts", () => {
    expect(matchesHardcodedShortcut(ev("q", { ctrlKey: true }))).toBe("exit");
    expect(matchesHardcodedShortcut(ev(",", { ctrlKey: true }))).toBe("settings");
    expect(RESERVED_FIXED_KEYS).toContain("Ctrl+Q");
    expect(RESERVED_FIXED_KEYS).toContain("Ctrl+Comma");
  });

  it("F10 and Alt+F/E/V/G are the menu bar's activation keys", () => {
    expect(matchesMenuBarActivation(ev("F10"))).toBe("f10");
    for (const letter of ["f", "e", "v", "g"]) {
      expect(matchesMenuBarActivation(ev(letter, { altKey: true })), letter).toBe("access");
      expect(RESERVED_FIXED_KEYS).toContain(`Alt+${letter.toUpperCase()}`);
    }
    expect(RESERVED_FIXED_KEYS).toContain("F10");
  });

  it("R-1512: Ctrl+Alt+E / Ctrl+Alt+V / Ctrl+Alt+Shift+G are NOT access keys (Ctrl or Meta make it an ordinary key)", () => {
    expect(matchesMenuBarActivation(ev("e", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(matchesMenuBarActivation(ev("v", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(matchesMenuBarActivation(ev("g", { ctrlKey: true, altKey: true, shiftKey: true }))).toBeNull();
    for (const k of ["Ctrl+Alt+C", "Ctrl+Alt+V", "Ctrl+Alt+E", "Ctrl+Alt+Shift+G"]) expect(RESERVED_FIXED_KEYS).not.toContain(k);
  });

  it("Shift+Enter and Shift+Delete are caught by the R-34 rescue of `open` / `delete` by default -- and listed so a remap does not free them", () => {
    expect(resolveActionForKey(ev("Enter", { shiftKey: true }), {})).toBe("open");
    expect(resolveActionForKey(ev("Delete", { shiftKey: true }), {})).toBe("delete");
    expect(RESERVED_FIXED_KEYS).toContain("Shift+Enter");
    expect(RESERVED_FIXED_KEYS).toContain("Shift+Delete");
    // after a remap the action no longer matches, but the key stays fixed (Q-5)
    expect(resolveActionForKey(ev("Enter", { shiftKey: true }), { open: "F3" })).not.toBe("open");
  });

  it("Tab and Shift+Tab are the tab-stop keys", () => {
    expect(RESERVED_FIXED_KEYS).toContain("Tab");
    expect(RESERVED_FIXED_KEYS).toContain("Shift+Tab");
  });

  it("every default registration key (R-1510) is free of the list and of the default keymap", () => {
    const defaults = ["Ctrl+Alt+C", "Ctrl+Alt+V", "Ctrl+Alt+E", "Ctrl+Alt+Shift+G"];
    for (const d of defaults) {
      expect(RESERVED_FIXED_KEYS).not.toContain(d);
      for (const [action, binding] of Object.entries(DEFAULT_KEYMAP)) {
        const taken = binding.split(",").map((b) => normalizeKeyString(b.trim()));
        expect(taken, `${d} vs ${action}`).not.toContain(normalizeKeyString(d));
      }
    }
  });
});

describe("completeness: every key either predicate accepts is in the list (a new fixed key cannot be forgotten)", () => {
  const BODIES = [
    ..."abcdefghijklmnopqrstuvwxyz".split(""),
    ..."0123456789".split(""),
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    ",", "+", " ", "Tab", "Enter", "Escape", "Delete", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  ];
  const token = (key: string): string => (key === " " ? "Space" : key === "," ? "Comma" : key === "+" ? "Plus" : key.length === 1 ? key.toUpperCase() : key);

  it("over every key x every modifier subset", () => {
    const missing: string[] = [];
    for (const key of BODIES) {
      for (let bits = 0; bits < 16; bits++) {
        const mods = { ctrlKey: !!(bits & 1), altKey: !!(bits & 2), shiftKey: !!(bits & 4), metaKey: !!(bits & 8) };
        const e = ev(key, mods);
        if (matchesHardcodedShortcut(e) === null && matchesMenuBarActivation(e) === null) continue;
        const normal = [mods.ctrlKey ? "Ctrl" : "", mods.altKey ? "Alt" : "", mods.shiftKey ? "Shift" : "", mods.metaKey ? "Meta" : "", token(key)].filter(Boolean).join("+");
        if (!RESERVED_FIXED_KEYS.includes(normal)) missing.push(normal);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the list entries that have a predicate are really matched by it (no stale entries)", () => {
    const withPredicate = ["Ctrl+Q", "Ctrl+Comma", "F10", "Alt+F", "Alt+E", "Alt+V", "Alt+G"];
    for (const k of withPredicate) {
      expect(matchesAction(ev(k.split("+").pop()!.replace("Comma", ","), { ctrlKey: k.startsWith("Ctrl"), altKey: k.startsWith("Alt") }), [k]), k).toBe(true);
    }
  });
});
