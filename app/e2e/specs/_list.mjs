// Helpers for the multi-column list specs (SPEC-0300-0023 R-1792 / R-1842; not a spec file itself: it exports no `tests`).
//
// The list is a page of columns: only `geometry.first..last` are in the DOM (no scrolling, R-1793). The inner body of the list frame
// (`.file-list-frame .pane-body`) is W x H of R-1792; `rows = floor(H / rowHeight)`.

import { chOf, openFiles, rowHeightOf } from "./_util.mjs";

export const BODY = ".file-list-frame .pane-body";

/** Size of the list's inner body (W, H of R-1792). */
export const bodySize = async (ctx) => {
  const d = await ctx.m.dims(BODY);
  return { W: d.clientWidth, H: d.clientHeight };
};

/**
 * Put the viewport so that the list's inner body is `wantW` wide (+/- 1 px, the tree's width is floored) and `wantH` high (exact).
 * `wantW` null keeps the width of 1000. Returns the measured { W, H }.
 */
export async function fitBody(ctx, wantW, wantH) {
  let vw = 1000;
  let vh = 700;
  await ctx.setViewport(vw, vh);
  let size = await bodySize(ctx);
  for (let i = 0; i < 8; i++) {
    const dw = wantW == null ? 0 : wantW - size.W;
    const dh = wantH == null ? 0 : wantH - size.H;
    if (Math.abs(dw) <= 1 && dh === 0) break;
    vw += Math.abs(dw) <= 1 ? 0 : Math.round(dw / 0.75) || Math.sign(dw);
    vh += dh;
    await ctx.setViewport(vw, vh);
    size = await bodySize(ctx);
  }
  return size;
}

/** The R-1792 minimum column in px for the given toggles: (min_col_width + 10 [size] + 20 [time]) x ch. */
export const minColPx = (minColWidth, showSize, showTime, ch) => (minColWidth + (showSize ? 10 : 0) + (showTime ? 20 : 0)) * ch;

/**
 * The page the list should draw by R-1792 for the given facts (an independent copy of the formula, so a wrong implementation is found).
 * `focusIndex` is the position of the cursor in the shown array.
 */
export function expectedPage({ W, H, rowHeight, ch, count, showSize, showTime, minColWidth, focusIndex }) {
  const rows = Math.max(1, Math.floor(H / rowHeight));
  const totalCols = Math.max(1, Math.ceil(count / rows));
  const minCol = minColPx(minColWidth, showSize, showTime, ch);
  const maxFit = Math.max(1, Math.floor(W / minCol));
  const cols = Math.min(maxFit, totalCols);
  const focusCol = Math.floor(focusIndex / rows);
  const startCol = Math.floor(focusCol / cols) * cols;
  const shown = Math.min(cols, totalCols - startCol);
  return { rows, totalCols, cols, startCol, shown, first: startCol * rows, last: Math.min((startCol + shown) * rows - 1, count - 1) };
}

/** What the DOM shows: the entries drawn (by the number in the f001.txt style names), their columns and the column widths. */
export const drawn = (ctx) =>
  ctx.ev(`(() => {
    const list = document.querySelector('.file-list');
    const rows = [...document.querySelectorAll('.file-list-row')];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const listRect = list.getBoundingClientRect();
    const lefts = [...new Set(rects.map((r) => Math.round(r.left * 100) / 100))].sort((a, b) => a - b);
    const columns = lefts.map((left) => {
      const inCol = rows.filter((_, i) => Math.round(rects[i].left * 100) / 100 === left);
      const width = rects[rows.indexOf(inCol[0])].width;
      return { left: left - listRect.left, width, count: inCol.length, labels: inCol.map((r) => r.getAttribute('aria-label')), seps: inCol.map((r) => r.classList.contains('sep')) };
    });
    const style = getComputedStyle(list);
    return { rowCount: rows.length, columns, listWidth: listRect.width, listHeight: listRect.height, gridRows: style.gridTemplateRows.split(' ').length,
      cursor: rows.findIndex((r) => r.classList.contains('cursor') || r.classList.contains('idle')) };
  })()`);

/** The heading text of the list frame (R-1763). */
export const listHeading = (ctx) => ctx.ev(`document.querySelector('.file-list-frame .pane-title').textContent`);

/** The index (0-based) of the entry a row `f0NN.txt` is. */
export const indexOfLabel = (label) => Number.parseInt(/(\d+)/.exec(label)?.[1] ?? "-1", 10) - 1;

/** Open fixture `name` with `count` files, show `view`, and return { ch, rowHeight }. */
export async function openList(ctx, name, count, view) {
  await openFiles(ctx, name, count, view);
  return { ch: await chOf(ctx, ".file-list"), rowHeight: await rowHeightOf(ctx) };
}
