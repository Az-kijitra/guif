import { describe, expect, it } from "vitest";
import { fitScale } from "./image-zoom";

// [単体] SPEC-0300-0015 第9版 R-482 / AC-482: Fit enlarges past 100% up to 800%, shrinks big images, never divides by zero.
describe("fitScale", () => {
  it("a big image shrinks to fit", () => {
    expect(fitScale({ width: 1000, height: 800 }, { width: 2000, height: 1000 })).toBe(0.5);
  });
  it("a small image is enlarged past 100% (the smaller ratio of the two axes)", () => {
    expect(fitScale({ width: 1000, height: 800 }, { width: 100, height: 100 })).toBe(8);
    expect(fitScale({ width: 1000, height: 800 }, { width: 400, height: 100 })).toBe(2.5);
  });
  it("stops at 800%", () => {
    expect(fitScale({ width: 5000, height: 5000 }, { width: 10, height: 10 })).toBe(8);
  });
  it("floors at 1%", () => {
    expect(fitScale({ width: 10, height: 10 }, { width: 100000, height: 100000 })).toBe(0.01);
  });
  it("zero sizes give finite numbers", () => {
    for (const r of [
      fitScale({ width: 100, height: 100 }, { width: 0, height: 0 }),
      fitScale({ width: 0, height: 0 }, { width: 100, height: 100 }),
      fitScale({ width: 0, height: 0 }, { width: 0, height: 0 }),
    ]) expect(Number.isFinite(r)).toBe(true);
  });
});
