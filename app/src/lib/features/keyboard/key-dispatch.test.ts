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

describe("resolveActionForKey (SPEC-0300-0010 §4.2, windows profile)", () => {
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
    expect(resolveActionForKey(event, "windows", {})).toBe(expectedAction);
  });

  it("AC-16: Shift+ArrowUp/Down/Left/Right still resolve to the base move_* action", () => {
    expect(resolveActionForKey(key("ArrowUp", { shiftKey: true }), "windows", {})).toBe("move_up");
    expect(resolveActionForKey(key("ArrowDown", { shiftKey: true }), "windows", {})).toBe("move_down");
    expect(resolveActionForKey(key("ArrowLeft", { shiftKey: true }), "windows", {})).toBe("move_left");
    expect(resolveActionForKey(key("ArrowRight", { shiftKey: true }), "windows", {})).toBe("move_right");
  });
});

describe("resolveActionForKey (SPEC-0300-0010 §4.2/§4.1, vim profile, AC-27)", () => {
  it.each([
    ["h", {}, "move_left"],
    ["l", {}, "move_right"],
    ["k", {}, "move_up"],
    ["j", {}, "move_down"],
  ] as const)("vim '%s' resolves to '%s' (ISS-0020/ISS-0031 resolved)", (k, mods, expectedAction) => {
    expect(resolveActionForKey(key(k, mods), "vim", {})).toBe(expectedAction);
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
  function makeContext(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      isSettingsOpen: false,
      isOverlayOpen: false,
      isMenuBarActive: false,
      isTreeFocused: false,
      profile: "windows" as const,
      customOverrides: {},
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(false),
      onOverlayKey: vi.fn().mockReturnValue(false),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(false),
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
