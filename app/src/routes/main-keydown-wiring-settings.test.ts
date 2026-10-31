import { describe, expect, it, vi } from "vitest";
import { createMainKeydownHandler, type MainKeydownWiringDeps } from "./main-keydown-wiring";

// [単体] Spec: SPEC-0300-0022 R-1606 / AC-1612 (the `repeat` flag reaches the handler of `Ctrl+,`), R-1671 / AC-1661 (works with a search input
//   focus, an overlay, a path-bar edit, an open right-click menu, an active menu bar; the overlay state is not touched), R-1671-1 / AC-1664 (the
//   menus are closed by the handler, not by the dispatch), SPEC-0300-0010 第18版 R-14 (no `isSettingsOpen`).
// Architecture: SPEC-0200-0001 §3.17.9: `MainKeydownWiringDeps.onHardcodedShortcut: (action: "exit" | "settings", event: KeydownLikeEvent) => boolean`;
//   the event given to it carries `repeat` (= KeyboardEvent.repeat), like the one given to every other handler.
//
// Module under test: ./main-keydown-wiring.ts

type Fn = ReturnType<typeof vi.fn>;

function key(k: string, mods: Record<string, boolean> = {}) {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, repeat: false, keyCode: 0, preventDefault: vi.fn(), ...mods };
}

function makeDeps(over: Record<string, unknown> = {}) {
  const deps = {
    isTreeFocused: () => false,
    customOverrides: () => ({}),
    modal: { isOpen: false },
    history: { isOpen: false },
    sortMenu: { isOpen: false },
    search: { active: false, inputFocused: false },
    onHardcodedShortcut: vi.fn().mockReturnValue(true),
    onExitAction: vi.fn().mockReturnValue(false),
    handleModalKey: vi.fn().mockReturnValue(true),
    handleSortMenuKey: vi.fn().mockReturnValue(true),
    sortMenuToggle: vi.fn(),
    resolveHistoryIntent: vi.fn().mockReturnValue(true),
    onTreeAction: vi.fn().mockReturnValue(false),
    onListAction: vi.fn().mockReturnValue(false),
    onSearchAction: vi.fn(),
    onTabStop: vi.fn().mockReturnValue(false),
    ...over,
  };
  return deps as unknown as MainKeydownWiringDeps & Record<string, Fn>;
}
const fire = (deps: MainKeydownWiringDeps, e: ReturnType<typeof key>): void => createMainKeydownHandler(deps)(e as unknown as Event);
const CTRL_COMMA = (mods: Record<string, boolean> = {}) => key(",", { ctrlKey: true, ...mods });
const hardcoded = (deps: unknown): Fn => (deps as { onHardcodedShortcut: Fn }).onHardcodedShortcut;

describe("Ctrl+, reaches onHardcodedShortcut('settings', event) (R-1671)", () => {
  it("passes the action and an event with the modifier fields, and prevents the default when handled", () => {
    const deps = makeDeps();
    const e = CTRL_COMMA();
    fire(deps, e);
    expect(hardcoded(deps)).toHaveBeenCalledTimes(1);
    const [action, event] = hardcoded(deps).mock.calls[0];
    expect(action).toBe("settings");
    expect(event).toMatchObject({ key: ",", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false });
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("R-1606: `repeat` of the KeyboardEvent is carried (true and false)", () => {
    for (const repeat of [true, false]) {
      const deps = makeDeps();
      fire(deps, CTRL_COMMA({ repeat }));
      expect(hardcoded(deps).mock.calls[0][1].repeat).toBe(repeat);
    }
  });

  it("Ctrl+Q passes ('exit', event) the same way", () => {
    const deps = makeDeps();
    fire(deps, key("q", { ctrlKey: true }));
    expect(hardcoded(deps).mock.calls[0][0]).toBe("exit");
    expect(hardcoded(deps).mock.calls[0][1]).toMatchObject({ key: "q", ctrlKey: true });
  });

  it("an unhandled result (false) is not prevented", () => {
    const deps = makeDeps({ onHardcodedShortcut: vi.fn().mockReturnValue(false) });
    const e = CTRL_COMMA();
    fire(deps, e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe("AC-1661 / AC-1664 (unit part): it is evaluated ahead of every overlay / guard", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["a dialog is open", { modal: { isOpen: true } }],
    ["the search input is focused", { search: { active: true, inputFocused: true } }],
    ["the path bar is being edited", { pathBar: { editing: true, onKey: vi.fn(), onOverlayAction: vi.fn() } }],
    ["the right-click menu is open", { contextMenu: { isOpen: true, handleKey: vi.fn().mockReturnValue(true) } }],
    ["the menu bar is active", { menuBar: { active: true, onKey: vi.fn().mockReturnValue(true), onActivate: vi.fn() } }],
    ["the sort menu is open", { sortMenu: { isOpen: true } }],
  ];
  it.each(cases)("%s", (_n, over) => {
    const deps = makeDeps(over);
    fire(deps, CTRL_COMMA());
    expect(hardcoded(deps)).toHaveBeenCalledTimes(1);
    expect(deps.handleModalKey).not.toHaveBeenCalled();
    expect(deps.handleSortMenuKey).not.toHaveBeenCalled();
    expect(deps.onSearchAction).not.toHaveBeenCalled();
    expect(deps.onListAction).not.toHaveBeenCalled();
    const cm = (over as { contextMenu?: { handleKey: Fn } }).contextMenu;
    if (cm) expect(cm.handleKey).not.toHaveBeenCalled();
    const mb = (over as { menuBar?: { onKey: Fn } }).menuBar;
    if (mb) expect(mb.onKey).not.toHaveBeenCalled();
  });
});

describe("SPEC-0300-0024: while the fuzzy search is shown", () => {
  it("Ctrl+, and Ctrl+Q still reach onHardcodedShortcut (the same as with the other overlays)", () => {
    for (const [ev, action] of [[CTRL_COMMA(), "settings"], [key("q", { ctrlKey: true }), "exit"]] as const) {
      const deps = makeDeps({ fuzzySearch: { isOpen: true } });
      fire(deps, ev);
      expect(hardcoded(deps)).toHaveBeenCalledWith(action, expect.objectContaining({ ctrlKey: true }));
      expect(ev.preventDefault).toHaveBeenCalled();
    }
  });

  it("other keys are left to the search box (no list action)", () => {
    const deps = makeDeps({ fuzzySearch: { isOpen: true } });
    fire(deps, key("ArrowDown"));
    expect(deps.onListAction).not.toHaveBeenCalled();
    expect(hardcoded(deps)).not.toHaveBeenCalled();
  });
});
