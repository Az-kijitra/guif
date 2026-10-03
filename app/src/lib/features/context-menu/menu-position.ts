// SPEC-0300-0018 R-1070 (G-3) / SPEC-0200-0001 §3.9.4. Pure.

function place(cursor: number, size: number, viewport: number, margin: number): number {
  // G-3: flip when the menu crosses the window edge (margin not included) ...
  const flipped = cursor + size > viewport ? cursor - size : cursor;
  // ... then clamp so every side keeps `margin` (a too-large menu sticks to the margin).
  return Math.max(margin, Math.min(flipped, viewport - margin - size));
}

export function computeMenuPosition(i: {
  cursor: { x: number; y: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  margin?: number;
}): { x: number; y: number } {
  const margin = i.margin ?? 8;
  return {
    x: place(i.cursor.x, i.menu.width, i.viewport.width, margin),
    y: place(i.cursor.y, i.menu.height, i.viewport.height, margin),
  };
}
