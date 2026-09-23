// SPEC-0300-0011 §3.1 (R-10~R-12): resolving which paths an operation
// targets from the current selection/focus state. This module owns only the
// pure selection-to-targets decision; the actual selection/focus state
// itself is owned by features/file-list (SPEC-0300-0009).

// R-10/R-11: copy/cut/delete target the current selection, falling back to
// the single focused entry when nothing is selected.
function resolveTargets(selected: readonly string[], focused: string | null): string[] {
  if (selected.length > 0) {
    return [...selected];
  }
  if (focused !== null) {
    return [focused];
  }
  return [];
}

export function resolveCopyCutTargets(selected: readonly string[], focused: string | null): string[] {
  return resolveTargets(selected, focused);
}

export function resolveDeleteTargets(selected: readonly string[], focused: string | null): string[] {
  return resolveTargets(selected, focused);
}

// R-12/AC-50: rename targets exactly one entry. A multi-selection has no
// valid rename target at all.
export function resolveRenameTarget(selected: readonly string[], focused: string | null): string | null {
  if (selected.length > 1) {
    return null;
  }
  if (selected.length === 1) {
    return selected[0];
  }
  return focused;
}
