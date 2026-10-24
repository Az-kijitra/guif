import { describe, expect, it } from "vitest";
import {
  createTreeNode,
  getTreeChildQuery,
  handleTreeMoveLeft,
  handleTreeMoveRight,
  handleTreeNodeSelect,
  shouldRebuildTreeOnDirChange,
  toggleNodeExpansion,
} from "./tree";

// code-generator addition (2026-09-29, coordinator review item 2): R-59-2's
// "表示できる行数(完全に表示される行の数)" must be measured by the tree panel
// itself, never approximated from the file list's own layout. This pure
// function is what routes/+page.svelte feeds `computeFullyVisibleRows`'s
// result into `treePageStep`/`fullyVisibleRows()` with.
import { computeFullyVisibleRows } from "./tree";

// Phase 7 additions (SPEC-0300-0009 R-40/R-40-0/R-40-0-1/R-40-5/R-40-6, R-59-2;
// SPEC-0200-0001 §3.6.3, §3.6.11.7 SHOULD-125). Not yet implemented (TDD): a
// second import so the ABOVE (Phase 1) tests keep passing unaffected while
// these new named imports resolve to `undefined` until `./tree.ts` exports
// them (each new `it()` below fails individually with "is not a function",
// not a whole-file module-resolution error).
import * as treeNs from "./tree";
import { computeTreeRoot, isAncestorPath, pathsEqual, resolveAncestorChain, treePageStep } from "./tree";

// Spec: SPEC-0300-0009 (file list / tree view detail) §5 / §6.4
// Module under test (not yet implemented): ./tree.ts

describe("createTreeNode (SPEC-0300-0009 R-40, R-42, AC-28, AC-30, AC-31)", () => {
  it("AC-28/AC-30/AC-31: a freshly created node starts collapsed and unloaded (no children fetched yet)", () => {
    const node = createTreeNode({ path: "C:/root/dir", name: "dir" });
    expect(node.expanded).toBe(false);
    expect(node.loaded).toBe(false);
    expect(node.children).toBeUndefined();
  });
});

describe("getTreeChildQuery (SPEC-0300-0009 R-41, AC-29)", () => {
  it("AC-29: always requests directories sorted by name ascending, dir-only, via fs_list_dir params", () => {
    const query = getTreeChildQuery("C:/root/dir");
    expect(query).toEqual({
      path: "C:/root/dir",
      sortKey: "name",
      sortOrder: "asc",
      dirOnly: true,
    });
  });

  it("AC-29: tree query is unaffected by the file list's current sort setting", () => {
    const queryWhileListSortsBySize = getTreeChildQuery("C:/root/dir", {
      // the list-side current sort should have zero influence on the tree query
      currentListSortKey: "size",
      currentListSortOrder: "desc",
    });
    expect(queryWhileListSortsBySize.sortKey).toBe("name");
    expect(queryWhileListSortsBySize.sortOrder).toBe("asc");
  });
});

describe("toggleNodeExpansion (SPEC-0300-0009 R-64, AC-48)", () => {
  it("AC-48: clicking the caret toggles a collapsed node to expanded", () => {
    const collapsed = createTreeNode({ path: "C:/root/dir", name: "dir" });
    const toggled = toggleNodeExpansion(collapsed);
    expect(toggled.expanded).toBe(true);
  });

  it("AC-48: clicking the caret toggles an expanded node back to collapsed", () => {
    const expanded = { ...createTreeNode({ path: "C:/root/dir", name: "dir" }), expanded: true };
    const toggled = toggleNodeExpansion(expanded);
    expect(toggled.expanded).toBe(false);
  });
});

