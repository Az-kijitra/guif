import { describe, expect, it } from "vitest";
import { matchesAction, normalizeKeyString, resolveBinding } from "./keymap-resolve";
import { validateCustomOverride } from "./keymap-validate";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail), 第8版
// (originally 4th edition + addendum 2, 2026-09-23; updated for ISS-0105:
// the `profile` input was removed and `profileDefault` renamed
// `defaultBinding`, R-20-1/R-30), as referenced by SPEC-0300-0011
// (file operations detail) for the `delete` action's Phase 2 behavior.
//
// This file is intentionally *new* (it does not modify the existing,
// already-passing `keymap-resolve.test.ts` / `keymap-defaults.test.ts` /
// `key-dispatch.test.ts` from Phase 1) because the two rules it covers were
// only settled today (ISS-0050, ISS-0048) — after the Phase 1 suite was
// already frozen — and are prerequisites for SPEC-0300-0011's completely
// delete branch (R-56-4).
//
// R-33/R-33-1: a single-alphabet-character key body is matched
//   case-insensitively; normalization must happen on *both* the event side
//   and the custom-override binding-string side (not just the event side,
//   which `./keymap-resolve.ts` already does via `eventKeyToken`).
// R-18-2 (mirrored in SPEC-0300-0011 R-56-4-2-1): a custom override for the
//   `delete` action containing a Shift modifier is invalid and must be
//   rejected (falling back to the default binding), because Shift is
//   permanently reserved as the "permanent delete" modifier for `delete`.
//   AC-53 (the "does the wrong key fire" half) belongs to SPEC-0300-0010;
//   this suite only exercises the validation function itself.

describe("normalizeKeyString / matchesAction case-insensitivity (SPEC-0300-0010 R-33, R-33-1)", () => {
  it("R-33-1: normalizeKeyString uppercases a lowercase single-character key body", () => {
    // A custom override written in lowercase (e.g. `input_keymap_custom.delete = "d"`)
    // must normalize to the same string as the uppercase default ("D").
    expect(normalizeKeyString("d")).toBe("D");
  });

  it("R-33-1: a lowercase custom override for 'delete' matches the same keydown event as the uppercase default", () => {
    // R-33-1 (第6版以降の例示): a custom override such as `sort_menu = "s"`
    // (lowercase) must match the same physical key as the uppercase form "S".
    const eventForUppercaseD = { key: "D", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesAction(eventForUppercaseD, ["d"])).toBe(true);
  });

  it("R-33-1: an uppercase-written binding still matches a lowercase-key event (both directions normalized)", () => {
    const eventForLowercaseD = { key: "d", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesAction(eventForLowercaseD, ["D"])).toBe(true);
  });

  it("R-33-2: case normalization does not, by itself, imply the Shift modifier", () => {
    // Pressing plain "d" (no Shift) must not match a binding that requires
    // Shift explicitly — case-insensitivity is about the key body only.
    const plainD = { key: "d", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    expect(matchesAction(plainD, ["Shift+D"])).toBe(false);
  });
});

describe("validateCustomOverride (SPEC-0300-0010 R-18-2, SPEC-0300-0011 R-56-4-2-1, AC-53/AC-46-9)", () => {
  it("rejects a Shift-containing custom override for 'delete'", () => {
    expect(validateCustomOverride("delete", "Shift+F8")).toBeNull();
  });

  it("rejects a Shift-containing custom override for 'delete' even with other modifiers present", () => {
    expect(validateCustomOverride("delete", "Ctrl+Shift+F8")).toBeNull();
  });

  it("accepts a Shift-free custom override for 'delete'", () => {
    expect(validateCustomOverride("delete", "F8")).toBe("F8");
  });

  // SPEC-0200-0001 §3.3.8-(d) (MIN-1, ISS-0052 residual): the Shift check is
  // case-insensitive on the modifier token. Otherwise "shift+F8" slips past
  // the check while normalizeKeyString silently drops the unknown token,
  // yielding a plain "F8" binding that is not what the user wrote.
  it("§3.3.8-d: rejects lowercase 'shift+F8' (modifier token compared case-insensitively)", () => {
    expect(validateCustomOverride("delete", "shift+F8")).toBeNull();
  });

  it("§3.3.8-d: rejects uppercase 'SHIFT+F8' and mixed-case 'Ctrl+sHiFt+F8'", () => {
    expect(validateCustomOverride("delete", "SHIFT+F8")).toBeNull();
    expect(validateCustomOverride("delete", "Ctrl+sHiFt+F8")).toBeNull();
  });

  it("does not restrict Shift on any action other than 'delete'", () => {
    expect(validateCustomOverride("sort_menu", "Shift+S")).toBe("Shift+S");
  });
});

describe("resolveBinding wires validateCustomOverride in (integration regression, code-reviewer 2026-09-23)", () => {
  // code-reviewer found that `validateCustomOverride` was implemented and
  // unit-tested in isolation but never called from `resolveBinding`, so a
  // Shift-containing custom override for `delete` was accepted as-is
  // instead of falling back to the default binding (ISS-0048).
  it("falls back to the default binding when the custom override for 'delete' contains Shift", () => {
    const bindings = resolveBinding({
      customOverrides: { delete: "Shift+F8" },
      actionId: "delete",
      defaultBinding: "Delete",
    });
    expect(bindings).toEqual(["Delete"]);
  });

  it("accepts a Shift-free custom override for 'delete'", () => {
    const bindings = resolveBinding({
      customOverrides: { delete: "F8" },
      actionId: "delete",
      defaultBinding: "Delete",
    });
    expect(bindings).toEqual(["F8"]);
  });

  it("§3.3.8-d: falls back to the default binding for a lowercase 'shift+F8' delete override too", () => {
    const bindings = resolveBinding({
      customOverrides: { delete: "shift+F8" },
      actionId: "delete",
      defaultBinding: "Delete",
    });
    expect(bindings).toEqual(["Delete"]);
  });

  it("does not apply the delete-only Shift restriction to other actions", () => {
    const bindings = resolveBinding({
      customOverrides: { sort_menu: "Shift+S" },
      actionId: "sort_menu",
      defaultBinding: "S",
    });
    expect(bindings).toEqual(["Shift+S"]);
  });
});
