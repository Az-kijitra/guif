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

// ---------------------------------------------------------------------------
// SPEC-0300-0018 R-1020~R-1022, R-1056-1 / SPEC-0200-0001 §3.9.3, §3.9.17.2.
// Right-click selection rule and the pre-execution selection restore.

export interface ContextClickResult {
  selected: ReadonlySet<string>;
  anchor: string | null;
  focusedIndex: number;
}

export function resolveContextClick(
  visiblePaths: readonly string[],
  state: ClickRowState,
  path: string,
): ContextClickResult {
  const focusedIndex = visiblePaths.indexOf(path);
  // R-1020: a row inside the selection keeps selection and anchor; otherwise it replaces them.
  if (state.selected.has(path)) return { selected: state.selected, anchor: state.anchor, focusedIndex };
  const { selected, anchor } = selectSingle(path);
  return { selected, anchor, focusedIndex };
}

// R-1056-1 / §3.9.17.2: current selection that is hidden by a filter stays; the displayed
// targets are put back. Paths not in `visiblePaths` are ignored.
export function resolveRestoredSelection(
  visiblePaths: readonly string[],
  state: ClickRowState,
  paths: readonly string[],
): { selected: ReadonlySet<string>; anchor: string | null } {
  const visible = new Set(visiblePaths);
  const targets = paths.filter((p) => visible.has(p));
  const selected = new Set<string>();
  for (const p of state.selected) if (!visible.has(p)) selected.add(p);
  for (const p of targets) selected.add(p);
  const anchor = state.anchor !== null && targets.includes(state.anchor) ? state.anchor : (targets[0] ?? state.anchor);
  return { selected, anchor };
}
