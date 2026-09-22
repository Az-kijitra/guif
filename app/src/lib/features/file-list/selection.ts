// SPEC-0300-0009 §6.1 (R-50~R-55): selection logic for the file list. Entries
// are identified by their `path` (string) so this module stays a pure-logic,
// DOM-free unit (SPEC-0400-0001 §3).

export interface SingleSelectResult {
  selected: Set<string>;
  anchor: string;
}

export interface SelectToggleState {
  selected: Set<string>;
  focusedIndex: number;
  visibleCount: number;
}

export interface SelectToggleResult {
  selected: Set<string>;
  focusedIndex: number;
}

// R-50: clicking a row selects only that entry and updates the range anchor.
export function selectSingle(path: string): SingleSelectResult {
  return { selected: new Set([path]), anchor: path };
}

// R-51: Shift+click selects the inclusive range from the anchor to the
// clicked row, based on display order (visible/all paths, in order).
export function selectRange(paths: readonly string[], anchor: string, target: string): Set<string> {
  const anchorIndex = paths.indexOf(anchor);
  const targetIndex = paths.indexOf(target);
  if (anchorIndex === -1 || targetIndex === -1) {
    return new Set(targetIndex !== -1 ? [target] : []);
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return new Set(paths.slice(start, end + 1));
}

// R-52: Ctrl/Cmd+click toggles a single entry without touching the rest of
// the current selection.
export function toggleSelection(selected: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selected);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}

// R-54/R-55 (4th version, ISS-0029 resolved): select_all operates on the
// *visible* (post-filter) entries only.
export function selectAllVisible(visible: readonly string[]): Set<string> {
  return new Set(visible);
}

// R-54/R-55: invert selection, scoped to the visible entries only. Hidden
// (non-visible) entries keep their existing selection state untouched.
export function invertSelectionVisible(
  visible: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  for (const path of visible) {
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
  }
  return next;
}

// R-54: clear_selection.
export function clearSelection(): Set<string> {
  return new Set();
}

// R-53: select_toggle (Space) toggles the focused row's selection and moves
// focus one row down, clamped to the last visible row.
export function applySelectToggle(state: SelectToggleState, path: string): SelectToggleResult {
  const selected = toggleSelection(state.selected, path);
  const focusedIndex = Math.min(state.focusedIndex + 1, Math.max(0, state.visibleCount - 1));
  return { selected, focusedIndex };
}
