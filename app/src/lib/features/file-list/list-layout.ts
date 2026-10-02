// SPEC-0300-0009 §3.2 (R-15~R-19) + SPEC-0300-0017 §8/§9 (R-946, R-955~R-959):
// multi-column "vertical-first, column-flow" file list layout math. Pure
// functions only -- no DOM/Svelte dependency, so they stay testable without a
// rendering environment (SPEC-0400-0001 §3).

const FALLBACK_ROW_HEIGHT = 32;
const NAME_COLUMN_MIN_WIDTH = 140;
const SIZE_COLUMN_EXTRA_WIDTH = 72;
const TIME_COLUMN_EXTRA_WIDTH = 140;
// SPEC-0300-0017 R-956: 8px per extra item and a 32px column margin are part of minCol.
const ITEM_GAP_IN_MIN_COL = 8;
const COLUMN_MARGIN = 32;

export const LIST_COL_GAP_PX = 16;
export const LIST_BODY_PADDING_Y_PX = 6;
export const COL_MAX_WIDTH_PX = 720;
// R-946 / R-946-1: fixed widths of the size and time cells; the name column floor.
export const SIZE_CELL_PX = 64;
export const TIME_CELL_PX = 140;
export const NAME_CELL_MIN_PX = 140;
// R-945: row padding 6px left + right, gap 2px between items.
const ROW_PADDING_X_TOTAL = 12;
const ROW_ITEM_GAP = 2;

export interface ListLayoutInput {
  containerWidth: number;
  containerHeight: number;
  rowHeight: number | undefined;
  entryCount: number;
  showSize: boolean;
  showTime: boolean;
}

export interface ListLayout {
  rows: number;
  cols: number;
}

export interface ColumnWidthInput {
  showSize: boolean;
  showTime: boolean;
}

export interface OverflowMarkersInput {
  totalCols: number;
  firstVisibleCol: number;
  lastVisibleCol: number;
}

export interface OverflowMarkers {
  showLeadingMarker: boolean;
  showTrailingMarker: boolean;
}

export interface ScrollSnapInput {
  scrollLeft: number;
  colWidth: number;
}

// R-956 minCol: 140 (+72 size) (+140 time) + 8 x (items - 1) + 32 => 172 / 252 / 320 / 400.
export function computeColumnWidth(input: ColumnWidthInput): number {
  let width = NAME_COLUMN_MIN_WIDTH;
  let items = 1;
  if (input.showSize) {
    width += SIZE_COLUMN_EXTRA_WIDTH;
    items += 1;
  }
  if (input.showTime) {
    width += TIME_COLUMN_EXTRA_WIDTH;
    items += 1;
  }
  return width + ITEM_GAP_IN_MIN_COL * (items - 1) + COLUMN_MARGIN;
}

interface ColumnMath {
  rows: number;
  cols: number;
  needed: number;
  maxFit: number;
  minCol: number;
  colWidth: number;
  pitch: number;
  bodyWidth: number;
  maxScrollLeft: number;
}

// R-956 (+ R-956-2). `bodyContentHeight` is H = the list body's content height.
function columnMath(input: {
  width: number;
  bodyContentHeight: number;
  rowHeight: number | undefined;
  entryCount: number;
  showSize: boolean;
  showTime: boolean;
}): ColumnMath {
  const rowHeight = input.rowHeight ?? FALLBACK_ROW_HEIGHT;
  const rows = Math.max(1, Math.floor(input.bodyContentHeight / rowHeight));
  const minCol = computeColumnWidth({ showSize: input.showSize, showTime: input.showTime });
  const needed = Math.max(1, Math.ceil(input.entryCount / rows));
  const maxFit = Math.max(1, Math.floor((input.width + LIST_COL_GAP_PX) / (minCol + LIST_COL_GAP_PX)));
  let cols = Math.min(maxFit, needed);
  let colWidth: number;
  if (input.width < minCol) {
    // R-956-2: narrower than one minimum column -> one column as wide as the frame.
    cols = 1;
    colWidth = Math.max(0, input.width);
  } else if (needed > maxFit) {
    colWidth = minCol;
  } else {
    colWidth = Math.min(
      COL_MAX_WIDTH_PX,
      Math.max(minCol, Math.floor((input.width - LIST_COL_GAP_PX * (cols - 1)) / cols)),
    );
  }
  const pitch = colWidth + LIST_COL_GAP_PX;
  return {
    rows,
    cols,
    needed,
    maxFit,
    minCol,
    colWidth,
    pitch,
    bodyWidth: cols * colWidth + LIST_COL_GAP_PX * (cols - 1),
    maxScrollLeft: (needed - cols) * pitch,
  };
}

// R-16-1/R-16-2/R-17: rows/cols recomputed from container dimensions.
// `containerHeight` is H (the list body's content height, MUST-110); see
// computeListGeometry for the variant that takes the outer frame.
export function computeListLayout(input: ListLayoutInput): ListLayout {
  const m = columnMath({
    width: input.containerWidth,
    bodyContentHeight: input.containerHeight,
    rowHeight: input.rowHeight,
    entryCount: input.entryCount,
    showSize: input.showSize,
    showTime: input.showTime,
  });
  return { rows: m.rows, cols: m.cols };
}

