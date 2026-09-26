import { describe, expect, it, vi } from "vitest";
import {
  TREE_HANDLED_ACTIONS,
  attachGlobalKeydownListener,
  dispatchKeydown,
  isTreeHandledAction,
  matchesHardcodedShortcut,
  resolveActionForKey,
} from "./key-dispatch";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail) §3, §9
// Module under test (not yet implemented): ./key-dispatch.ts
//
// "当該キーを押すと当該アクションが発火すること" is this spec's own responsibility
// (ISS-0025); the *result* of that action firing (selection/focus/display
// changes) is verified in SPEC-0300-0009's tests instead.
//
// Key events are represented as plain objects with the properties this module
// needs ({ key, ctrlKey, altKey, shiftKey, metaKey }), so these tests do not
// require a DOM/jsdom environment.

function key(k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  };
}

describe("attachGlobalKeydownListener (SPEC-0300-0010 R-10, AC-01)", () => {
  it("AC-01: registers exactly one capture-phase keydown listener on the given target", () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    attachGlobalKeydownListener(target as unknown as EventTarget, vi.fn());
    expect(target.addEventListener).toHaveBeenCalledTimes(1);
    const [type, , options] = target.addEventListener.mock.calls[0];
    expect(type).toBe("keydown");
    expect(options).toMatchObject({ capture: true });
  });
});

describe("resolveActionForKey (SPEC-0300-0010 第8版 §4.2, single default keymap, R-20-1)", () => {
  it.each([
    ["ArrowUp", {}, "move_up"], // AC-06
    ["ArrowDown", {}, "move_down"], // AC-06
    ["ArrowLeft", {}, "move_left"], // AC-07
    ["ArrowRight", {}, "move_right"], // AC-07
    ["PageUp", {}, "page_up"], // AC-08
    ["PageDown", {}, "page_down"], // AC-08
    ["Enter", {}, "open"], // AC-09
    ["Backspace", {}, "go_parent"], // AC-10
    [" ", {}, "select_toggle"], // AC-13 (Space)
    ["a", { ctrlKey: true }, "select_all"], // AC-14
    ["Escape", {}, "clear_selection"], // AC-15
    ["b", { ctrlKey: true, shiftKey: true }, "toggle_tree"], // AC-17
    ["h", { ctrlKey: true }, "toggle_hidden"], // AC-18
    ["s", { ctrlKey: true, shiftKey: true }, "toggle_size"], // AC-19
    ["t", { ctrlKey: true, shiftKey: true }, "toggle_time"], // AC-20
    ["s", {}, "sort_menu"], // AC-21
    ["q", { ctrlKey: true }, "exit"], // AC-26
  ] as const)("%s with mods %o resolves to action '%s'", (k, mods, expectedAction) => {
    const event = key(k, mods);
    expect(resolveActionForKey(event, {})).toBe(expectedAction);
  });

  it("AC-16: Shift+ArrowUp/Down/Left/Right still resolve to the base move_* action", () => {
    expect(resolveActionForKey(key("ArrowUp", { shiftKey: true }), {})).toBe("move_up");
    expect(resolveActionForKey(key("ArrowDown", { shiftKey: true }), {})).toBe("move_down");
    expect(resolveActionForKey(key("ArrowLeft", { shiftKey: true }), {})).toBe("move_left");
    expect(resolveActionForKey(key("ArrowRight", { shiftKey: true }), {})).toBe("move_right");
  });
});

// AC-55 (SPEC-0300-0010 第8版, ISS-0102/ISS-0103): the former vim keys are not
// bound by default; movement is by the arrow keys only. (AC-27, which
// verified the vim keys, was deleted and its number retired.)
describe("resolveActionForKey AC-55 (H/J/K/L do not move by default, R-20-1)", () => {
  it.each(["h", "j", "k", "l", "H", "J", "K", "L"])("plain '%s' resolves to no action", (k) => {
    expect(resolveActionForKey(key(k), {})).toBeNull();
  });

  it("a stale legacy-profile setting cannot alter resolution: resolveActionForKey takes only (event, customOverrides)", () => {
    expect(resolveActionForKey.length).toBe(2);
    expect(resolveActionForKey(key("j"), {})).toBeNull();
    expect(resolveActionForKey(key("ArrowDown"), {})).toBe("move_down");
  });

  it("R-30: the custom-override route still works — move_down='J' makes J resolve to move_down (replaces the old vim-default test data)", () => {
    expect(resolveActionForKey(key("j"), { move_down: "J" })).toBe("move_down");
    expect(resolveActionForKey(key("k"), { move_up: "K" })).toBe("move_up");
  });
});

