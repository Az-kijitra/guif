import { describe, expect, it } from "vitest";
import { matchesAction, normalizeKeyString, resolveBinding } from "./keymap-resolve";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail) §5
// Module under test (not yet implemented): ./keymap-resolve.ts
//
// R-30: custom override (input_keymap_custom) takes precedence over the profile default
// R-31: an empty-string custom override disables the action
// R-32: a single action may be bound to multiple comma-separated keys
// R-33: modifier order is normalized to Ctrl -> Alt -> Shift -> Meta, then the key
// R-34: a Shift-only event also matches a binding string with "Shift+" stripped
//       (rescue matching)

describe("normalizeKeyString (SPEC-0300-0010 R-33, AC-31)", () => {
  it("AC-31: orders modifiers as Ctrl -> Alt -> Shift -> Meta regardless of input order", () => {
    expect(normalizeKeyString("Shift+Alt+Ctrl+F9")).toBe("Ctrl+Alt+Shift+F9");
    expect(normalizeKeyString("Meta+Shift+Alt+Ctrl+F9")).toBe("Ctrl+Alt+Shift+Meta+F9");
  });

  it("normalizes a plain key with no modifiers unchanged", () => {
    expect(normalizeKeyString("S")).toBe("S");
  });

  it("normalizes a single-modifier binding", () => {
    expect(normalizeKeyString("Ctrl+A")).toBe("Ctrl+A");
  });
});

describe("resolveBinding (SPEC-0300-0010 R-30, R-31, R-32)", () => {
  it("AC-28: a custom override takes precedence over the profile default", () => {
    const bindings = resolveBinding({
      profile: "windows",
      customOverrides: { toggle_hidden: "Ctrl+Alt+H" },
      actionId: "toggle_hidden",
      profileDefault: "Ctrl+H",
    });
    expect(bindings).toEqual(["Ctrl+Alt+H"]);
  });

  it("falls back to the profile default when no custom override exists", () => {
    const bindings = resolveBinding({
      profile: "windows",
      customOverrides: {},
      actionId: "toggle_hidden",
      profileDefault: "Ctrl+H",
    });
    expect(bindings).toEqual(["Ctrl+H"]);
  });

  it("AC-29: an empty-string custom override disables the action (no bindings)", () => {
    const bindings = resolveBinding({
      profile: "windows",
      customOverrides: { exit: "" },
      actionId: "exit",
      profileDefault: "Ctrl+Q",
    });
    expect(bindings).toEqual([]);
  });

  it("AC-30: a comma-separated custom override resolves to multiple usable bindings", () => {
    const bindings = resolveBinding({
      profile: "windows",
      customOverrides: { sort_menu: "S,Ctrl+Alt+S" },
      actionId: "sort_menu",
      profileDefault: "S",
    });
    expect(bindings).toEqual(["S", "Ctrl+Alt+S"]);
  });
});

describe("matchesAction (SPEC-0300-0010 R-33, R-34)", () => {
  it("matches when the normalized event key equals a resolved binding", () => {
    const event = { key: "h", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesAction(event, ["Ctrl+H"])).toBe(true);
  });

  it("does not match when modifiers differ", () => {
    const event = { key: "h", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
    expect(matchesAction(event, ["Ctrl+H"])).toBe(false);
  });

  it("AC-30: matches any one of several comma-separated bindings", () => {
    const eventForFirst = { key: "s", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    const eventForSecond = { key: "s", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
    expect(matchesAction(eventForFirst, ["S", "Ctrl+Alt+S"])).toBe(true);
    expect(matchesAction(eventForSecond, ["S", "Ctrl+Alt+S"])).toBe(true);
  });

  it("R-34: a Shift-only event also matches the binding with 'Shift+' stripped (rescue match)", () => {
    // Binding is plain "S" (no modifier); pressing Shift+S should still match via
    // the shift-only rescue rule described in R-34.
    const event = { key: "S", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false };
    expect(matchesAction(event, ["S"])).toBe(true);
  });

  it("does not apply the shift-only rescue when other modifiers are also pressed", () => {
    const event = { key: "S", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false };
    expect(matchesAction(event, ["S"])).toBe(false);
  });
});
