/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// [単体 / 静的] Spec: SPEC-0300-0021 R-1550 (a registration's key is matched where the file-list handler's keymap actions are evaluated: 1 the same
//   situations -- not while an overlay is open, the path bar is edited, the menu bar is active, the search INPUT is focused (R-14-2); 2 but the search bar's
//   buttons / `document.body` / the tree are fine; 3 the position: AFTER every keymap action failed to match -> the registrations -> the Tab fallback),
//   R-1549 (the repeat flag reaches the matcher untouched; the wiring decides), R-1512 / AC-1544 (`Ctrl+Alt+E` is not an access key: the menu bar does not
//   activate, the registration runs; `Alt+E` opens the Edit menu and the registration does not run), R-1550 4 (a matched key is HANDLED -> default action
//   prevented), AC-1533 (i)-(iii) (unit part), AC-1537.
//   SPEC-0300-0010 第17版 §3.1 #15 / R-16-3 (class (d)-equivalent: after the keymap actions; the action id set is NOT changed), R-14-2, R-14-5.
// Architecture: SPEC-0200-0001 §3.16.7 (`DispatchContext.onExternalAppKey?: (event) => boolean`, OPTIONAL; inserted at the END of `dispatchKeydown`, after
//   `onListAction` and before the Tab fallback, only when `action === null`; `key-dispatch.ts` does not import `features/external-apps/`, like
//   `onMenuBarActivate`), §3.16.6 (`KeydownLikeEvent` gains `repeat?: boolean`).
//
// Contract assumed (reported to the implementer):
//   DispatchContext gains: onExternalAppKey?: (event: KeydownLikeEvent) => boolean;      KeydownLikeEvent gains: repeat?: boolean
//   dispatchKeydown: ... onListAction -> [handled? return true] -> [action === null && onExternalAppKey?.(event) === true -> return true] -> Tab fallback
//
// Module under test: ./key-dispatch.ts

import { ACTION_IDS } from "./keymap-defaults";
import { dispatchKeydown } from "./key-dispatch";

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number; repeat: boolean }> = {},
) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

function makeCtx(over: Record<string, unknown> = {}) {
  return {
    isOverlayOpen: false,
    isMenuBarActive: false,
    canActivateMenuBar: true,
    isTreeFocused: false,
    isSearchInputFocused: false,
    customOverrides: {},
    onHardcodedShortcut: vi.fn().mockReturnValue(true),
    onExitAction: vi.fn().mockReturnValue(true),
    onOverlayKey: vi.fn().mockReturnValue(true),
    onMenuBarKey: vi.fn().mockReturnValue(true),
    onMenuBarActivate: vi.fn().mockReturnValue(true),
    onTreeAction: vi.fn().mockReturnValue(true),
    onListAction: vi.fn().mockReturnValue(false),
    onSearchAction: vi.fn(),
    onTabStop: vi.fn().mockReturnValue(true),
    onPathBarKey: vi.fn(),
    onPathBarOverlayAction: vi.fn(),
    onExternalAppKey: vi.fn().mockReturnValue(true),
    ...over,
  };
}
type Ctx = ReturnType<typeof makeCtx>;
const run = (e: ReturnType<typeof ev>, ctx: Ctx): boolean => dispatchKeydown(e, ctx as never);

const CTRL_ALT_C = ev("c", { ctrlKey: true, altKey: true });

