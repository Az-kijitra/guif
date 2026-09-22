// SPEC-0300-0009 §5 / §6.4 (R-40~R-45, R-64~R-66): tree node state and
// expand/collapse/focus-movement logic. The child-fetch itself reuses the
// same directory-enumeration query shape as the file list (R-41); this
// module only computes the query parameters/results, it does not perform the
// Tauri `invoke()` call (that belongs in `shared/ipc/fs.ts`, SPEC-0200-0001
// §4.5, wired up by the eventual Svelte component).

export interface TreeNodeInput {
  path: string;
  name: string;
}

// A child reference only needs enough shape for this module's own logic
// (focusing the first child by path); the full child TreeNode is built
// lazily once its own children are fetched, so it is not required to already
// be a complete TreeNode at this point.
export interface TreeChildRef {
  path: string;
  name: string;
}

export interface TreeNode {
  path: string;
  name: string;
  expanded: boolean;
  loaded: boolean;
  children: TreeChildRef[] | undefined;
}

export interface TreeChildQuery {
  path: string;
  sortKey: "name";
  sortOrder: "asc";
  dirOnly: true;
}

export type TreeMoveRightResult =
  | { action: "expand" }
  | { action: "focus-child"; path: string }
  | { action: "noop" };

export type TreeMoveLeftResult = { action: "collapse" } | { action: "focus-parent"; path: string };

export interface TreeNodeSelectResult {
  shouldLoad: boolean;
  path: string;
}

// R-40/R-42: a freshly created node starts collapsed and unloaded — children
// are fetched only on-demand, and Phase 1 performs no automatic expansion.
export function createTreeNode(input: TreeNodeInput): TreeNode {
  return {
    path: input.path,
    name: input.name,
    expanded: false,
    loaded: false,
    children: undefined,
  };
}

// R-41/AC-29: the tree's child query is always dir-only, sorted by name
// ascending, regardless of the file list's current sort setting.
export function getTreeChildQuery(
  path: string,
  _currentListSort?: { currentListSortKey?: string; currentListSortOrder?: string },
): TreeChildQuery {
  return { path, sortKey: "name", sortOrder: "asc", dirOnly: true };
}

// R-64: clicking the caret toggles expanded/collapsed.
export function toggleNodeExpansion(node: TreeNode): TreeNode {
  return { ...node, expanded: !node.expanded };
}

// R-65: move_right expands an unloaded node, or focuses the first child of
// an already-expanded node.
export function handleTreeMoveRight(node: TreeNode): TreeMoveRightResult {
  if (!node.loaded || !node.expanded) {
    return { action: "expand" };
  }
  if (node.children && node.children.length > 0) {
    return { action: "focus-child", path: node.children[0].path };
  }
  return { action: "noop" };
}

// R-66: move_left collapses an expanded node, or focuses the parent node.
export function handleTreeMoveLeft(node: TreeNode, parentPath: string): TreeMoveLeftResult {
  if (node.expanded) {
    return { action: "collapse" };
  }
  return { action: "focus-parent", path: parentPath };
}

// R-43/AC-24/AC-25: selecting a tree node reloads the directory only if the
// path actually changed.
export function handleTreeNodeSelect(selectedPath: string, currentPath: string): TreeNodeSelectResult {
  return { shouldLoad: selectedPath !== currentPath, path: selectedPath };
}

// R-44/AC-26/AC-27: the list->tree link only rebuilds the tree while it is
// visible.
export function shouldRebuildTreeOnDirChange(input: { treeVisible: boolean }): boolean {
  return input.treeVisible;
}
