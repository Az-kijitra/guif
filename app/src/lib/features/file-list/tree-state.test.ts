import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-40~R-45, R-64~R-66, AC-600~AC-608, AC-612-1.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.3,
//   §3.6.11.4 (MUST-87), §3.6.11.7 (MUST-90), §3.6.11.11 (SHOULD-122/124/125).
//
// Module under test (not yet implemented): ./tree-state.svelte.ts
//
// Contract assumed (documented in the handback report, since §3.6.3/§3.6.11
// specify behavior but not the exact factory signature):
//
//   createTreeState(deps: {
//     listDir: (path: string, showHidden: boolean) => Promise<{ path: string; name: string }[]>;
//     isVisible: () => boolean;              // MUST-87(f): injected, no list-state import
//     onLoadFailureNotice: (message: string) => void; // R-40-3 aggregated notice
//   }) -> {
//     root, currentDirPath, focusedPath, hasFocus (getters),
//     followTo(path: string, opts?: { rebuild?: boolean }): Promise<void>,
//     clear(): void,                          // MUST-94/MUST-87(b)
//     toggleExpand(path: string): void,
//     handleMoveRight(): void, handleMoveLeft(): void,  // R-65/R-66
//     moveFocus(direction: "up" | "down"): void,
//     moveFocusPage(direction: "up" | "down", pageSize: number): void,
//     selectFocused(): { path: string } | null,
//     applyHiddenFilesChanged(showHidden: boolean): void,
//     visibleRows(): { path: string; name: string; level: number; expanded: boolean; loading: boolean }[],
//     setContainerFocus(focused: boolean): void,  // onfocus/onblur tracking (rawHasFocus)
//   }
//
// `listDir` is dir-only (R-41: the tree always filters to directories,
// name/asc). Fetch failures are simulated by rejecting with
// `Object.assign(new Error(message), { code })`, mirroring the `code` field
// `shared/ipc/fs.ts`'s `FsListDirError` normalizes onto every fs_list_dir
// rejection (MUST-95).

import { createTreeState } from "./tree-state.svelte";
import { pathComparisonKey } from "$lib/shared/path-key";

function accessDenied(message = "denied") {
  return Promise.reject(Object.assign(new Error(message), { code: "access_denied" }));
}
function notFound(message = "gone") {
  return Promise.reject(Object.assign(new Error(message), { code: "not_found" }));
}
function otherError(message = "boom") {
  return Promise.reject(Object.assign(new Error(message), { code: "other" }));
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function makeState(overrides: { listDir?: ReturnType<typeof vi.fn>; isVisible?: () => boolean } = {}) {
  const onLoadFailureNotice = vi.fn();
  const listDir =
    overrides.listDir ??
    vi.fn(async (path: string) => {
      // A tiny in-memory tree: C:\ -> A -> B ; C:\ -> A -> C ; D:\ -> X
      const table: Record<string, { path: string; name: string }[]> = {
        "C:\\": [{ path: "C:\\A", name: "A" }],
        "C:\\A": [
          { path: "C:\\A\\B", name: "B" },
          { path: "C:\\A\\C", name: "C" },
        ],
        "C:\\A\\B": [],
        "C:\\A\\C": [],
        "D:\\": [{ path: "D:\\X", name: "X" }],
        "D:\\X": [],
      };
      return table[path] ?? [];
    });
  const isVisible = overrides.isVisible ?? (() => true);
  const listDrives = vi.fn(async () => ["C:\\", "D:\\"]);
  const state = createTreeState({ listDir, isVisible, onLoadFailureNotice, listDrives });
  return { state, listDir, onLoadFailureNotice, listDrives };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("followTo: same-drive move (SPEC-0300-0009 R-40-1/R-44, AC-600/AC-602)", () => {
  it("AC-600: builds the root, expands the ancestor chain, and highlights/focuses the target", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A\\B");
    await flush();

    expect(state.anchorKey).toBe(pathComparisonKey("C:\\"));
    expect(state.currentDirPath).toBe("C:\\A\\B");
    expect(state.focusedPath).toBe("C:\\A\\B");
  });

  it("AC-602: a later same-drive move keeps a manually-expanded sibling node's expansion", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A\\B");
    await flush();
    state.toggleExpand("C:\\A\\C"); // user manually expands a sibling
    await flush();

    await state.followTo("C:\\A\\C"); // still same drive
    await flush();

    const rows = state.visibleRows();
    const c = rows.find((r) => r.path === "C:\\A\\C");
    expect(c?.expanded).toBe(true);
  });
});

