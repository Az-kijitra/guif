import { describe, expect, it, vi } from "vitest";
import { dispatchKeydown, matchesHardcodedShortcut } from "./key-dispatch";

// [単体] Spec: SPEC-0300-0022 R-1671 (【確定 T-25】案 A: the hard-coded `Ctrl+,` pre-emption is kept and calls "open the settings file"),
//   R-1606 (an auto-repeat does not run it again: the event reaches the handler so it can look at `repeat`), R-1671-1, AC-1661 (the situations in
//   which it works), AC-1664 (menu bar active); SPEC-0300-0010 第18版 §3.1 #1 / R-12 priority 1 / R-14 (there is no settings screen:
//   `DispatchContext.isSettingsOpen` is gone, T-27).
// Architecture: SPEC-0200-0001 §3.17.9: `DispatchContext.onHardcodedShortcut: (action: "exit" | "settings", event: KeydownLikeEvent) => boolean`.
//
// Module under test: ./key-dispatch.ts

function ev(k: string, mods: Record<string, boolean> = {}) {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, repeat: false, keyCode: 0, ...mods };
}
const CTRL_COMMA = (mods: Record<string, boolean> = {}) => ev(",", { ctrlKey: true, ...mods });

type Fn = ReturnType<typeof vi.fn>;

function makeCtx(over: Record<string, unknown> = {}) {
  return {
    isOverlayOpen: false,
    isMenuBarActive: false,
    isTreeFocused: false,
    isSearchInputFocused: false,
    customOverrides: {},
    onHardcodedShortcut: vi.fn().mockReturnValue(true),
    onExitAction: vi.fn().mockReturnValue(false),
    onOverlayKey: vi.fn().mockReturnValue(false),
    onMenuBarKey: vi.fn().mockReturnValue(false),
    onTreeAction: vi.fn().mockReturnValue(false),
    onListAction: vi.fn().mockReturnValue(false),
    onSearchAction: vi.fn(),
    ...over,
  } as unknown as Parameters<typeof dispatchKeydown>[1];
}
const fn = (ctx: unknown, name: string): Fn => (ctx as Record<string, Fn>)[name];

describe("Ctrl+, is still the hard-coded priority 1 (R-1671, T-25 case A)", () => {
  it("matchesHardcodedShortcut keeps answering 'settings' for Ctrl+, and 'exit' for Ctrl+Q", () => {
    expect(matchesHardcodedShortcut(CTRL_COMMA())).toBe("settings");
    expect(matchesHardcodedShortcut(ev("q", { ctrlKey: true }))).toBe("exit");
  });

  it("R-1606: onHardcodedShortcut receives the action AND the very event object (so `repeat` can be read)", () => {
    const ctx = makeCtx();
    const e = CTRL_COMMA({ repeat: true });
    expect(dispatchKeydown(e, ctx)).toBe(true);
    expect(fn(ctx, "onHardcodedShortcut")).toHaveBeenCalledTimes(1);
    expect(fn(ctx, "onHardcodedShortcut").mock.calls[0][0]).toBe("settings");
    expect(fn(ctx, "onHardcodedShortcut").mock.calls[0][1]).toBe(e);
  });

  it("Ctrl+Q also receives its event", () => {
    const ctx = makeCtx();
    const e = ev("q", { ctrlKey: true });
    dispatchKeydown(e, ctx);
    expect(fn(ctx, "onHardcodedShortcut").mock.calls[0][0]).toBe("exit");
    expect(fn(ctx, "onHardcodedShortcut").mock.calls[0][1]).toBe(e);
  });

  it("the handler's boolean is the dispatch result (true = handled / default prevented, false = not)", () => {
    expect(dispatchKeydown(CTRL_COMMA(), makeCtx({ onHardcodedShortcut: vi.fn().mockReturnValue(true) }))).toBe(true);
    expect(dispatchKeydown(CTRL_COMMA(), makeCtx({ onHardcodedShortcut: vi.fn().mockReturnValue(false) }))).toBe(false);
  });

  it("it is not bound to the keymap: `settings = \"\"` or another key for `settings` does not stop Ctrl+, (R-1670 T-28)", () => {
    for (const customOverrides of [{ settings: "" }, { settings: "Ctrl+Shift+O" }]) {
      const ctx = makeCtx({ customOverrides });
      dispatchKeydown(CTRL_COMMA(), ctx);
      expect(fn(ctx, "onHardcodedShortcut")).toHaveBeenCalledTimes(1);
    }
  });
});

describe("AC-1661 / AC-1664: it works in every situation, ahead of everything else", () => {
  const situations: [string, Record<string, unknown>][] = [
    ["the search input is focused (R-14-2-3)", { isSearchInputFocused: true, isSearchActive: true }],
    ["an overlay (dialog) is open (R-14-3-2)", { isOverlayOpen: true }],
    ["the path bar is being edited (SPEC-0300-0016 R-760-1)", { isPathBarEditing: true }],
    ["the menu bar is active (SPEC-0300-0020 R-1355, AC-1664 ii)", { isMenuBarActive: true }],
    ["the tree has the focus", { isTreeFocused: true }],
  ];
  it.each(situations)("%s", (_name, over) => {
    const ctx = makeCtx(over);
    expect(dispatchKeydown(CTRL_COMMA(), ctx)).toBe(true);
    expect(fn(ctx, "onHardcodedShortcut")).toHaveBeenCalledTimes(1);
    for (const h of ["onOverlayKey", "onMenuBarKey", "onTreeAction", "onListAction", "onSearchAction", "onExitAction"]) {
      expect(fn(ctx, h), h).not.toHaveBeenCalled();
    }
  });
});

describe("SPEC-0300-0010 第18版 R-14 / AC-04: there is no settings-screen suppression any more (T-27)", () => {
  it("a context carrying a stray isSettingsOpen: true does not suppress anything", () => {
    const ctx = makeCtx({ isSettingsOpen: true });
    dispatchKeydown(ev("ArrowDown"), ctx);
    expect(fn(ctx, "onListAction")).toHaveBeenCalledWith("move_down", expect.anything());
  });
});
