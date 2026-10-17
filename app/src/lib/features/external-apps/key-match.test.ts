import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1550 (a registration's key starts that registration; the matching rule is the keymap's own: R-33
//   normalisation, R-34 rescue, comma lists -- supplied here by INJECTION), R-1506 (config order: the first matching registration wins),
//   R-1551 (a registration without usable keys never matches), R-1549 (the key repeat is the WIRING's business: this function only says
//   which registration a key belongs to), AC-1537 (unit part).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/key-match.ts`: `matchExternalAppKey(event, entries, matches) -> index | null`,
//   `matches = matchesAction` is injected; `isComposing` => null); no import of `features/keyboard` (feature boundary).
//
// Contract assumed (reported to the implementer):
//   matchExternalAppKey(
//     event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing?: boolean; keyCode?: number; repeat?: boolean },
//     entries: readonly { index: number; keys: readonly string[] }[],
//     matches: (event, bindings: readonly string[]) => boolean,
//   ): number | null                       // the `index` of the first entry whose keys match, else null
//
// Module under test (not yet implemented): ./key-match.ts

import { matchExternalAppKey } from "./key-match";

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number; repeat: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

// A stand-in for keyboard's matchesAction: compares "Ctrl+Alt+Shift+X" built from the event with the bindings (no rescue rule needed here).
const token = (e: ReturnType<typeof ev>): string =>
  [e.ctrlKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : "", e.metaKey ? "Meta" : "", e.key.length === 1 ? e.key.toUpperCase() : e.key]
    .filter(Boolean)
    .join("+");
const matches = (e: ReturnType<typeof ev>, bindings: readonly string[]): boolean => bindings.includes(token(e));

const ENTRIES = [
  { index: 0, keys: ["Ctrl+Alt+C"] },
  { index: 1, keys: ["Ctrl+Alt+V"] },
  { index: 2, keys: ["Ctrl+Alt+E", "F9"] },
  { index: 3, keys: ["Ctrl+Alt+Shift+G"] },
];

describe("matchExternalAppKey (R-1550)", () => {
  it("returns the index of the registration whose key is pressed", () => {
    expect(matchExternalAppKey(ev("c", { ctrlKey: true, altKey: true }), ENTRIES, matches)).toBe(0);
    expect(matchExternalAppKey(ev("v", { ctrlKey: true, altKey: true }), ENTRIES, matches)).toBe(1);
    expect(matchExternalAppKey(ev("g", { ctrlKey: true, altKey: true, shiftKey: true }), ENTRIES, matches)).toBe(3);
  });

  it("every element of a comma list belongs to the same registration", () => {
    expect(matchExternalAppKey(ev("e", { ctrlKey: true, altKey: true }), ENTRIES, matches)).toBe(2);
    expect(matchExternalAppKey(ev("F9"), ENTRIES, matches)).toBe(2);
  });

  it("returns the entry's own `index`, not its position (the list may have been filtered)", () => {
    const entries = [{ index: 7, keys: ["F9"] }, { index: 3, keys: ["F10x"] }];
    expect(matchExternalAppKey(ev("F9"), entries, matches)).toBe(7);
    expect(matchExternalAppKey(ev("F10x"), entries, matches)).toBe(3);
  });

  it("a key nobody registered is null", () => {
    expect(matchExternalAppKey(ev("x", { ctrlKey: true }), ENTRIES, matches)).toBeNull();
    expect(matchExternalAppKey(ev("c", { ctrlKey: true }), ENTRIES, matches)).toBeNull();
    expect(matchExternalAppKey(ev("c"), ENTRIES, matches)).toBeNull();
  });

  it("no registrations / registrations without usable keys never match", () => {
    expect(matchExternalAppKey(ev("c", { ctrlKey: true, altKey: true }), [], matches)).toBeNull();
    expect(matchExternalAppKey(ev("c", { ctrlKey: true, altKey: true }), [{ index: 0, keys: [] }], matches)).toBeNull();
  });

  it("the first registration (config order) wins when two list the same key", () => {
    const entries = [{ index: 4, keys: ["F9"] }, { index: 5, keys: ["F9"] }];
    expect(matchExternalAppKey(ev("F9"), entries, matches)).toBe(4);
  });

  it("the matching rule is the injected one: it receives the event and the entry's keys", () => {
    const spy = vi.fn(() => false);
    const e = ev("c", { ctrlKey: true, altKey: true });
    matchExternalAppKey(e, [{ index: 0, keys: ["A", "B"] }, { index: 1, keys: ["C"] }], spy);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, e, ["A", "B"]);
    expect(spy).toHaveBeenNthCalledWith(2, e, ["C"]);
  });

  it("an entry without keys is not even offered to the matcher", () => {
    const spy = vi.fn(() => true);
    expect(matchExternalAppKey(ev("c"), [{ index: 0, keys: [] }], spy)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("IME composition", () => {
  it("is never a match, even for a key that would match", () => {
    expect(matchExternalAppKey(ev("c", { ctrlKey: true, altKey: true, isComposing: true }), ENTRIES, matches)).toBeNull();
  });

  it("keyCode 229 (the legacy IME marker) is never a match either", () => {
    expect(matchExternalAppKey(ev("c", { ctrlKey: true, altKey: true, keyCode: 229 }), ENTRIES, matches)).toBeNull();
  });

  it("the matcher is not consulted while composing", () => {
    const spy = vi.fn(() => true);
    matchExternalAppKey(ev("c", { isComposing: true }), ENTRIES, spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("the key repeat is not decided here (R-1549: the wiring swallows it)", () => {
  it("a repeating keydown still names its registration", () => {
    expect(matchExternalAppKey(ev("c", { ctrlKey: true, altKey: true, repeat: true }), ENTRIES, matches)).toBe(0);
  });
});
