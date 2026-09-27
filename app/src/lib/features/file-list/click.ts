// SPEC-0300-0009 R-50 (click selects), R-51 (Shift+click range), R-52
// (Ctrl/Cmd+click toggle), implemented in Phase 6 per SPEC-0300-0015 R-401-5
// (ISS-0132). Delegates to the existing pure selection functions
// (`selectSingle`/`selectRange`/`toggleSelection`) rather than reimplementing
// them (SPEC-0200-0001 §3.5.3).

import { selectSingle, selectRange, toggleSelection } from "./selection";

export interface ClickRowState {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export interface ClickRowResult {
  selected: Set<string>;
  anchor: string;
  focusedIndex: number;
}

export function resolveRowClick(
  visiblePaths: readonly string[],
  state: ClickRowState,
  clickedPath: string,
  modifiers: { shiftKey: boolean; ctrlKey: boolean },
): ClickRowResult {
  // §3.5.3 SHOULD-110 (【導出】): every click moves focus to the clicked row.
  const focusedIndex = visiblePaths.indexOf(clickedPath);

  if (modifiers.shiftKey) {
    // R-51: range from the existing anchor (established if there wasn't one
    // yet); the anchor itself never moves on a Shift+click.
    const anchor = state.anchor ?? clickedPath;
    const selected = selectRange(visiblePaths, anchor, clickedPath);
    return { selected, anchor, focusedIndex };
  }

  if (modifiers.ctrlKey) {
    // R-52: toggles the clicked row only; the anchor moves to it so a
    // FOLLOWING Shift+click ranges from here.
    const selected = toggleSelection(state.selected, clickedPath);
    return { selected, anchor: clickedPath, focusedIndex };
  }

  // R-50: plain click selects only the clicked row.
  const { selected, anchor } = selectSingle(clickedPath);
  return { selected, anchor, focusedIndex };
}
