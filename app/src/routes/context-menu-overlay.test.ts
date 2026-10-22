import { describe, expect, it, vi } from "vitest";
import { computeDispatchOverlayFlags, syncContextMenuWithModal } from "./overlay-wiring";
import { createMainKeydownHandler, type MainKeydownWiringDeps } from "./main-keydown-wiring";
import { buildStatusItems, focusAreaLabel, resolveFocusArea, type FocusAreaInput } from "./status-bar-model";

// Spec: SPEC-0300-0018 R-1083 (menu open: Escape closes the menu only; the
//   search / path-bar flags are masked), R-1084 (priority-1 Ctrl+Q works while
//   the menu is open; `S` is trapped, never toggles the sort menu), R-1104 /
//   AC-1083 (a modal opening closes the menu; item not executed), R-1113 /
//   AC-1091 (status-bar focus area `右クリックメニュー`, priority 3 beside the
//   sort menu), AC-1074; SPEC-0300-0010 R-12/R-13 (overlays).
// Architecture: SPEC-0200-0001 §3.9.5 (computeDispatchOverlayFlags gets an
//   optional `contextMenuOpen`; onOverlayKey order modal -> contextMenu ->
//   sortMenu -> history; `S` is NOT a sort_menu toggle while the menu is
//   open), §3.9.6 (syncContextMenuWithModal: close only, no focus handling),
//   §3.9.10, §3.9.17.7 (a single `contextMenu: { isOpen, handleKey }` dep;
//   `pass` keys are not preventDefault'ed).
// Modules under test (stubs): overlay-wiring.ts, main-keydown-wiring.ts,
//   status-bar-model.ts.

describe("computeDispatchOverlayFlags with contextMenuOpen (R-1083)", () => {
  const base = { modalOpen: false, historyOpen: false, searchActive: true, searchInputFocused: true, pathBarEditing: true };

  it("an open context menu makes isOverlayOpen true and masks search + path bar flags", () => {
    expect(computeDispatchOverlayFlags({ ...base, contextMenuOpen: true })).toEqual({
      isOverlayOpen: true,
      isSearchActive: false,
      isSearchInputFocused: false,
      isPathBarEditing: false,
    });
  });

  it("omitted / false contextMenuOpen keeps the old behaviour", () => {
    const f = computeDispatchOverlayFlags(base);
    expect(f.isOverlayOpen).toBe(false);
    expect(f.isSearchActive).toBe(true);
    expect(f.isSearchInputFocused).toBe(true);
    expect(f.isPathBarEditing).toBe(true);
    expect(computeDispatchOverlayFlags({ ...base, contextMenuOpen: false }).isOverlayOpen).toBe(false);
  });
});

