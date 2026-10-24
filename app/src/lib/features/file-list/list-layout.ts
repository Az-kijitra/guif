// SPEC-0300-0023 R-1780 .. R-1783 / R-1791 .. R-1793 (replaces SPEC-0300-0017 R-955 / R-956 / R-958 / R-959); SPEC-0200-0001 §3.18.7:
// the multi-column "vertical-first" list layout in `ch` units, with page-wise column switching (tuif's `start_col`).
// Pure functions that take VALUES only -- no DOM, no Svelte, no appearanceState (§3.18.15 SHOULD-2).

const FALLBACK_ROW_HEIGHT = 32;

// R-1781 / R-1782 / R-1783: the mark cell, the size cell and the time cell, in ch; the gap between cells is 1ch.
const MARK_CELL_CH = 2;
const SIZE_CELL_CH = 10;
const TIME_CELL_CH = 16;
// R-1792: the minimum column also counts the size and the time cell (tuif: min_col_width + 10 + 20).
const SIZE_MIN_COL_EXTRA_CH = 10;
const TIME_MIN_COL_EXTRA_CH = 20;

export interface ColumnPageInput {
  // The INNER width / height of the list body (no padding, no frame line).
  width: number;
  height: number;
  rowHeight: number;
  // px per ch (the advance of `0` in the list font).
  ch: number;
  count: number;
  showSize: boolean;
  showTime: boolean;
  minColWidth: number;
  // The position of the cursor in the (filtered) array; -1 when it is not shown.
  focusIndex: number;
}

export interface ColumnPage {
  rows: number;
  totalCols: number;
  // Columns per page.
  cols: number;
  startCol: number;
  // Columns drawn on this page (the last page may have fewer than `cols`).
  shown: number;
  colWidths: number[];
  // `entries.slice(first, last + 1)` is what is drawn.
  first: number;
  last: number;
}

// R-1792: the whole page computation.
export function computeColumnPage(input: ColumnPageInput): ColumnPage {
  const width = Math.max(0, input.width);
  const rows = Math.max(1, Math.floor(input.height / input.rowHeight));
  const totalCols = Math.max(1, Math.ceil(input.count / rows));
  const minCol = (input.minColWidth + (input.showSize ? SIZE_MIN_COL_EXTRA_CH : 0) + (input.showTime ? TIME_MIN_COL_EXTRA_CH : 0)) * input.ch;
  const maxFit = Math.max(1, minCol > 0 ? Math.floor(width / minCol) : 1);
  const cols = Math.min(maxFit, totalCols);
  const focusCol = input.focusIndex >= 0 && input.focusIndex < input.count ? Math.floor(input.focusIndex / rows) : 0;
  const startCol = Math.floor(focusCol / cols) * cols;
  const shown = Math.min(cols, totalCols - startCol);
  // R-1793: the page's columns share the whole width; the remainder goes 1px each to the rightmost columns.
  const base = Math.floor(width / shown);
  const remainder = width - base * shown;
  const colWidths = Array.from({ length: shown }, (_, i) => base + (i >= shown - remainder ? 1 : 0));
  return {
    rows,
    totalCols,
    cols,
    startCol,
    shown,
    colWidths,
    first: startCol * rows,
    last: Math.min((startCol + shown) * rows - 1, input.count - 1),
  };
}

export interface ListGeometryInput {
  frameWidth: number;
  frameHeight: number;
  // undefined: the CSS variable could not be read (falls back to 32px).
  rowHeight: number | undefined;
  entryCount: number;
  showSize: boolean;
  showTime: boolean;
  focusIndex: number;
  minColWidth: number;
  ch: number;
}

export interface ListGeometry extends ColumnPage {
  bodyWidth: number;
  bodyHeight: number;
}

// The geometry the panel draws from: the page plus the body's size.
export function buildGeometry(input: ListGeometryInput): ListGeometry {
  const rowHeight = input.rowHeight ?? FALLBACK_ROW_HEIGHT;
  const page = computeColumnPage({
    width: input.frameWidth,
    height: input.frameHeight,
    rowHeight,
    ch: input.ch,
    count: input.entryCount,
    showSize: input.showSize,
    showTime: input.showTime,
    minColWidth: input.minColWidth,
    focusIndex: input.focusIndex,
  });
  return { ...page, bodyWidth: input.frameWidth, bodyHeight: page.rows * rowHeight };
}

// R-1783: the row is `2ch minmax(0, 1fr) [10ch] [16ch]`.
export function rowGridTemplate(showSize: boolean, showTime: boolean): string {
  const parts = [`${MARK_CELL_CH}ch`, "minmax(0, 1fr)"];
  if (showSize) parts.push(`${SIZE_CELL_CH}ch`);
  if (showTime) parts.push(`${TIME_CELL_CH}ch`);
  return parts.join(" ");
}

// R-1788: the width the name may use (never negative): the column minus the other cells and the 1ch gaps between cells.
export function computeNameCellWidth(input: { colWidth: number; ch: number; showSize: boolean; showTime: boolean; separator?: boolean }): number {
  const cells = MARK_CELL_CH + (input.showSize ? SIZE_CELL_CH : 0) + (input.showTime ? TIME_CELL_CH : 0);
  const gaps = 1 + (input.showSize ? 1 : 0) + (input.showTime ? 1 : 0);
  // A column with a vertical rule (`.sep`, border-right 1px) has 1px less inside.
  return Math.max(0, input.colWidth - (input.separator ? 1 : 0) - input.ch * (cells + gaps));
}

// SPEC-0200-0001 §3.8.1: parses a CSS length like "21px" (undefined => the caller falls back).
export function parseRowHeightPx(raw: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(raw);
  return m ? Number(m[1]) : undefined;
}
