import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0017 R-937 (a node known to have no children hides its
// caret; "no children" = a fetch that returned 0 entries, or a fetch that
// FAILED and left the node childless -- SPEC-0300-0009 R-40-3; a node whose
// children were never fetched keeps its caret).
// Design: SPEC-0200-0001 §3.8.4 as OVERRIDDEN by §3.8.17 SHOULD-150:
//   * `TreeRowView.leaf` is DERIVED, not stored:
//       leaf = (loadFailed && children === undefined) || (loaded && children.length === 0)
//   * the only state kept is the failure flag `loadFailed`; it is set in the
//     failure handler AFTER the stale check (a stale failure must not set it),
//     together with `touch()`; reset by a successful re-fetch and discardChildren.
//   * a failed RE-fetch of a node that still has children is NOT a leaf.
//   * SHOULD-144: the change must bump `version` (touch()).
// `visibleRows()` rows are read through a structural cast because the
// `leaf` field is not yet on the `TreeRowView` type (RED until implemented).

import { createTreeState } from "./tree-state.svelte";

type E = { path: string; name: string };
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const denied = () => Object.assign(new Error("denied"), { code: "access_denied" });

function baseTable(): Record<string, E[]> {
  return {
    "C:\\": [{ path: "C:\\A", name: "A" }],
    "C:\\A": [{ path: "C:\\A\\B", name: "B" }],
    "C:\\A\\B": [],
    "D:\\": [{ path: "D:\\X", name: "X" }],
    "D:\\X": [],
  };
}

function make(listDir: (p: string, h: boolean) => Promise<E[]>) {
  const fn = vi.fn(listDir);
  const notice = vi.fn();
  const state = createTreeState({
    listDir: fn,
    isVisible: () => true,
    onLoadFailureNotice: notice,
    listDrives: async () => ["C:\\", "D:\\"],
  });
  return { state, listDir: fn, notice };
}

type Row = { path: string; leaf?: boolean; expanded: boolean };
const rowOf = (s: ReturnType<typeof make>["state"], path: string) =>
  s.visibleRows().find((r) => r.path === path) as unknown as Row | undefined;
const leafOf = (s: ReturnType<typeof make>["state"], path: string) => rowOf(s, path)?.leaf;

describe("TreeRowView.leaf: derived from a loaded node with zero children (R-937)", () => {
  it("a node whose children were never fetched is NOT a leaf (its caret stays)", async () => {
    const t = baseTable();
    const { state } = make(async (p) => t[p] ?? []);
    await state.followTo("C:\\A\\B");
    await flush();
    expect(rowOf(state, "C:\\A\\B")).toBeDefined();
    expect(leafOf(state, "C:\\A\\B")).toBe(false); // the current folder itself is not fetched
  });

  it("a node with children is not a leaf", async () => {
    const t = baseTable();
    const { state } = make(async (p) => t[p] ?? []);
    await state.followTo("C:\\A\\B");
    await flush();
    expect(leafOf(state, "C:\\A")).toBe(false);
    expect(leafOf(state, "C:\\")).toBe(false);
  });

  it("AC-912: expanding a node whose fetch returns 0 folders makes it a leaf", async () => {
    const t = baseTable();
    const { state } = make(async (p) => t[p] ?? []);
    await state.followTo("C:\\A\\B");
    await flush();
    state.toggleExpand("C:\\A\\B");
    await flush();
    expect(rowOf(state, "C:\\A\\B")?.expanded).toBe(true);
    expect(leafOf(state, "C:\\A\\B")).toBe(true);
  });
});

describe("TreeRowView.leaf: failed fetch with no children (R-40-3, SHOULD-150)", () => {
  it("a non-stale failure that leaves the node childless makes it a leaf", async () => {
    const t = baseTable();
    const { state } = make(async (p) => {
      if (p === "C:\\A") throw denied();
      return t[p] ?? [];
    });
    await state.followTo("C:\\A\\B");
    await flush();
    expect(rowOf(state, "C:\\A")).toBeDefined();
    expect(leafOf(state, "C:\\A")).toBe(true);
  });

  it("a STALE failure does not set the failure flag (superseded fetch, SHOULD-150 'after the stale check')", async () => {
    const t = baseTable();
    const pending: { resolve: (e: E[]) => void; reject: (e: unknown) => void }[] = [];
    let pendingEnabled = false;
    const { state } = make((p) => {
      if (p === "C:\\A" && pendingEnabled) {
        return new Promise<E[]>((resolve, reject) => pending.push({ resolve, reject }));
      }
      return Promise.resolve(t[p] ?? []);
    });
    await state.followTo("C:\\A"); // A exists as an unfetched node
    await flush();
    pendingEnabled = true;
    state.toggleExpand("C:\\A"); // fetch #1 (token 1)
    state.toggleExpand("C:\\A"); // fetch #2 (token 2) -- node is not expanded yet, so it fetches again
    expect(pending).toHaveLength(2);
    pending[0].reject(denied()); // the superseded fetch fails
    await flush();
    expect(leafOf(state, "C:\\A")).toBe(false);
    pending[1].reject(denied()); // the current fetch fails
    await flush();
    expect(leafOf(state, "C:\\A")).toBe(true);
  });

  it("a failed RE-fetch of a node that still has children is NOT a leaf", async () => {
    const t = baseTable();
    let failA = false;
    const { state } = make(async (p) => {
      if (p === "C:\\A" && failA) throw denied();
      return t[p] ?? [];
    });
    await state.followTo("C:\\A\\B");
    await flush();
    expect(rowOf(state, "C:\\A")?.expanded).toBe(true);
    failA = true;
    state.applyHiddenFilesChanged(true); // re-fetches every loaded+expanded node
    await flush();
    expect(leafOf(state, "C:\\A")).toBe(false);
  });

  it("a successful re-fetch clears the failure flag (the node is no longer a leaf)", async () => {
    const t = baseTable();
    let failA = true;
    const { state } = make(async (p) => {
      if (p === "C:\\A" && failA) throw denied();
      return t[p] ?? [];
    });
    await state.followTo("C:\\A\\B");
    await flush();
    expect(leafOf(state, "C:\\A")).toBe(true);
    failA = false;
    state.toggleExpand("C:\\A");
    await flush();
    expect(rowOf(state, "C:\\A")?.expanded).toBe(true);
    expect(leafOf(state, "C:\\A")).toBe(false);
  });

  it("discardChildren (anchor change collapses the old drive) resets the failure flag", async () => {
    const t = baseTable();
    const { state } = make(async (p) => {
      if (p === "D:\\") throw denied();
      return t[p] ?? [];
    });
    await state.followTo("C:\\A");
    await flush();
    state.toggleExpand("D:\\"); // D:\ fetch fails -> leaf
    await flush();
    expect(leafOf(state, "D:\\")).toBe(true);
    await state.followTo("E:\\"); // anchor moves away from C:\ ... D:\ is discarded (collapsed, children dropped)
    await flush();
    expect(rowOf(state, "D:\\")).toBeDefined();
    expect(leafOf(state, "D:\\")).toBe(false);
  });
});

describe("leaf changes reach the view (SHOULD-144 / SHOULD-150: touch() after the assignment)", () => {
  it("version increases when a 0-children fetch flips the node to a leaf, and the new row shows it", async () => {
    const t = baseTable();
    const { state } = make(async (p) => t[p] ?? []);
    await state.followTo("C:\\A\\B");
    await flush();
    const before = state.version;
    expect(leafOf(state, "C:\\A\\B")).toBe(false);
    state.toggleExpand("C:\\A\\B");
    await flush();
    expect(state.version).toBeGreaterThan(before);
    expect(leafOf(state, "C:\\A\\B")).toBe(true);
  });

  it("version increases when a failure flips the node to a leaf, and the new row shows it", async () => {
    const t = baseTable();
    let failB = false;
    const { state } = make(async (p) => {
      if (p === "C:\\A\\B" && failB) throw denied();
      return t[p] ?? [];
    });
    await state.followTo("C:\\A\\B");
    await flush();
    expect(leafOf(state, "C:\\A\\B")).toBe(false); // current folder: not fetched yet
    failB = true;
    const before = state.version;
    state.toggleExpand("C:\\A\\B");
    await flush();
    expect(state.version).toBeGreaterThan(before);
    expect(leafOf(state, "C:\\A\\B")).toBe(true);
  });
});
