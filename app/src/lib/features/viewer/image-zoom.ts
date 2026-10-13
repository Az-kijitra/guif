// SPEC-0300-0015 R-481~R-483-2, SPEC-0200-0001 §3.14.4: the pure arithmetic of the image display. No DOM here; the
// callers (routes/viewer/image-interaction.ts, ImageView.svelte) feed it measurements.

export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// R-481-2: x1.25 / ÷1.25, stopping at the ends.
export function nextZoom(current: number, dir: "in" | "out"): number {
  return clampZoom(dir === "in" ? current * ZOOM_STEP : current / ZOOM_STEP);
}

// The base of the next step. Fit is the REAL displayed scale, not 1 (the Fit-offset defect).
export function currentScale(mode: "fit" | number, dims: { clientWidth: number; naturalWidth: number }): number {
  if (mode !== "fit") return mode;
  if (dims.naturalWidth <= 0 || dims.clientWidth <= 0) return 1;
  return dims.clientWidth / dims.naturalWidth;
}

export function scaledSize(natural: number, scale: number): number {
  return natural * scale;
}

export function maxScroll(contentSize: number, viewportSize: number): number {
  return Math.max(0, contentSize - viewportSize);
}

// One axis. The content point under `pointer` (viewport-relative) stays under it after the content size changes.
// A direction whose next content fits the viewport needs no scroll (it is centred by margin:auto, MINOR-23); one whose
// previous content fitted (it was centred) has no scroll position to preserve, so the ratio is not used.
export function anchoredScroll(a: {
  scroll: number;
  prevContent: number;
  nextContent: number;
  viewport: number;
  pointer: number;
}): number {
  const max = maxScroll(a.nextContent, a.viewport);
  if (max <= 0) return 0;
  if (a.prevContent <= a.viewport) return max / 2;
  const next = ((a.scroll + a.pointer) / a.prevContent) * a.nextContent - a.pointer;
  return Math.min(max, Math.max(0, next));
}

// One axis: the scroll moves opposite to the pointer.
export function panScroll(a: { startScroll: number; startPointer: number; pointer: number; max: number }): number {
  return Math.min(a.max, Math.max(0, a.startScroll - (a.pointer - a.startPointer)));
}

export function canPan(d: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }): boolean {
  return d.scrollWidth > d.clientWidth || d.scrollHeight > d.clientHeight;
}

// R-482 (第9版): Fit is the largest scale at which the WHOLE image fits the display area -- it also enlarges past 100%,
// within the R-481 range (stopping at 800%, where the image is centred). A degenerate size never divides by zero.
export function fitScale(view: { width: number; height: number }, natural: { width: number; height: number }): number {
  if (natural.width <= 0 || natural.height <= 0) return 1;
  if (view.width <= 0 || view.height <= 0) return ZOOM_MIN;
  return clampZoom(Math.min(view.width / natural.width, view.height / natural.height));
}
