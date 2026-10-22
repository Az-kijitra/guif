import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0010 第16版 R-12 優先4 (menu bar), R-14-5-1 (activation keys are evaluated right after priority 1 and BEFORE R-14 /
//   R-14-2 / R-14-4 / R-14-3), R-14-5-2 (while active the key goes to the menu bar's handler right after priority 1 and the chain STOPS there;
//   OS keys are returned as "not handled"), R-14-5-3 (the criterion is the menu-bar state, not the overlay / input focus), R-14-3 (exit not
//   evaluated while active), §3.1 #13 / #14, AC-93 [単体] (the evaluation order), AC-91 / AC-92 (the unit part). Menu SPEC-0300-0020 R-1350-2
//   (確定 T-06: a user binding of F10 / Alt+letter loses to the menu bar), R-1355 (Ctrl+Q still exits).
//   Alt-alone keyup is on hold and NOT covered.
// Architecture: SPEC-0200-0001 §3.14.1-3 (two new stages in `dispatchKeydown` after priority 1: (a) `ctx.isMenuBarActive` ->
//   `ctx.onMenuBarKey(null, event)` and stop; (b) `ctx.canActivateMenuBar === true && matchesMenuBarActivation(event)` ->
//   `ctx.onMenuBarActivate(kind, event)` and `true`; the OLD `isMenuBarActive` branch after `isOverlayOpen` is deleted; the new context
//   members are OPTIONAL so existing builders / tests stay valid).
//
// Contract assumed (reported to the implementer):
//   DispatchContext gains: canActivateMenuBar?: boolean;  onMenuBarActivate?: (kind: "f10" | "access", event: KeydownLikeEvent) => boolean;
//   dispatchKeydown: ... priority 1 -> [active] onMenuBarKey(null, event) -> return its truthiness  |  [inactive & can-activate & matches]
//   onMenuBarActivate(kind, event) -> true  -> R-14 -> R-14-2 -> R-14-4 -> search Escape -> exit -> overlay -> tree -> list
//
// Module under test: ./key-dispatch.ts

import { dispatchKeydown } from "./key-dispatch";

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number }> = {},
) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

function makeCtx(over: Record<string, unknown> = {}) {
  return {
    isOverlayOpen: false,
    isMenuBarActive: false,
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
    ...over,
  };
}
type Ctx = ReturnType<typeof makeCtx>;
const run = (e: ReturnType<typeof ev>, ctx: Ctx): boolean => dispatchKeydown(e, ctx as never);

// every handler other than the ones named must not have run
function expectOnly(ctx: Ctx, called: (keyof Ctx)[]): void {
  const handlers: (keyof Ctx)[] = [
    "onHardcodedShortcut", "onExitAction", "onOverlayKey", "onMenuBarKey", "onMenuBarActivate", "onTreeAction", "onListAction",
    "onSearchAction", "onTabStop", "onPathBarKey", "onPathBarOverlayAction",
  ];
  for (const h of handlers) {
    const fn = ctx[h] as unknown as ReturnType<typeof vi.fn>;
    if (called.includes(h)) expect(fn, String(h)).toHaveBeenCalled();
    else expect(fn, String(h)).not.toHaveBeenCalled();
  }
}

