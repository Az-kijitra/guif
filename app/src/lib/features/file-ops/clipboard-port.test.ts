import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0011 R-15-1 (staged rollout: internal clipboard only; the
//   OS-clipboard requirements R-15~R-18 / AC-04~AC-06-1 stay GAP), R-19/R-19-1
//   (only this app's own cut resolves to a move), R-10 (targets).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.4
//   ("clipboard-port.ts: ClipboardPort and the internal implementation; the
//   clipboard is feature-local closure state, NOT shared state"), §3.3.14-1
//   (承認B見送り: internal clipboard only; no clipboard_set_files /
//   clipboard_get_files).
// Module under test (not yet implemented): ./clipboard-port.ts
//
// Contract assumed (documented in the handback report; names not fixed by
// the design): `createInternalClipboard()` returns a ClipboardPort whose
// methods are async so that a future OS-backed implementation can replace it
// without changing callers:
//   set({ paths, origin }): Promise<void>
//   get(): Promise<{ paths: string[]; origin: "internal-copy" | "internal-cut" } | null>
//   clear(): Promise<void>
// AC-04/AC-05/AC-06 (real OS clipboard round trip) are GAP and are covered
// by tests/manual/phase2-file-ops-checklist.md, not here.

import { createInternalClipboard } from "./clipboard-port";

describe("createInternalClipboard (R-15-1)", () => {
  it("starts empty", async () => {
    const cb = createInternalClipboard();
    expect(await cb.get()).toBeNull();
  });

  it("returns what was set: copy origin", async () => {
    const cb = createInternalClipboard();
    await cb.set({ paths: ["C:\\a.txt", "C:\\b.txt"], origin: "internal-copy" });
    expect(await cb.get()).toEqual({ paths: ["C:\\a.txt", "C:\\b.txt"], origin: "internal-copy" });
  });

  it("returns what was set: cut origin", async () => {
    const cb = createInternalClipboard();
    await cb.set({ paths: ["C:\\a.txt"], origin: "internal-cut" });
    expect((await cb.get())?.origin).toBe("internal-cut");
  });

  it("a later set replaces the previous content", async () => {
    const cb = createInternalClipboard();
    await cb.set({ paths: ["C:\\a.txt"], origin: "internal-cut" });
    await cb.set({ paths: ["C:\\b.txt"], origin: "internal-copy" });
    expect(await cb.get()).toEqual({ paths: ["C:\\b.txt"], origin: "internal-copy" });
  });

  it("clear empties it (used after a successful move so moved paths do not linger)", async () => {
    const cb = createInternalClipboard();
    await cb.set({ paths: ["C:\\a.txt"], origin: "internal-cut" });
    await cb.clear();
    expect(await cb.get()).toBeNull();
  });

  it("mutating the array passed to set (or returned by get) does not corrupt the stored content", async () => {
    const cb = createInternalClipboard();
    const input = ["C:\\a.txt"];
    await cb.set({ paths: input, origin: "internal-copy" });
    input.push("C:\\evil.txt");
    const first = await cb.get();
    first!.paths.push("C:\\evil2.txt");
    expect((await cb.get())?.paths).toEqual(["C:\\a.txt"]);
  });

  it("each instance is independent (feature-local state, not a shared singleton)", async () => {
    const one = createInternalClipboard();
    const two = createInternalClipboard();
    await one.set({ paths: ["C:\\a.txt"], origin: "internal-copy" });
    expect(await two.get()).toBeNull();
  });
});