// R-19: overflow markers appear when columns are scrolled out of view.
export function computeOverflowMarkers(input: OverflowMarkersInput): OverflowMarkers {
  return {
    showLeadingMarker: input.firstVisibleCol > 0,
    showTrailingMarker: input.lastVisibleCol < input.totalCols - 1,
  };
}

// R-18: snap scroll position to the nearest column boundary.
export function computeScrollSnapTarget(input: ScrollSnapInput): number {
  if (input.colWidth <= 0) {
    return 0;
  }
  return Math.round(input.scrollLeft / input.colWidth) * input.colWidth;
}

// ---------------------------------------------------------------------
// Phase 9 (SPEC-0300-0017 R-946/R-949/R-955~R-959; SPEC-0200-0001 §3.8.6).
// ---------------------------------------------------------------------

export interface ListGeometryInput {
  frameWidth: number;
  frameHeight: number;
  rowHeight: number | undefined;
  entryCount: number;
  showSize: boolean;
  showTime: boolean;
}

export interface ListGeometry {
  rows: number;
  cols: number;
  needed: number;
  maxFit: number;
  minCol: number;
  colWidth: number;
  pitch: number;
  bodyWidth: number;
  bodyHeight: number;
  maxScrollLeft: number;
}

export interface ScrollTargetInput {
  focusIndex: number;
  rows: number;
  cols: number;
  pitch: number;
  scrollLeft: number;
  needed: number;
}

export interface EdgeMarkerRowsInput {
  scrollLeft: number;
  pitch: number;
  rows: number;
  cols: number;
  needed: number;
  entryCount: number;
}

export interface NameCellWidthInput {
  colWidth: number;
  showSize: boolean;
  showTime: boolean;
}

// R-956: W = frame clientWidth, H = frame clientHeight - 6 (body padding; subtracted only here).
export function computeListGeometry(input: ListGeometryInput): ListGeometry {
  const rowHeight = input.rowHeight ?? FALLBACK_ROW_HEIGHT;
  const m = columnMath({
    width: input.frameWidth,
    bodyContentHeight: input.frameHeight - LIST_BODY_PADDING_Y_PX,
    rowHeight: input.rowHeight,
    entryCount: input.entryCount,
    showSize: input.showSize,
    showTime: input.showTime,
  });
  return { ...m, bodyHeight: m.rows * rowHeight };
}

// R-958: the smallest pitch multiple that shows the focus column in full;
// unchanged when it is already visible. Clamped to [0, maxScrollLeft] (G7).
export function computeScrollTargetForFocus(input: ScrollTargetInput): number {
  if (input.pitch <= 0 || input.rows <= 0) return 0;
  const maxScroll = Math.max(0, (input.needed - input.cols) * input.pitch);
  const col = Math.floor(Math.max(0, input.focusIndex) / input.rows);
  const first = Math.round(input.scrollLeft / input.pitch);
  let target = input.scrollLeft;
  if (col < first) {
    target = col * input.pitch;
  } else if (col > first + input.cols - 1) {
    target = (col - input.cols + 1) * input.pitch;
  }
  return Math.min(maxScroll, Math.max(0, target));
}

// R-959: head rows of the leftmost / rightmost visible columns, when columns are hidden.
export function computeEdgeMarkerRows(input: EdgeMarkerRowsInput): { leftIndex: number | null; rightIndex: number | null } {
  if (input.entryCount <= 0 || input.pitch <= 0) return { leftIndex: null, rightIndex: null };
  const first = Math.max(0, Math.round(input.scrollLeft / input.pitch));
  const last = Math.min(input.needed - 1, first + input.cols - 1);
  return {
    leftIndex: first > 0 ? first * input.rows : null,
    rightIndex: last < input.needed - 1 ? last * input.rows : null,
  };
}

// R-946 (+ R-956-2 note): the name column drops its 140px floor in a narrow list.
export function rowGridTemplate(showSize: boolean, showTime: boolean, colWidth?: number): string {
  const minCol = computeColumnWidth({ showSize, showTime });
  const narrow = colWidth !== undefined && colWidth < minCol;
  const parts = [narrow ? "minmax(0, 1fr)" : `minmax(${NAME_CELL_MIN_PX}px, 1fr)`];
  if (showSize) parts.push(`${SIZE_CELL_PX}px`);
  if (showTime) parts.push(`${TIME_CELL_PX}px`);
  return parts.join(" ");
}

// Design §3.8.5 / R-956-2: width of the name cell (never negative).
export function computeNameCellWidth(input: NameCellWidthInput): number {
  const items = 1 + (input.showSize ? 1 : 0) + (input.showTime ? 1 : 0);
  const width =
    input.colWidth -
    ROW_PADDING_X_TOTAL -
    ROW_ITEM_GAP * (items - 1) -
    (input.showSize ? SIZE_CELL_PX : 0) -
    (input.showTime ? TIME_CELL_PX : 0);
  return Math.max(0, width);
}

// SPEC-0200-0001 §3.8.1: parses a CSS length like "28px" (undefined => the caller falls back).
export function parseRowHeightPx(raw: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(raw);
  return m ? Number(m[1]) : undefined;
}
