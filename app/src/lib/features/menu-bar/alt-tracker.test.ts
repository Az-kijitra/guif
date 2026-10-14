import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0020 R-1350 2 (Alt alone: from Alt's keydown to its keyup no other keydown / mouse press; either Alt; IME excluded),
//   R-1351 (Alt alone again deactivates), AC-1341, AC-1345 (the "can activate" part is the wiring's), AC-1348 (i) [E2E・OS 入力].
// Architecture: SPEC-0200-0001 §3.14.1-3 (`createAltTracker()` in menu-bar-keys.ts: fed by every keydown, a pointerdown and the Alt keyup),
//   §3.14.12-9 ((a) the tracker starts only when ctrl / shift / meta are all false at Alt's keydown; (b) auto-repeat keydowns of Alt do NOT invalidate;
//   (c) preventDefault is the wiring's own listener, not here).
//
// Contract:
//   createAltTracker(): { onKeyDown(e): void; onKeyUp(e): boolean; onPointerDown(): void }
//     onKeyUp returns true exactly when this keyup of Alt completes an "Alt alone" press (and resets the tracker)
//   reduceAltAlone(state): MenuBarKeyResult  -- inactive: activate (heading 0, dropdown closed); active: deactivate (one press, R-1351)

import { createAltTracker, INACTIVE_STATE, reduceAltAlone, type MenuBarKeyState } from "./menu-bar-keys";

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number; repeat: boolean }> = {},
) => ({ key, ctrlKey: false, altKey: key === "Alt", shiftKey: false, metaKey: false, ...mods });

describe("Alt alone (R-1350 2)", () => {
  it("Alt down, Alt up with nothing between -> activation", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt"));
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
  });

  it("a keyup of Alt without a tracked keydown (e.g. the keydown went to another window) does nothing", () => {
    expect(createAltTracker().onKeyUp(ev("Alt"))).toBe(false);
  });

  it("the tracker resets after each press: a second Alt press activates again, a stray second keyup does not", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt"));
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
    expect(t.onKeyUp(ev("Alt"))).toBe(false);
    t.onKeyDown(ev("Alt"));
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
  });

  it("another key between the two (Alt+F4, Alt+Tab, Ctrl+Alt+Z, Alt+F ...) cancels it (AC-1341)", () => {
    for (const other of [ev("F4", { altKey: true }), ev("Tab", { altKey: true }), ev("z", { altKey: true, ctrlKey: true }), ev("f", { altKey: true }), ev(" ", { altKey: true })]) {
      const t = createAltTracker();
      t.onKeyDown(ev("Alt"));
      t.onKeyDown(other);
      expect(t.onKeyUp(ev("Alt")), other.key).toBe(false);
    }
  });

  it("a modifier pressed after Alt (Ctrl, Shift) is another key and cancels it", () => {
    for (const m of ["Control", "Shift", "Meta"]) {
      const t = createAltTracker();
      t.onKeyDown(ev("Alt"));
      t.onKeyDown(ev(m, { altKey: true }));
      expect(t.onKeyUp(ev("Alt")), m).toBe(false);
    }
  });

  it("a mouse press while Alt is down cancels it (R-1350 2)", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt"));
    t.onPointerDown();
    expect(t.onKeyUp(ev("Alt"))).toBe(false);
  });

  it("a mouse press BEFORE Alt does not matter", () => {
    const t = createAltTracker();
    t.onPointerDown();
    t.onKeyDown(ev("Alt"));
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
  });

  it("§3.14.12-9 (a): does not start when ctrl / shift / meta is already down at Alt's keydown (Ctrl then Alt, AltGr-like)", () => {
    for (const m of ["ctrlKey", "shiftKey", "metaKey"] as const) {
      const t = createAltTracker();
      t.onKeyDown(ev("Alt", { [m]: true }));
      expect(t.onKeyUp(ev("Alt")), m).toBe(false);
    }
  });

  it("§3.14.12-9 (b): auto-repeat keydowns of Alt do NOT cancel it", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt"));
    t.onKeyDown(ev("Alt", { repeat: true }));
    t.onKeyDown(ev("Alt", { repeat: true }));
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
  });

  it("a repeat keydown of Alt without a first one does not start it either way it is harmless (start requires the clean state)", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt", { repeat: true, ctrlKey: true }));
    expect(t.onKeyUp(ev("Alt"))).toBe(false);
  });

  it("IME composition: the keydown during composition (isComposing / 229) never starts it; an IME key in between cancels it; a composing keyup is no activation", () => {
    const a = createAltTracker();
    a.onKeyDown(ev("Alt", { isComposing: true }));
    expect(a.onKeyUp(ev("Alt"))).toBe(false);
    const b = createAltTracker();
    b.onKeyDown(ev("Alt", { keyCode: 229 }));
    expect(b.onKeyUp(ev("Alt"))).toBe(false);
    const c = createAltTracker();
    c.onKeyDown(ev("Alt"));
    c.onKeyDown(ev("Process", { altKey: true, keyCode: 229 }));
    expect(c.onKeyUp(ev("Alt"))).toBe(false);
    const d = createAltTracker();
    d.onKeyDown(ev("Alt"));
    expect(d.onKeyUp(ev("Alt", { isComposing: true }))).toBe(false);
  });

  it("only the Alt key's keyup counts: the keyup of another key does not complete (nor reset) a press", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt"));
    expect(t.onKeyUp(ev("f"))).toBe(false);
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
  });

  it("left and right Alt are not distinguished (both are key 'Alt')", () => {
    const t = createAltTracker();
    t.onKeyDown(ev("Alt"));
    t.onKeyDown(ev("Alt")); // the other Alt, not a repeat
    expect(t.onKeyUp(ev("Alt"))).toBe(true);
  });
});

describe("reduceAltAlone (R-1350 2 / R-1351)", () => {
  it("inactive -> active with the first heading highlighted and the dropdown closed", () => {
    const r = reduceAltAlone(INACTIVE_STATE);
    expect(r.state).toEqual({ active: true, headingIndex: 0, openMenu: null, highlightId: null, entries: [] });
    expect(r.effect).toEqual({ kind: "activate" });
    expect(r.handled).toBe(true);
    expect(r.preventDefault).toBe(true);
  });

  it("active (heading level) -> inactive in one press, asking for the focus restore (AC-1341 second half)", () => {
    const s: MenuBarKeyState = { active: true, headingIndex: 2, openMenu: null, highlightId: null, entries: [] };
    const r = reduceAltAlone(s);
    expect(r.state).toEqual(INACTIVE_STATE);
    expect(r.effect).toEqual({ kind: "deactivate" });
  });

  it("active with a dropdown open -> inactive as well", () => {
    const s: MenuBarKeyState = { active: true, headingIndex: 1, openMenu: "edit", highlightId: "a", entries: [{ type: "item", id: "a", enabled: true }] };
    const r = reduceAltAlone(s);
    expect(r.state).toEqual(INACTIVE_STATE);
    expect(r.effect).toEqual({ kind: "deactivate" });
  });
});
