import { describe, expect, it, vi } from "vitest";
import { createMainKeydownHandler, type MainKeydownWiringDeps } from "./main-keydown-wiring";

// [単体] Spec: SPEC-0300-0010 第16版 R-14-5-1 (activation only when no overlay is shown and the path bar is not being edited; works with the
//   search input focused), R-14-5-2 (active: every key to the menu bar's handler; an unhandled (OS) key is not preventDefault()ed), R-1350-1,
//   R-1355, AC-90 / AC-91 / AC-92 (unit part), AC-93.
//   Alt-alone (keyup) is on hold and NOT covered.
// Architecture: SPEC-0200-0001 §3.14.1-3 ("main-keydown-wiring.ts: replace `isMenuBarActive: false` and `onMenuBarKey: () => false` with values
//   from `deps.menuBar` (`menuBar?` stays optional); `canActivateMenuBar` is derived from `computeDispatchOverlayFlags` (overlay hidden, path
//   bar not editing)"), §3.14.12-9(c) (the Alt / F10 preventDefault layer is menu-bar-wiring's own listener; this handler only preventDefault()s
//   what dispatchKeydown reports as handled).
//
// Contract assumed (reported to the implementer):
//   MainKeydownWiringDeps.menuBar?: {
//     readonly active: boolean;                                                        // reactive getter
//     onKey: (action: string | null, event: KeydownLikeEvent) => boolean;             // R-14-5-2 (called with action null)
//     onActivate: (kind: "f10" | "access", event: KeydownLikeEvent) => boolean;        // R-14-5-1
//   }
//
// Module under test: ./main-keydown-wiring.ts

function key(k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing", boolean>> = {}) {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    isComposing: false,
    keyCode: 0,
    preventDefault: vi.fn(),
    ...mods,
  };
}

function makeDeps(over: Record<string, unknown> = {}) {
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
    ...over,
  };
  return { deps: deps as unknown as MainKeydownWiringDeps & typeof deps, menuBar: (deps.menuBar ?? menuBar) as typeof menuBar };
}

const fire = (deps: MainKeydownWiringDeps, e: ReturnType<typeof key>): void => createMainKeydownHandler(deps)(e as unknown as Event);

