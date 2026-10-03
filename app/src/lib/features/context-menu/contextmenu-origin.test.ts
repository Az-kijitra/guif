import { describe, expect, it } from "vitest";
import { createContextMenuOriginTracker } from "./contextmenu-origin";

// Spec: SPEC-0300-0018 R-1002 (keyboard-origin contextmenu never opens the menu;
//   a real right click always does), R-1003 (modifier keys held during a right
//   click are ignored), G-5 (synthetic contextmenu = keyboard), AC-1004.
// Architecture: SPEC-0200-0001 §3.9.9, §3.9.17.1 (MUST-113: consume() is called
//   once at the TOP of the handler; MUST-114: the record is erased ONLY by the
//   ContextMenu key and Shift+F10, not by other keys, bare modifiers or
//   auto-repeat).
// Module under test (stub): ./contextmenu-origin.ts

const key = (k: string, over: { shiftKey?: boolean; repeat?: boolean } = {}) => ({
  key: k,
  shiftKey: false,
  ...over,
});

describe("createContextMenuOriginTracker (R-1002)", () => {
  it("pointerdown(button 2) then contextmenu -> pointer", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    expect(o.consume()).toBe("pointer");
  });

  it("contextmenu with no preceding pointerdown (a synthetic dispatchEvent) -> keyboard", () => {
    const o = createContextMenuOriginTracker();
    expect(o.consume()).toBe("keyboard");
  });

  it("a LEFT-button pointerdown does not count as a right click -> keyboard", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 0 });
    expect(o.consume()).toBe("keyboard");
    o.onPointerDown({ button: 1 });
    expect(o.consume()).toBe("keyboard");
  });

  it("consume erases the record: a second consume is keyboard (one pointerdown serves one contextmenu)", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    expect(o.consume()).toBe("pointer");
    expect(o.consume()).toBe("keyboard");
  });

  it("MUST-113: a pointer right click followed by a synthetic contextmenu -> the synthetic one is keyboard", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    o.consume(); // the real contextmenu (e.g. on an input: the handler bails out AFTER consuming)
    expect(o.consume()).toBe("keyboard"); // the following synthetic one
  });
});

describe("keyboard-origin keys erase the record (MUST-114)", () => {
  it("Shift+F10 erases it -> keyboard", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    o.onKeyDown(key("F10", { shiftKey: true }));
    expect(o.consume()).toBe("keyboard");
  });

  it("the ContextMenu key erases it -> keyboard", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    o.onKeyDown(key("ContextMenu"));
    expect(o.consume()).toBe("keyboard");
  });

  it("plain F10 (without Shift) does NOT erase it", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    o.onKeyDown(key("F10"));
    expect(o.consume()).toBe("pointer");
  });

  it("an ordinary key (a) does NOT erase it", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    o.onKeyDown(key("a"));
    expect(o.consume()).toBe("pointer");
  });

  it("R-1003: Shift held down through a right click -- auto-repeat keydowns (repeat: true) do not erase it", () => {
    const o = createContextMenuOriginTracker();
    o.onKeyDown(key("Shift", { shiftKey: true }));
    o.onPointerDown({ button: 2 });
    o.onKeyDown(key("Shift", { shiftKey: true, repeat: true }));
    o.onKeyDown(key("Control", { repeat: true }));
    expect(o.consume()).toBe("pointer");
  });

  it("a bare modifier keydown (Shift / Control / Alt) does NOT erase it", () => {
    const o = createContextMenuOriginTracker();
    o.onPointerDown({ button: 2 });
    for (const k of ["Shift", "Control", "Alt", "Meta"]) o.onKeyDown(key(k, { shiftKey: k === "Shift" }));
    expect(o.consume()).toBe("pointer");
  });

  it("keyboard contextmenu key with no prior pointer stays keyboard", () => {
    const o = createContextMenuOriginTracker();
    o.onKeyDown(key("ContextMenu"));
    expect(o.consume()).toBe("keyboard");
  });

  it("a real right click AFTER a ContextMenu key press is pointer again (the keyboard judgment does not block the mouse, AC-1004)", () => {
    const o = createContextMenuOriginTracker();
    o.onKeyDown(key("ContextMenu"));
    o.consume();
    o.onPointerDown({ button: 2 });
    expect(o.consume()).toBe("pointer");
  });
});
