import { describe, expect, it } from "vitest";
import { applyRenameError, computeRenameInitialSelection, handleRenameDialogKeydown } from "./rename-flow";

// Spec: SPEC-0300-0011 (file operations detail) §8
// Module under test (not yet implemented): ./rename-flow.ts
//
// R-60/R-60-1: the rename dialog presets the existing name and initially
//   selects only the stem (the part before the extension); a name with no
//   extension has its entire value selected.
// R-61: Enter confirms, Escape cancels (in both the dialog body and the
//   input field).
// R-63: validation/already_exists errors are shown inline, without closing
//   the dialog, so the user can retry.

describe("computeRenameInitialSelection (SPEC-0300-0011 R-60-1)", () => {
  it("AC-48-1/AC-48-2: presets the full name and selects only the stem when an extension is present", () => {
    const selection = computeRenameInitialSelection("report.txt");
    expect(selection.value).toBe("report.txt");
    expect(selection.selectionStart).toBe(0);
    expect(selection.selectionEnd).toBe("report".length);
  });

  it("AC-48-1: selects the entire name when there is no extension", () => {
    const selection = computeRenameInitialSelection("README");
    expect(selection.value).toBe("README");
    expect(selection.selectionStart).toBe(0);
    expect(selection.selectionEnd).toBe("README".length);
  });

  it("AC-48-2: typing a replacement for the selected stem preserves the extension (selection boundary check)", () => {
    // computeRenameInitialSelection only produces the *initial* selection;
    // an editor honoring [selectionStart, selectionEnd) when the user types
    // "summary" over "report.txt" naturally yields "summary.txt" — this
    // test locks in the selection boundaries that make that true.
    const selection = computeRenameInitialSelection("report.txt");
    const untouchedSuffix = selection.value.slice(selection.selectionEnd);
    expect(untouchedSuffix).toBe(".txt");
  });
});

describe("handleRenameDialogKeydown (SPEC-0300-0011 R-61)", () => {
  it("AC-48: Enter confirms the rename", () => {
    expect(handleRenameDialogKeydown({ key: "Enter" })).toBe("confirm");
  });

  it("AC-49: Escape cancels the rename without changing the name", () => {
    expect(handleRenameDialogKeydown({ key: "Escape" })).toBe("cancel");
  });

  it("an unrelated key does nothing", () => {
    expect(handleRenameDialogKeydown({ key: "a" })).toBeNull();
  });
});

describe("applyRenameError (SPEC-0300-0011 R-63, AC-55)", () => {
  it("AC-55: an already_exists error is shown inline and the dialog stays open", () => {
    const initialState = { name: "existing.txt", error: null as string | null, closed: false };
    const nextState = applyRenameError(initialState, "already_exists");

    expect(nextState.error).not.toBeNull();
    expect(nextState.closed).toBe(false);
  });
});
