// SPEC-0300-0009 §3.2 (R-15~R-19): multi-column "vertical-first, column-flow"
// file list layout math. Pure functions only — no DOM/Svelte dependency, so
// they stay testable without a rendering environment (SPEC-0400-0001 §3).

const FALLBACK_ROW_HEIGHT = 32;
const NAME_COLUMN_MIN_WIDTH = 140;
const SIZE_COLUMN_EXTRA_WIDTH = 72;
const TIME_COLUMN_EXTRA_WIDTH = 140;

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

// R-16-3: 1-column min width = 140 (name) + 72 (size, if shown) + 140 (time, if shown)
export function computeColumnWidth(input: ColumnWidthInput): number {
  let width = NAME_COLUMN_MIN_WIDTH;
  if (input.showSize) {
    width += SIZE_COLUMN_EXTRA_WIDTH;
  }
  if (input.showTime) {
    width += TIME_COLUMN_EXTRA_WIDTH;
  }
  return width;
}

// R-16-1/R-16-2/R-17: rows/cols recomputed from container dimensions.
export function computeListLayout(input: ListLayoutInput): ListLayout {
  const rowHeight = input.rowHeight ?? FALLBACK_ROW_HEIGHT;
  const rows = Math.max(1, Math.floor(input.containerHeight / rowHeight));

  const colWidth = computeColumnWidth({ showSize: input.showSize, showTime: input.showTime });
  const colsThatFitWidth = Math.max(0, Math.floor(input.containerWidth / colWidth));
  const requiredCols = Math.max(0, Math.ceil(input.entryCount / rows));

  const cols = Math.min(colsThatFitWidth, requiredCols);

  return { rows, cols };
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
