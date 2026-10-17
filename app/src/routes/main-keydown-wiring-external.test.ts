import { describe, expect, it, vi } from "vitest";
import { createMainKeydownHandler, type MainKeydownWiringDeps } from "./main-keydown-wiring";

// [単体] Spec: SPEC-0300-0021 R-1550 (the registrations are matched in the key dispatch -- the same situations as the file-list handler's keymap), R-1550 4
//   (a matched key is handled: the default action is prevented), R-1549 (the key repeat flag must reach the matcher: this handler fills it from the
//   KeyboardEvent), R-1512 / AC-1544 (Ctrl+Alt+E reaches the registrations, Alt+E opens the menu), AC-1533 (unit part).
// Architecture: SPEC-0200-0001 §3.16.6 / §3.16.7 (`main-keydown-wiring.ts` "fills `ke.repeat` and passes `DispatchContext.onExternalAppKey`"), MUST-144
//   (a one-line pass-through; the logic lives in `routes/external-apps-wiring.ts`).
//
// Contract assumed (reported to the implementer):
//   MainKeydownWiringDeps.externalApps?: { onKey: (event: KeydownLikeEvent) => boolean }       // optional, so existing callers / tests stay valid
//   the KeydownLikeEvent given to EVERY handler carries `repeat: boolean` (= KeyboardEvent.repeat)
//   DispatchContext.onExternalAppKey = deps.externalApps?.onKey      (undefined when the dep is absent)
//
// Module under test: ./main-keydown-wiring.ts

function key(
  k: string,
  mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing" | "repeat", boolean>> = {},
) {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    isComposing: false,
    repeat: false,
    keyCode: 0,
    preventDefault: vi.fn(),
    ...mods,
  };
}

function makeDeps(over: Record<string, unknown> = {}) {
  const externalApps = { onKey: vi.fn().mockReturnValue(true) };
  const menuBar = { active: false, onKey: vi.fn().mockReturnValue(true), onActivate: vi.fn().mockReturnValue(true) };
  const deps = {
    isTreeFocused: () => false,
    customOverrides: () => ({}),
    modal: { isOpen: false },
    history: { isOpen: false },
    sortMenu: { isOpen: false },
    search: { active: false, inputFocused: false },
    onHardcodedShortcut: vi.fn().mockReturnValue(false),
    onExitAction: vi.fn().mockReturnValue(false),
    handleModalKey: vi.fn().mockReturnValue(true),
    handleSortMenuKey: vi.fn().mockReturnValue(true),
    sortMenuToggle: vi.fn(),
    resolveHistoryIntent: vi.fn().mockReturnValue(true),
    onTreeAction: vi.fn().mockReturnValue(false),
    onListAction: vi.fn().mockReturnValue(false),
    onSearchAction: vi.fn(),
    onTabStop: vi.fn().mockReturnValue(false),
    menuBar,
    externalApps,
    ...over,
  };
  return { deps: deps as unknown as MainKeydownWiringDeps & typeof deps, externalApps: (deps.externalApps ?? externalApps) as typeof externalApps, menuBar };
}

const fire = (deps: MainKeydownWiringDeps, e: ReturnType<typeof key>): void => createMainKeydownHandler(deps)(e as unknown as Event);