describe("activation (R-14-5-1, AC-90)", () => {
  it("F10 on the file list: onActivate('f10', event) and the default action is prevented", () => {
    const { deps, menuBar } = makeDeps();
    const e = key("F10");
    fire(deps, e);
    expect(menuBar.onActivate).toHaveBeenCalledTimes(1);
    expect(menuBar.onActivate.mock.calls[0][0]).toBe("f10");
    expect(menuBar.onActivate.mock.calls[0][1]).toMatchObject({ key: "F10", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false });
    expect(e.preventDefault).toHaveBeenCalled();
    expect(deps.onListAction).not.toHaveBeenCalled();
  });

  it.each(["f", "e", "v", "g"])("Alt+%s -> onActivate('access', event)", (k) => {
    const { deps, menuBar } = makeDeps();
    const e = key(k, { altKey: true });
    fire(deps, e);
    expect(menuBar.onActivate.mock.calls[0][0]).toBe("access");
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("with the TREE focused and with the SEARCH INPUT focused it still activates (AC-90 ii / iii)", () => {
    const tree = makeDeps({ isTreeFocused: () => true });
    fire(tree.deps, key("F10"));
    expect(tree.menuBar.onActivate).toHaveBeenCalledTimes(1);
    const search = makeDeps({ search: { active: true, inputFocused: true } });
    fire(search.deps, key("F10"));
    expect(search.menuBar.onActivate).toHaveBeenCalledTimes(1);
    expect(search.deps.onSearchAction).not.toHaveBeenCalled();
  });

  it("a user binding of F10 to an action does not win (T-06)", () => {
    const { deps, menuBar } = makeDeps({ customOverrides: () => ({ copy: "F10" }) });
    fire(deps, key("F10"));
    expect(menuBar.onActivate).toHaveBeenCalledTimes(1);
    expect(deps.onListAction).not.toHaveBeenCalled();
  });
});

describe("no activation while an overlay is shown or the path bar is being edited (R-1350-1, AC-92 / AC-1345)", () => {
  it("confirm dialog open: the modal gets the key, the menu bar does not activate", () => {
    const { deps, menuBar } = makeDeps({ modal: { isOpen: true } });
    fire(deps, key("F10"));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
    expect(deps.handleModalKey).toHaveBeenCalled();
  });

  it("history / jump list open", () => {
    const { deps, menuBar } = makeDeps({ history: { isOpen: true } });
    fire(deps, key("F10"));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
    expect(deps.resolveHistoryIntent).toHaveBeenCalled();
  });

  it("sort menu open", () => {
    const { deps, menuBar } = makeDeps({ sortMenu: { isOpen: true } });
    fire(deps, key("F10"));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
    expect(deps.handleSortMenuKey).toHaveBeenCalled();
  });

  it("right-click menu open", () => {
    const contextMenu = { isOpen: true, handleKey: vi.fn().mockReturnValue(true) };
    const { deps, menuBar } = makeDeps({ contextMenu });
    fire(deps, key("F10"));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
    expect(contextMenu.handleKey).toHaveBeenCalled();
  });

  it("path bar editing: the path bar keeps the key (F10 and Alt+F do not activate)", () => {
    const pathBar = { editing: true, onKey: vi.fn(), onOverlayAction: vi.fn() };
    const { deps, menuBar } = makeDeps({ pathBar });
    fire(deps, key("F10"));
    fire(deps, key("f", { altKey: true }));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
  });

  it("IME composition: no activation", () => {
    const { deps, menuBar } = makeDeps();
    fire(deps, key("F10", { isComposing: true }));
    expect(menuBar.onActivate).not.toHaveBeenCalled();
  });
});

describe("while active (R-14-5-2, AC-91)", () => {
  it("every key goes to onKey(null, event); the list / tree / exit / search handlers never run", () => {
    const { deps, menuBar } = makeDeps({
      menuBar: { active: true, onKey: vi.fn().mockReturnValue(true), onActivate: vi.fn() },
      customOverrides: () => ({ exit: "Q" }),
      isTreeFocused: () => true,
      search: { active: true, inputFocused: true },
    });
    for (const k of ["Delete", "F2", "s", "/", "Backspace", "a", "Tab", "q", "Escape", "ArrowDown"]) fire(deps, key(k));
    expect(menuBar.onKey).toHaveBeenCalledTimes(10);
    for (const c of menuBar.onKey.mock.calls) expect(c[0]).toBeNull();
    expect(deps.onListAction).not.toHaveBeenCalled();
    expect(deps.onTreeAction).not.toHaveBeenCalled();
    expect(deps.onExitAction).not.toHaveBeenCalled();
    expect(deps.onSearchAction).not.toHaveBeenCalled();
    expect(deps.onTabStop).not.toHaveBeenCalled();
  });

  it("a handled key is preventDefault()ed; an OS key (onKey returns false) is NOT", () => {
    const onKey = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const { deps } = makeDeps({ menuBar: { active: true, onKey, onActivate: vi.fn() } });
    const handled = key("ArrowDown");
    const os = key("F4", { altKey: true });
    fire(deps, handled);
    fire(deps, os);
    expect(handled.preventDefault).toHaveBeenCalled();
    expect(os.preventDefault).not.toHaveBeenCalled();
  });

  it("Ctrl+Q still reaches the hardcoded shortcut (AC-1343)", () => {
    const { deps, menuBar } = makeDeps({ menuBar: { active: true, onKey: vi.fn(), onActivate: vi.fn() } });
    fire(deps, key("q", { ctrlKey: true }));
    expect(deps.onHardcodedShortcut).toHaveBeenCalledWith("exit");
    expect(menuBar.onKey).not.toHaveBeenCalled();
  });

  it("the activation member is not used while active", () => {
    const m = { active: true, onKey: vi.fn().mockReturnValue(true), onActivate: vi.fn() };
    const { deps } = makeDeps({ menuBar: m });
    fire(deps, key("F10"));
    expect(m.onActivate).not.toHaveBeenCalled();
    expect(m.onKey).toHaveBeenCalledTimes(1);
  });
});

describe("backward compatibility: no menuBar dependency (existing callers / tests)", () => {
  it("F10 and Alt+F fall to the list handler as before; nothing throws", () => {
    const { deps } = makeDeps({ menuBar: undefined });
    expect(() => {
      fire(deps, key("F10"));
      fire(deps, key("f", { altKey: true }));
    }).not.toThrow();
    expect(deps.onListAction).toHaveBeenCalledTimes(2);
  });
});
