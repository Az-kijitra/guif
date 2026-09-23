import { describe, expect, it } from "vitest";
import { applyCreateError, applyCreateSuccess, initialCreateState } from "./create-flow";

// Spec: SPEC-0300-0011 (file operations detail) §9
// Module under test (not yet implemented): ./create-flow.ts
//
// R-71: name always starts empty (no auto-generated default name).
// R-72/R-72-1: the `new_folder` entry point (Ctrl+Shift+N) opens the dialog
//   with kind already set to "folder", requiring no in-dialog switch.
// R-72-2/R-72-3: the `new_file` entry point and the (single, unsplit)
//   context-menu "New..." entry point both default to kind "file".
// R-74: already_exists is shown inline, dialog stays open.
// R-76: on success the dialog closes and does not enter a rename-armed
//   ("editing") state.

describe("initialCreateState (SPEC-0300-0011 R-71, R-72, R-72-1, R-72-2, R-72-3)", () => {
  it("AC-59: the name field starts empty regardless of entry point", () => {
    expect(initialCreateState("new_file").name).toBe("");
    expect(initialCreateState("new_folder").name).toBe("");
    expect(initialCreateState("context_menu").name).toBe("");
  });

  it("AC-61/AC-61-1: the new_folder entry point starts with kind 'folder'", () => {
    expect(initialCreateState("new_folder").kind).toBe("folder");
  });

  it("AC-62: the new_file entry point starts with kind 'file'", () => {
    expect(initialCreateState("new_file").kind).toBe("file");
  });

  it("AC-62-1: the (single, unsplit) context-menu entry point starts with kind 'file'", () => {
    expect(initialCreateState("context_menu").kind).toBe("file");
  });
});

describe("applyCreateError (SPEC-0300-0011 R-74)", () => {
  it("AC-63: already_exists is shown inline and the dialog stays open", () => {
    const state = initialCreateState("new_file");
    const next = applyCreateError({ ...state, name: "a.txt" }, "already_exists");

    expect(next.error).not.toBeNull();
    expect(next.closed).toBe(false);
  });
});

describe("applyCreateSuccess (SPEC-0300-0011 R-76)", () => {
  it("AC-64/AC-65: closes the dialog and does not enter a rename-armed (editing) state", () => {
    const state = initialCreateState("new_file");
    const next = applyCreateSuccess({ ...state, name: "a.txt" });

    expect(next.closed).toBe(true);
    expect(next).not.toHaveProperty("editing");
  });
});
