import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0016 R-701/R-703/R-710-1/R-720~R-726-3/R-730/R-747, AC-702,
//   AC-706, AC-707, AC-711, AC-742, AC-744, AC-750.
// Architecture: SPEC-0200-0001 §3.7.4, §3.7.10.4 (MUST-100 a/b/d), §3.7.10.9
//   (SHOULD-136). Module under test: ./path-bar-state.svelte.ts (TDD stub:
//   focus plumbing exists; MUST-100(a) reset and confirm/Tab are RED).

import type { NavigateResult } from "$lib/shared/navigation-result";
import { createPathBarState, type PathBarDeps } from "./path-bar-state.svelte";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function make(over: Partial<PathBarDeps> & { cur?: { v: string } } = {}) {
  const cur = over.cur ?? { v: "C:\\A" };
  const deps: PathBarDeps = {
    currentPath: () => cur.v,
    navigate: vi.fn(async (p: string): Promise<NavigateResult> => ({ status: "success", path: p })),
    listDirForCompletion: vi.fn(async () => []),
    showHidden: () => false,
    notify: vi.fn(),
    onExitToList: vi.fn(),
    onOpenHistory: vi.fn(),
    onAddJump: vi.fn(),
    ...over,
  };
  const state = createPathBarState(deps);
  return { state, deps, cur };
}

describe("editing / text (R-701, MUST-100(b))", () => {
  it("editing is derived from focus; not editing shows currentPath always", () => {
    const { state, cur } = make();
    expect(state.editing).toBe(false);
    expect(state.text).toBe("C:\\A");
    cur.v = "C:\\B";
    expect(state.text).toBe("C:\\B");
    state.setFocused(true);
    expect(state.editing).toBe(true);
    state.setFocused(false);
    expect(state.editing).toBe(false);
  });

  it("MUST-100(a)/AC-702/R-703: gaining focus resets the text to the current path (no stale input)", () => {
    const { state } = make();
    state.setFocused(true);
    state.setText("C:\\X");
    state.setFocused(false);
    state.setFocused(true);
    expect(state.text).toBe("C:\\A");
  });

  it("R-704: discardEdit restores currentPath", () => {
    const { state } = make();
    state.setFocused(true);
    state.setText("C:\\X");
    state.discardEdit();
    expect(state.text).toBe("C:\\A");
  });
});

describe("handleConfirm: pre-navigation branches", () => {
  it("R-722-1: empty input does nothing (no navigate, no notify, stays editing)", async () => {
    const { state, deps } = make();
    state.setFocused(true);
    state.setText("   ");
    await state.handleConfirm();
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.onExitToList).not.toHaveBeenCalled();
  });

  it("AC-709/R-722: invalid input never calls navigate, notifies, keeps text", async () => {
    const { state, deps } = make();
    state.setFocused(true);
    state.setText("foo");
    await state.handleConfirm();
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(state.text).toBe("foo");
    expect(deps.onExitToList).not.toHaveBeenCalled();
  });

  it("AC-711/R-723: same path (case/trailing sep differences) skips navigate and exits to list", async () => {
    const { state, deps } = make({ cur: { v: "C:\\Users\\Foo" } });
    state.setFocused(true);
    state.setText("c:\\users\\foo\\");
    await state.handleConfirm();
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.onExitToList).toHaveBeenCalledTimes(1);
  });

  it("AC-708: navigate receives the normalized path", async () => {
    const { state, deps } = make();
    state.setFocused(true);
    state.setText('  "c:/Users//Foo/" ');
    await state.handleConfirm();
    expect(deps.navigate).toHaveBeenCalledWith("c:\\Users\\Foo");
  });
});

