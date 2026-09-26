import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0011 R-31 (overwrite/skip/cancel), R-33 (apply to all),
//   R-34 (per-item confirmation when apply-to-all is off), R-34-2 (evaluated
//   per item), AC-22 (cancel aborts the whole batch), AC-24~AC-29.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.4
//   ("conflict-flow.ts gets an async twin runConflictSessionAsync(items,
//   decide: (item) => Promise<ConflictDecision>); the sync version is kept",
//   because a synchronous decide cannot wait for a Svelte dialog).
// Module under test (not yet implemented): runConflictSessionAsync in
//   ./conflict-flow.ts (the existing sync runConflictSession stays and keeps
//   its own tests in conflict-flow.test.ts).

import { runConflictSession, runConflictSessionAsync } from "./conflict-flow";

const overwriteAll = { choice: "overwrite" as const, applyToAll: true };
const skipOne = { choice: "skip" as const, applyToAll: false };

describe("runConflictSessionAsync (R-33, R-34, R-34-2)", () => {
  it("apply-to-all ON: asks once, reuses the first decision for every remaining item", async () => {
    const decide = vi.fn().mockResolvedValue(overwriteAll);
    const result = await runConflictSessionAsync(["a", "b", "c"], decide);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      canceled: false,
      resolutions: { a: "overwrite", b: "overwrite", c: "overwrite" },
    });
  });

  it("apply-to-all OFF: asks for every item, in order, one at a time (awaiting each answer)", async () => {
    const order: string[] = [];
    const decide = vi.fn(async (item: string) => {
      order.push(`ask:${item}`);
      await Promise.resolve();
      order.push(`answer:${item}`);
      return item === "b" ? skipOne : { choice: "overwrite" as const, applyToAll: false };
    });
    const result = await runConflictSessionAsync(["a", "b", "c"], decide);
    expect(decide).toHaveBeenCalledTimes(3);
    expect(order).toEqual(["ask:a", "answer:a", "ask:b", "answer:b", "ask:c", "answer:c"]);
    expect(result.resolutions).toEqual({ a: "overwrite", b: "skip", c: "overwrite" });
    expect(result.canceled).toBe(false);
  });

  it("apply-to-all turned on midway applies from that item onward only", async () => {
    const decide = vi
      .fn()
      .mockResolvedValueOnce({ choice: "overwrite", applyToAll: false })
      .mockResolvedValueOnce({ choice: "skip", applyToAll: true });
    const result = await runConflictSessionAsync(["a", "b", "c", "d"], decide);
    expect(decide).toHaveBeenCalledTimes(2);
    expect(result.resolutions).toEqual({ a: "overwrite", b: "skip", c: "skip", d: "skip" });
  });

  it("AC-22: cancel on the first prompt aborts the whole batch with no resolutions", async () => {
    const decide = vi.fn().mockResolvedValue({ choice: "cancel", applyToAll: false });
    const result = await runConflictSessionAsync(["a", "b"], decide);
    expect(result).toEqual({ canceled: true, resolutions: {} });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("cancel on a later prompt discards the earlier answers too (batch-wide abort, no partial resolutions)", async () => {
    const decide = vi
      .fn()
      .mockResolvedValueOnce({ choice: "overwrite", applyToAll: false })
      .mockResolvedValueOnce({ choice: "cancel", applyToAll: false });
    const result = await runConflictSessionAsync(["a", "b", "c"], decide);
    expect(result).toEqual({ canceled: true, resolutions: {} });
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("no items => not canceled, empty resolutions, decide never called", async () => {
    const decide = vi.fn();
    expect(await runConflictSessionAsync([], decide)).toEqual({ canceled: false, resolutions: {} });
    expect(decide).not.toHaveBeenCalled();
  });

  it("gives the same result as the sync runConflictSession for the same decisions", async () => {
    const answers = [
      { choice: "overwrite" as const, applyToAll: false },
      { choice: "skip" as const, applyToAll: true },
    ];
    let i = 0;
    const syncResult = runConflictSession(["a", "b", "c"], () => answers[i++]);
    let j = 0;
    const asyncResult = await runConflictSessionAsync(["a", "b", "c"], async () => answers[j++]);
    expect(asyncResult).toEqual(syncResult);
  });

  it("a decide rejection propagates (the controller's try/catch/finally reports it)", async () => {
    const decide = vi.fn().mockRejectedValue(new Error("modal exploded"));
    await expect(runConflictSessionAsync(["a"], decide)).rejects.toThrow("modal exploded");
  });
});
