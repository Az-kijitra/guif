// SPEC-0300-0009 §6.3/§7 (R-23, R-61, R-63, R-72): directory-change side
// effects — state reset, which actions trigger a reload, go_parent target
// resolution, and the (Phase 1 scoped-down) `open` target resolution.
//
// R-76-2 (preserving selection/focus across *file-watch* driven reloads) is
// out of scope for this module: it is a different trigger than a
// user-initiated directory change and its edge cases remain TBD
// (SPEC-0300-0009 §9-i).

export interface ListResetState {
  selected: Set<string>;
  focusedIndex: number;
  anchor: string | null;
}

// R-72/AC-40: opening a directory resets selection, focus and the
// range-selection anchor.
export function resetListStateOnDirChange(): ListResetState {
  return { selected: new Set(), focusedIndex: 0, anchor: null };
}

// R-23/AC-15: toggling display columns must not trigger a directory reload;
// actually changing directory (open/go_parent) does.
const DIRECTORY_RELOADING_ACTIONS = new Set(["open", "go_parent"]);

export function affectsDirectoryReload(actionId: string): boolean {
  return DIRECTORY_RELOADING_ACTIONS.has(actionId);
}

export interface GoParentTarget {
  shouldNavigate: boolean;
  path?: string;
}

// Root prefixes, each including its trailing separator: drive ("C:\"), the
// `\\?\` / `\\.\` namespace forms, UNC share ("\\server\share\") and POSIX "/".
// Longest match wins so the namespace forms beat the generic UNC form.
const ROOT_PREFIXES: readonly RegExp[] = [
  /^[A-Za-z]:[\\/]/,
  /^\\\\[?.]\\[A-Za-z]:\\/,
  /^\\\\\?\\UNC\\[^\\]+\\[^\\]+\\/i,
  /^\\\\[?.]\\Volume\{[^}\\]+\}\\/i,
  /^\\\\[^\\?.][^\\]*\\[^\\]+\\/,
  /^\//,
];

function rootPrefix(path: string): string | null {
  let best: string | null = null;
  for (const pattern of ROOT_PREFIXES) {
    const m = pattern.exec(path);
    if (m !== null && (best === null || m[0].length > best.length)) best = m[0];
  }
  return best;
}

// R-63/AC-47: go_parent works even when the current listing is empty, and is
// a no-op once already at a filesystem root (e.g. a drive root like "C:/").
// The parent of a root's direct child is the root WITH its separator: "C:"
// alone is drive-relative on Windows (the process's current directory on C),
// so it must never be produced. A path without a root (relative or
// drive-relative such as "C:src") never navigates.
export function computeGoParentTarget(input: { currentPath: string; visibleCount: number }): GoParentTarget {
  const path = input.currentPath;
  // "C:" / "\\server\share" without the separator still name a root.
  const root = rootPrefix(path) ?? rootPrefix(path + "\\");
  if (root === null) return { shouldNavigate: false };

  const normalized = path.replace(/[\\/]+$/, "");
  if (normalized.length < root.length) return { shouldNavigate: false };

  const lastSlash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const parent = lastSlash < root.length ? root : normalized.slice(0, lastSlash);
  return { shouldNavigate: true, path: parent };
}

export type OpenTargetResult =
  | { action: "open-directory"; path: string }
  | { action: "noop" };

// R-61/§8.1: opening a directory entry navigates into it; opening a file is
// deferred to a later phase (viewer integration, SPEC-0300-0008) and is a
// no-op in Phase 1.
export function resolveOpenTarget(entry: { type: "dir" | "file"; path: string }): OpenTargetResult {
  if (entry.type === "dir") {
    return { action: "open-directory", path: entry.path };
  }
  return { action: "noop" };
}

export interface ReconcileInput {
  prevEntries: readonly { path: string }[];
  prevSelected: ReadonlySet<string>;
  prevFocusedPath: string | null;
  nextEntries: readonly { path: string }[];
  focusPath?: string;
  clearSelection?: boolean;
}

export interface ReconcileResult {
  selected: Set<string>;
  focusedIndex: number;
}

// SPEC-0200-0001 §3.3.6: state adjustment after a *reload* (not a directory
// change, R-72): the selection is limited to paths that still exist (or
// emptied by clearSelection, MUST-60); focus = focusPath, else the previous
// focused path, else the previous index clamped into range.
export function reconcileAfterReload(input: ReconcileInput): ReconcileResult {
  const { prevEntries, prevSelected, prevFocusedPath, nextEntries } = input;
  const nextPaths = new Set(nextEntries.map((e) => e.path));

  const selected = new Set<string>();
  if (input.clearSelection !== true) {
    for (const path of prevSelected) {
      if (nextPaths.has(path)) selected.add(path);
    }
  }

  if (nextEntries.length === 0) return { selected, focusedIndex: 0 };

  const indexOf = (path: string | null | undefined): number =>
    path === null || path === undefined ? -1 : nextEntries.findIndex((e) => e.path === path);

  let focusedIndex = indexOf(input.focusPath);
  if (focusedIndex < 0) focusedIndex = indexOf(prevFocusedPath);
  if (focusedIndex < 0) {
    const prevIndex = prevFocusedPath === null ? 0 : Math.max(prevEntries.findIndex((e) => e.path === prevFocusedPath), 0);
    focusedIndex = Math.min(prevIndex, nextEntries.length - 1);
  }
  return { selected, focusedIndex };
}
