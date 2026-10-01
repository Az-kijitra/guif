import { describe, expect, it, vi } from "vitest";

// Phase 8 (SPEC-0300-0016 R-770~R-779, AC-730~AC-737, AC-747, AC-755, AC-756;
// SPEC-0200-0001 §3.7.3, §3.7.10.6 MUST-102, §3.7.10.14 SHOULD-137/142/144).
// Contract assumed (design leaves exact names to §3.7.3): deps.listDrives;
// getters drives, anchorKey (pathComparisonKey form), extraNodeKey, and a
// test-only read-only `version` (SHOULD-144). Module under test:
// ./tree-state.svelte.ts (not yet extended -> RED).

import { pathComparisonKey } from "$lib/shared/path-key";
import { createTreeState } from "./tree-state.svelte";

type E = { path: string; name: string };
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function table(): (p: string) => Promise<E[]> {
  const t: Record<string, E[]> = {
    "C:\\": [{ path: "C:\\A", name: "A" }],
    "C:\\A": [{ path: "C:\\A\\B", name: "B" }],
    "C:\\A\\B": [],
    "D:\\": [{ path: "D:\\X", name: "X" }],
    "D:\\X": [],
    "\\\\server\\share\\": [{ path: "\\\\server\\share\\X", name: "X" }],
    "\\\\server\\share\\X": [],
  };
  return async (p) => t[p] ?? [];
}

function make(over: { listDir?: (p: string, h: boolean) => Promise<E[]>; isVisible?: () => boolean; listDrives?: () => Promise<string[]> } = {}) {
  const listDir = vi.fn(over.listDir ?? table());
  const listDrives = vi.fn(over.listDrives ?? (async () => ["C:\\", "D:\\"]));
  const state = createTreeState({ listDir, isVisible: over.isVisible ?? (() => true), onLoadFailureNotice: () => {}, listDrives });
  return { state, listDir, listDrives };
}
const tops = (s: ReturnType<typeof make>["state"]) => s.visibleRows().filter((r) => r.level === 0).map((r) => r.path);

describe("drive list at the top level (R-770~R-772, R-778, AC-730, AC-755)", () => {
  it("AC-730: ascending drives, current drive expanded, others collapsed", async () => {
    const { state } = make();
    await state.followTo("C:\\A\\B");
    await flush();
    expect(tops(state)).toEqual(["C:\\", "D:\\"]);
    const rows = state.visibleRows();
    expect(rows.find((r) => r.path === "C:\\")?.expanded).toBe(true);
    expect(rows.find((r) => r.path === "D:\\")?.expanded).toBe(false);
    expect(state.focusedPath).toBe("C:\\A\\B");
    expect(state.anchorKey).toBe(pathComparisonKey("C:\\"));
  });

  it("AC-755: a current drive missing from the enumeration is inserted in sorted position", async () => {
    const { state } = make({ listDrives: async () => ["C:\\", "E:\\"] });
    await state.followTo("D:\\X");
    await flush();
    expect(tops(state)).toEqual(["C:\\", "D:\\", "E:\\"]);
  });

  it("AC-734/R-774: ← on a collapsed drive node is a no-op; → expands it without moving the current path", async () => {
    const { state } = make();
    await state.followTo("C:\\A");
    await flush();
    for (let i = 0; i < 10; i++) state.moveFocus("down");
    expect(state.focusedPath).toBe("D:\\");
    state.handleMoveLeft();
    expect(state.focusedPath).toBe("D:\\");
    state.handleMoveRight();
    await flush();
    expect(state.visibleRows().some((r) => r.path === "D:\\X")).toBe(true);
    expect(state.currentDirPath).toBe("C:\\A");
  });

  it("AC-737/R-782: first render does not wait for a slow listDrives; other drives join when it resolves", async () => {
    let resolveDrives!: (v: string[]) => void;
    const { state } = make({ listDrives: () => new Promise<string[]>((r) => (resolveDrives = r)) });
    await state.followTo("C:\\A");
    await flush();
    expect(tops(state)).toEqual(["C:\\"]);
    resolveDrives(["C:\\", "D:\\"]);
    await flush();
    expect(tops(state)).toEqual(["C:\\", "D:\\"]);
  });
});

