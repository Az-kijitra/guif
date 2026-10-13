import { describe, expect, it } from "vitest";
import { buildStatusItems, focusAreaLabel, resolveFocusArea, type FocusAreaInput } from "./status-bar-model";

// [単体] Spec: SPEC-0300-0020 R-1372 / 確定 T-11 (while the menu bar is active the status bar's focus position is `フォーカス: メニュー`; the rank
//   is the right-click menu's, 3), SPEC-0300-0017 第8版 R-972 (note), SPEC-0300-0019 W-89 (`メニュー`), AC-1214 / AC-1340.
// Architecture: SPEC-0200-0001 §3.14.12-1 (MUST-129 / SHOULD-197): W-89 is a `REGION_NAMES` entry; `FocusArea` gains "menu-bar" in
//   `status-bar-model.ts` (NOT in status-bar-wiring.svelte.ts); routes may not import a feature's messages (import-boundary).
//
// Contract assumed (reported to the implementer):
//   FocusAreaInput.menuBarActive?: boolean        // optional, like contextMenuOpen
//   FocusArea includes "menu-bar"; focusAreaLabel("menu-bar") === "メニュー"
//   resolveFocusArea: modal > history/jump > sort menu > (context menu | menu bar) > path editing > search > tree > list > none

const base: FocusAreaInput = {
  modalOpen: false,
  historyOpen: false,
  historyMode: "history",
  sortMenuOpen: false,
  pathEditing: false,
  domArea: null,
};
const withMenuBar = (over: Partial<FocusAreaInput> = {}): FocusAreaInput => ({ ...base, ...over, menuBarActive: true }) as FocusAreaInput;

describe("resolveFocusArea with the menu bar (R-1372)", () => {
  it("menu bar active -> 'menu-bar'", () => {
    expect(resolveFocusArea(withMenuBar())).toBe("menu-bar");
  });

  it("it outranks the DOM focus: the focus really sits in the menu bar's heading, but also when the DOM area is still list / tree / search", () => {
    for (const domArea of ["list", "tree", "search", null] as const) {
      expect(resolveFocusArea(withMenuBar({ domArea }))).toBe("menu-bar");
    }
  });

  it("it outranks path-bar editing (the path bar cannot be edited while the menu bar is active, R-1350-1, but the rank is defined anyway)", () => {
    expect(resolveFocusArea(withMenuBar({ pathEditing: true }))).toBe("menu-bar");
  });

  it("a dialog or a history list outranks it (they cannot coexist: R-1370 closes the menu, R-1365)", () => {
    expect(resolveFocusArea(withMenuBar({ modalOpen: true }))).toBe("dialog");
    expect(resolveFocusArea(withMenuBar({ historyOpen: true, historyMode: "history" }))).toBe("history");
    expect(resolveFocusArea(withMenuBar({ historyOpen: true, historyMode: "jump" }))).toBe("jump");
  });

  it("when the flag is false or absent nothing changes (the 8 existing states)", () => {
    expect(resolveFocusArea({ ...base, domArea: "list" })).toBe("list");
    expect(resolveFocusArea({ ...base, domArea: "tree" })).toBe("tree");
    expect(resolveFocusArea({ ...base, menuBarActive: false, domArea: "search" } as FocusAreaInput)).toBe("search");
    expect(resolveFocusArea({ ...base, menuBarActive: false } as FocusAreaInput)).toBe("none");
  });
});

describe("the label and the status item (W-89)", () => {
  it("focusAreaLabel('menu-bar') is メニュー", () => {
    expect(focusAreaLabel("menu-bar" as never)).toBe("メニュー");
  });

  it("the status bar shows フォーカス: メニュー (AC-1214, AC-1340)", () => {
    const items = buildStatusItems({
      focusArea: "menu-bar" as never,
      sortKey: "name",
      sortOrder: "asc",
      selectedVisibleCount: 0,
      showHidden: false,
      searchActive: false,
      query: "",
    });
    expect(items[0]).toEqual({ id: "focus", text: "フォーカス: メニュー" });
  });
});
