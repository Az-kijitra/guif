import { describe, expect, it, vi } from "vitest";
import { createMainKeydownHandler, type MainKeydownWiringDeps } from "./main-keydown-wiring";

// Spec: SPEC-0300-0010 §3.1 #9 (sort menu keys, classification (c) EXCEPT the
//   re-press-to-close key itself, which is keymap-driven, R-34-14).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.5.
//
// code-reviewer B1: the sort menu's re-press-to-close was matching a
// hardcoded literal "s" (sort-menu-wiring.ts's since-removed
// `isBareSortMenuKey`) instead of the KEYMAP-RESOLVED action id, so a
// remapped `input_keymap_custom.sort_menu` override could never close the
// menu by re-pressing its own (custom) key, and the literal "S" kept closing
// the menu even after being remapped away from it.

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

function makeDeps(overrides: Partial<MainKeydownWiringDeps> = {}): MainKeydownWiringDeps {
  return {
    isTreeFocused: () => false,
    customOverrides: () => ({}),
    modal: { isOpen: false },
    history: { isOpen: false },
    sortMenu: { isOpen: true },
    search: { active: false, inputFocused: false },
    onHardcodedShortcut: vi.fn().mockReturnValue(false),
    onExitAction: vi.fn().mockReturnValue(false),
    handleModalKey: vi.fn().mockReturnValue(false),
    handleSortMenuKey: vi.fn().mockReturnValue(true),
    sortMenuToggle: vi.fn(),
    resolveHistoryIntent: vi.fn().mockReturnValue(false),
    onTreeAction: vi.fn().mockReturnValue(false),
    onListAction: vi.fn().mockReturnValue(false),
    onSearchAction: vi.fn(),
    onTabStop: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

describe("createMainKeydownHandler: sort menu re-press close via the resolved keymap action (B1)", () => {
  it("the default 's' key (resolves to the sort_menu action) closes the menu via sortMenuToggle, never reaching handleSortMenuKey", () => {
    const deps = makeDeps();
    const handler = createMainKeydownHandler(deps);
    handler(key("s") as unknown as Event);
    expect(deps.sortMenuToggle).toHaveBeenCalledTimes(1);
    expect(deps.handleSortMenuKey).not.toHaveBeenCalled();
  });

  it("a custom override remapping sort_menu onto a different key ALSO closes the menu (honors input_keymap_custom)", () => {
    const deps = makeDeps({ customOverrides: () => ({ sort_menu: "D" }) });
    const handler = createMainKeydownHandler(deps);
    handler(key("d") as unknown as Event);
    expect(deps.sortMenuToggle).toHaveBeenCalledTimes(1);
    expect(deps.handleSortMenuKey).not.toHaveBeenCalled();
  });

  it("once sort_menu is remapped away from 'S', pressing the literal 'S' no longer closes the menu by itself (forwarded to handleSortMenuKey instead)", () => {
    const deps = makeDeps({ customOverrides: () => ({ sort_menu: "D" }) });
    const handler = createMainKeydownHandler(deps);
    handler(key("s") as unknown as Event);
    expect(deps.sortMenuToggle).not.toHaveBeenCalled();
    expect(deps.handleSortMenuKey).toHaveBeenCalledTimes(1);
  });

  it("the menu's own fixed keys (e.g. ArrowDown/Escape) still go to handleSortMenuKey, not sortMenuToggle", () => {
    const deps = makeDeps();
    const handler = createMainKeydownHandler(deps);
    handler(key("ArrowDown") as unknown as Event);
    handler(key("Escape") as unknown as Event);
    expect(deps.sortMenuToggle).not.toHaveBeenCalled();
    expect(deps.handleSortMenuKey).toHaveBeenCalledTimes(2);
  });

  it("while the sort menu is closed, the sort_menu action does not reach sortMenuToggle/handleSortMenuKey at all (falls through to onListAction)", () => {
    const deps = makeDeps({ sortMenu: { isOpen: false }, onListAction: vi.fn().mockReturnValue(true) });
    const handler = createMainKeydownHandler(deps);
    handler(key("s") as unknown as Event);
    expect(deps.sortMenuToggle).not.toHaveBeenCalled();
    expect(deps.handleSortMenuKey).not.toHaveBeenCalled();
    expect(deps.onListAction).toHaveBeenCalledWith("sort_menu", expect.anything());
  });
});