describe("matchesHardcodedShortcut (SPEC-0300-0010 R-12 priority 1)", () => {
  it("recognizes Ctrl+Q as the hardcoded exit shortcut", () => {
    expect(matchesHardcodedShortcut(key("q", { ctrlKey: true }))).toBe("exit");
  });

  it("recognizes Ctrl+, as the hardcoded settings shortcut", () => {
    expect(matchesHardcodedShortcut(key(",", { ctrlKey: true }))).toBe("settings");
  });

  it("returns null for unrelated keys", () => {
    expect(matchesHardcodedShortcut(key("a", { ctrlKey: true }))).toBeNull();
  });
});

describe("TREE_HANDLED_ACTIONS / isTreeHandledAction (SPEC-0300-0010 R-15, AC-05)", () => {
  it("AC-05: limits the tree handler to exactly the 7 specified actions", () => {
    expect(TREE_HANDLED_ACTIONS).toEqual([
      "move_up",
      "move_down",
      "page_up",
      "page_down",
      "move_right",
      "move_left",
      "open",
    ]);
  });

  it("AC-05: toggle_size (not in the allow-list) is not treated as a tree action", () => {
    expect(isTreeHandledAction("toggle_size")).toBe(false);
  });

  it("AC-05: move_up is treated as a tree action", () => {
    expect(isTreeHandledAction("move_up")).toBe(true);
  });
});

