// SPEC-0300-0009 §5 / §6.4 (R-40~R-45, R-64~R-66): tree node state and
// expand/collapse/focus-movement logic. The child-fetch itself reuses the
// same directory-enumeration query shape as the file list (R-41); this
// module only computes the query parameters/results, it does not perform the
// Tauri `invoke()` call (that belongs in `shared/ipc/fs.ts`, SPEC-0200-0001
// §4.5, wired up by the eventual Svelte component).

import { pathComparisonKey } from "$lib/shared/path-key";

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

// ---------------------------------------------------------------------
// Phase 7 additions (SPEC-0300-0009 R-40/R-40-0/R-40-0-1/R-40-5/R-40-6,
// R-59-2; SPEC-0200-0001 §3.6.3, §3.6.11.7/§3.6.11.11 SHOULD-122/125).
// ---------------------------------------------------------------------

export interface TreeRootResult {
  root: string | null;
  singleNodeOnly: boolean;
}

const UNC_ROOT = /^\\\\([^\\]+)\\([^\\]+)/;
const DRIVE_ROOT = /^[A-Za-z]:\\?/;

// R-40/R-40-0/R-40-5: root determination. `\\?\` prefix stripping and
// volume-GUID/device-namespace exclusion are TREE-specific rules (SHOULD-129
// condition 2), not part of the general path-comparison contract in
// `shared/path-key.ts`.
export function computeTreeRoot(currentPath: string): TreeRootResult {
  let path = currentPath;

  // R-40-0: strip the `\\?\` extended-length prefix before classifying.
  if (path.startsWith("\\\\?\\UNC\\")) {
    path = "\\\\" + path.slice("\\\\?\\UNC\\".length);
  } else if (path.startsWith("\\\\?\\")) {
    path = path.slice("\\\\?\\".length);
  }

  // R-40-0-1: a volume GUID path (`\\?\Volume{...}\...`, only reachable via
  // the `\\?\` prefix stripped above landing on `Volume{`) or a device
  // namespace path (`\\.\...`) is excluded from the tree entirely.
  if (/^Volume\{[0-9a-fA-F-]+\}/.test(path) || path.startsWith("\\\\.\\")) {
    return { root: null, singleNodeOnly: true };
  }

  const uncMatch = UNC_ROOT.exec(path);
  if (uncMatch) {
    return { root: `\\\\${uncMatch[1]}\\${uncMatch[2]}\\`, singleNodeOnly: false };
  }

  const driveMatch = DRIVE_ROOT.exec(path);
  if (driveMatch) {
    return { root: `${path.slice(0, 2)}\\`, singleNodeOnly: false };
  }

  return { root: null, singleNodeOnly: true };
}

// R-40-6/AC-605-2: case-insensitive, ignoring a trailing separator
// difference.
export function pathsEqual(a: string, b: string): boolean {
  return pathComparisonKey(a) === pathComparisonKey(b);
}

// R-40-6: `ancestor` is an ancestor of `path` when `path` starts with
// `ancestor` followed by a path separator (or `ancestor` IS a separator-
// terminated root already, e.g. a drive/UNC root).
export function isAncestorPath(ancestor: string, path: string): boolean {
  const a = pathComparisonKey(ancestor);
  const p = pathComparisonKey(path);
  if (a === p) return false;
  const withSep = a.endsWith("\\") ? a : a + "\\";
  return p.startsWith(withSep);
}

function splitSegments(path: string, root: string): string[] {
  const rest = path.slice(root.length);
  return rest.split("\\").filter((s) => s.length > 0);
}

// R-40-1/SHOULD-125: purely lexical -- the chain from `root` to `target`
// inclusive, computed from path segments only (no fetch-state awareness; the
// caller intersects this with what has actually been fetched).
export function resolveAncestorChain(target: string, root: string): string[] {
  if (pathsEqual(target, root)) return [root];
  const segments = splitSegments(target, root);
  const chain = [root];
  let current = root.endsWith("\\") ? root.slice(0, -1) : root;
  for (const segment of segments) {
    current = `${current}\\${segment}`;
    chain.push(current);
  }
  return chain;
}

