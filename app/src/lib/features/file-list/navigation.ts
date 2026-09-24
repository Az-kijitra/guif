// SPEC-0300-0009 §6.2 (R-56~R-60): focus movement logic for the file list.
// SPEC-0200-0001 §3.1.3 (MUST-37, SHOULD-46): `focusedIndex` is stored on the
// `entries` (real/unfiltered) basis at all times. Movement calculations
// (moveFocusRow/moveFocusColumn/moveFocusPage below) instead operate
// temporarily in "visual index" space (position within the currently
// visible/filtered array) — `toVisualIndex`/`toRealIndex` are the pure
// conversion functions bridging real <-> visual index spaces, matched by
// path identity (not array position, since a given path generally sits at a
// different position in `entries` than in the visible/filtered array).

import { selectRange } from "./selection";

export type RowDirection = "up" | "down";
export type ColumnDirection = "left" | "right";
export type PageDirection = "up" | "down";

// R-57: move_up / move_down shift the focused index by one row in display
// order, clamped to the visible range.
export function moveFocusRow(visible: readonly unknown[], index: number, direction: RowDirection): number {
  if (direction === "down") {
    return Math.min(index + 1, visible.length - 1);
  }
  return Math.max(index - 1, 0);
}

// R-58: move_left / move_right jump to the same row position in the
// previous/next column, using rowsPerColumn to convert between row/col and
// the flat visual index.
export function moveFocusColumn(
  index: number,
  direction: ColumnDirection,
  rowsPerColumn: number,
  totalCount: number,
): number {
  if (rowsPerColumn <= 0 || totalCount <= 0) {
    return index;
  }
  const row = index % rowsPerColumn;
  const col = Math.floor(index / rowsPerColumn);
  const totalCols = Math.ceil(totalCount / rowsPerColumn);
  const newCol = direction === "right" ? col + 1 : col - 1;

  if (newCol < 0 || newCol >= totalCols) {
    return index;
  }
  const newIndex = newCol * rowsPerColumn + row;
  if (newIndex >= totalCount) {
    return index;
  }
  return newIndex;
}

// R-59: page_up / page_down move the focus by one page (rows) worth of
// entries, clamped to the visible range.
export function moveFocusPage(
  visible: readonly unknown[],
  index: number,
  direction: PageDirection,
  rows: number,
): number {
  if (direction === "down") {
    return Math.min(index + rows, visible.length - 1);
  }
  return Math.max(index - rows, 0);
}

// R-60: Shift+move extends the range selection from the anchor to the new
// focus position (inclusive, direction-agnostic — same logic as R-51).
export function extendRangeSelection(
  visible: readonly string[],
  anchor: string,
  target: string,
): Set<string> {
  return selectRange(visible, anchor, target);
}

// R-56/AC-45: focus traversal only considers entries that are currently
// visible (post-filter); hidden entries must never be reachable by moving
// focus.
export function filterFocusableEntries(all: readonly string[], visible: readonly string[]): string[] {
  const visibleSet = new Set(visible);
  return all.filter((path) => visibleSet.has(path));
}

// SPEC-0200-0001 §3.1.3 (MUST-37): convert a real (entries-basis) index into
// a visual index (position within the currently displayed/visible array),
// via path identity. Returns -1 if the entry at realIndex is out of bounds,
// or not present in `visible` (i.e. currently filtered out). Callers must
// treat -1 defensively (§3.1.4-2/MUST-44); in normal operation this should
// not occur: while the search bar is closed, `visible` mirrors `entries` in
// full (R-117), so every real index is trivially visible; while the search
// bar is open, R-14-2 prevents this function's callers (moveRow etc.) from
// being invoked at all (the list only regains focus via R-109-2's
// resolveFocusIndexForVisibleSet, which guarantees the resulting real index
// is visible).
export function toVisualIndex(
  realIndex: number,
  entries: readonly { path: string }[],
  visible: readonly { path: string }[],
): number {
  const entry = entries[realIndex];
  if (entry === undefined) return -1;
  return visible.findIndex((v) => v.path === entry.path);
}

// SPEC-0200-0001 §3.1.3 (MUST-37): convert a visual index (position within
// `visible`) back into a real (entries-basis) index, via path identity.
// Returns -1 if out of range (including when `visible` is empty, §3.1.4-2/
// MUST-44).
export function toRealIndex(
  visualIndex: number,
  entries: readonly { path: string }[],
  visible: readonly { path: string }[],
): number {
  const entry = visible[visualIndex];
  if (entry === undefined) return -1;
  return entries.findIndex((e) => e.path === entry.path);
}

// SPEC-0300-0012 R-109-2-1 ONLY (SHOULD-45: this function does NOT also serve
// R-107-1's close-time focus restoration — the two rules are not equivalent:
// R-107-1 rule 2 focuses the listbox root element without changing
// focusedIndex at all, whereas R-109-2-1 rule 2 moves focusedIndex to
// filteredEntries[0]. §3.1.5's close-time design calls containerEl?.focus()
// only, never this function). Used when Enter confirms a filtered search and
// focus moves from the search input into the list:
//   1. if the entry at currentRealIndex is present in `visible`, keep it
//      (return currentRealIndex unchanged)
//   2. else, return the real index of `visible[0]` (filteredEntries' first
//      entry)
//   3. else (visible is empty), return null — caller must not move focus
//      into the list and must leave it in the search input (R-109-2-1 #3)
export function resolveFocusIndexForVisibleSet(
  entries: readonly { path: string }[],
  visible: readonly { path: string }[],
  currentRealIndex: number,
): number | null {
  if (visible.length === 0) return null;
  if (toVisualIndex(currentRealIndex, entries, visible) !== -1) {
    return currentRealIndex;
  }
  return toRealIndex(0, entries, visible);
}
