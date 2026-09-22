import { describe, expect, it } from "vitest";
import {
  ACTION_IDS,
  EXCLUDED_ACTION_IDS,
  PHASE1_ACTION_IDS,
  SAME_ACROSS_PROFILES_ACTION_IDS,
  VIM_DEFAULTS,
  WINDOWS_DEFAULTS,
} from "./keymap-defaults";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail) §4
// Module under test (not yet implemented): ./keymap-defaults.ts
//
// R-20: two profiles, "windows" (default) and "vim"
// R-21: the action id set has exactly 34 entries (§4.2 table)
// R-22: vim defaults for move_up/down, page_up/down, toggle_size/time,
//       zip_create/extract are confirmed values (ISS-0020 resolved)
// R-23: 20 actions share the identical key binding across both profiles
// R-26: "後続" (subsequent-phase) actions keep their id/binding definitions
// R-27: 12 scope-excluded actions must not appear anywhere in the action set

describe("ACTION_IDS (SPEC-0300-0010 R-21)", () => {
  it("contains exactly 34 action ids", () => {
    expect(ACTION_IDS).toHaveLength(34);
    expect(new Set(ACTION_IDS).size).toBe(34); // no duplicates
  });

  it("R-27: none of the 12 scope-excluded actions are present", () => {
    const excluded = [
      "undo",
      "redo",
      "duplicate",
      "prefix_date",
      "properties",
      "open_explorer",
      "open_cmd",
      "open_terminal_cmd",
      "open_terminal_powershell",
      "open_terminal_wsl",
      "open_vscode",
      "open_git_client",
    ];
    expect(EXCLUDED_ACTION_IDS).toEqual(excluded);
    for (const id of excluded) {
      expect(ACTION_IDS).not.toContain(id);
    }
  });
});

describe("WINDOWS_DEFAULTS (SPEC-0300-0010 R-21, §4.2, P1 actions)", () => {
  const expectedP1: Record<string, string> = {
    move_up: "ArrowUp",
    move_down: "ArrowDown",
    move_left: "ArrowLeft",
    move_right: "ArrowRight",
    page_up: "PageUp",
    page_down: "PageDown",
    select_toggle: "Space",
    select_all: "Ctrl+A",
    clear_selection: "Escape",
    open: "Enter",
    go_parent: "Backspace",
    exit: "Ctrl+Q",
    toggle_hidden: "Ctrl+H",
    toggle_tree: "Ctrl+Shift+B",
    sort_menu: "S",
    toggle_size: "Ctrl+Shift+S",
    toggle_time: "Ctrl+Shift+T",
  };

  it.each(Object.entries(expectedP1))("windows default for %s is %s", (actionId, key) => {
    expect(WINDOWS_DEFAULTS[actionId]).toBe(key);
  });
});

describe("VIM_DEFAULTS (SPEC-0300-0010 R-22, ISS-0020 resolved)", () => {
  const expectedP1: Record<string, string> = {
    move_up: "K",
    move_down: "J",
    move_left: "H",
    move_right: "L",
    page_up: "Ctrl+U",
    page_down: "Ctrl+D",
    select_toggle: "Space",
    select_all: "Ctrl+A",
    clear_selection: "Escape",
    open: "Enter",
    go_parent: "Backspace",
    exit: "Ctrl+Q",
    toggle_hidden: "Ctrl+H",
    toggle_tree: "Ctrl+Shift+B",
    sort_menu: "S",
    toggle_size: "Ctrl+Shift+S",
    toggle_time: "Ctrl+Shift+T",
  };

  it.each(Object.entries(expectedP1))("vim default for %s is %s", (actionId, key) => {
    expect(VIM_DEFAULTS[actionId]).toBe(key);
  });

  it("AC-27: confirms vim H/L/K/J for left/right/up/down (ISS-0020/ISS-0031 resolved)", () => {
    expect(VIM_DEFAULTS.move_left).toBe("H");
    expect(VIM_DEFAULTS.move_right).toBe("L");
    expect(VIM_DEFAULTS.move_up).toBe("K");
    expect(VIM_DEFAULTS.move_down).toBe("J");
  });
});

describe("SAME_ACROSS_PROFILES_ACTION_IDS (SPEC-0300-0010 R-23)", () => {
  it("lists exactly the 20 actions whose windows and vim bindings are identical", () => {
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toHaveLength(20);
    for (const id of SAME_ACROSS_PROFILES_ACTION_IDS) {
      expect(WINDOWS_DEFAULTS[id]).toBe(VIM_DEFAULTS[id]);
    }
  });

  it("includes toggle_size and toggle_time (ISS-0020 resolved: identical across profiles)", () => {
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("toggle_size");
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("toggle_time");
  });
});

describe("PHASE1_ACTION_IDS (SPEC-0300-0010 R-26, §4.2 region column)", () => {
  it("contains exactly the 17 actions marked P1 (including partial-P1 `open`)", () => {
    expect(PHASE1_ACTION_IDS).toHaveLength(17);
    expect(PHASE1_ACTION_IDS).toEqual(
      expect.arrayContaining([
        "move_up",
        "move_down",
        "move_left",
        "move_right",
        "page_up",
        "page_down",
        "select_toggle",
        "select_all",
        "clear_selection",
        "open",
        "go_parent",
        "exit",
        "toggle_hidden",
        "toggle_tree",
        "sort_menu",
        "toggle_size",
        "toggle_time",
      ]),
    );
  });

  it("does not include 'subsequent phase' (後続) actions such as search or settings", () => {
    expect(PHASE1_ACTION_IDS).not.toContain("search");
    expect(PHASE1_ACTION_IDS).not.toContain("settings");
    expect(PHASE1_ACTION_IDS).not.toContain("refresh");
    expect(PHASE1_ACTION_IDS).not.toContain("focus_path");
    expect(PHASE1_ACTION_IDS).not.toContain("help_keymap");
  });
});