describe("handleTreeMoveRight (SPEC-0300-0009 R-65, AC-49, AC-50)", () => {
  it("AC-49: on an unloaded node, move_right requests expansion (fetch + expand)", () => {
    const node = createTreeNode({ path: "C:/root/dir", name: "dir" });
    const result = handleTreeMoveRight(node);
    expect(result).toEqual({ action: "expand" });
  });

  it("AC-50: on an already-expanded node with children, move_right focuses the first child", () => {
    const node = {
      ...createTreeNode({ path: "C:/root/dir", name: "dir" }),
      loaded: true,
      expanded: true,
      children: [
        { path: "C:/root/dir/a", name: "a" },
        { path: "C:/root/dir/b", name: "b" },
      ],
    };
    const result = handleTreeMoveRight(node);
    expect(result).toEqual({ action: "focus-child", path: "C:/root/dir/a" });
  });
});

describe("handleTreeMoveLeft (SPEC-0300-0009 R-66, AC-51)", () => {
  it("AC-51: on an expanded node, move_left collapses it", () => {
    const node = {
      ...createTreeNode({ path: "C:/root/dir", name: "dir" }),
      loaded: true,
      expanded: true,
      children: [{ path: "C:/root/dir/a", name: "a" }],
    };
    const result = handleTreeMoveLeft(node, "C:/root");
    expect(result).toEqual({ action: "collapse" });
  });

  it("AC-51: on a collapsed (or childless) node, move_left focuses the parent node", () => {
    const node = createTreeNode({ path: "C:/root/dir", name: "dir" });
    const result = handleTreeMoveLeft(node, "C:/root");
    expect(result).toEqual({ action: "focus-parent", path: "C:/root" });
  });
});

describe("handleTreeNodeSelect (SPEC-0300-0009 R-43, AC-24, AC-25)", () => {
  it("AC-24: selecting a tree node for a different path requests a directory reload", () => {
    const result = handleTreeNodeSelect("C:/root/dir", "C:/root/current");
    expect(result).toEqual({ shouldLoad: true, path: "C:/root/dir" });
  });

  it("AC-25: selecting the tree node for the already-open path does not trigger a reload", () => {
    const result = handleTreeNodeSelect("C:/root/current", "C:/root/current");
    expect(result.shouldLoad).toBe(false);
  });
});

describe("shouldRebuildTreeOnDirChange (SPEC-0300-0009 R-44, AC-26, AC-27)", () => {
  it("AC-26: rebuilds the tree to follow the new path when the tree is visible", () => {
    expect(shouldRebuildTreeOnDirChange({ treeVisible: true })).toBe(true);
  });

  it("AC-27: does not rebuild the tree when the tree is hidden", () => {
    expect(shouldRebuildTreeOnDirChange({ treeVisible: false })).toBe(false);
  });
});

describe("computeTreeRoot (SPEC-0300-0009 R-40/R-40-0/R-40-0-1/R-40-5, AC-600/AC-601/AC-607)", () => {
  it("AC-600: a local drive path's root is the drive root", () => {
    expect(computeTreeRoot("C:\\A\\B")).toEqual({ root: "C:\\", singleNodeOnly: false });
  });

  it("a bare drive root's own root is itself", () => {
    expect(computeTreeRoot("C:\\")).toEqual({ root: "C:\\", singleNodeOnly: false });
  });

  it("AC-601 (i): a UNC path's root is \\\\server\\share\\", () => {
    expect(computeTreeRoot("\\\\server\\share\\X")).toEqual({ root: "\\\\server\\share\\", singleNodeOnly: false });
  });

  it("AC-601 (ii)/R-40-0: a \\\\?\\ extended-length local path strips the prefix for the root", () => {
    expect(computeTreeRoot("\\\\?\\C:\\A")).toEqual({ root: "C:\\", singleNodeOnly: false });
  });

  it("AC-601 (iii)/R-40-0: a \\\\?\\UNC\\ extended-length UNC path strips the prefix for the root", () => {
    expect(computeTreeRoot("\\\\?\\UNC\\server\\share\\X")).toEqual({ root: "\\\\server\\share\\", singleNodeOnly: false });
  });

  it("R-40-0-1: a volume GUID path is excluded from the tree entirely (single node only, no root)", () => {
    expect(computeTreeRoot("\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\foo")).toEqual({
      root: null,
      singleNodeOnly: true,
    });
  });

  it("R-40-0-1: a device-namespace path (\\\\.\\...) is excluded from the tree entirely", () => {
    expect(computeTreeRoot("\\\\.\\PhysicalDrive0")).toEqual({ root: null, singleNodeOnly: true });
  });

  it("AC-607/R-40-5: computeTreeRoot never returns a multi-drive listing shape (single root or none)", () => {
    const r = computeTreeRoot("D:\\x");
    expect(r.root === null || typeof r.root === "string").toBe(true);
    expect(Array.isArray((r as unknown as { root: unknown }).root)).toBe(false);
  });
});