describe("the position: keymap actions -> registrations -> Tab (R-1550 3, AC-1537)", () => {
  it("a key that no action matches reaches onExternalAppKey with the event itself; a true result handles it", () => {
    const ctx = makeCtx();
    const e = ev("c", { ctrlKey: true, altKey: true, repeat: true });
    expect(run(e, ctx)).toBe(true);
    expect(ctx.onExternalAppKey).toHaveBeenCalledTimes(1);
    expect(ctx.onExternalAppKey.mock.calls[0][0]).toBe(e);
    expect(ctx.onListAction).toHaveBeenCalledTimes(1); // the file-list handler got its chance first (with action null)
    expect(ctx.onListAction.mock.calls[0][0]).toBeNull();
  });

  it("order of calls: onListAction, then onExternalAppKey", () => {
    const calls: string[] = [];
    const ctx = makeCtx({
      onListAction: vi.fn(() => (calls.push("list"), false)),
      onExternalAppKey: vi.fn(() => (calls.push("external"), true)),
    });
    run(CTRL_ALT_C, ctx);
    expect(calls).toEqual(["list", "external"]);
  });

  it("a key bound to an action never reaches the registrations -- even when that action's handler reports 'not handled' (e.g. refresh)", () => {
    const ctx = makeCtx({ onListAction: vi.fn().mockReturnValue(false) });
    expect(run(ev("F5"), ctx)).toBe(false); // refresh is resolved but unimplemented
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
    expect(ctx.onTabStop).not.toHaveBeenCalled();
  });

  it("an action that the list handler handles stops the chain before the registrations (e.g. ZIP create on Ctrl+Alt+Z)", () => {
    const ctx = makeCtx({ onListAction: vi.fn().mockReturnValue(true) });
    expect(run(ev("z", { ctrlKey: true, altKey: true }), ctx)).toBe(true);
    expect(ctx.onListAction).toHaveBeenCalledWith("zip_create", expect.anything());
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });

  it("the tree: tree actions are the tree's; every other key falls through to the list handler and then to the registrations", () => {
    const tree = makeCtx({ isTreeFocused: true });
    expect(run(ev("ArrowDown"), tree)).toBe(true);
    expect(tree.onTreeAction).toHaveBeenCalledWith("move_down", expect.anything());
    expect(tree.onExternalAppKey).not.toHaveBeenCalled();

    const other = makeCtx({ isTreeFocused: true, onTreeAction: vi.fn().mockReturnValue(false) });
    expect(run(CTRL_ALT_C, other)).toBe(true);
    expect(other.onTreeAction).not.toHaveBeenCalled(); // not one of the 7 tree actions
    expect(other.onExternalAppKey).toHaveBeenCalledTimes(1);
  });

  it("a false result lets the chain end as before: not handled, and Tab keeps its fallback", () => {
    const ctx = makeCtx({ onExternalAppKey: vi.fn().mockReturnValue(false) });
    expect(run(CTRL_ALT_C, ctx)).toBe(false);
    const tab = makeCtx({ onExternalAppKey: vi.fn().mockReturnValue(false) });
    expect(run(ev("Tab"), tab)).toBe(true);
    expect(tab.onTabStop).toHaveBeenCalledWith("next");
    const shiftTab = makeCtx({ onExternalAppKey: vi.fn().mockReturnValue(false) });
    run(ev("Tab", { shiftKey: true }), shiftTab);
    expect(shiftTab.onTabStop).toHaveBeenCalledWith("prev");
  });

  it("Tab: the registrations are asked BEFORE the Tab fallback (the fixed order), Tab then moves the focus", () => {
    const calls: string[] = [];
    const ctx = makeCtx({
      onExternalAppKey: vi.fn(() => (calls.push("external"), false)),
      onTabStop: vi.fn(() => (calls.push("tab"), true)),
    });
    run(ev("Tab"), ctx);
    expect(calls).toEqual(["external", "tab"]);
  });

  it("without the optional hook nothing changes", () => {
    const ctx = makeCtx();
    delete (ctx as Record<string, unknown>).onExternalAppKey;
    expect(run(CTRL_ALT_C, ctx)).toBe(false);
    const tab = makeCtx();
    delete (tab as Record<string, unknown>).onExternalAppKey;
    expect(run(ev("Tab"), tab)).toBe(true);
  });

  it("only `true` handles the key (a truthy non-boolean does not)", () => {
    const ctx = makeCtx({ onExternalAppKey: vi.fn().mockReturnValue("yes") });
    expect(run(CTRL_ALT_C, ctx)).toBe(false);
  });
});

describe("the situations in which the registrations are NOT consulted (R-1550 1, AC-1533)", () => {
  it("an overlay is open (AC-1533 (i): the delete confirmation, a menu, the history list ...)", () => {
    const ctx = makeCtx({ isOverlayOpen: true });
    run(CTRL_ALT_C, ctx);
    expect(ctx.onOverlayKey).toHaveBeenCalled();
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });

  it("the path bar is being edited (AC-1533 (ii))", () => {
    const ctx = makeCtx({ isPathBarEditing: true });
    run(CTRL_ALT_C, ctx);
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });

  it("the menu bar is active (AC-1533 (iii)): the key goes to the menu bar", () => {
    const ctx = makeCtx({ isMenuBarActive: true });
    run(CTRL_ALT_C, ctx);
    expect(ctx.onMenuBarKey).toHaveBeenCalled();
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });

  it("the search INPUT is focused (R-14-2): only its own four keys are processed", () => {
    const ctx = makeCtx({ isSearchInputFocused: true });
    expect(run(CTRL_ALT_C, ctx)).toBe(false);
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });

  it("the hard-coded Ctrl+Q wins", () => {
    const ctx = makeCtx();
    run(ev("q", { ctrlKey: true }), ctx);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("exit", expect.anything());
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });
});