describe("handleConfirm: 3-way resolution (MUST-100(d), R-724/R-726-1~3/R-730)", () => {
  async function pending(text = "C:\\Slow") {
    const d = deferred<NavigateResult>();
    const m = make({ navigate: vi.fn(() => d.promise) });
    m.state.setFocused(true);
    m.state.setText(text);
    const p = m.state.handleConfirm();
    return { ...m, d, p };
  }

  it("AC-706/R-724: success, still editing, text unchanged -> exit to list", async () => {
    const { deps, d, p } = await pending();
    d.resolve({ status: "success", path: "C:\\Slow" });
    await p;
    expect(deps.onExitToList).toHaveBeenCalledTimes(1);
  });

  it("AC-707/R-730/R-730-1: failure, text unchanged -> notify, no exit, text kept", async () => {
    const { state, deps, d, p } = await pending("C:\\NoSuch");
    d.resolve({ status: "failed", code: "not_found", message: "not found" });
    await p;
    expect(deps.onExitToList).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith("not found");
    expect(state.text).toBe("C:\\NoSuch");
  });

  it("R-726 / AC-712: stale result does nothing at all (no notify, no focus move)", async () => {
    const { deps, d, p } = await pending();
    d.resolve({ status: "stale" });
    await p;
    expect(deps.onExitToList).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("AC-742/R-726-1: not editing at resolution (Escaped out) -> success does not move focus", async () => {
    const { state, deps, d, p } = await pending();
    state.setFocused(false);
    d.resolve({ status: "success", path: "C:\\Slow" });
    await p;
    expect(deps.onExitToList).not.toHaveBeenCalled();
  });

  it("AC-742/R-726-1: not editing at resolution -> failure still notifies (message only)", async () => {
    const { state, deps, d, p } = await pending();
    state.setFocused(false);
    d.resolve({ status: "failed", code: "other", message: "boom" });
    await p;
    expect(deps.notify).toHaveBeenCalledWith("boom");
    expect(deps.onExitToList).not.toHaveBeenCalled();
  });

  it("AC-750/R-726-2: success but text edited meanwhile -> keep editing, text, no exit", async () => {
    const { state, deps, d, p } = await pending();
    state.setText("C:\\Oth");
    d.resolve({ status: "success", path: "C:\\Slow" });
    await p;
    expect(deps.onExitToList).not.toHaveBeenCalled();
    expect(state.editing).toBe(true);
    expect(state.text).toBe("C:\\Oth");
  });

  it("R-726-3: failure and text edited meanwhile -> notify only, text unchanged", async () => {
    const { state, deps, d, p } = await pending();
    state.setText("C:\\Oth");
    d.resolve({ status: "failed", code: "not_found", message: "nf" });
    await p;
    expect(deps.notify).toHaveBeenCalledWith("nf");
    expect(state.text).toBe("C:\\Oth");
  });
});

describe("handleTabComplete (R-740~R-748)", () => {
  it("AC-713: single directory completes to parent+name+\\", async () => {
    const { state } = make({ listDirForCompletion: vi.fn(async () => [{ name: "Documents" }]) });
    state.setFocused(true);
    state.setText("C:\\A\\doc");
    await state.handleTabComplete();
    expect(state.text).toBe("C:\\A\\Documents\\");
  });

  it("AC-714: common prefix extends; second Tab notifies the count and keeps text", async () => {
    const { state, deps } = make({
      listDirForCompletion: vi.fn(async () => [{ name: "Project1" }, { name: "project2" }, { name: "Other" }]),
    });
    state.setFocused(true);
    state.setText("C:\\A\\pro");
    await state.handleTabComplete();
    expect(state.text).toBe("C:\\A\\Project");
    await state.handleTabComplete();
    expect(state.text).toBe("C:\\A\\Project");
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it("AC-715/R-745: no candidates, invalid parent, listing failure -> notify, text unchanged", async () => {
    const { state, deps } = make({
      listDirForCompletion: vi.fn(async (p: string) => {
        if (p.includes("NoSuch")) throw new Error("x");
        return [];
      }),
    });
    state.setFocused(true);
    for (const t of ["C:\\A\\pro", "C:\\NoSuch\\x", "foo"]) {
      state.setText(t);
      await state.handleTabComplete();
      expect(state.text).toBe(t);
    }
    expect(deps.notify).toHaveBeenCalledTimes(3);
  });

  it("AC-744/R-747: result discarded when text changed meanwhile (snapshot compare), no notify", async () => {
    const d = deferred<{ name: string }[]>();
    const { state, deps } = make({ listDirForCompletion: vi.fn(() => d.promise) });
    state.setFocused(true);
    state.setText("C:\\Slow\\a");
    const p = state.handleTabComplete();
    state.setText("C:\\Slow\\ab");
    d.resolve([{ name: "abc" }]);
    await p;
    expect(state.text).toBe("C:\\Slow\\ab");
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("MUST-100(d): result discarded when no longer editing", async () => {
    const d = deferred<{ name: string }[]>();
    const { state } = make({ listDirForCompletion: vi.fn(() => d.promise) });
    state.setFocused(true);
    state.setText("C:\\A\\do");
    const p = state.handleTabComplete();
    state.setFocused(false);
    d.resolve([{ name: "Docs" }]);
    await p;
    expect(state.text).toBe("C:\\A");
  });

  it("R-742: showHidden is passed through to the listing", async () => {
    const list = vi.fn(async () => []);
    const { state } = make({ listDirForCompletion: list, showHidden: () => true });
    state.setFocused(true);
    state.setText("C:\\A\\.c");
    await state.handleTabComplete();
    expect(list).toHaveBeenCalledWith("C:\\A\\", true);
  });
});

describe("SHOULD-136: no Map/Set anywhere in the path-bar feature sources", () => {
  it("no new Map/Set/WeakMap/WeakSet/SvelteMap/SvelteSet in non-test sources", () => {
    for (const f of ["path-bar-state.svelte.ts", "normalize.ts", "completion.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/\bnew\s+(Map|Set|WeakMap|WeakSet)\b|SvelteMap|SvelteSet/);
    }
  });
});
