// SPEC-0300-0018 R-1087 (G-4: 600ms) / SPEC-0200-0001 §3.9.6, §3.9.17.5. Pure.

export function shouldSwallowAfterOutsideClose(i: {
  now: number;
  closedAt: { time: number; x: number; y: number } | null;
  type: "mousedown" | "mouseup" | "click" | "dblclick";
  detail: number;
  x: number;
  y: number;
  windowMs?: number;
  distancePx?: number;
}): boolean {
  if (i.closedAt === null) return false;
  const windowMs = i.windowMs ?? 600;
  const distance = i.distancePx ?? 4;
  if (i.now - i.closedAt.time > windowMs) return false;
  if (i.type !== "dblclick" && i.detail < 2) return false;
  return Math.abs(i.x - i.closedAt.x) <= distance && Math.abs(i.y - i.closedAt.y) <= distance;
}

// §3.9.17.5: `onauxclick` handles the MIDDLE button only.
export function isMiddleButtonAuxclick(e: { button: number }): boolean {
  return e.button === 1;
}