describe("re-enumeration triggers (R-781, MUST-102(c), SHOULD-137, AC-747)", () => {
  it("not on same-anchor moves; yes when the anchor changes, even to an already-listed drive", async () => {
    const { state, listDrives } = make();
    await state.followTo("C:\\A");
    await flush();
    expect(listDrives).toHaveBeenCalledTimes(1);
    await state.followTo("C:\\A\\B");
    await flush();
    expect(listDrives).toHaveBeenCalledTimes(1);
    await state.followTo("D:\\X");
    await flush();
    expect(listDrives).toHaveBeenCalledTimes(2);
  });

  it("after clear() the next followTo enumerates again", async () => {
    const { state, listDrives } = make();
    await state.followTo("C:\\A");
    await flush();
    state.clear();
    await state.followTo("C:\\A");
    await flush();
    expect(listDrives).toHaveBeenCalledTimes(2);
  });

  it("AC-747: a drive reported only by a later enumeration appears after an anchor change", async () => {
    let drives = ["C:\\"];
    const { state } = make({ listDrives: async () => drives });
    await state.followTo("C:\\A");
    await flush();
    drives = ["C:\\", "F:\\"];
    await state.followTo("C:\\A\\B");
    await flush();
    expect(state.drives).toEqual(["C:\\"]);
    await state.followTo("F:\\");
    await flush();
    expect(state.drives).toEqual(["C:\\", "F:\\"]);
  });

  it("SHOULD-137/142: a drive that vanished from the enumeration is removed (node too)", async () => {
    let drives = ["C:\\", "D:\\"];
    const { state } = make({ listDrives: async () => drives });
    await state.followTo("C:\\A");
    await flush();
    drives = ["C:\\"];
    await state.followTo("\\\\server\\share\\X"); // anchor change -> re-enumerate
    await flush();
    expect(state.visibleRows().some((r) => r.path === "D:\\")).toBe(false);
  });
});

describe("anchor switch discards other expanded drives (R-775, MUST-102(a)(b), SHOULD-142)", () => {
  it("a user-expanded OTHER drive is collapsed, children dropped, and re-fetched on next expand", async () => {
    const { state, listDir } = make();
    await state.followTo("C:\\A");
    await flush();
    state.toggleExpand("D:\\");
    await flush();
    expect(state.visibleRows().some((r) => r.path === "D:\\X")).toBe(true);
    await state.followTo("C:\\A\\B"); // same anchor: D stays
    expect(state.visibleRows().some((r) => r.path === "D:\\X")).toBe(true);
    await state.followTo("\\\\server\\share\\X"); // anchor switch
    await flush();
    expect(state.visibleRows().some((r) => r.path === "D:\\X")).toBe(false);
    listDir.mockClear();
    state.toggleExpand("D:\\");
    await flush();
    expect(listDir).toHaveBeenCalledWith("D:\\", expect.anything());
  });

  it("returning to the old drive does not resurrect descendants' expanded state", async () => {
    const { state } = make();
    await state.followTo("C:\\A\\B");
    await flush();
    await state.followTo("D:\\X");
    await flush();
    await state.followTo("C:\\");
    await flush();
    expect(state.visibleRows().find((r) => r.path === "C:\\A")?.expanded ?? false).toBe(false);
  });

  it("AC-731: after switching to D:\\ and back, expanding C:\\ re-fetches its children", async () => {
    const { state, listDir } = make();
    await state.followTo("C:\\A");
    await flush();
    await state.followTo("D:\\X");
    await flush();
    listDir.mockClear();
    state.toggleExpand("C:\\");
    await flush();
    expect(listDir).toHaveBeenCalledWith("C:\\", expect.anything());
  });

  it("an in-flight fetch for the old anchor is invalidated by the switch", async () => {
    let resolveC!: (v: E[]) => void;
    const base = table();
    const { state } = make({ listDir: (p) => (p === "C:\\" ? new Promise<E[]>((r) => (resolveC = r)) : base(p)) });
    const first = state.followTo("C:\\A");
    await state.followTo("D:\\X");
    resolveC([{ path: "C:\\A", name: "A" }]);
    await first;
    await flush();
    expect(state.visibleRows().some((r) => r.path === "C:\\A")).toBe(false);
  });
});

