import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0014 R-305 / R-305-1 (zip_create = Ctrl+Alt+Z, zip_extract =
//   Ctrl+Alt+X; the value is owned by SPEC-0300-0010 §4.2 #33 / #34 and is NOT
//   changed by Phase 5), R-305-2 (the two default keys do not cross-match; the
//   vim profile is gone so `Z` / `Shift+Z` are not defaults), R-306-1 /
//   SPEC-0300-0010 R-14-2 (checked elsewhere), AC-45 (key -> action id).
//   SPEC-0300-0010 第9版 (区分 P5): the actions are DEFINED (34 ids) and the
//   defaults exist already; Phase 5 only implements what they do.
// Architecture: SPEC-0200-0001 §3.4.11-E (keymap / key-dispatch / overlay-wiring
//   are NOT changed for Phase 5: `keymap-defaults.ts` already has both ids).
// Modules under test (existing, regression guard): ./keymap-defaults.ts,
//   ./keymap-resolve.ts. This file is GREEN before and after the Phase 5
//   implementation; it fails only if someone changes the assignment.

import { ACTION_IDS, DEFAULT_KEYMAP } from "./keymap-defaults";
import { matchesAction, resolveBinding } from "./keymap-resolve";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

const bindingsOf = (actionId: string, custom: Record<string, string> = {}) =>
  resolveBinding({ customOverrides: custom, actionId, defaultBinding: DEFAULT_KEYMAP[actionId] });

describe("zip actions in the default keymap (SPEC-0300-0010 §4.2 #33 / #34)", () => {
  it("both ids are part of the action set", () => {
    expect(ACTION_IDS).toContain("zip_create");
    expect(ACTION_IDS).toContain("zip_extract");
  });

  it("R-305-1: zip_create = Ctrl+Alt+Z, zip_extract = Ctrl+Alt+X", () => {
    expect(DEFAULT_KEYMAP.zip_create).toBe("Ctrl+Alt+Z");
    expect(DEFAULT_KEYMAP.zip_extract).toBe("Ctrl+Alt+X");
  });

  it("AC-45: Ctrl+Alt+Z matches zip_create and Ctrl+Alt+X matches zip_extract", () => {
    expect(matchesAction(key("z", { ctrlKey: true, altKey: true }), bindingsOf("zip_create"))).toBe(true);
    expect(matchesAction(key("x", { ctrlKey: true, altKey: true }), bindingsOf("zip_extract"))).toBe(true);
    expect(matchesAction(key("Z", { ctrlKey: true, altKey: true }), bindingsOf("zip_create"))).toBe(true);
  });

  it("R-305-2: the two default keys do not cross-match", () => {
    expect(matchesAction(key("z", { ctrlKey: true, altKey: true }), bindingsOf("zip_extract"))).toBe(false);
    expect(matchesAction(key("x", { ctrlKey: true, altKey: true }), bindingsOf("zip_create"))).toBe(false);
  });

  it("R-305-2 / ISS-0102: there are no `Z` / `Shift+Z` defaults (vim profile abolished): a bare or Shift-only Z matches neither action", () => {
    for (const ev of [key("z"), key("Z", { shiftKey: true })]) {
      expect(matchesAction(ev, bindingsOf("zip_create"))).toBe(false);
      expect(matchesAction(ev, bindingsOf("zip_extract"))).toBe(false);
    }
  });

  it("no other action shares either ZIP key (a key press fires exactly one action)", () => {
    const users = (binding: string) => Object.entries(DEFAULT_KEYMAP).filter(([, v]) => v === binding).map(([k]) => k);
    expect(users("Ctrl+Alt+Z")).toEqual(["zip_create"]);
    expect(users("Ctrl+Alt+X")).toEqual(["zip_extract"]);
  });

  it("R-30 (custom override) still applies to the zip actions: an empty override disables, a custom key replaces the default", () => {
    expect(bindingsOf("zip_create", { zip_create: "" })).toEqual([]);
    expect(bindingsOf("zip_extract", { zip_extract: "Ctrl+Alt+E" })).toEqual(["Ctrl+Alt+E"]);
  });
});
