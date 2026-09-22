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
