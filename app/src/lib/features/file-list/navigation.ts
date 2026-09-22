// SPEC-0300-0009 §6.2 (R-56~R-60): focus movement logic for the file list.
// Focus is tracked as a "visual index" (position within the currently
// visible/display-order entries), per R-56.

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