describe("syncContextMenuWithModal (R-1104, AC-1083)", () => {
  it("closes an open context menu when a modal opens (close only)", () => {
    const contextMenu = { isOpen: true, close: vi.fn() };
    syncContextMenuWithModal({ modalOpen: true, contextMenu });
    expect(contextMenu.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing while no modal is open", () => {
    const contextMenu = { isOpen: true, close: vi.fn() };
    syncContextMenuWithModal({ modalOpen: false, contextMenu });
    expect(contextMenu.close).not.toHaveBeenCalled();
  });

  it("does nothing when the menu is already closed", () => {
    const contextMenu = { isOpen: false, close: vi.fn() };
    syncContextMenuWithModal({ modalOpen: true, contextMenu });
    expect(contextMenu.close).not.toHaveBeenCalled();
  });
});

describe("resolveFocusArea / focusAreaLabel: context-menu (R-1113, AC-1091)", () => {
  const area = (over: Partial<FocusAreaInput> = {}) =>
    resolveFocusArea({
      modalOpen: false,
      historyOpen: false,
      historyMode: "history",
      sortMenuOpen: false,
      pathEditing: false,
      domArea: null,
      ...over,
    });

  it("an open context menu -> context-menu", () => {
    expect(area({ contextMenuOpen: true })).toBe("context-menu");
  });

  it("it outranks path editing, search, tree and list", () => {
    expect(area({ contextMenuOpen: true, pathEditing: true })).toBe("context-menu");
    expect(area({ contextMenuOpen: true, domArea: "search" })).toBe("context-menu");
    expect(area({ contextMenuOpen: true, domArea: "tree" })).toBe("context-menu");
    expect(area({ contextMenuOpen: true, domArea: "list" })).toBe("context-menu");
  });

  it("a dialog and the history / jump list outrank it (priority 1 / 2)", () => {
    expect(area({ contextMenuOpen: true, modalOpen: true })).toBe("dialog");
    expect(area({ contextMenuOpen: true, historyOpen: true })).toBe("history");
    expect(area({ contextMenuOpen: true, historyOpen: true, historyMode: "jump" })).toBe("jump");
  });

  it("it shares priority 3 with the sort menu (they never coexist; the sort menu is checked first)", () => {
    expect(area({ sortMenuOpen: true })).toBe("sort-menu");
    expect(area({ sortMenuOpen: true, contextMenuOpen: true })).toBe("sort-menu");
  });

  it("closed (or omitted) falls back to the DOM focus area", () => {
    expect(area({ domArea: "list" })).toBe("list");
    expect(area({ contextMenuOpen: false, domArea: "list" })).toBe("list");
  });

  it("label is 右クリックメニュー and the status item reads フォーカス: 右クリックメニュー", () => {
    expect(focusAreaLabel("context-menu")).toBe("右クリックメニュー");
    const items = buildStatusItems({
      focusArea: "context-menu",
      sortKey: "name",
      sortOrder: "asc",
      selectedVisibleCount: 0,
      showHidden: false,
      searchActive: false,
      query: "",
    });
    expect(items[0].text).toBe("フォーカス: 右クリックメニュー");
  });
});

// ---------------------------------------------------------------------------

function key(k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    isComposing: false,
    preventDefault: vi.fn(),
    ...mods,
  };
}

function makeDeps(over: Partial<MainKeydownWiringDeps> = {}) {
  const contextMenu = { isOpen: true, handleKey: vi.fn().mockReturnValue(true) };
  const deps: MainKeydownWiringDeps = {
    isTreeFocused: () => false,
    customOverrides: () => ({}),
    modal: { isOpen: false },
    history: { isOpen: false },
    sortMenu: { isOpen: false },
    contextMenu,
    search: { active: false, inputFocused: false },
    onHardcodedShortcut: vi.fn().mockReturnValue(true),
    onExitAction: vi.fn().mockReturnValue(false),
    handleModalKey: vi.fn().mockReturnValue(true),
    handleSortMenuKey: vi.fn().mockReturnValue(true),
    sortMenuToggle: vi.fn(),
    resolveHistoryIntent: vi.fn().mockReturnValue(false),
    onTreeAction: vi.fn().mockReturnValue(false),
    onListAction: vi.fn().mockReturnValue(false),
    onSearchAction: vi.fn(),
    onTabStop: vi.fn().mockReturnValue(false),
    ...over,
  };
  return { deps, contextMenu };
}

