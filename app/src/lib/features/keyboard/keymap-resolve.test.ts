import { describe, expect, it } from "vitest";
import { matchesAction, normalizeKeyString, resolveBinding } from "./keymap-resolve";

// Phase 7 additions (SPEC-0200-0001 §3.6.11.3, MUST-86(i)-(iii); §3.6.11.11
// SHOULD-128). `isKnownKeyBody` is a NEW named export that does not exist yet
// (a second import statement, like tree.test.ts's Phase 7 addition, so the
// existing tests above keep passing while these new ones fail individually).
import { isKnownKeyBody } from "./keymap-resolve";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail) §5
// Module under test (not yet implemented): ./keymap-resolve.ts
//
// R-30: custom override (input_keymap_custom) takes precedence over the default binding
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
  it("AC-28: a custom override takes precedence over the default binding", () => {
    const bindings = resolveBinding({
      customOverrides: { toggle_hidden: "Ctrl+Alt+H" },
      actionId: "toggle_hidden",
      defaultBinding: "Ctrl+H",
    });
    expect(bindings).toEqual(["Ctrl+Alt+H"]);
  });

  it("falls back to the default binding when no custom override exists", () => {
    const bindings = resolveBinding({
      customOverrides: {},
      actionId: "toggle_hidden",
      defaultBinding: "Ctrl+H",
    });
    expect(bindings).toEqual(["Ctrl+H"]);
  });

  it("AC-29: an empty-string custom override disables the action (no bindings)", () => {
    const bindings = resolveBinding({
      customOverrides: { exit: "" },
      actionId: "exit",
      defaultBinding: "Ctrl+Q",
    });
    expect(bindings).toEqual([]);
  });

  it("AC-30: a comma-separated custom override resolves to multiple usable bindings", () => {
    const bindings = resolveBinding({
      customOverrides: { sort_menu: "S,Ctrl+Alt+S" },
      actionId: "sort_menu",
      defaultBinding: "S",
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

// ---------------------------------------------------------------------
// Phase 7 (SPEC-0200-0001 §3.6.11.3, MUST-86(i)-(iii)): the pre-Phase-7
// implementation has two real bugs that MUST-86 requires fixing:
//   (i)   modifier names are compared case-sensitively (`presentModifiers.has
//         ("Ctrl")`), so a lowercase `config.toml` entry like "ctrl+a" has its
//         modifier silently DROPPED, making the action fire on a bare,
//         unmodified "A" keypress instead of Ctrl+A.
//   (ii)  multi-character key names (e.g. "escape") are never case-folded, so
//         they never match their canonical form ("Escape").
//   (iii) there is no canonical "Plus"/"Comma" key-body handling at all yet
//         (eventKeyToken(",") currently returns "," verbatim, eventKeyToken
//         ("+") returns "+" verbatim).
// These tests are written directly against the CURRENT (buggy) behavior's
// opposite -- i.e. they assert the CORRECT behavior MUST-86 requires, and are
// therefore expected to fail (RED) until keymap-resolve.ts is fixed.
// ---------------------------------------------------------------------

describe("normalizeKeyString: modifier names are case-INsensitive (MUST-86(i))", () => {
  it("a lowercase modifier in a config.toml-style binding normalizes to the canonical Ctrl+A", () => {
    expect(normalizeKeyString("ctrl+a")).toBe("Ctrl+A");
  });

  it("mixed-case modifiers normalize and reorder correctly", () => {
    expect(normalizeKeyString("sHiFt+cTrL+f9")).toBe("Ctrl+Shift+F9");
  });
});

describe("normalizeKeyString: multi-character key names are case-INsensitive (MUST-86(iii))", () => {
  it("a lowercase multi-character key name normalizes to its canonical capitalized form", () => {
    expect(normalizeKeyString("ctrl+escape")).toBe(normalizeKeyString("Ctrl+Escape"));
    expect(normalizeKeyString("arrowup")).toBe(normalizeKeyString("ArrowUp"));
    expect(normalizeKeyString("pagedown")).toBe(normalizeKeyString("PageDown"));
    expect(normalizeKeyString("f5")).toBe(normalizeKeyString("F5"));
  });

  it("an UNKNOWN multi-character string is passed through unchanged (only KNOWN names are canonicalized)", () => {
    expect(normalizeKeyString("Ctrl+Foo")).toBe("Ctrl+Foo");
  });
});

describe("normalizeKeyString/matchesAction: 'Plus'/'Comma' key-body words (MUST-86(ii), 発注者決定 2026-09-27)", () => {
  it("'Plus' and 'Comma' are already-canonical multi-character key names, case-insensitively", () => {
    expect(normalizeKeyString("Ctrl+plus")).toBe(normalizeKeyString("Ctrl+Plus"));
    expect(normalizeKeyString("ctrl+comma")).toBe(normalizeKeyString("Ctrl+Comma"));
  });

  it("pressing the '+' key (no modifiers) matches a 'Plus' binding", () => {
    const event = { key: "+", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesAction(event, ["Plus"])).toBe(true);
  });

  it("pressing the ',' key with Ctrl matches a 'Ctrl+Comma' binding (the new settings default)", () => {
    const event = { key: ",", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesAction(event, ["Ctrl+Comma"])).toBe(true);
  });

  it("a raw '+'/',' character is no longer how the key body is written (canonical form is the word)", () => {
    const plusEvent = { key: "+", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    // Once eventKeyToken maps "+" -> "Plus", a literal "+" binding string no
    // longer matches a "+" keypress (the binding itself must also say "Plus").
    expect(matchesAction(plusEvent, ["+"])).toBe(false);
  });
});

// SHOULD-128: `isKnownKeyBody` is the single-source predicate
// `validateKeymapEntries` (keymap-validate.ts) must use to reject an unknown
// key name (AC-62-1 (i), `toggle_size = "Ctrl+Foo"`) -- `canonicalizeKeyBody`
// alone cannot do this because it passes unknown multi-character strings
// through unchanged (by design, for forward-compatibility), so "interpretable"
// is not the same predicate as "known".
describe("isKnownKeyBody (SPEC-0200-0001 §3.6.11.11 SHOULD-128)", () => {
  it("a single alphanumeric or symbol character is a known key body", () => {
    expect(isKnownKeyBody("A")).toBe(true);
    expect(isKnownKeyBody("a")).toBe(true);
    expect(isKnownKeyBody("9")).toBe(true);
    expect(isKnownKeyBody("!")).toBe(true);
  });

  it("known multi-character key names are recognized, case-insensitively", () => {
    for (const name of ["Escape", "escape", "ArrowUp", "F5", "f12", "Plus", "comma", "PageDown", "Space"]) {
      expect(isKnownKeyBody(name)).toBe(true);
    }
  });

  it("AC-62-1 (i): an unknown multi-character key name is NOT known ('Ctrl+Foo' is invalid)", () => {
    expect(isKnownKeyBody("Foo")).toBe(false);
  });

  it("a bare '+' or ',' symbol is NOT a known key body (must be written as Plus/Comma)", () => {
    expect(isKnownKeyBody("+")).toBe(false);
    expect(isKnownKeyBody(",")).toBe(false);
  });

  it("an empty string is not a known key body", () => {
    expect(isKnownKeyBody("")).toBe(false);
  });
});
