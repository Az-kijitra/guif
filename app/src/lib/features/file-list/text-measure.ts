// SPEC-0200-0001 §3.8.5 / §3.8.17 SHOULD-157: the thin DOM-touching layer of the
// file list's measurements. Pure logic stays in list-layout.ts / name-ellipsis.ts;
// this module only reads the DOM / canvas and hands plain values to them.

import { parseRowHeightPx } from "./list-layout";
import type { MeasureText } from "./name-ellipsis";

// R-949: the width of a string in the given CSS font (`ctx.font` syntax), cached.
export function createCanvasMeasurer(font: string): MeasureText {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (ctx === null) {
    return (text) => Array.from(text).length * 8;
  }
  ctx.font = font;
  const cache = new Map<string, number>();
  return (text) => {
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    const width = ctx.measureText(text).width;
    cache.set(text, width);
    return width;
  };
}

// R-924: `--list-row-height` from :root (undefined when it is not defined).
export function readRowHeightPx(doc: Document = document): number | undefined {
  return parseRowHeightPx(getComputedStyle(doc.documentElement).getPropertyValue("--list-row-height"));
}