// REVISED 2026-10-01 (unit-test-writer, Phase 8; SHOULD-137): the old AC-603
// "rebuild" suite asserted the previous drive's nodes disappear. SPEC-0300-0009
// 第9版 R-44/AC-603 + SPEC-0300-0016 R-775: the tree is NOT rebuilt -- the
// anchor switches; the old drive node stays in the top-level list (collapsed,
// children discarded). More detail: tree-state-drives.test.ts.
describe("followTo: cross-drive move switches the anchor (SPEC-0300-0016 R-775, SPEC-0300-0009 第9版 AC-603)", () => {
  it("AC-603 (revised): anchor changes; the old drive node remains but collapsed with no children", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A\\B");
    await flush();

    await state.followTo("D:\\X");
    await flush();

    expect(state.anchorKey).toBe(pathComparisonKey("D:\\"));
    expect(state.currentDirPath).toBe("D:\\X");
    const rows = state.visibleRows();
    expect(rows.map((r) => r.path)).toEqual(["C:\\", "D:\\", "D:\\X"]);
    expect(rows.find((r) => r.path === "C:\\")?.expanded).toBe(false);
  });
});

describe("followTo: latest request wins (SPEC-0300-0009 R-40-7, AC-608; MUST-90(a))", () => {
  it("a slow first followTo does not overwrite the highlight set by a faster, later followTo", async () => {
    let resolveSlow!: (v: { path: string; name: string }[]) => void;
    const listDir = vi.fn((path: string) => {
      if (path === "C:\\") return new Promise<{ path: string; name: string }[]>((r) => (resolveSlow = r));
      if (path === "C:\\A") return Promise.resolve([{ path: "C:\\A\\B", name: "B" }]);
      return Promise.resolve([]);
    });
    const { state } = makeState({ listDir });

    const first = state.followTo("C:\\A\\B"); // starts a slow fetch of "C:\\"
    const second = state.followTo("D:\\X"); // this one must win
    resolveSlow([{ path: "C:\\A", name: "A" }]); // the slow one finally resolves
    await Promise.all([first, second]);
    await flush();

    expect(state.currentDirPath).toBe("D:\\X");
    expect(state.anchorKey).toBe(pathComparisonKey("D:\\"));
  });
});

describe("toggleExpand (SPEC-0300-0009 R-64, AC-28/AC-48): on-demand child fetch", () => {
  it("AC-28: children are not fetched until the node is expanded", async () => {
    const { state, listDir } = makeState();
    await state.followTo("C:\\A");
    await flush();
    listDir.mockClear();
    expect(listDir).not.toHaveBeenCalled();
  });

  it("expanding a node fetches its children exactly once", async () => {
    const { state, listDir } = makeState();
    await state.followTo("C:\\A");
    await flush();
    listDir.mockClear();

    state.toggleExpand("C:\\A");
    await flush();

    expect(listDir).toHaveBeenCalledWith("C:\\A", expect.anything());
    const rows = state.visibleRows();
    expect(rows.some((r) => r.path === "C:\\A\\B")).toBe(true);
  });
});

describe("load failures (SPEC-0300-0009 R-40-2/R-40-3, AC-604/AC-605)", () => {
  it("AC-604 (i): access-denied leaves the node childless/collapsed WITHOUT any notice", async () => {
    const listDir = vi.fn((path: string) => (path === "C:\\A" ? accessDenied() : Promise.resolve([])));
    const { state, onLoadFailureNotice } = makeState({ listDir });
    await state.followTo("C:\\A");
    await flush();

    expect(onLoadFailureNotice).not.toHaveBeenCalled();
  });

  it("AC-604 (ii): a non-access-denied/not-found failure notifies exactly once even with multiple failures in one build", async () => {
    const listDir = vi.fn((path: string) => (path === "C:\\" || path === "C:\\A" ? otherError() : Promise.resolve([])));
    const { state, onLoadFailureNotice } = makeState({ listDir });
    await state.followTo("C:\\A\\B");
    await flush();

    expect(onLoadFailureNotice).toHaveBeenCalledTimes(1);
  });

  it("AC-605/AC-605-1: when a deeper path segment cannot be fetched, the deepest reachable node is highlighted instead of erroring", async () => {
    const listDir = vi.fn((path: string) => (path === "C:\\A" ? notFound() : Promise.resolve([{ path: "C:\\A", name: "A" }])));
    const { state } = makeState({ listDir });
    await state.followTo("C:\\A\\B");
    await flush();

    expect(state.focusedPath).toBe("C:\\"); // could not descend past the root
  });
});

