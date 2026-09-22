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

// R-63/AC-47: go_parent works even when the current listing is empty, and is
// a no-op once already at a filesystem root (e.g. a drive root like "C:/").
export function computeGoParentTarget(input: { currentPath: string; visibleCount: number }): GoParentTarget {
  const normalized = input.currentPath.replace(/[\\/]+$/, "");

  if (/^[A-Za-z]:$/.test(normalized) || normalized === "" || normalized === "/") {
    return { shouldNavigate: false };
  }

  const lastSlash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (lastSlash <= 0) {
    return { shouldNavigate: false };
  }

  const parent = normalized.slice(0, lastSlash);
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
