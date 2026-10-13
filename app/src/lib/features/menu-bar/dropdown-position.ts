// SPEC-0300-0020 R-1382 / SPEC-0200-0001 §3.14.1-2. Pure.
// The dropdown opens at the lower LEFT of its heading; when it would cross the right edge it is shifted left so that its right
// edge is `margin` px inside the window's inner width. Never to a negative x.

export function computeDropdownPosition(i: {
  heading: { left: number; bottom: number };
  menuWidth: number;
  viewportWidth: number;
  margin?: number;
}): { x: number; y: number } {
  const margin = i.margin ?? 8;
  const limit = i.viewportWidth - margin - i.menuWidth;
  const x = i.heading.left > limit ? limit : i.heading.left;
  return { x: Math.max(0, x), y: i.heading.bottom };
}