// R-59-2/AC-623: tree page-move step (fully-visible rows - 1, minimum 1).
export function treePageStep(fullyVisibleRows: number): number {
  return Math.max(fullyVisibleRows - 1, 1);
}

// R-59-2/AC-623: the number of tree rows FULLY visible in a viewport of
// `containerHeight` px given each row is `rowHeight` px tall (floor, never a
// partially-cut-off row; minimum 1). This is the tree panel's OWN
// measurement -- it must never reuse the file list's `computeListLayout`
// `rows` (a different viewport with a different row height, §3.6.11
// coordinator review). AC-623's worked example: rowHeight=28, height=300 =>
// 10 fully-visible rows (300/28 = 10.71, floored to 10).
export function computeFullyVisibleRows(containerHeight: number, rowHeight: number): number {
  if (rowHeight <= 0) return 1;
  return Math.max(1, Math.floor(containerHeight / rowHeight));
}

// ---------------------------------------------------------------------
// Phase 8 additions (SPEC-0300-0016 R-770~R-778; SPEC-0200-0001 §3.7.3,
// §3.7.10.6(e), §3.7.10.14 SHOULD-137/138/146).
// ---------------------------------------------------------------------

// R-40-0: strips the `\\?\` extended-length prefix (`\\?\UNC\s\sh` becomes
// `\\s\sh`). Used by computeTreeTopLevel and by callers that must compare a
// tree node's (prefix-less) path with a prefixed current path (SHOULD-146).
export function normalizeForTreeComparison(path: string): string {
  if (path.startsWith("\\\\?\\UNC\\")) {
    return "\\\\" + path.slice("\\\\?\\UNC\\".length);
  }
  if (path.startsWith("\\\\?\\")) {
    return path.slice("\\\\?\\".length);
  }
  return path;
}

export interface TreeTopLevelResult {
  // R-771's origin: the current drive's node, or the R-776/R-777 extra node.
  anchorRoot: string;
  // true when the anchor is a UNC share node (R-776) or a single node (R-777).
  anchorIsExtra: boolean;
  // SHOULD-138: the drive-letter root of the current path; null for UNC,
  // volume-GUID and `\\.\` paths (no drive node is highlighted/added).
  currentDrive: string | null;
  // The path with the `\\?\` prefix removed, for ancestor-chain expansion
  // (MUST-102(e): never feed a prefixed path to resolveAncestorChain).
  normalizedTarget: string;
}

export function computeTreeTopLevel(currentPath: string): TreeTopLevelResult {
  const normalized = normalizeForTreeComparison(currentPath);

  // R-777/R-40-0-1: volume GUID or device namespace -> one single node.
  if (/^Volume\{[0-9a-fA-F-]+\}/.test(normalized) || normalized.startsWith("\\\\.\\")) {
    return { anchorRoot: currentPath, anchorIsExtra: true, currentDrive: null, normalizedTarget: currentPath };
  }

  const uncMatch = UNC_ROOT.exec(normalized);
  if (uncMatch) {
    return {
      anchorRoot: `\\\\${uncMatch[1]}\\${uncMatch[2]}\\`,
      anchorIsExtra: true,
      currentDrive: null,
      normalizedTarget: normalized,
    };
  }

  if (DRIVE_ROOT.test(normalized)) {
    const drive = `${normalized.slice(0, 2)}\\`;
    return { anchorRoot: drive, anchorIsExtra: false, currentDrive: drive, normalizedTarget: normalized };
  }

  // Anything else (e.g. a not-yet-resolved relative path): a single node.
  return { anchorRoot: currentPath, anchorIsExtra: true, currentDrive: null, normalizedTarget: currentPath };
}

// R-770-1/R-778: ascending, de-duplicated (case-insensitive) drive list that
// always contains `currentDrive` when it is non-null.
export function mergeDriveList(enumerated: readonly string[], currentDrive: string | null): string[] {
  const byKey = new Map<string, string>();
  for (const drive of enumerated) {
    const key = drive.toUpperCase();
    if (!byKey.has(key)) byKey.set(key, drive);
  }
  if (currentDrive !== null && !byKey.has(currentDrive.toUpperCase())) {
    byKey.set(currentDrive.toUpperCase(), currentDrive);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, drive]) => drive);
}
