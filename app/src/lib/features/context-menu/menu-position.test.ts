import { describe, expect, it } from "vitest";
import { computeMenuPosition } from "./menu-position";

// Spec: SPEC-0300-0018 R-1070 (cursor position; flip at right/bottom; clamp so
//   all four sides stay >= 8px inside the window; menu larger than the window
//   -> top-left at 8px), G-3 (the flip test uses the WINDOW edge, margin NOT
//   included; the margin is absorbed by the clamp), AC-1060.
// Architecture: SPEC-0200-0001 §3.9.4 (formula). Module under test (stub):
//   ./menu-position.ts

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };
const pos = (x: number, y: number, over: Partial<Parameters<typeof computeMenuPosition>[0]> = {}) =>
  computeMenuPosition({ cursor: { x, y }, menu, viewport, ...over });

describe("computeMenuPosition (AC-1060)", () => {
  it("middle of the window: top-left at the cursor", () => {
    expect(pos(400, 300)).toEqual({ x: 400, y: 300 });
  });

  it("near the right edge: flips to the cursor's left (x = cursor.x - width)", () => {
    expect(pos(900, 300)).toEqual({ x: 700, y: 300 });
  });

  it("near the bottom edge: flips above the cursor (y = cursor.y - height)", () => {
    expect(pos(400, 700)).toEqual({ x: 400, y: 400 });
  });

  it("bottom-right corner: flips both axes", () => {
    expect(pos(950, 780)).toEqual({ x: 750, y: 480 });
  });

  it("G-3: exactly touching the window edge (x + w === vw) does NOT flip; the 8px clamp pulls it in", () => {
    // cursor.x + 200 === 1000 -> no flip -> 800, clamped to 1000 - 8 - 200 = 792
    expect(pos(800, 300).x).toBe(792);
    expect(pos(400, 500).y).toBe(492); // 500 + 300 === 800 -> no flip -> clamp 800-8-300
  });

  it("G-3: 1px past the window edge flips", () => {
    expect(pos(801, 300).x).toBe(601);
    expect(pos(400, 501).y).toBe(201);
  });

  it("G-3: the margin is NOT part of the flip test (fits inside the window but not the margin -> no flip, clamped)", () => {
    // cursor.x + w = 995 <= 1000: no flip, then clamp to 792 (never 595)
    expect(pos(795, 300).x).toBe(792);
  });

  it("clamps to the left / top margin (8px) when the cursor is at the very edge", () => {
    expect(pos(0, 0)).toEqual({ x: 8, y: 8 });
    expect(pos(3, 5)).toEqual({ x: 8, y: 8 });
  });

  it("a flip that would go negative is clamped to the 8px margin", () => {
    const r = computeMenuPosition({
      cursor: { x: 100, y: 100 },
      menu: { width: 250, height: 450 },
      viewport: { width: 300, height: 500 },
    });
    expect(r).toEqual({ x: 8, y: 8 });
  });

  it("menu larger than the window: top-left at 8px on that axis", () => {
    const r = computeMenuPosition({
      cursor: { x: 150, y: 150 },
      menu: { width: 400, height: 900 },
      viewport: { width: 300, height: 500 },
    });
    expect(r).toEqual({ x: 8, y: 8 });
  });

  it("result keeps >= 8px from every side whenever the menu fits (property over a grid)", () => {
    for (let x = 0; x <= 1000; x += 37) {
      for (let y = 0; y <= 800; y += 41) {
        const r = pos(x, y);
        expect(r.x).toBeGreaterThanOrEqual(8);
        expect(r.y).toBeGreaterThanOrEqual(8);
        expect(r.x + menu.width).toBeLessThanOrEqual(viewport.width - 8);
        expect(r.y + menu.height).toBeLessThanOrEqual(viewport.height - 8);
      }
    }
  });

  it("an explicit margin overrides the default 8", () => {
    expect(pos(0, 0, { margin: 20 })).toEqual({ x: 20, y: 20 });
  });
});