describe("AC-93 (a): while the menu bar is active, the key goes to the menu bar right after priority 1 and the chain stops (R-14-5-2)", () => {
  it("priority 1 still wins: Ctrl+Q reaches onHardcodedShortcut('exit') and the menu bar does not see it (R-1355)", () => {
    const ctx = makeCtx({ isMenuBarActive: true });
    expect(run(ev("q", { ctrlKey: true }), ctx)).toBe(true);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("exit", expect.anything());
    expectOnly(ctx, ["onHardcodedShortcut"]);
  });

  it("Ctrl+, (settings) is priority 1 as well", () => {
    const ctx = makeCtx({ isMenuBarActive: true });
    run(ev(",", { ctrlKey: true }), ctx);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("settings", expect.anything());
    expectOnly(ctx, ["onHardcodedShortcut"]);
  });

  it("any other key is passed as onMenuBarKey(null, event): the keymap action is NOT resolved for the menu bar", () => {
    const ctx = makeCtx({ isMenuBarActive: true });
    const e = ev("ArrowDown"); // would be move_down in the keymap
    expect(run(e, ctx)).toBe(true);
    expect(ctx.onMenuBarKey).toHaveBeenCalledTimes(1);
    expect((ctx.onMenuBarKey as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeNull();
    expect((ctx.onMenuBarKey as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(e);
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("the return value is the menu bar's: an OS key (Alt+F4) comes back as false and NOTHING else runs (no list / tree / overlay)", () => {
    const ctx = makeCtx({ isMenuBarActive: true, onMenuBarKey: vi.fn().mockReturnValue(false) });
    expect(run(ev("F4", { altKey: true }), ctx)).toBe(false);
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("R-14-2 is not evaluated: with the search input focused the search bar's keys do not fire (Esc is the menu bar's, AC-1344)", () => {
    const ctx = makeCtx({ isMenuBarActive: true, isSearchInputFocused: true, isSearchActive: true });
    run(ev("Escape"), ctx);
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("R-14-4 is not evaluated: path-bar editing keys do not fire", () => {
    const ctx = makeCtx({ isMenuBarActive: true, isPathBarEditing: true });
    run(ev("Enter"), ctx);
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("R-14-3 / priority 2: the keymap `exit` is not evaluated while active (exit = 'Q' does not exit, AC-1343)", () => {
    const ctx = makeCtx({ isMenuBarActive: true, customOverrides: { exit: "Q" } });
    run(ev("q"), ctx);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("the overlay handler is not reached (the menu bar is never active while an overlay shows, R-1370, so the position is moved ahead of it)", () => {
    const ctx = makeCtx({ isMenuBarActive: true, isOverlayOpen: true });
    run(ev("ArrowDown"), ctx);
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("tree focus and Tab: neither the tree handler nor the Tab-stop move runs (R-1355: the focus never leaves the menu bar)", () => {
    const ctx = makeCtx({ isMenuBarActive: true, isTreeFocused: true });
    run(ev("Tab"), ctx);
    run(ev("ArrowRight"), ctx);
    expectOnly(ctx, ["onMenuBarKey"]);
  });

  it("the activation member is not used while active: F10 goes to onMenuBarKey (it deactivates there, R-1351)", () => {
    const ctx = makeCtx({ isMenuBarActive: true, canActivateMenuBar: true });
    run(ev("F10"), ctx);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
    expect(ctx.onMenuBarKey).toHaveBeenCalledTimes(1);
  });
});

describe("AC-93 (b): activation keys are evaluated after priority 1 and BEFORE R-14 / R-14-2 / R-14-4 (R-14-5-1)", () => {
  it("F10 -> onMenuBarActivate('f10', event) and the dispatch returns true; nothing else runs", () => {
    const ctx = makeCtx({ canActivateMenuBar: true });
    const e = ev("F10");
    expect(run(e, ctx)).toBe(true);
    expect(ctx.onMenuBarActivate).toHaveBeenCalledTimes(1);
    expect((ctx.onMenuBarActivate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("f10");
    expect((ctx.onMenuBarActivate as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(e);
    expectOnly(ctx, ["onMenuBarActivate"]);
  });

  it.each(["f", "e", "v", "g"])("Alt+%s -> onMenuBarActivate('access', event)", (k) => {
    const ctx = makeCtx({ canActivateMenuBar: true });
    expect(run(ev(k, { altKey: true }), ctx)).toBe(true);
    expect((ctx.onMenuBarActivate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("access");
    expectOnly(ctx, ["onMenuBarActivate"]);
  });

  it("before R-14-2: F10 and Alt+F work while the search INPUT has the focus (AC-90 iii: no character is typed, no search key fires)", () => {
    for (const e of [ev("F10"), ev("f", { altKey: true })]) {
      const ctx = makeCtx({ canActivateMenuBar: true, isSearchInputFocused: true, isSearchActive: true });
      expect(run(e, ctx)).toBe(true);
      expectOnly(ctx, ["onMenuBarActivate"]);
    }
  });

  it("AC-90 (ii): with the tree focused it activates as well", () => {
    const ctx = makeCtx({ canActivateMenuBar: true, isTreeFocused: true });
    run(ev("F10"), ctx);
    expectOnly(ctx, ["onMenuBarActivate"]);
  });

  it("R-1350-2 (T-06): a user binding of F10 or Alt+F to an action loses to the menu bar", () => {
    const a = makeCtx({ canActivateMenuBar: true, customOverrides: { copy: "F10" } });
    run(ev("F10"), a);
    expectOnly(a, ["onMenuBarActivate"]);
    const b = makeCtx({ canActivateMenuBar: true, customOverrides: { search: "Alt+F" } });
    run(ev("f", { altKey: true }), b);
    expectOnly(b, ["onMenuBarActivate"]);
  });

  it("priority 1 is still first: Ctrl+Q never reaches the activation stage", () => {
    const ctx = makeCtx({ canActivateMenuBar: true });
    run(ev("q", { ctrlKey: true }), ctx);
    expectOnly(ctx, ["onHardcodedShortcut"]);
  });
});

describe("when the menu bar cannot be activated, the keys keep their old meaning (R-14-5-1 conditions, AC-92 unit part)", () => {
  it("canActivateMenuBar false (overlay shown / path bar editing, as the wiring decides): F10 is not an activation and falls to the normal chain", () => {
    const ctx = makeCtx({ canActivateMenuBar: false });
    expect(run(ev("F10"), ctx)).toBe(false);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
    expect(ctx.onListAction).toHaveBeenCalledWith(null, expect.anything()); // no keymap action for F10 -> the list gets a null action
  });

  it("canActivateMenuBar absent: same (existing context builders are unaffected)", () => {
    const ctx = makeCtx();
    expect(run(ev("F10"), ctx)).toBe(false);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
  });

  it("overlay open and not can-activate: the overlay handler gets the key as before", () => {
    const ctx = makeCtx({ canActivateMenuBar: false, isOverlayOpen: true });
    run(ev("F10"), ctx);
    expectOnly(ctx, ["onOverlayKey"]);
  });

  it("path bar editing and not can-activate: the path bar keeps its own handling", () => {
    const ctx = makeCtx({ canActivateMenuBar: false, isPathBarEditing: true });
    run(ev("F10"), ctx);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
  });

  it("IME composition: F10 / Alt+F during composition do not activate (R-14-5-1)", () => {
    for (const e of [ev("F10", { isComposing: true }), ev("F10", { keyCode: 229 }), ev("f", { altKey: true, isComposing: true })]) {
      const ctx = makeCtx({ canActivateMenuBar: true });
      run(e, ctx);
      expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
    }
  });

  it("Ctrl+Alt+Z (zip_create) is not an activation: it reaches the list as the zip_create action (AC-90 last clause, AC-1341)", () => {
    const ctx = makeCtx({ canActivateMenuBar: true, onListAction: vi.fn().mockReturnValue(true) });
    expect(run(ev("z", { ctrlKey: true, altKey: true }), ctx)).toBe(true);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
    expect(ctx.onListAction).toHaveBeenCalledWith("zip_create", expect.anything());
  });

  it("the Alt key's own keydown does nothing and the normal dispatch continues (R-14-5-1 note; Alt-alone itself is on hold)", () => {
    const ctx = makeCtx({ canActivateMenuBar: true });
    run(ev("Alt", { altKey: true }), ctx);
    expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
  });

  it("Alt+F4 / Alt+Tab while NOT active are not activations", () => {
    for (const e of [ev("F4", { altKey: true }), ev("Tab", { altKey: true })]) {
      const ctx = makeCtx({ canActivateMenuBar: true });
      run(e, ctx);
      expect(ctx.onMenuBarActivate).not.toHaveBeenCalled();
    }
  });
});

describe("the old branch is gone (SPEC-0200-0001 §3.14.1-3)", () => {
  it("the menu bar handler is not called a second time after the overlay: one key, one call", () => {
    const ctx = makeCtx({ isMenuBarActive: true, onMenuBarKey: vi.fn().mockReturnValue(false) });
    run(ev("a"), ctx);
    expect(ctx.onMenuBarKey).toHaveBeenCalledTimes(1);
  });
});
