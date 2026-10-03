import { describe, expect, it } from "vitest";
import { decideContextMenuEvent, decideMenuWheel } from "./menu-events";

// Spec: SPEC-0300-0018 R-1011 (input fields: do nothing), R-1088 + G-5 (menu
//   open: pointer-origin outside right click closes; inside / keyboard /
//   synthetic do nothing), R-1002 (keyboard origin: never opens), R-1101
//   (overlay open: nothing), R-1001 (none target: nothing), R-1000, R-1089 (1)
//   (wheel).
// Architecture: SPEC-0200-0001 §3.9.17.1 order (editable -> menu open -> keyboard
//   -> overlay -> target), §3.9.17.4 (decideContextMenuEvent / decideMenuWheel).
// Module under test (stub): ./menu-events.ts

type In = Parameters<typeof decideContextMenuEvent>[0];
const base: In = {
  editable: false,
  menuOpen: false,
  origin: "pointer",
  insideMenu: false,
  overlayOpen: false,
  target: { kind: "row" },
};
const d = (over: Partial<In>) => decideContextMenuEvent({ ...base, ...over });

describe("decideContextMenuEvent: closed menu", () => {
  it("pointer right click on a row -> open-row", () => {
    expect(d({})).toBe("open-row");
  });

  it("pointer right click on the list blank -> open-blank", () => {
    expect(d({ target: { kind: "blank" } })).toBe("open-blank");
  });

  it("target none (tree, status bar, ...) -> ignore (R-1001)", () => {
    expect(d({ target: { kind: "none" } })).toBe("ignore");
  });

  it("keyboard / synthetic origin never opens (R-1002)", () => {
    expect(d({ origin: "keyboard" })).toBe("ignore");
    expect(d({ origin: "keyboard", target: { kind: "blank" } })).toBe("ignore");
  });

  it("an overlay (dialog / history / jump list / sort menu) blocks opening (R-1101)", () => {
    expect(d({ overlayOpen: true })).toBe("ignore");
    expect(d({ overlayOpen: true, target: { kind: "blank" } })).toBe("ignore");
  });

  it("an input field is never handled, whatever else holds (R-1011)", () => {
    expect(d({ editable: true })).toBe("ignore");
    expect(d({ editable: true, target: { kind: "blank" } })).toBe("ignore");
  });
});

describe("decideContextMenuEvent: menu open (R-1088, G-5)", () => {
  it("pointer-origin right click OUTSIDE the menu -> close (no new menu)", () => {
    expect(d({ menuOpen: true })).toBe("close");
    expect(d({ menuOpen: true, target: { kind: "blank" } })).toBe("close");
    expect(d({ menuOpen: true, target: { kind: "none" } })).toBe("close");
  });

  it("pointer-origin right click INSIDE the menu -> ignore", () => {
    expect(d({ menuOpen: true, insideMenu: true })).toBe("ignore");
  });

  it("keyboard / synthetic origin -> ignore, even outside the menu (G-5)", () => {
    expect(d({ menuOpen: true, origin: "keyboard" })).toBe("ignore");
    expect(d({ menuOpen: true, origin: "keyboard", insideMenu: true })).toBe("ignore");
  });

  it("an input field is ignored even while the menu is open", () => {
    expect(d({ menuOpen: true, editable: true })).toBe("ignore");
  });

  it("never returns an open-* decision while the menu is open", () => {
    for (const origin of ["pointer", "keyboard"] as const) {
      for (const insideMenu of [true, false]) {
        for (const kind of ["row", "blank", "none"] as const) {
          const r = d({ menuOpen: true, origin, insideMenu, target: { kind } });
          expect(r === "open-row" || r === "open-blank").toBe(false);
        }
      }
    }
  });
});

describe("decideMenuWheel (R-1089 (1))", () => {
  it("outside the menu -> prevent (neither list nor tree scrolls)", () => {
    expect(decideMenuWheel({ insideMenu: false, scrollable: true })).toBe("prevent");
    expect(decideMenuWheel({ insideMenu: false, scrollable: false })).toBe("prevent");
  });

  it("inside a vertically scrollable menu -> allow", () => {
    expect(decideMenuWheel({ insideMenu: true, scrollable: true })).toBe("allow");
  });

  it("inside a non-scrollable menu -> prevent (no scroll chaining to the page)", () => {
    expect(decideMenuWheel({ insideMenu: true, scrollable: false })).toBe("prevent");
  });
});
