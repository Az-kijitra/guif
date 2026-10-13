import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-481 (0.01~8), R-481-1 (Ctrl + wheel), R-481-2 (x1.25 / ÷1.25, stop at the ends; wheel keeps
//   the pointer position, keys / buttons use the viewport centre), R-482 (Fit), R-483 (drag pan), R-483-1 (the scroll range
//   covers the whole scaled image; both ends reachable), R-483-2 (smaller direction centred), R-486 (% shown), AC-518 / AC-519
//   (CDP side not here).
// Architecture: SPEC-0200-0001 §3.14.4 (pure functions in `features/viewer/image-zoom.ts`; the base scale of Fit is the REAL
//   displayed scale `img.clientWidth / naturalWidth`, not 1), §3.14.12-13 MINOR-23 (`anchoredScroll`: a direction whose content
//   fits the viewport is excluded from the ratio; the two axes are judged independently).
//
//
// Contract assumed (reported to the implementer):
//   export const ZOOM_MIN = 0.01, ZOOM_MAX = 8, ZOOM_STEP = 1.25;
//   clampZoom(z: number): number                                         // into [ZOOM_MIN, ZOOM_MAX]
//   nextZoom(current: number, dir: "in" | "out"): number                // current * 1.25 | current / 1.25, clamped
//   currentScale(mode: "fit" | number, dims: { clientWidth: number; naturalWidth: number }): number
//                                                                        // "fit" -> clientWidth / naturalWidth; number -> itself
//   scaledSize(natural: number, scale: number): number                   // natural * scale (the <img> width / height in px)
//   maxScroll(contentSize: number, viewportSize: number): number         // max(0, content - viewport)
//   anchoredScroll(a: { scroll: number; prevContent: number; nextContent: number; viewport: number; pointer: number }): number
//                                                                        // ONE axis; pointer is viewport-relative (centre = viewport / 2)
//   panScroll(a: { startScroll: number; startPointer: number; pointer: number; max: number }): number   // ONE axis
//   canPan(d: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }): boolean
//
// Module under test (not yet implemented): ./image-zoom.ts

import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  anchoredScroll,
  canPan,
  clampZoom,
  currentScale,
  maxScroll,
  nextZoom,
  panScroll,
  scaledSize,
} from "./image-zoom";

describe("constants (R-481, R-481-2)", () => {
  it("range 0.01~8 and step 1.25", () => {
    expect(ZOOM_MIN).toBe(0.01);
    expect(ZOOM_MAX).toBe(8);
    expect(ZOOM_STEP).toBe(1.25);
  });
});

describe("clampZoom (R-481)", () => {
  it("keeps values inside the range and clamps the outside to the ends", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.01)).toBe(0.01);
    expect(clampZoom(8)).toBe(8);
    expect(clampZoom(0.001)).toBe(0.01);
    expect(clampZoom(0)).toBe(0.01);
    expect(clampZoom(8.0001)).toBe(8);
    expect(clampZoom(100)).toBe(8);
  });
});

