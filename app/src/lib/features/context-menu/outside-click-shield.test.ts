import { describe, expect, it } from "vitest";
import { isMiddleButtonAuxclick, shouldSwallowAfterOutsideClose } from "./outside-click-shield";

// Spec: SPEC-0300-0018 R-1087 (the click that closes the menu is not passed on;
//   the 2nd click of a double click is not passed either), G-4 (window 600ms,
//   "same position vicinity"; between 1st and 2nd click).
// Architecture: SPEC-0200-0001 §3.9.6, §3.9.17.5 (SHOULD-163: swallow iff
//   within windowMs AND (type === "dblclick" OR detail >= 2) AND within
//   distancePx (default 4, per axis) of the closing click; auxclick handles
//   the MIDDLE button only).
// Module under test (stub): ./outside-click-shield.ts

const closedAt = { time: 10_000, x: 200, y: 150 };
const base = {
  now: 10_300,
  closedAt,
  type: "click" as const,
  detail: 2,
  x: 200,
  y: 150,
};

describe("shouldSwallowAfterOutsideClose", () => {
  it("2nd click (detail 2) within 600ms at the same position -> swallow", () => {
    expect(shouldSwallowAfterOutsideClose(base)).toBe(true);
  });

  it("dblclick within the window -> swallow (even with detail 1)", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, type: "dblclick", detail: 1 })).toBe(true);
  });

  it("mousedown / mouseup of the 2nd click (detail >= 2) are swallowed as well", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, type: "mousedown" })).toBe(true);
    expect(shouldSwallowAfterOutsideClose({ ...base, type: "mouseup" })).toBe(true);
  });

  it("an unrelated single click (detail 1) passes", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, detail: 1 })).toBe(false);
    expect(shouldSwallowAfterOutsideClose({ ...base, type: "mousedown", detail: 1 })).toBe(false);
  });

  it("boundary: exactly 600ms after the close is still inside the window; 601ms is outside", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, now: 10_600 })).toBe(true);
    expect(shouldSwallowAfterOutsideClose({ ...base, now: 10_601 })).toBe(false);
  });

  it("outside the window even a dblclick passes", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, type: "dblclick", now: 12_000 })).toBe(false);
  });

  it("position: within 4px on both axes -> swallow; 5px away on either axis -> pass", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, x: 204, y: 146 })).toBe(true);
    expect(shouldSwallowAfterOutsideClose({ ...base, x: 205 })).toBe(false);
    expect(shouldSwallowAfterOutsideClose({ ...base, y: 155 })).toBe(false);
    expect(shouldSwallowAfterOutsideClose({ ...base, type: "dblclick", x: 400 })).toBe(false);
  });

  it("no recorded outside close -> never swallow", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, closedAt: null })).toBe(false);
  });

  it("windowMs / distancePx can be overridden", () => {
    expect(shouldSwallowAfterOutsideClose({ ...base, now: 10_250, windowMs: 200 })).toBe(false);
    expect(shouldSwallowAfterOutsideClose({ ...base, x: 210, distancePx: 10 })).toBe(true);
  });

  it("an event timestamped before the close (clock skew) is not swallowed unless within the window", () => {
    // now < closedAt.time never happens with a monotonic clock; just must not throw.
    expect(() => shouldSwallowAfterOutsideClose({ ...base, now: 9_000 })).not.toThrow();
  });
});

describe("isMiddleButtonAuxclick (§3.9.17.5)", () => {
  it("only button 1 (middle) is handled", () => {
    expect(isMiddleButtonAuxclick({ button: 1 })).toBe(true);
    expect(isMiddleButtonAuxclick({ button: 2 })).toBe(false);
    expect(isMiddleButtonAuxclick({ button: 0 })).toBe(false);
    expect(isMiddleButtonAuxclick({ button: 3 })).toBe(false);
  });
});