describe("pathsEqual (SPEC-0300-0009 R-40-6, AC-605-2)", () => {
  it("AC-605-2: case-insensitive and ignores a trailing separator difference", () => {
    expect(pathsEqual("C:\\Users\\Foo", "c:\\users\\FOO\\")).toBe(true);
  });

  it("different paths are not equal", () => {
    expect(pathsEqual("C:\\A", "C:\\B")).toBe(false);
  });

  it("a UNC root compares equal regardless of trailing separator", () => {
    expect(pathsEqual("\\\\server\\share", "\\\\server\\share\\")).toBe(true);
  });
});

describe("isAncestorPath (SPEC-0300-0009 R-40-6)", () => {
  it("the drive root is an ancestor of a nested path", () => {
    expect(isAncestorPath("C:\\", "C:\\A\\B")).toBe(true);
  });

  it("a path is not its own ancestor", () => {
    expect(isAncestorPath("C:\\A\\B", "C:\\A\\B")).toBe(false);
  });

  it("boundary check: 'C:\\A' is not an ancestor of the sibling 'C:\\AB'", () => {
    expect(isAncestorPath("C:\\A", "C:\\AB")).toBe(false);
  });

  it("case-insensitive, ignoring a trailing separator on the ancestor", () => {
    expect(isAncestorPath("c:\\a", "C:\\A\\B")).toBe(true);
  });

  it("a UNC share root is an ancestor of its children", () => {
    expect(isAncestorPath("\\\\server\\share\\", "\\\\server\\share\\X")).toBe(true);
  });

  it("an unrelated path is not an ancestor", () => {
    expect(isAncestorPath("C:\\A", "D:\\A\\B")).toBe(false);
  });
});

describe("resolveAncestorChain (SPEC-0300-0009 R-40-1, SHOULD-125: lexical only, no fetch-state awareness)", () => {
  it("returns the chain from the root to the target inclusive", () => {
    expect(resolveAncestorChain("C:\\A\\B", "C:\\")).toEqual(["C:\\", "C:\\A", "C:\\A\\B"]);
  });

  it("a UNC target under a UNC root", () => {
    expect(resolveAncestorChain("\\\\server\\share\\X\\Y", "\\\\server\\share\\")).toEqual([
      "\\\\server\\share\\",
      "\\\\server\\share\\X",
      "\\\\server\\share\\X\\Y",
    ]);
  });

  it("the target IS the root: a single-element chain", () => {
    expect(resolveAncestorChain("C:\\", "C:\\")).toEqual(["C:\\"]);
  });

  it("a one-level-deep target", () => {
    expect(resolveAncestorChain("C:\\A", "C:\\")).toEqual(["C:\\", "C:\\A"]);
  });
});

describe("treePageStep (SPEC-0300-0009 R-59-2, AC-623)", () => {
  it("AC-623 example: 10 fully-visible rows -> a page step of 9", () => {
    expect(treePageStep(10)).toBe(9);
  });

  it("the minimum step is 1, even with 0 or 1 fully-visible rows", () => {
    expect(treePageStep(1)).toBe(1);
    expect(treePageStep(0)).toBe(1);
  });

  it("2 fully-visible rows -> a step of 1", () => {
    expect(treePageStep(2)).toBe(1);
  });
});