describe("createMainKeydownHandler with the context menu open (R-1080, R-1084, AC-1073, AC-1074)", () => {
  it("routes keys to contextMenu.handleKey and preventDefaults when it returns true", () => {
    const { deps, contextMenu } = makeDeps();
    const e = key("ArrowDown");
    createMainKeydownHandler(deps)(e as unknown as Event);
    expect(contextMenu.handleKey).toHaveBeenCalledTimes(1);
    expect(contextMenu.handleKey.mock.calls[0][0]).toMatchObject({ key: "ArrowDown" });
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("a 'pass' key (handleKey -> false, e.g. Alt+F4) is NOT preventDefault'ed", () => {
    const { deps, contextMenu } = makeDeps();
    contextMenu.handleKey.mockReturnValue(false);
    const e = key("F4", { altKey: true });
    createMainKeydownHandler(deps)(e as unknown as Event);
    expect(contextMenu.handleKey).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("AC-1074: Ctrl+Q reaches the exit shortcut (priority 1) and not the menu", () => {
    const { deps, contextMenu } = makeDeps();
    createMainKeydownHandler(deps)(key("q", { ctrlKey: true }) as unknown as Event);
    expect(deps.onHardcodedShortcut).toHaveBeenCalledWith("exit", expect.anything());
    expect(contextMenu.handleKey).not.toHaveBeenCalled();
  });

  it("`s` does NOT toggle the sort menu (it is trapped by the context menu: AC-1073)", () => {
    const { deps, contextMenu } = makeDeps();
    createMainKeydownHandler(deps)(key("s") as unknown as Event);
    expect(deps.sortMenuToggle).not.toHaveBeenCalled();
    expect(deps.onListAction).not.toHaveBeenCalled();
    expect(contextMenu.handleKey).toHaveBeenCalledTimes(1);
  });

  it("list / tree actions do not fire (Delete, Ctrl+C)", () => {
    const { deps } = makeDeps();
    const h = createMainKeydownHandler(deps);
    h(key("Delete") as unknown as Event);
    h(key("c", { ctrlKey: true }) as unknown as Event);
    expect(deps.onListAction).not.toHaveBeenCalled();
    expect(deps.onTreeAction).not.toHaveBeenCalled();
  });

  it("R-1083: Escape with the search bar active goes to the menu, not to the search cancel", () => {
    const { deps, contextMenu } = makeDeps({ search: { active: true, inputFocused: true } });
    createMainKeydownHandler(deps)(key("Escape") as unknown as Event);
    expect(contextMenu.handleKey).toHaveBeenCalledTimes(1);
    expect(deps.onSearchAction).not.toHaveBeenCalled();
  });

  it("order: a modal wins over the context menu", () => {
    const { deps, contextMenu } = makeDeps({ modal: { isOpen: true } });
    createMainKeydownHandler(deps)(key("ArrowDown") as unknown as Event);
    expect(deps.handleModalKey).toHaveBeenCalledTimes(1);
    expect(contextMenu.handleKey).not.toHaveBeenCalled();
  });

  it("order: the context menu wins over the sort menu", () => {
    const { deps, contextMenu } = makeDeps({ sortMenu: { isOpen: true } });
    createMainKeydownHandler(deps)(key("ArrowDown") as unknown as Event);
    expect(contextMenu.handleKey).toHaveBeenCalledTimes(1);
    expect(deps.handleSortMenuKey).not.toHaveBeenCalled();
  });

  it("order: the context menu wins over the history list", () => {
    const { deps, contextMenu } = makeDeps({ history: { isOpen: true } });
    createMainKeydownHandler(deps)(key("ArrowDown") as unknown as Event);
    expect(contextMenu.handleKey).toHaveBeenCalledTimes(1);
    expect(deps.resolveHistoryIntent).not.toHaveBeenCalled();
  });

  it("a closed menu is never consulted", () => {
    const { deps, contextMenu } = makeDeps();
    (contextMenu as { isOpen: boolean }).isOpen = false;
    createMainKeydownHandler(deps)(key("ArrowDown") as unknown as Event);
    expect(contextMenu.handleKey).not.toHaveBeenCalled();
  });

  it("without the optional contextMenu dep existing behaviour is unchanged", () => {
    const { deps } = makeDeps({ contextMenu: undefined, sortMenu: { isOpen: true } });
    createMainKeydownHandler(deps)(key("ArrowDown") as unknown as Event);
    expect(deps.handleSortMenuKey).toHaveBeenCalledTimes(1);
  });
});