describe("nextZoom (R-481-2: x1.25 / ÷1.25, stops at the ends)", () => {
  it("in: 1 -> 1.25 -> 1.5625 ; out: 1 -> 0.8", () => {
    expect(nextZoom(1, "in")).toBeCloseTo(1.25, 10);
    expect(nextZoom(nextZoom(1, "in"), "in")).toBeCloseTo(1.5625, 10); // AC-518: 156.25% after Ctrl + `+` twice from 100%
    expect(nextZoom(1, "out")).toBeCloseTo(0.8, 10);
  });

  it("stops at 8 (800%): 7 -> 8, 8 -> 8, never beyond", () => {
    expect(nextZoom(7, "in")).toBe(8);
    expect(nextZoom(8, "in")).toBe(8);
  });

  it("stops at 0.01 (1%): 0.011 -> 0.01, 0.01 -> 0.01, never below", () => {
    expect(nextZoom(0.011, "out")).toBe(0.01);
    expect(nextZoom(0.01, "out")).toBe(0.01);
  });

  it("the result is always inside [0.01, 8] for any start inside the range", () => {
    for (const z of [0.01, 0.05, 0.3, 0.5, 1, 2, 4, 6.5, 8]) {
      for (const dir of ["in", "out"] as const) {
        const n = nextZoom(z, dir);
        expect(n).toBeGreaterThanOrEqual(0.01);
        expect(n).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("currentScale: the base of the next step (the Fit-offset defect, SPEC-0200-0001 §3.14.4)", () => {
  it("a number mode is returned as is", () => {
    expect(currentScale(2, { clientWidth: 123, naturalWidth: 456 })).toBe(2);
  });

  it("Fit is the REAL displayed scale: a 2000px image shown 1000px wide is 0.5, not 1", () => {
    expect(currentScale("fit", { clientWidth: 1000, naturalWidth: 2000 })).toBe(0.5);
  });

  it("Fit never exceeds 100% for a small image (R-482): 100 px natural shown at 100 px = 1", () => {
    expect(currentScale("fit", { clientWidth: 100, naturalWidth: 100 })).toBe(1);
  });

  it("Ctrl + `+` from Fit continues from the real scale: 0.5 -> 0.625 (not 1.25)", () => {
    const base = currentScale("fit", { clientWidth: 1000, naturalWidth: 2000 });
    expect(nextZoom(base, "in")).toBeCloseTo(0.625, 10);
  });

  it("an image not loaded yet (naturalWidth 0) gives a finite number (no NaN / Infinity leaks into the zoom)", () => {
    const s = currentScale("fit", { clientWidth: 0, naturalWidth: 0 });
    expect(Number.isFinite(s)).toBe(true);
  });
});

describe("scaledSize / maxScroll (R-483-1: the range covers the whole scaled image)", () => {
  it("scaledSize = natural x scale (the <img> is laid out at this size, not transformed)", () => {
    expect(scaledSize(2000, 1)).toBe(2000);
    expect(scaledSize(2000, 2)).toBe(4000);
    expect(scaledSize(1500, 1.5625)).toBeCloseTo(2343.75, 10);
    expect(scaledSize(100, 0.5)).toBe(50);
  });

  it("maxScroll = content - viewport, never negative (a smaller content cannot scroll)", () => {
    expect(maxScroll(2000, 1024)).toBe(976);
    expect(maxScroll(1024, 1024)).toBe(0);
    expect(maxScroll(100, 1024)).toBe(0);
  });
});

describe("anchoredScroll: Ctrl + wheel keeps the point under the pointer (R-481-1, R-481-2, AC-519)", () => {
  const base = { prevContent: 2000, nextContent: 2500, viewport: 1000 };

  it("scroll 0, pointer at 500: the content point 500 moves to 625, so the scroll becomes 125", () => {
    expect(anchoredScroll({ ...base, scroll: 0, pointer: 500 })).toBeCloseTo(125, 8);
  });

  it("the point under the pointer is the same before and after (1px tolerance), for several pointers / scrolls", () => {
    for (const scroll of [0, 100, 333, 1000]) {
      for (const pointer of [0, 250, 500, 999]) {
        const next = anchoredScroll({ ...base, scroll, pointer });
        const ratioBefore = (scroll + pointer) / base.prevContent;
        const ratioAfter = (next + pointer) / base.nextContent;
        // unless clamped by the range, the relative content position is preserved
        if (next > 0 && next < maxScroll(base.nextContent, base.viewport)) {
          expect(Math.abs(ratioAfter - ratioBefore) * base.nextContent).toBeLessThan(1);
        }
      }
    }
  });

  it("keyboard zoom keeps the viewport centre: pointer = viewport / 2", () => {
    const next = anchoredScroll({ prevContent: 2000, nextContent: 2500, viewport: 1000, scroll: 500, pointer: 500 });
    // centre content point = 1000 (ratio 0.5) -> 1250 -> scroll 750
    expect(next).toBeCloseTo(750, 8);
  });

  it("the result stays in [0, max]: the far end is reached exactly (R-483-1: both ends reachable after a zoom)", () => {
    // at the right edge of a 2000px content (scroll 1000, pointer 1000) zooming to 2500 ends at the new maximum 1500
    expect(anchoredScroll({ ...base, scroll: 1000, pointer: 1000 })).toBe(1500);
    // at the very start
    expect(anchoredScroll({ ...base, scroll: 0, pointer: 0 })).toBe(0);
  });

  it("zooming OUT never produces a negative scroll or one past the new maximum", () => {
    const out = anchoredScroll({ prevContent: 2500, nextContent: 2000, viewport: 1000, scroll: 1500, pointer: 200 });
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThanOrEqual(1000);
  });

  it("MINOR-23: when the next content fits the viewport the scroll is 0 (the direction is centred by margin:auto)", () => {
    expect(anchoredScroll({ prevContent: 2000, nextContent: 800, viewport: 1000, scroll: 700, pointer: 300 })).toBe(0);
    expect(anchoredScroll({ prevContent: 2000, nextContent: 1000, viewport: 1000, scroll: 700, pointer: 300 })).toBe(0);
  });

  it("MINOR-23: when the previous content already fit (centred) and the next does not, the ratio is NOT used; the result is a valid scroll position", () => {
    const r = anchoredScroll({ prevContent: 500, nextContent: 1500, viewport: 1000, scroll: 0, pointer: 100 });
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(500);
  });

  it("MINOR-23: both fit -> 0", () => {
    expect(anchoredScroll({ prevContent: 300, nextContent: 400, viewport: 1000, scroll: 0, pointer: 100 })).toBe(0);
  });
});

describe("panScroll: drag pan (R-483; AC-519: dragging 200px to the upper left gives scroll (200, 200))", () => {
  it("the scroll moves opposite to the pointer: pointer 500 -> 300 from scroll 0 gives 200", () => {
    expect(panScroll({ startScroll: 0, startPointer: 500, pointer: 300, max: 1000 })).toBe(200);
  });

  it("dragging the other way reduces the scroll", () => {
    expect(panScroll({ startScroll: 400, startPointer: 100, pointer: 250, max: 1000 })).toBe(250);
  });

  it("clamps to [0, max] (cannot go negative or past the end)", () => {
    expect(panScroll({ startScroll: 0, startPointer: 100, pointer: 900, max: 1000 })).toBe(0);
    expect(panScroll({ startScroll: 900, startPointer: 900, pointer: 100, max: 1000 })).toBe(1000);
  });

  it("an axis that cannot scroll (max 0) stays 0", () => {
    expect(panScroll({ startScroll: 0, startPointer: 300, pointer: 0, max: 0 })).toBe(0);
  });
});

describe("canPan: dragging starts only when the body can scroll in at least one direction", () => {
  it("true when wider or taller than the viewport", () => {
    expect(canPan({ scrollWidth: 2000, clientWidth: 1000, scrollHeight: 500, clientHeight: 500 })).toBe(true);
    expect(canPan({ scrollWidth: 1000, clientWidth: 1000, scrollHeight: 900, clientHeight: 500 })).toBe(true);
  });

  it("false when the content fits", () => {
    expect(canPan({ scrollWidth: 1000, clientWidth: 1000, scrollHeight: 500, clientHeight: 500 })).toBe(false);
  });
});