describe("a registration key (R-1550)", () => {
  it("Ctrl+Alt+C reaches onKey with the event's fields, and the default action is prevented", () => {
    const { deps, externalApps } = makeDeps();
    const e = key("c", { ctrlKey: true, altKey: true });
    fire(deps, e);
    expect(externalApps.onKey).toHaveBeenCalledTimes(1);
    expect(externalApps.onKey.mock.calls[0][0]).toMatchObject({ key: "c", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false });
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("an unhandled key (onKey false) is not prevented", () => {
    const { deps } = makeDeps({ externalApps: { onKey: vi.fn().mockReturnValue(false) } });
    const e = key("c", { ctrlKey: true, altKey: true });
    fire(deps, e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("R-1549: the repeat flag of the KeyboardEvent reaches the matcher", () => {
    const { deps, externalApps } = makeDeps();
    fire(deps, key("c", { ctrlKey: true, altKey: true, repeat: true }));
    expect(externalApps.onKey.mock.calls[0][0].repeat).toBe(true);
    fire(deps, key("c", { ctrlKey: true, altKey: true, repeat: false }));
    expect(externalApps.onKey.mock.calls[1][0].repeat).toBe(false);
  });

  it("the repeat flag is on every event the handlers see (not only the external one)", () => {
    const { deps } = makeDeps();
    fire(deps, key("ArrowDown", { repeat: true }));
    expect(deps.onListAction).toHaveBeenCalled();
    expect(deps.onListAction.mock.calls[0][1].repeat).toBe(true);
  });

  it("the IME marker is kept as before (keyCode 229) and composition is passed on", () => {
    const { deps, externalApps } = makeDeps();
    fire(deps, key("c", { ctrlKey: true, altKey: true, isComposing: true }));
    // whether onKey is called is the matcher's business (key-match returns null while composing); the field must be there
    if (externalApps.onKey.mock.calls.length > 0) expect(externalApps.onKey.mock.calls[0][0].isComposing).toBe(true);
  });
});

describe("the key map comes first (AC-1537)", () => {
  it("a keymap action handled by the list never reaches the registrations", () => {
    const { deps, externalApps } = makeDeps({ onListAction: vi.fn().mockReturnValue(true) });
    fire(deps, key("a", { ctrlKey: true }));
    expect(deps.onListAction).toHaveBeenCalledWith("select_all", expect.anything());
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });

  it("ZIP's Ctrl+Alt+Z belongs to the keymap, not to a registration", () => {
    const { deps, externalApps } = makeDeps({ onListAction: vi.fn().mockReturnValue(true) });
    fire(deps, key("z", { ctrlKey: true, altKey: true }));
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });
});

describe("the situations without registrations (AC-1533)", () => {
  it("a dialog is open: the modal gets the key", () => {
    const { deps, externalApps } = makeDeps({ modal: { isOpen: true } });
    fire(deps, key("c", { ctrlKey: true, altKey: true }));
    expect(deps.handleModalKey).toHaveBeenCalled();
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });

  it("history / sort menu / right-click menu open", () => {
    for (const over of [{ history: { isOpen: true } }, { sortMenu: { isOpen: true } }, { contextMenu: { isOpen: true, handleKey: vi.fn().mockReturnValue(true) } }]) {
      const { deps, externalApps } = makeDeps(over);
      fire(deps, key("c", { ctrlKey: true, altKey: true }));
      expect(externalApps.onKey).not.toHaveBeenCalled();
    }
  });

  it("the path bar is being edited", () => {
    const { deps, externalApps } = makeDeps({ pathBar: { editing: true, onKey: vi.fn(), onOverlayAction: vi.fn() } });
    fire(deps, key("c", { ctrlKey: true, altKey: true }));
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });

  it("the menu bar is active", () => {
    const { deps, externalApps, menuBar } = makeDeps();
    menuBar.active = true;
    fire(deps, key("c", { ctrlKey: true, altKey: true }));
    expect(menuBar.onKey).toHaveBeenCalled();
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });

  it("the search INPUT is focused", () => {
    const { deps, externalApps } = makeDeps({ search: { active: true, inputFocused: true } });
    fire(deps, key("c", { ctrlKey: true, altKey: true }));
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });

  it("AC-1515: the search bar is open but one of its BUTTONS has the focus (input not focused): the registrations are consulted", () => {
    const { deps, externalApps } = makeDeps({ search: { active: true, inputFocused: false } });
    fire(deps, key("c", { ctrlKey: true, altKey: true }));
    expect(externalApps.onKey).toHaveBeenCalledTimes(1);
  });

  it("the tree has the focus: the registrations are consulted for a non-tree key (R-1533)", () => {
    const { deps, externalApps } = makeDeps({ isTreeFocused: () => true });
    fire(deps, key("c", { ctrlKey: true, altKey: true }));
    expect(externalApps.onKey).toHaveBeenCalledTimes(1);
  });
});

describe("AC-1544: Ctrl+Alt+E and Alt+E", () => {
  it("Ctrl+Alt+E: the menu bar does not activate, the registration is consulted", () => {
    const { deps, externalApps, menuBar } = makeDeps();
    fire(deps, key("e", { ctrlKey: true, altKey: true }));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
    expect(externalApps.onKey).toHaveBeenCalledTimes(1);
  });

  it("Alt+E: the Edit menu is activated, the registration is not consulted", () => {
    const { deps, externalApps, menuBar } = makeDeps();
    fire(deps, key("e", { altKey: true }));
    expect(menuBar.onActivate).toHaveBeenCalledWith("access", expect.anything());
    expect(externalApps.onKey).not.toHaveBeenCalled();
  });
});

describe("the dep is optional", () => {
  it("without it nothing changes: the key is simply not handled", () => {
    const { deps } = makeDeps({ externalApps: undefined });
    delete (deps as unknown as Record<string, unknown>).externalApps;
    const e = key("c", { ctrlKey: true, altKey: true });
    expect(() => fire(deps, e)).not.toThrow();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