describe("extra top-level nodes (R-776, R-777, AC-735, AC-736, AC-756) and \\\\?\\ handling (MUST-102(e))", () => {
  it("AC-735: UNC share node follows the drives, expanded; moving to C:\\ removes it", async () => {
    const { state } = make();
    await state.followTo("\\\\server\\share\\X");
    await flush();
    expect(tops(state)).toEqual(["C:\\", "D:\\", "\\\\server\\share\\"]);
    expect(state.extraNodeKey).toBe(pathComparisonKey("\\\\server\\share\\"));
    expect(state.focusedPath).toBe("\\\\server\\share\\X");
    await state.followTo("C:\\");
    await flush();
    expect(state.extraNodeKey).toBeNull();
    expect(state.visibleRows().some((r) => r.path.startsWith("\\\\server"))).toBe(false);
  });

  it("AC-756 (i): \\\\?\\UNC\\ share node is shown without the prefix", async () => {
    const { state } = make();
    await state.followTo("\\\\?\\UNC\\server\\share\\X");
    await flush();
    expect(state.visibleRows().some((r) => r.path.includes("?"))).toBe(false);
    expect(state.visibleRows().some((r) => r.name === "\\\\server\\share\\")).toBe(true);
  });

  it("AC-756 (ii)/MUST-102(e): \\\\?\\C:\\A creates no fake 'C:\\C:' nodes; C:\\ is expanded, A highlighted", async () => {
    const { state } = make();
    await state.followTo("\\\\?\\C:\\A");
    await flush();
    const rows = state.visibleRows();
    expect(rows.some((r) => /C:\\C:/i.test(r.path))).toBe(false);
    expect(rows.find((r) => r.path === "C:\\")?.expanded).toBe(true);
    expect(state.focusedPath).toBe("C:\\A");
  });

  it("AC-736: a volume GUID path adds ONE single node after the drives; no listing is performed", async () => {
    const g = "\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\X";
    const { state, listDir } = make();
    await state.followTo(g);
    await flush();
    expect(tops(state)).toEqual(["C:\\", "D:\\", g]);
    expect(listDir).not.toHaveBeenCalled();
  });
});

describe("followTo is inert while the tree is hidden (R-779, MUST-102(d), AC-27)", () => {
  it("no listDir / listDrives calls and no rows", async () => {
    const { state, listDir, listDrives } = make({ isVisible: () => false });
    await state.followTo("C:\\A\\B");
    await flush();
    expect(listDir).not.toHaveBeenCalled();
    expect(listDrives).not.toHaveBeenCalled();
    expect(state.visibleRows()).toEqual([]);
  });
});

describe("version increments on every mutating operation (SHOULD-144: touch() leak detector)", () => {
  async function ready() {
    const m = make();
    await m.state.followTo("C:\\A");
    await flush();
    return m;
  }

  it("cross-drive followTo", async () => {
    const { state } = await ready();
    const v = state.version;
    await state.followTo("D:\\X");
    await flush();
    expect(state.version).toBeGreaterThan(v);
  });

  it("applying an enumeration result", async () => {
    let resolve!: (v: string[]) => void;
    const { state } = make({ listDrives: () => new Promise<string[]>((r) => (resolve = r)) });
    await state.followTo("C:\\A");
    await flush();
    const v = state.version;
    resolve(["C:\\", "D:\\"]);
    await flush();
    expect(state.version).toBeGreaterThan(v);
  });

  it("toggleExpand (expand, then collapse)", async () => {
    const { state } = await ready();
    let v = state.version;
    state.toggleExpand("D:\\");
    await flush();
    expect(state.version).toBeGreaterThan(v);
    v = state.version;
    state.toggleExpand("D:\\");
    expect(state.version).toBeGreaterThan(v);
  });

  it("handleMoveLeft collapsing an expanded node", async () => {
    const { state } = await ready();
    for (let i = 0; i < 10; i++) state.moveFocus("up");
    expect(state.focusedPath).toBe("C:\\");
    const v = state.version;
    state.handleMoveLeft();
    expect(state.version).toBeGreaterThan(v);
  });

  it("removeSubtree (anchor switch discarding an expanded other drive)", async () => {
    const { state } = await ready();
    state.toggleExpand("D:\\");
    await flush();
    const v = state.version;
    await state.followTo("\\\\server\\share\\X");
    await flush();
    expect(state.version).toBeGreaterThan(v);
  });
});