describe("computeFullyVisibleRows (SPEC-0300-0009 R-59-2, AC-623)", () => {
  it("AC-623 worked example: rowHeight=28, height=300 -> 10 fully-visible rows", () => {
    expect(computeFullyVisibleRows(300, 28)).toBe(10);
  });

  it("SPEC-0300-0023 R-1754 / AC-1753: with the new 21px row (16px x 1.32) the same function gives floor(300 / 21) = 14 and floor(441 / 21) = 21", () => {
    expect(computeFullyVisibleRows(300, 21)).toBe(14);
    expect(computeFullyVisibleRows(441, 21)).toBe(21);
    expect(computeFullyVisibleRows(440, 21)).toBe(20);
  });

  it("a partially-cut-off trailing row is not counted (floors, never rounds/ceils)", () => {
    expect(computeFullyVisibleRows(299, 28)).toBe(10);
    expect(computeFullyVisibleRows(28, 28)).toBe(1);
    expect(computeFullyVisibleRows(27, 28)).toBe(1); // minimum 1 even when nothing fully fits
  });

  it("minimum is 1 even for a zero/negative height", () => {
    expect(computeFullyVisibleRows(0, 28)).toBe(1);
    expect(computeFullyVisibleRows(-10, 28)).toBe(1);
  });

  it("a zero/negative row height never divides by zero -- falls back to 1", () => {
    expect(computeFullyVisibleRows(300, 0)).toBe(1);
    expect(computeFullyVisibleRows(300, -5)).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Phase 8 (SPEC-0300-0016 R-770~R-778, AC-730, AC-735, AC-736, AC-755,
// AC-756; SPEC-0200-0001 §3.7.3, §3.7.10.6(e), §3.7.10.14 SHOULD-137/138/146).
// computeTreeTopLevel REPLACES computeTreeRoot for tree-state (computeTreeRoot
// tests above stay while it remains exported; AC-607's old "never a drive
// listing" assertion is obsolete: the drive list now exists, R-770 -- it only
// described computeTreeRoot's own shape and stays true for that function).
// New pure functions are accessed through a namespace import so a missing
// export fails per-test (RED), not at module load.
// ---------------------------------------------------------------------
describe("computeTreeTopLevel (R-771, R-776, R-777, SHOULD-138, MUST-102(e))", () => {
  const top = (p: string) => (treeNs as unknown as { computeTreeTopLevel: (p: string) => Record<string, unknown> }).computeTreeTopLevel(p);

  it("AC-730: a drive path -> anchor is the drive root, not extra, currentDrive is that drive", () => {
    expect(top("C:\\A\\B")).toEqual({ anchorRoot: "C:\\", anchorIsExtra: false, currentDrive: "C:\\", normalizedTarget: "C:\\A\\B" });
  });

  it("AC-756 (ii)/MUST-102(e): \\\\?\\C:\\A -> anchor C:\\, normalizedTarget has NO prefix (no fake 'C:\\C:' nodes)", () => {
    expect(top("\\\\?\\C:\\A")).toMatchObject({ anchorRoot: "C:\\", anchorIsExtra: false, currentDrive: "C:\\", normalizedTarget: "C:\\A" });
  });

  it("AC-735/AC-756 (i)/R-776: UNC and \\\\?\\UNC\\ -> extra anchor = share root, currentDrive null", () => {
    expect(top("\\\\server\\share\\X")).toMatchObject({ anchorRoot: "\\\\server\\share\\", anchorIsExtra: true, currentDrive: null });
    expect(top("\\\\?\\UNC\\server\\share\\X")).toMatchObject({ anchorRoot: "\\\\server\\share\\", anchorIsExtra: true, currentDrive: null, normalizedTarget: "\\\\server\\share\\X" });
  });

  it("AC-736/R-777: volume GUID and \\\\.\\ -> single extra node = the path itself, currentDrive null", () => {
    const g = "\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\X";
    expect(top(g)).toMatchObject({ anchorRoot: g, anchorIsExtra: true, currentDrive: null });
    expect(top("\\\\.\\C:\\Windows")).toMatchObject({ anchorIsExtra: true, currentDrive: null });
  });
});

describe("mergeDriveList (R-770-1, R-778, SHOULD-138)", () => {
  const merge = (e: string[], c: string | null) => (treeNs as unknown as { mergeDriveList: (e: string[], c: string | null) => string[] }).mergeDriveList(e, c);

  it("keeps an already-present drive list in ascending order", () => {
    expect(merge(["D:\\", "C:\\"], "C:\\")).toEqual(["C:\\", "D:\\"]);
  });

  it("AC-755: a current drive missing from the enumeration is inserted at its sorted position", () => {
    expect(merge(["C:\\", "E:\\"], "D:\\")).toEqual(["C:\\", "D:\\", "E:\\"]);
  });

  it("currentDrive null (UNC/GUID) adds nothing; case-insensitive no-duplicate", () => {
    expect(merge(["C:\\"], null)).toEqual(["C:\\"]);
    expect(merge(["C:\\"], "c:\\")).toEqual(["C:\\"]);
  });
});

describe("normalizeForTreeComparison (SHOULD-146)", () => {
  const norm = (p: string) => (treeNs as unknown as { normalizeForTreeComparison: (p: string) => string }).normalizeForTreeComparison(p);

  it("strips \\\\?\\ and rewrites \\\\?\\UNC\\ to \\\\\\\\", () => {
    expect(norm("\\\\?\\C:\\A")).toBe("C:\\A");
    expect(norm("\\\\?\\UNC\\s\\sh\\X")).toBe("\\\\s\\sh\\X");
  });

  it("leaves ordinary paths untouched", () => {
    expect(norm("C:\\A")).toBe("C:\\A");
  });
});

// ======================================================================
// Phase 9 (SPEC-0300-0017 R-936, R-938, R-938-1, R-940; AC-911, AC-913;
// SPEC-0200-0001 §3.8.4). Display name / title / indent are pure functions of
// the node path + level; `TreeRowView.name` and the node path/comparison are
// untouched. Stubs exist in ./tree.ts, so these fail (RED) until implemented.
// ======================================================================

const GUID = "{12345678-1234-1234-1234-123456789abc}";
const GUID_ROOT = "\\\\?\\Volume" + GUID + "\\";
const GUID_X = GUID_ROOT + "X";
const DEV_ROOT = "\\\\.\\C:\\";
const DEV_WIN = "\\\\.\\C:\\Windows";

describe("treeIndentCh (SPEC-0300-0023 R-1801, AC-1800; replaces treeIndentPx of R-936)", () => {
  it("is 2 x depth in ch (the indent is written in CSS ch, the mark column is a separate 2ch): C: 0, A 2, B 4", () => {
    expect(treeNs.treeIndentCh(0)).toBe(0);
    expect(treeNs.treeIndentCh(1)).toBe(2);
    expect(treeNs.treeIndentCh(2)).toBe(4);
    expect(treeNs.treeIndentCh(5)).toBe(10);
  });

  it("the old pixel helper is gone (no 8 + 14 x level any more)", () => {
    expect((treeNs as Record<string, unknown>).treeIndentPx).toBeUndefined();
  });
});

describe("treeNodeLabel: level > 0 is the folder name as is (R-938 last sentence)", () => {
  it("returns the given name", () => {
    expect(treeNs.treeNodeLabel("C:\\A", 1, "A")).toBe("A");
    expect(treeNs.treeNodeLabel("C:\\A\\B", 2, "B")).toBe("B");
  });
});

describe("treeNodeLabel: level 0 (R-938 [E1], R-938-1, AC-913)", () => {
  it("drive root C:\\ -> C: (trailing separator removed)", () => {
    expect(treeNs.treeNodeLabel("C:\\", 0, "C:\\")).toBe("C:");
    expect(treeNs.treeNodeLabel("D:\\", 0, "D:\\")).toBe("D:");
  });

  it("UNC share \\\\server\\share\\ -> \\\\server\\share", () => {
    expect(treeNs.treeNodeLabel("\\\\server\\share\\", 0, "\\\\server\\share\\")).toBe("\\\\server\\share");
  });

  it("AC-913 (iii): \\\\?\\C:\\ prefix is not shown -> C:", () => {
    expect(treeNs.treeNodeLabel("\\\\?\\C:\\", 0, "\\\\?\\C:\\")).toBe("C:");
  });

  it("\\\\?\\UNC\\server\\share\\ prefix is not shown -> \\\\server\\share", () => {
    expect(treeNs.treeNodeLabel("\\\\?\\UNC\\server\\share\\", 0, "x")).toBe("\\\\server\\share");
  });

  it("AC-913 (iv): volume GUID single node \\\\?\\Volume{GUID}\\X -> X (last component)", () => {
    expect(treeNs.treeNodeLabel(GUID_X, 0, GUID_X)).toBe("X");
  });

  it("volume GUID single node with a trailing separator -> still the last component", () => {
    expect(treeNs.treeNodeLabel(GUID_X + "\\", 0, GUID_X)).toBe("X");
  });

  it("R-938-1: \\\\.\\C:\\Windows -> Windows", () => {
    expect(treeNs.treeNodeLabel(DEV_WIN, 0, DEV_WIN)).toBe("Windows");
  });

  it("R-938-1 exception: the root itself keeps the prefix, minus the trailing separator", () => {
    expect(treeNs.treeNodeLabel(GUID_ROOT, 0, GUID_ROOT)).toBe("\\\\?\\Volume" + GUID);
    expect(treeNs.treeNodeLabel(DEV_ROOT, 0, DEV_ROOT)).toBe("\\\\.\\C:");
  });
});

describe("treeNodeTitle (R-940, AC-913)", () => {
  it("drive root keeps its path: C:\\", () => {
    expect(treeNs.treeNodeTitle("C:\\")).toBe("C:\\");
  });

  it("deeper nodes: the path", () => {
    expect(treeNs.treeNodeTitle("C:\\A\\B")).toBe("C:\\A\\B");
  });

  it("UNC share: \\\\server\\share\\", () => {
    expect(treeNs.treeNodeTitle("\\\\server\\share\\")).toBe("\\\\server\\share\\");
  });

  it("\\\\?\\ prefixed nodes show the path WITHOUT the prefix (C:\\, \\\\server\\share\\)", () => {
    expect(treeNs.treeNodeTitle("\\\\?\\C:\\")).toBe("C:\\");
    expect(treeNs.treeNodeTitle("\\\\?\\C:\\X")).toBe("C:\\X");
    expect(treeNs.treeNodeTitle("\\\\?\\UNC\\server\\share\\")).toBe("\\\\server\\share\\");
  });

  it("single nodes (R-938-1) show the FULL path including the prefix", () => {
    expect(treeNs.treeNodeTitle(GUID_X)).toBe(GUID_X);
    expect(treeNs.treeNodeTitle(DEV_ROOT)).toBe(DEV_ROOT);
    expect(treeNs.treeNodeTitle(DEV_WIN)).toBe(DEV_WIN);
  });
});

describe("isSingleNodePath (R-777 / R-40-0-1, shared with computeTreeTopLevel)", () => {
  it("volume GUID and device namespace paths are single-node paths", () => {
    expect(treeNs.isSingleNodePath(GUID_X)).toBe(true);
    expect(treeNs.isSingleNodePath(GUID_ROOT)).toBe(true);
    expect(treeNs.isSingleNodePath(DEV_ROOT)).toBe(true);
    expect(treeNs.isSingleNodePath(DEV_WIN)).toBe(true);
    expect(treeNs.isSingleNodePath("\\\\?\\volume" + GUID.toUpperCase() + "\\X")).toBe(true);
  });

  it("ordinary drive / UNC / \\\\?\\ drive / \\\\?\\UNC paths are not", () => {
    expect(treeNs.isSingleNodePath("C:\\")).toBe(false);
    expect(treeNs.isSingleNodePath("C:\\A\\B")).toBe(false);
    expect(treeNs.isSingleNodePath("\\\\server\\share\\")).toBe(false);
    expect(treeNs.isSingleNodePath("\\\\?\\C:\\X")).toBe(false);
    expect(treeNs.isSingleNodePath("\\\\?\\UNC\\server\\share\\")).toBe(false);
  });
});