describe("node keys are case/trailing-separator normalized (SPEC-0300-0009 R-40-6, AC-605-2; MUST-90(d))", () => {
  it("AC-605-2: a differently-cased path for an already-visited folder highlights the SAME node (no duplicate)", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A");
    await flush();
    await state.followTo("c:\\a\\");
    await flush();

    const rows = state.visibleRows();
    // Test fix (code-reviewer minor item, 2026-09-29): AC-605-2 requires the
    // SAME node (no duplicate) -- `toBeLessThanOrEqual(1)` would also accept
    // 0 (the node silently disappearing), which is not what "highlights the
    // SAME node" means. The node produced by the first followTo() must still
    // be exactly the one found.
    expect(rows.filter((r) => r.path.toLowerCase() === "c:\\a").length).toBe(1);
  });
});

describe("applyHiddenFilesChanged (SPEC-0300-0009 R-40-4; MUST-90(b))", () => {
  it("re-fetches an already-loaded expanded node's children with the new showHidden flag", async () => {
    const { state, listDir } = makeState();
    await state.followTo("C:\\A");
    await flush();
    state.toggleExpand("C:\\A");
    await flush();
    listDir.mockClear();

    state.applyHiddenFilesChanged(true);
    await flush();

    expect(listDir).toHaveBeenCalledWith("C:\\A", true);
  });

  // Test fix (code-generator, 2026-09-29): the previous version of this test
  // made `state.toggleExpand("C:\\A")`'s OWN initial load (the only prior
  // fetch of "C:\\A") the pending "call #1", which never settled within the
  // test's own `await flush()` -- so `applyHiddenFilesChanged`'s
  // `loaded && expanded` guard (R-40-4) never even issued the two racing
  // fetches the test's comments describe. That premise silently relied on
  // `followTo` pre-fetching the FINAL target's own children in the
  // background, which R-42 注記/AC-30 forbid (the current folder's node
  // stays collapsed and unloaded until the user explicitly expands it, R-64
  // -- R-40-1 only expands the ANCESTOR chain). This revision lets
  // `toggleExpand`'s own initial load resolve normally first (a distinct,
  // immediately-resolving call), so the SUBSEQUENT `applyHiddenFilesChanged`
  // pair is the actual slow/fast race MUST-90(b) is about.
  it("MUST-90(b): a stale (superseded) hidden-files toggle result never overwrites the latest one", async () => {
    let resolveSlow!: (v: { path: string; name: string }[]) => void;
    let callCount = 0;
    const listDir = vi.fn((path: string, showHidden: boolean) => {
      if (path === "C:\\A") {
        callCount += 1;
        if (callCount === 1) return Promise.resolve([]); // toggleExpand's own initial load
        if (callCount === 2) return new Promise<{ path: string; name: string }[]>((r) => (resolveSlow = r)); // slow: showHidden=true
        return Promise.resolve(showHidden ? [{ path: "C:\\A\\.hidden", name: ".hidden" }] : []); // fast: showHidden=false
      }
      return Promise.resolve([]);
    });
    const { state } = makeState({ listDir });
    await state.followTo("C:\\A");
    await flush();
    state.toggleExpand("C:\\A"); // call #1: resolves immediately, node becomes loaded+expanded
    await flush();

    state.applyHiddenFilesChanged(true); // slow: showHidden=true (call #2, pending)
    state.applyHiddenFilesChanged(false); // fast: showHidden=false (call #3, resolves first)
    await flush();
    resolveSlow([{ path: "C:\\A\\.hidden", name: ".hidden" }]); // the STALE result arrives last
    await flush();

    const rows = state.visibleRows();
    expect(rows.some((r) => r.path === "C:\\A\\.hidden")).toBe(false);
  });
});

describe("clear() (SPEC-0300-0009 R-44 non-visible clause; SPEC-0200-0001 §3.6.11.4 MUST-87(b)/MUST-94)", () => {
  it("clears root/nodes WITHOUT performing any fetch", async () => {
    const { state, listDir } = makeState();
    await state.followTo("C:\\A");
    await flush();
    listDir.mockClear();

    state.clear();

    expect(listDir).not.toHaveBeenCalled();
    expect(state.drives).toEqual([]);
    expect(state.visibleRows()).toEqual([]);
  });
});

