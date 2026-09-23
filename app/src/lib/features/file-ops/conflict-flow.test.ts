import { describe, expect, it, vi } from "vitest";
import {
  CONFLICT_DIALOG_CHOICES,
  createConflictDialogState,
  runConflictSession,
} from "./conflict-flow";

// Spec: SPEC-0300-0011 (file operations detail) §5
// Module under test (not yet implemented): ./conflict-flow.ts
//
// This module owns the UI-side confirm-dialog *sequencing* for a paste
// batch that hits one or more name conflicts (R-30~R-36). It does not
// perform any filesystem work itself — the actual per-item overwrite/skip
// execution and the non-UI-path `conflict` rejection (AC-29/AC-29-1) are
// backend concerns, covered by the Rust tests in
// `app/src-tauri/src/fs_ops/transfer.rs`.
//
// R-31: choices are exactly "overwrite" / "skip" / "cancel" (no "keep both").
// R-33/R-34/R-34-1: "apply to all" defaults to checked; when checked, the
//   first decision is applied to every subsequent conflict in the batch
//   without asking again; when unchecked, every conflict is asked
//   individually (R-34-2: evaluated one item at a time).
// R-35: default focus for the conflict dialog is "cancel" (safe-by-default).

describe("CONFLICT_DIALOG_CHOICES (SPEC-0300-0011 R-31, R-31-1)", () => {
  it("AC-19/AC-23: exposes exactly overwrite/skip/cancel, in that order, with no 'keep both' option", () => {
    expect(CONFLICT_DIALOG_CHOICES).toEqual(["overwrite", "skip", "cancel"]);
  });
});

describe("createConflictDialogState (SPEC-0300-0011 R-34-1, R-35)", () => {
  it("AC-28: 'apply to all' is checked by default", () => {
    const state = createConflictDialogState("a.txt");
    expect(state.applyToAll).toBe(true);
  });

  it("AC-30: the default focus is 'cancel' (safe side)", () => {
    const state = createConflictDialogState("a.txt");
    expect(state.defaultFocus).toBe("cancel");
  });
});

describe("runConflictSession (SPEC-0300-0011 R-33, R-34, R-34-2)", () => {
  it("AC-24: 'apply to all' + overwrite resolves every subsequent conflict as overwrite without asking again", () => {
    const decide = vi.fn().mockReturnValue({ choice: "overwrite", applyToAll: true });

    const result = runConflictSession(["a.txt", "b.txt", "c.txt"], decide);

    expect(decide).toHaveBeenCalledTimes(1);
    expect(result.canceled).toBe(false);
    expect(result.resolutions).toEqual({ "a.txt": "overwrite", "b.txt": "overwrite", "c.txt": "overwrite" });
  });

  it("AC-25: 'apply to all' + skip resolves every subsequent conflict as skip without asking again", () => {
    const decide = vi.fn().mockReturnValue({ choice: "skip", applyToAll: true });

    const result = runConflictSession(["a.txt", "b.txt"], decide);

    expect(decide).toHaveBeenCalledTimes(1);
    expect(result.resolutions).toEqual({ "a.txt": "skip", "b.txt": "skip" });
  });

  it("AC-26: unchecking 'apply to all' asks again for the second conflict", () => {
    const decide = vi.fn().mockReturnValue({ choice: "overwrite", applyToAll: false });

    runConflictSession(["a.txt", "b.txt"], decide);

    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("AC-27: distinct per-item choices are recorded independently when 'apply to all' is off", () => {
    const decide = vi
      .fn()
      .mockReturnValueOnce({ choice: "overwrite", applyToAll: false })
      .mockReturnValueOnce({ choice: "skip", applyToAll: false });

    const result = runConflictSession(["a.txt", "b.txt"], decide);

    expect(result.resolutions).toEqual({ "a.txt": "overwrite", "b.txt": "skip" });
  });

  it("AC-22: choosing 'cancel' leaves nothing resolved for this batch", () => {
    const decide = vi.fn().mockReturnValue({ choice: "cancel", applyToAll: false });

    const result = runConflictSession(["a.txt"], decide);

    expect(result.canceled).toBe(true);
    expect(result.resolutions).toEqual({});
  });

  it("a batch with no conflicts never invokes the decide callback", () => {
    const decide = vi.fn();

    const result = runConflictSession([], decide);

    expect(decide).not.toHaveBeenCalled();
    expect(result.canceled).toBe(false);
    expect(result.resolutions).toEqual({});
  });
});