describe("the situations in which they ARE consulted", () => {
  it("AC-1515: the search bar is open but the focus is on one of its buttons / document.body (isSearchActive, input NOT focused)", () => {
    const ctx = makeCtx({ isSearchActive: true, isSearchInputFocused: false });
    expect(run(CTRL_ALT_C, ctx)).toBe(true);
    expect(ctx.onExternalAppKey).toHaveBeenCalledTimes(1);
  });

  it("with the file list focused (the plain case)", () => {
    const ctx = makeCtx();
    expect(run(CTRL_ALT_C, ctx)).toBe(true);
  });
});

describe("AC-1544 / R-1512: Ctrl+Alt+E is a registration key, Alt+E is the menu bar's", () => {
  it("Ctrl+Alt+E: the menu bar is NOT activated, the registration is asked", () => {
    const ctx = makeCtx();
    expect(run(ev("e", { ctrlKey: true, altKey: true }), ctx)).toBe(true);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
    expect(ctx.onExternalAppKey).toHaveBeenCalledTimes(1);
  });

  it("Alt+E: the Edit menu opens, the registrations are not asked", () => {
    const ctx = makeCtx();
    expect(run(ev("e", { altKey: true }), ctx)).toBe(true);
    expect(ctx.onMenuBarActivate).toHaveBeenCalledWith("access", expect.anything());
    expect(ctx.onExternalAppKey).not.toHaveBeenCalled();
  });

  it("Ctrl+Alt+V and Ctrl+Alt+Shift+G likewise reach the registrations", () => {
    for (const e of [ev("v", { ctrlKey: true, altKey: true }), ev("g", { ctrlKey: true, altKey: true, shiftKey: true })]) {
      const ctx = makeCtx();
      expect(run(e, ctx)).toBe(true);
      expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
      expect(ctx.onExternalAppKey).toHaveBeenCalledTimes(1);
    }
  });
});

describe("the action id set is not changed (SPEC-0300-0010 R-16-3)", () => {
  it("still the 35 actions, none of them external", () => {
    expect(ACTION_IDS).toHaveLength(35);
    expect(ACTION_IDS.filter((id) => /external|ext_|launch/.test(id))).toEqual([]);
  });
});

describe("the source (placement and boundary)", () => {
  const dir = resolve(__dirname);
  const source = readFileSync(resolve(dir, "key-dispatch.ts"), "utf-8").replace(/\/\/.*$/gm, "");

  it("onExternalAppKey is called after onListAction and before the Tab fallback, guarded by action === null", () => {
    const list = source.indexOf("ctx.onListAction(");
    const external = source.indexOf("ctx.onExternalAppKey");
    const tab = source.lastIndexOf("isPlainTab(event)");
    expect(list).toBeGreaterThan(0);
    expect(external).toBeGreaterThan(list);
    expect(tab).toBeGreaterThan(external);
    expect(source.slice(external - 40, external + 80)).toMatch(/action\s*===\s*null/);
    expect(source).toMatch(/onExternalAppKey\?\.\(event\)\s*===\s*true/);
  });

  it("DispatchContext declares it as an optional member", () => {
    expect(source).toMatch(/onExternalAppKey\?:\s*\(\w+:\s*KeydownLikeEvent\)\s*=>\s*boolean/);
  });

  it("key-dispatch.ts does not import the external-apps feature (the hook is injected)", () => {
    expect(source).not.toMatch(/external-apps/);
  });

  it("KeydownLikeEvent gains an optional `repeat`", () => {
    const resolveSource = readFileSync(resolve(dir, "keymap-resolve.ts"), "utf-8");
    expect(resolveSource).toMatch(/repeat\?:\s*boolean/);
  });
});