describe("dispatchKeydown priority chain (SPEC-0300-0010 R-11, R-12, R-13, R-14)", () => {
  // SHOULD-44 (SPEC-0200-0001 §3.1.4): the only change existing callers of
  // this helper need is these 2 new default fields
  // (`isSearchInputFocused`/`onSearchAction`) for SPEC-0300-0012's R-14-2.
  // `dispatchKeydown`'s return type is unchanged (still plain `boolean`), so
  // none of the pre-existing `expect(handled).toBe(...)` assertions below
  // need to change.
  function makeContext(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      isSettingsOpen: false,
      isOverlayOpen: false,
      isMenuBarActive: false,
      isTreeFocused: false,
      isSearchInputFocused: false,
      customOverrides: {},
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(false),
      onOverlayKey: vi.fn().mockReturnValue(false),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(false),
      onSearchAction: vi.fn(),
      ...overrides,
    };
  }

  it("AC-04: when the settings screen is open, no handler in the chain is invoked (R-14)", () => {
    const ctx = makeContext({ isSettingsOpen: true });
    const handled = dispatchKeydown(key("ArrowDown"), ctx);
    expect(handled).toBe(false);
    expect(ctx.onOverlayKey).not.toHaveBeenCalled();
    expect(ctx.onListAction).not.toHaveBeenCalled();
    expect(ctx.onTreeAction).not.toHaveBeenCalled();
  });

  it("AC-02: while an overlay (e.g. a modal) is open, list navigation keys do not reach the list handler (R-13)", () => {
    const ctx = makeContext({
      isOverlayOpen: true,
      onOverlayKey: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("ArrowUp"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("AC-03: Escape while the sort menu (an overlay) is open only closes the menu, not the list selection (R-12, R-13)", () => {
    const ctx = makeContext({
      isOverlayOpen: true,
      onOverlayKey: vi.fn().mockReturnValue(true), // the sort menu handler consumes Escape itself
    });
    const handled = dispatchKeydown(key("Escape"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onOverlayKey).toHaveBeenCalledTimes(1);
    expect(ctx.onListAction).not.toHaveBeenCalled(); // clear_selection must not also fire
  });

  it("AC-05: when the tree is focused, one of the 7 tree actions is routed to the tree handler", () => {
    const ctx = makeContext({
      isTreeFocused: true,
      onTreeAction: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("ArrowRight"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onTreeAction).toHaveBeenCalledWith("move_right", expect.anything());
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("AC-05: when the tree is focused but the key resolves to a non-tree action, it falls through to the list handler", () => {
    const ctx = makeContext({
      isTreeFocused: true,
      onListAction: vi.fn().mockReturnValue(true),
    });
    // Ctrl+Shift+S = toggle_size, which is not in TREE_HANDLED_ACTIONS
    const handled = dispatchKeydown(key("s", { ctrlKey: true, shiftKey: true }), ctx);
    expect(handled).toBe(true);
    expect(ctx.onTreeAction).not.toHaveBeenCalled();
    expect(ctx.onListAction).toHaveBeenCalledWith("toggle_size", expect.anything());
  });

  it("AC-26: Ctrl+Q reaches the hardcoded-shortcut handler ahead of every other handler (R-12 priority 1)", () => {
    const ctx = makeContext({
      isOverlayOpen: true, // even with an overlay open, priority 1 fires first
      onHardcodedShortcut: vi.fn().mockReturnValue(true),
      onOverlayKey: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("q", { ctrlKey: true }), ctx);
    expect(handled).toBe(true);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("exit");
    expect(ctx.onOverlayKey).not.toHaveBeenCalled();
  });

  it("stops dispatching once a handler reports the event as handled (R-11)", () => {
    const ctx = makeContext({
      isMenuBarActive: true,
      onMenuBarKey: vi.fn().mockReturnValue(true),
      onListAction: vi.fn().mockReturnValue(true),
    });
    dispatchKeydown(key("ArrowDown"), ctx);
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("falls through to the list handler when no higher-priority handler claims the event", () => {
    const ctx = makeContext({ onListAction: vi.fn().mockReturnValue(true) });
    const handled = dispatchKeydown(key("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onListAction).toHaveBeenCalledWith("move_down", expect.anything());
  });
});

// SPEC-0300-0012 R-120/R-121 + docs/architecture/proposals/SPEC-0200-0001.md
// §3.1.4 (MUST-38/41/42, ISS-0064, SPEC-0300-0010 追補 R-14-2, 発注者承認
// 2026-09-24): while the search <input> is focused, R-14-2 is evaluated
// immediately after R-14 (isSettingsOpen) and before priority 2 (exit
// action resolution). R-12's numbered priority table (1~6) itself is NOT
// changed — R-14-2 is an independent guard alongside R-14, not a new row.
describe("dispatchKeydown R-14-2 (SPEC-0200-0001 §3.1.4, ISS-0064 — search-input-focused guard)", () => {
  function makeContext(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      isSettingsOpen: false,
      isOverlayOpen: false,
      isMenuBarActive: false,
      isTreeFocused: false,
      isSearchInputFocused: false,
      customOverrides: {},
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(false),
      onOverlayKey: vi.fn().mockReturnValue(false),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(false),
      onSearchAction: vi.fn(),
      ...overrides,
    };
  }

  it("when the search input is NOT focused, R-14-2 is a no-op and dispatch proceeds exactly as before", () => {
    const ctx = makeContext({ onListAction: vi.fn().mockReturnValue(true) });
    const handled = dispatchKeydown(key("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
    expect(ctx.onListAction).toHaveBeenCalled();
  });

  it("R-121: Escape while the search input is focused resolves to onSearchAction('cancel') and stops the chain", () => {
    const ctx = makeContext({ isSearchInputFocused: true });
    const handled = dispatchKeydown(key("Escape"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onSearchAction).toHaveBeenCalledWith("cancel");
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("Escape while the search bar is open but focus is elsewhere (after Enter) cancels the search", () => {
    const ctx = makeContext({ isSearchActive: true, isSearchInputFocused: false });
    const handled = dispatchKeydown(key("Escape"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onSearchAction).toHaveBeenCalledWith("cancel");
  });

  it("other keys are unaffected while the search bar is open but not input-focused", () => {
    const ctx = makeContext({ isSearchActive: true, onListAction: vi.fn().mockReturnValue(true) });
    expect(dispatchKeydown(key("ArrowDown"), ctx)).toBe(true);
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
    expect(ctx.onListAction).toHaveBeenCalled();
  });

  it("code-review M1: IME composition Enter/arrows pass through to the input (no search action, no preventDefault)", () => {
    for (const k of ["Enter", "ArrowUp", "ArrowDown", "Escape"]) {
      const ctx = makeContext({ isSearchInputFocused: true });
      const handled = dispatchKeydown({ ...key(k), isComposing: true }, ctx);
      expect(handled).toBe(false);
      expect(ctx.onSearchAction).not.toHaveBeenCalled();
    }
  });

  it("code-review m1: modified Enter/arrow keys are not search actions", () => {
    for (const mods of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      const ctx = makeContext({ isSearchInputFocused: true });
      const handled = dispatchKeydown(key("Enter", mods), ctx);
      expect(handled).toBe(false);
      expect(ctx.onSearchAction).not.toHaveBeenCalled();
    }
  });

  it("R-121: Enter while the search input is focused resolves to onSearchAction('confirm')", () => {
    const ctx = makeContext({ isSearchInputFocused: true });
    const handled = dispatchKeydown(key("Enter"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onSearchAction).toHaveBeenCalledWith("confirm");
  });

  it("R-121/R-122: ArrowUp while the search input is focused resolves to onSearchAction('history_prev')", () => {
    const ctx = makeContext({ isSearchInputFocused: true });
    const handled = dispatchKeydown(key("ArrowUp"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onSearchAction).toHaveBeenCalledWith("history_prev");
  });

  it("R-121: ArrowDown while the search input is focused resolves to onSearchAction('query_clear') (SHOULD-53: renamed from 'history_clear')", () => {
    const ctx = makeContext({ isSearchInputFocused: true });
    const handled = dispatchKeydown(key("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onSearchAction).toHaveBeenCalledWith("query_clear");
  });

  it("AC-123: a key outside the 4 recognized search keys stops the chain WITHOUT being treated as handled, so the <input> keeps it as ordinary text entry (e.g. a custom move_down='J' must not move list focus while typing 'j' in the search box; the vim profile that used to supply this key is abolished, R-20-1)", () => {
    const ctx = makeContext({
      isSearchInputFocused: true,
      customOverrides: { move_down: "J" },
      onListAction: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("j"), ctx);
    // handled=false: no preventDefault, so the browser still inserts "j"
    // into the <input> — dispatch is nonetheless stopped (onListAction must
    // not fire), matching the isSettingsOpen (R-14) `return false` pattern.
    expect(handled).toBe(false);
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("MUST-41: R-14 (isSettingsOpen) is evaluated before R-14-2 and remains authoritative — settings-open still suppresses everything even while the search input is (nominally) focused", () => {
    const ctx = makeContext({ isSettingsOpen: true, isSearchInputFocused: true });
    const handled = dispatchKeydown(key("Escape"), ctx);
    expect(handled).toBe(false);
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
  });

  it("priority 1 (hardcoded Ctrl+Q/Ctrl+,) still fires ahead of R-14-2 while the search input is focused", () => {
    const ctx = makeContext({
      isSearchInputFocused: true,
      onHardcodedShortcut: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("q", { ctrlKey: true }), ctx);
    expect(handled).toBe(true);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("exit");
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
  });

  it("SHOULD-50: priority 2 (exit action resolved via the keymap) is suppressed while the search input is focused, since R-14-2 sits before it in the chain", () => {
    // A custom keymap rebinding `exit` onto a key that is not one of the 4
    // recognized search keys (Escape/Enter/ArrowUp/ArrowDown) — R-14-2 must
    // still swallow it rather than letting the rebound exit action reach
    // onExitAction (this is exactly the accident scenario R-14-2's design
    // rationale describes for `input_keymap_custom.exit`).
    const ctx = makeContext({
      isSearchInputFocused: true,
      customOverrides: { exit: "x" },
      onExitAction: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("x"), ctx);
    expect(handled).toBe(false);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
  });
});

// SPEC-0300-0010 第8版 R-14-3 / R-14-3-1..3 / AC-57 (ISS-0107 案2, 発注者決定
// 2026-09-26), SPEC-0200-0001 §3.3.14-3: while an overlay (modal or history/
// jump list, i.e. ctx.isOverlayOpen) is displayed, the keymap-routed `exit`
// (R-12 priority 2) is NOT evaluated; dispatch is not aborted but proceeds to
// priority 3 (the overlay handler). Priority 1 (Ctrl+Q / Ctrl+,) is always
// active. R-12's numbered table is unchanged.
describe("dispatchKeydown R-14-3 (exit is not evaluated while an overlay is open)", () => {
  function makeContext(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      isSettingsOpen: false,
      isOverlayOpen: false,
      isMenuBarActive: false,
      isTreeFocused: false,
      isSearchInputFocused: false,
      customOverrides: { exit: "Q" },
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(true),
      onOverlayKey: vi.fn().mockReturnValue(false),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(false),
      onSearchAction: vi.fn(),
      ...overrides,
    };
  }

  it("(1) isOverlayOpen=true + custom exit='Q': 'Q' does not call onExitAction and is routed to onOverlayKey (AC-57 (1)(2))", () => {
    const ctx = makeContext({ isOverlayOpen: true, onOverlayKey: vi.fn().mockReturnValue(false) });
    const handled = dispatchKeydown(key("q"), ctx);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
    expect(ctx.onOverlayKey).toHaveBeenCalledTimes(1);
    // R-14-3-1: the chain is not aborted before priority 3; the overlay
    // handler receives the resolved action ("exit") and the event.
    expect(ctx.onOverlayKey).toHaveBeenCalledWith("exit", expect.objectContaining({ key: "q" }));
    // Overlay returned false (text-entry key): chain stops, no preventDefault.
    expect(handled).toBe(false);
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("(1b) R-14-3-1: the overlay handler consuming the key returns true", () => {
    const ctx = makeContext({ isOverlayOpen: true, onOverlayKey: vi.fn().mockReturnValue(true) });
    expect(dispatchKeydown(key("q"), ctx)).toBe(true);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
  });

  it("(2) isOverlayOpen=false: 'Q' still reaches onExitAction as before (AC-57 (4))", () => {
    const ctx = makeContext({ isOverlayOpen: false });
    const handled = dispatchKeydown(key("q"), ctx);
    expect(handled).toBe(true);
    expect(ctx.onExitAction).toHaveBeenCalledWith("exit");
    expect(ctx.onOverlayKey).not.toHaveBeenCalled();
  });

  it("(3) R-14-3-2: Ctrl+Q reaches onHardcodedShortcut even while an overlay is open (AC-57 (3))", () => {
    const ctx = makeContext({
      isOverlayOpen: true,
      onHardcodedShortcut: vi.fn().mockReturnValue(true),
    });
    const handled = dispatchKeydown(key("q", { ctrlKey: true }), ctx);
    expect(handled).toBe(true);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("exit");
    expect(ctx.onOverlayKey).not.toHaveBeenCalled();
  });

  it("(4) R-14-2 unchanged: isOverlayOpen=false + isSearchInputFocused=true still swallows a custom exit key without calling onExitAction", () => {
    const ctx = makeContext({ isOverlayOpen: false, isSearchInputFocused: true });
    const handled = dispatchKeydown(key("q"), ctx);
    expect(handled).toBe(false);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
  });

  it("R-14 order: settings open still suppresses everything (exit key and overlay handler both untouched)", () => {
    const ctx = makeContext({ isSettingsOpen: true, isOverlayOpen: true });
    expect(dispatchKeydown(key("q"), ctx)).toBe(false);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
    expect(ctx.onOverlayKey).not.toHaveBeenCalled();
  });

  it("a non-exit key while an overlay is open is unaffected (still goes to onOverlayKey with its own action)", () => {
    const ctx = makeContext({ isOverlayOpen: true, onOverlayKey: vi.fn().mockReturnValue(true) });
    expect(dispatchKeydown(key("ArrowDown"), ctx)).toBe(true);
    expect(ctx.onOverlayKey).toHaveBeenCalledWith("move_down", expect.anything());
  });
});

// R-42-1 / DispatchContext: the profile field no longer exists (ISS-0105).
describe("DispatchContext (ISS-0105): no profile input", () => {
  it("dispatch works with a context that has no profile field and customOverrides only", () => {
    const ctx = {
      isSettingsOpen: false,
      isOverlayOpen: false,
      isMenuBarActive: false,
      isTreeFocused: false,
      isSearchInputFocused: false,
      customOverrides: {},
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(false),
      onOverlayKey: vi.fn().mockReturnValue(false),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(true),
      onSearchAction: vi.fn(),
    };
    expect(dispatchKeydown(key("ArrowDown"), ctx)).toBe(true);
    expect(ctx.onListAction).toHaveBeenCalledWith("move_down", expect.anything());
  });
});
