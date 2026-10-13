import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0020 R-1382 (the dropdown opens at the lower LEFT of its heading, aligned with the heading's left edge; when it would cross the
//   right edge it is shifted left so its right edge is 8px inside the window's inner width; `min-width: 260px`), AC-1360 (look), SPEC-0300-0018 R-1071.
// Architecture: SPEC-0200-0001 §3.14.1-2: "位置計算は右クリック (`menu-position.ts`) とは別関数 `dropdown-position.ts`: 見出しの左下基準・右端 8px 内側".
//
// Contract assumed (reported to the implementer):
//   computeDropdownPosition(i: { heading: { left: number; bottom: number }; menuWidth: number; viewportWidth: number; margin?: number }): { x: number; y: number }
//   x = heading.left, or viewportWidth - margin - menuWidth when the menu would overflow (margin default 8), never below 0;  y = heading.bottom
//
// Module under test (not yet implemented): ./dropdown-position.ts

import { computeDropdownPosition } from "./dropdown-position";

const at = (left: number, menuWidth = 260, viewportWidth = 1000, bottom = 24) =>
  computeDropdownPosition({ heading: { left, bottom }, menuWidth, viewportWidth });

describe("normal placement", () => {
  it("the left edge equals the heading's left edge; the top equals the heading's bottom", () => {
    expect(at(8)).toEqual({ x: 8, y: 24 });
    expect(at(100)).toEqual({ x: 100, y: 24 });
  });

  it("a menu whose right edge is exactly 8px inside the window is not moved", () => {
    expect(at(1000 - 8 - 260).x).toBe(732);
  });
});

describe("overflow at the right edge", () => {
  it("one pixel too far right: shifted left so the right edge is 8px inside (x = 1000 - 8 - 260 = 732)", () => {
    expect(at(733).x).toBe(732);
  });

  it("a heading near the right edge (the 移動 menu on a narrow window)", () => {
    expect(at(900).x).toBe(732);
    expect(at(990).x).toBe(732);
  });

  it("the narrowest supported window (640 inner width): a 260px menu under the last heading", () => {
    expect(computeDropdownPosition({ heading: { left: 600, bottom: 24 }, menuWidth: 260, viewportWidth: 640 }).x).toBe(640 - 8 - 260);
  });

  it("the vertical position is not changed by the horizontal shift", () => {
    expect(at(900, 260, 1000, 31).y).toBe(31);
  });
});

describe("degenerate widths", () => {
  it("a menu wider than the window never goes to a negative x", () => {
    expect(computeDropdownPosition({ heading: { left: 50, bottom: 24 }, menuWidth: 500, viewportWidth: 300 }).x).toBe(0);
  });

  it("an explicit margin is honoured", () => {
    expect(computeDropdownPosition({ heading: { left: 900, bottom: 24 }, menuWidth: 260, viewportWidth: 1000, margin: 20 }).x).toBe(720);
  });
});
