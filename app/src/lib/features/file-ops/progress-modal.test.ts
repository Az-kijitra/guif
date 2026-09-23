import { describe, expect, it } from "vitest";
import {
  PROGRESS_MODAL_IS_OVERLAY,
  applyProgressEvent,
  createBatchProgressAccumulator,
  createProgressDialogState,
  formatProgressLabel,
  handleProgressDialogKeydown,
} from "./progress-modal";

// Spec: SPEC-0300-0011 (file operations detail) §6
// Module under test (not yet implemented): ./progress-modal.ts
//
// R-40/R-41: progress display shows the current target name and
//   "current/total" counts, sourced from per-item start/fail/done events.
// R-42/R-42-1/R-42-2: the progress display is a modal overlay with a
//   cancel button; Escape also cancels. Being an overlay, it participates
//   in the keyboard dispatch priority chain the same way every other modal
//   does (SPEC-0300-0010 R-13) — that trapping mechanism itself is already
//   covered generically by the Phase 1 test
//   `app/src/lib/features/keyboard/key-dispatch.test.ts`
//   ("AC-02: while an overlay ... is open, list navigation keys do not
//   reach the list handler"); this module only needs to report that it *is*
//   an overlay while shown, and that Escape maps to the same "cancel"
//   outcome as the cancel button.
// R-44: a canceled item is reported with the `canceled` error code.
// R-45: only copy/move show progress — delete/rename/create must not.

describe("formatProgressLabel (SPEC-0300-0011 R-41)", () => {
  it("AC-31: includes the current target name and the current/total counts", () => {
    const label = formatProgressLabel("コピー中", { currentName: "photo.png", index: 2, total: 5 });
    expect(label).toContain("photo.png");
    expect(label).toContain("2");
    expect(label).toContain("5");
  });
});

describe("PROGRESS_MODAL_IS_OVERLAY (SPEC-0300-0011 R-42-1)", () => {
  it("AC-32-1: the progress display identifies itself as a modal overlay", () => {
    expect(PROGRESS_MODAL_IS_OVERLAY).toBe(true);
  });
});

describe("createProgressDialogState (SPEC-0300-0011 R-42)", () => {
  it("AC-32: the cancel affordance is available as soon as the dialog is created", () => {
    const state = createProgressDialogState("コピー中");
    expect(state.canCancel).toBe(true);
  });
});

describe("handleProgressDialogKeydown (SPEC-0300-0011 R-42-2)", () => {
  it("AC-32-2: Escape maps to the same 'cancel' outcome as the cancel button", () => {
    expect(handleProgressDialogKeydown({ key: "Escape" })).toBe("cancel");
  });

  it("a non-Escape key does not trigger cancellation", () => {
    expect(handleProgressDialogKeydown({ key: "ArrowDown" })).toBeNull();
  });
});

describe("applyProgressEvent / createBatchProgressAccumulator (SPEC-0300-0011 R-40, R-44)", () => {
  it("AC-31: a 'start' event records the current name and index/total", () => {
    const acc = createBatchProgressAccumulator(3);
    const next = applyProgressEvent(acc, { type: "start", name: "a.txt", index: 1, total: 3 });
    expect(next.currentName).toBe("a.txt");
    expect(next.index).toBe(1);
    expect(next.total).toBe(3);
  });

  it("a 'done' event increments the success count", () => {
    const acc = createBatchProgressAccumulator(1);
    const next = applyProgressEvent(acc, { type: "done", name: "a.txt", index: 1, total: 1 });
    expect(next.ok).toBe(1);
  });

  it("AC-34: a 'fail' event with code 'canceled' is recorded distinctly as a canceled failure", () => {
    const acc = createBatchProgressAccumulator(2);
    const next = applyProgressEvent(acc, {
      type: "fail",
      name: "b.txt",
      index: 2,
      total: 2,
      code: "canceled",
    });
    expect(next.failed).toBe(1);
    expect(next.failures).toEqual([{ name: "b.txt", code: "canceled" }]);
  });
});

describe("AC-35 (SPEC-0300-0011 R-45): delete/rename/create never wire in progress display", () => {
  it("the delete flow module exposes no progress-shaped API", async () => {
    const deleteFlow: Record<string, unknown> = await import("./delete-flow");
    expect(deleteFlow).not.toHaveProperty("createProgressDialogState");
    expect(deleteFlow).not.toHaveProperty("applyProgressEvent");
  });

  it("the rename flow module exposes no progress-shaped API", async () => {
    const renameFlow: Record<string, unknown> = await import("./rename-flow");
    expect(renameFlow).not.toHaveProperty("createProgressDialogState");
    expect(renameFlow).not.toHaveProperty("applyProgressEvent");
  });

  it("the create flow module exposes no progress-shaped API", async () => {
    const createFlow: Record<string, unknown> = await import("./create-flow");
    expect(createFlow).not.toHaveProperty("createProgressDialogState");
    expect(createFlow).not.toHaveProperty("applyProgressEvent");
  });
});
