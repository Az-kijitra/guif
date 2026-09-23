import { describe, expect, it } from "vitest";
import {
  DELETE_DIALOG_CHOICES,
  DELETE_DIALOG_DEFAULT_FOCUS,
  buildDeleteConfirmContent,
  resolveDeleteMode,
  runDeleteConfirmFlow,
} from "./delete-flow";

// Spec: SPEC-0300-0011 (file operations detail) §7
// Module under test (not yet implemented): ./delete-flow.ts
//
// R-53/R-55: delete always goes through a confirm dialog with exactly
//   "delete" / "cancel", default focus on "cancel" (safe side).
// R-54: dialog content shows the single filename, or (for 4+) the count
//   plus the first 3 names with an ellipsis marker for the rest.
// R-56/R-56-4/R-56-4-1: the Shift modifier on the `delete` keypress (not
//   the key's letter case) decides trash-delete vs. permanent-delete; the
//   actual keymap matching that gets an event to this point is
//   SPEC-0300-0010's responsibility (AC-42/AC-50) — this module only owns
//   the *decision* once such an event is known to be the `delete` action.
// R-56-1: permanent delete also goes through a confirm dialog, and the
//   dialog content must make clear that this is the irreversible variant.

describe("resolveDeleteMode (SPEC-0300-0011 R-56, R-56-4, R-56-4-1)", () => {
  it("AC-46: a plain (non-Shift) delete keypress resolves to trash-delete", () => {
    expect(resolveDeleteMode({ shiftKey: false })).toBe("trash");
  });

  it("AC-46: a Shift-modified delete keypress resolves to permanent delete", () => {
    expect(resolveDeleteMode({ shiftKey: true })).toBe("permanent");
  });
});

describe("delete confirm dialog choices/focus (SPEC-0300-0011 R-53, R-55)", () => {
  it("AC-39: the dialog offers exactly 'delete' and 'cancel'", () => {
    expect(DELETE_DIALOG_CHOICES).toEqual(["delete", "cancel"]);
  });

  it("AC-40: the default focus is 'cancel' (safe side)", () => {
    expect(DELETE_DIALOG_DEFAULT_FOCUS).toBe("cancel");
  });
});

describe("runDeleteConfirmFlow (SPEC-0300-0011 R-53)", () => {
  it("AC-41: choosing 'cancel' does not proceed with deletion", () => {
    const result = runDeleteConfirmFlow(["a.txt"], "trash", "cancel");
    expect(result.proceed).toBe(false);
  });

  it("choosing 'delete' proceeds with deletion", () => {
    const result = runDeleteConfirmFlow(["a.txt"], "trash", "delete");
    expect(result.proceed).toBe(true);
  });

  it("AC-46-3: a canceled permanent-delete confirmation also does not proceed", () => {
    const result = runDeleteConfirmFlow(["a.txt"], "permanent", "cancel");
    expect(result.proceed).toBe(false);
  });
});

describe("buildDeleteConfirmContent (SPEC-0300-0011 R-54, R-56-1)", () => {
  it("AC-42: a single target shows that target's name", () => {
    const content = buildDeleteConfirmContent(["a.txt"], "trash");
    expect(content.shownNames).toEqual(["a.txt"]);
    expect(content.truncated).toBe(false);
  });

  it("AC-43: 4 or more targets show the count plus the first 3 names, with the rest truncated", () => {
    const content = buildDeleteConfirmContent(["a.txt", "b.txt", "c.txt", "d.txt"], "trash");
    expect(content.shownNames).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(content.truncated).toBe(true);
    expect(content.count).toBe(4);
  });

  it("AC-46-1: permanent-delete content is marked irreversible, distinct from trash-delete", () => {
    const trashContent = buildDeleteConfirmContent(["a.txt"], "trash");
    const permanentContent = buildDeleteConfirmContent(["a.txt"], "permanent");
    expect(trashContent.irreversible).toBe(false);
    expect(permanentContent.irreversible).toBe(true);
    expect(permanentContent.mode).toBe("permanent");
  });
});
