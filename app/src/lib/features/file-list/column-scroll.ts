// SPEC-0300-0017 R-958 / SPEC-0200-0001 §3.8.6: column-wise horizontal scrolling of
// the list body. The body has `overflow: hidden` (no scrollbar, no wheel handling);
// the only scrolling is (1) the automatic scroll that follows the focus row, and
// (2) the snap of a stray scroll position back to a multiple of the column pitch.

import { computeScrollSnapTarget, computeScrollTargetForFocus } from "./list-layout";

export interface ColumnScrollParams {
  // Index of the focus row within the displayed (filtered) entries; -1 = not shown.
  focusIndex: number;
  rows: number;
  cols: number;
  pitch: number;
  needed: number;
  // Receives the current scrollLeft after every change (feeds the edge markers).
  onScroll: (scrollLeft: number) => void;
}

export interface ColumnScrollDeps {
  raf: (callback: () => void) => number;
  cancelRaf: (handle: number) => void;
}

const browserDeps: ColumnScrollDeps = {
  raf: (callback) => requestAnimationFrame(callback),
  cancelRaf: (handle) => cancelAnimationFrame(handle),
};

export function columnScroll(node: HTMLElement, initial: ColumnScrollParams, deps: ColumnScrollDeps = browserDeps) {
  let params = initial;
  let snapHandle: number | undefined;
  let settleHandle: number | undefined;

  function maxScrollLeft(): number {
    return Math.max(0, (params.needed - params.cols) * params.pitch);
  }

  // Idempotent: a focus column that is already fully visible leaves scrollLeft alone.
  function followFocus(): void {
    const current = node.scrollLeft;
    const target =
      params.focusIndex >= 0
        ? computeScrollTargetForFocus({
            focusIndex: params.focusIndex,
            rows: params.rows,
            cols: params.cols,
            pitch: params.pitch,
            scrollLeft: current,
            needed: params.needed,
          })
        : Math.min(maxScrollLeft(), current);
    if (target !== current) node.scrollLeft = target;
    params.onScroll(node.scrollLeft);
  }

  function handleScroll(): void {
    params.onScroll(node.scrollLeft);
    if (snapHandle !== undefined) deps.cancelRaf(snapHandle);
    snapHandle = deps.raf(() => {
      snapHandle = undefined;
      const snapped = computeScrollSnapTarget({ scrollLeft: node.scrollLeft, colWidth: params.pitch });
      if (snapped !== node.scrollLeft) node.scrollLeft = snapped;
      params.onScroll(node.scrollLeft);
    });
  }

  node.addEventListener("scroll", handleScroll);
  followFocus();

  return {
    update(next: ColumnScrollParams): void {
      params = next;
      followFocus();
      // The new rows may not be laid out yet when this runs; settle once more next frame.
      if (settleHandle !== undefined) deps.cancelRaf(settleHandle);
      settleHandle = deps.raf(() => {
        settleHandle = undefined;
        followFocus();
      });
    },
    destroy(): void {
      node.removeEventListener("scroll", handleScroll);
      if (snapHandle !== undefined) deps.cancelRaf(snapHandle);
      if (settleHandle !== undefined) deps.cancelRaf(settleHandle);
    },
  };
}