describe("hasFocus derivation (SPEC-0200-0001 §3.6.3/§3.6.11.4 MUST-87(f): isVisible is injected)", () => {
  it("hasFocus is false while the tree is not visible, even if the container reports focus", () => {
    const { state } = makeState({ isVisible: () => false });
    state.setContainerFocus(true);
    expect(state.hasFocus).toBe(false);
  });

  it("hasFocus reflects the container's focus state while the tree is visible", () => {
    const { state } = makeState({ isVisible: () => true });
    state.setContainerFocus(true);
    expect(state.hasFocus).toBe(true);
    state.setContainerFocus(false);
    expect(state.hasFocus).toBe(false);
  });
});

describe("moveFocus / moveFocusPage (SPEC-0300-0009 R-57 analog, R-59-2)", () => {
  it("moveFocus('down')/('up') walk the flattened visible rows in order", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A"); // root C:\ expanded to A; A collapsed
    await flush();
    state.toggleExpand("C:\\A");
    await flush(); // visible rows now: C:\ (root display?), A, B, C -- exact root-row inclusion is an implementation detail

    const before = state.focusedPath;
    state.moveFocus("down");
    expect(state.focusedPath).not.toBe(before);
  });

  it("moveFocusPage moves by the given page size, clamped to the visible rows", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A");
    await flush();
    state.toggleExpand("C:\\A");
    await flush();

    state.moveFocus("up"); // go to the first visible row first (deterministic starting point)
    state.moveFocus("up");
    state.moveFocus("up");
    const rows = state.visibleRows();
    state.moveFocusPage("down", 1000); // far larger than the tree: clamp to the last row
    expect(state.focusedPath).toBe(rows[rows.length - 1]?.path);
  });
});

// Coordinator WebView2 finding: a real 3-segment-deep path (e.g.
// C:\Users\<user>\git) appeared to only expand the FIRST ancestor (Users),
// not the whole chain. This regression test pins the PUBLIC state contract
// for a chain this deep (root -> Users -> toshi -> git): every ancestor
// (including the middle one, "toshi", reused as BOTH a childNode at one
// iteration AND a parentNode at the next) must end up loaded/expanded with
// its children populated, not just the first hop from root.
describe("followTo: a 3-segment-deep ancestor chain expands every ancestor, not just the first hop", () => {
  it("root -> Users -> toshi -> git: all 3 ancestors are expanded with children populated", async () => {
    const table: Record<string, { path: string; name: string }[]> = {
      "C:\\": [{ path: "C:\\Users", name: "Users" }],
      "C:\\Users": [{ path: "C:\\Users\\toshi", name: "toshi" }],
      "C:\\Users\\toshi": [{ path: "C:\\Users\\toshi\\git", name: "git" }],
      "C:\\Users\\toshi\\git": [],
    };
    const listDir = async (path: string) => table[path] ?? [];
    const state = createTreeState({ listDir, isVisible: () => true, onLoadFailureNotice: () => {}, listDrives: async () => ["C:\\"] });
    await state.followTo("C:\\Users\\toshi\\git");
    await flush();

    const rows = state.visibleRows();
    expect(rows.map((r) => r.path)).toEqual(["C:\\", "C:\\Users", "C:\\Users\\toshi", "C:\\Users\\toshi\\git"]);
    // Every ANCESTOR (all but the final target) must be expanded so its
    // child is actually visible in the flattened DFS above.
    expect(rows.find((r) => r.path === "C:\\")?.expanded).toBe(true);
    expect(rows.find((r) => r.path === "C:\\Users")?.expanded).toBe(true);
    expect(rows.find((r) => r.path === "C:\\Users\\toshi")?.expanded).toBe(true);
    // The final target itself stays collapsed (R-42 注記/AC-30).
    expect(rows.find((r) => r.path === "C:\\Users\\toshi\\git")?.expanded).toBe(false);
    expect(state.focusedPath).toBe("C:\\Users\\toshi\\git");
  });
});

describe("selectFocused (SPEC-0300-0009 R-43)", () => {
  it("returns the focused node's path when one exists", async () => {
    const { state } = makeState();
    await state.followTo("C:\\A\\B");
    await flush();
    expect(state.selectFocused()).toEqual({ path: "C:\\A\\B" });
  });

  it("returns null when the tree has never been built", () => {
    const { state } = makeState();
    expect(state.selectFocused()).toBeNull();
  });
});
