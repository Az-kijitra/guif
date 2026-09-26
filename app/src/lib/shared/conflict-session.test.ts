/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 R-374 (the extract conflict dialog = SPEC-0300-0011
//   R-31/R-33/R-34/R-35 behaviour), R-377 (the conflict UI parts may be shared
//   as long as the behaviour is identical), R-374-2 (all confirmations are
//   finished before the extraction starts); SPEC-0300-0011 R-31/R-31-1
//   (exactly overwrite / skip / cancel), R-33 / R-34 / R-34-2 (apply to all;
//   one item at a time), AC-340, AC-342, AC-345, AC-346.
// Architecture: SPEC-0200-0001 §3.4.1 ("shared/conflict-session.ts: move
//   runConflictSessionAsync and the types out of features/file-ops/
//   conflict-flow.ts, which re-exports them; existing tests unchanged"),
//   §3.4.13-8 (CONFLICT_DIALOG_CHOICES moves too; ConflictChoice derives
//   from it), §4.1 (shared/ never imports features/).
// Module under test (not yet implemented): ./conflict-session.ts
//
// The re-export identity checks import ../features/file-ops/conflict-flow.
// That is allowed here: this file lives in shared/, and it is a *test*; the
// import-boundary scanner (import-boundary.test.ts) checks shared/ -> features/
// edges in test files too, so this test reads the file as TEXT instead of
// importing it (dynamic import via a computed path is avoided on purpose).

import { CONFLICT_DIALOG_CHOICES, runConflictSessionAsync } from "./conflict-session";
import type { ConflictChoice, ConflictDecision, ConflictSessionResult } from "./conflict-session";

const overwriteAll: ConflictDecision = { choice: "overwrite", applyToAll: true };
const skipOne: ConflictDecision = { choice: "skip", applyToAll: false };
const overwriteOne: ConflictDecision = { choice: "overwrite", applyToAll: false };
const cancel: ConflictDecision = { choice: "cancel", applyToAll: false };

describe("CONFLICT_DIALOG_CHOICES (SPEC-0300-0011 R-31/R-31-1; SPEC-0300-0014 R-374)", () => {
  it("is exactly overwrite, skip, cancel in this order (no 'keep both')", () => {
    expect([...CONFLICT_DIALOG_CHOICES]).toEqual(["overwrite", "skip", "cancel"]);
  });

  it("ConflictChoice is derived from it (type-level: every member is assignable)", () => {
    const all: ConflictChoice[] = [...CONFLICT_DIALOG_CHOICES];
    expect(all).toHaveLength(3);
  });
});

describe("runConflictSessionAsync moved to shared (R-33, R-34, R-34-2)", () => {
  it("apply-to-all ON: asks once and reuses the first decision for the rest", async () => {
    const decide = vi.fn().mockResolvedValue(overwriteAll);
    const r: ConflictSessionResult = await runConflictSessionAsync(["a", "b", "c"], decide);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ canceled: false, resolutions: { a: "overwrite", b: "overwrite", c: "overwrite" } });
  });

  it("apply-to-all OFF: asks for every item in order, one at a time (AC-345)", async () => {
    const order: string[] = [];
    const answers: Record<string, ConflictDecision> = { a: overwriteOne, b: skipOne };
    const decide = vi.fn(async (item: string) => {
      order.push(`ask:${item}`);
      await new Promise((r) => setTimeout(r, 0));
      order.push(`answered:${item}`);
      return answers[item];
    });
    const r = await runConflictSessionAsync(["a", "b"], decide);
    expect(order).toEqual(["ask:a", "answered:a", "ask:b", "answered:b"]);
    expect(r).toEqual({ canceled: false, resolutions: { a: "overwrite", b: "skip" } });
  });

  it("cancel at any item aborts the whole batch with EMPTY resolutions (AC-346: nothing is written)", async () => {
    const decide = vi.fn().mockResolvedValueOnce(overwriteOne).mockResolvedValueOnce(cancel);
    const r = await runConflictSessionAsync(["a", "b", "c"], decide);
    expect(r).toEqual({ canceled: true, resolutions: {} });
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("an empty item list => not canceled, no resolutions, decide never called", async () => {
    const decide = vi.fn();
    expect(await runConflictSessionAsync([], decide)).toEqual({ canceled: false, resolutions: {} });
    expect(decide).not.toHaveBeenCalled();
  });

  it("a rejection of decide propagates to the caller", async () => {
    await expect(runConflictSessionAsync(["a"], async () => Promise.reject(new Error("dialog broke")))).rejects.toThrow(
      "dialog broke",
    );
  });

  it("resolutions are keyed by the item string EXACTLY as given (archive-internal entry paths, §3.4.2)", async () => {
    const r = await runConflictSessionAsync(["docs/sub/x.txt", "日本語/表.txt"], async () => overwriteAll);
    expect(Object.keys(r.resolutions)).toEqual(["docs/sub/x.txt", "日本語/表.txt"]);
  });
});

describe("file-ops keeps working through a re-export (existing tests unchanged; §3.4.1)", () => {
  const flow = readFileSync(resolve(__dirname, "../features/file-ops/conflict-flow.ts"), "utf-8");

  it("conflict-flow.ts re-exports from $lib/shared/conflict-session", () => {
    expect(flow).toMatch(/export\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']\$lib\/shared\/conflict-session["']/);
  });

  it("conflict-flow.ts no longer defines runConflictSessionAsync or CONFLICT_DIALOG_CHOICES itself (single implementation, R-377)", () => {
    expect(flow).not.toMatch(/(?:async\s+)?function\s+runConflictSessionAsync\b/);
    expect(flow).not.toMatch(/const\s+CONFLICT_DIALOG_CHOICES\b/);
  });

  it("the sync runConflictSession and createConflictDialogState stay in file-ops (untouched)", () => {
    expect(flow).toMatch(/export\s+function\s+runConflictSession\b/);
    expect(flow).toMatch(/export\s+function\s+createConflictDialogState\b/);
  });
});

describe("shared/conflict-session.ts stays a leaf (SPEC-0200-0001 §4.1)", () => {
  const src = readFileSync(resolve(__dirname, "conflict-session.ts"), "utf-8");

  it("imports nothing from features/ or routes/", () => {
    expect(src).not.toMatch(/from\s+["'][^"']*features\//);
    expect(src).not.toMatch(/from\s+["'][^"']*routes\//);
  });
});

describe("an entry named __proto__ (own key, not a prototype assignment)", () => {
  it("keeps the __proto__ decision as an own key that survives JSON serialisation", async () => {
    const r = await runConflictSessionAsync(["__proto__", "a.txt"], async () => ({
      choice: "overwrite",
      applyToAll: true,
    }));
    expect(Object.keys(r.resolutions)).toEqual(["__proto__", "a.txt"]);
    expect(Object.getPrototypeOf(r.resolutions)).toBeNull();
    expect(JSON.parse(JSON.stringify(r.resolutions))).toEqual(
      JSON.parse('{"__proto__":"overwrite","a.txt":"overwrite"}'),
    );
    expect(JSON.stringify(r.resolutions)).toContain('"__proto__":"overwrite"');
  });

  it("does not pollute Object.prototype", async () => {
    await runConflictSessionAsync(["__proto__"], async () => ({ choice: "skip", applyToAll: false }));
    expect(({} as Record<string, unknown>).skip).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});
