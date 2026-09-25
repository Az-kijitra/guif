import { describe, expect, it } from "vitest";
import {
  ACTION_IDS,
  EXCLUDED_ACTION_IDS,
  PHASE1_ACTION_IDS,
  SAME_ACROSS_PROFILES_ACTION_IDS,
  VIM_DEFAULTS,
  WINDOWS_DEFAULTS,
} from "./keymap-defaults";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail),
//   **第5版** §4 (R-20~R-27, §4.2, §4.4)
// Module under test: ./keymap-defaults.ts
//
// R-20: two profiles, "windows" (default) and "vim"
// R-21/R-21-2 (第5版, ISS-0070 RESOLVED): the action id set has exactly 34
//   entries. `jump_add_url` (§4.2 #29, SPEC-0300-0013 R-256: URL jump
//   abolished) was removed from §4.2 and moved to §4.4 (scope-excluded), and
//   `new_folder` (§4.2 #35, ISS-0038) was added — the count stays 34
//   ("main's 46 - 13 excluded + 1 new = 34"), but the *membership* changed.
// R-22: vim defaults for move_up/down, page_up/down, toggle_size/time,
//       zip_create/extract are confirmed values (ISS-0020 resolved)
// R-22-1 (ISS-0038): new_folder's default is Ctrl+Shift+N on BOTH profiles
// R-23 (第5版): 20 actions share the identical key binding across both
//   profiles (was 21 in the 4th edition — `jump_add_url` dropped out,
//   `new_folder` took its place, net count unchanged at 20)
// R-26: "後続" (subsequent-phase) actions keep their id/binding definitions
// R-27 (第5版): 13 scope-excluded actions (was 12) must not appear anywhere
//   in the action set — `jump_add_url` was added as item #13 (§4.4)
//
// **Phase 4 (SPEC-0300-0013) follow-up, ISS-0086 residual**: this file
// previously matched the 3rd-edition action set (34 entries, but containing
// `jump_add_url` and lacking `new_folder` — a coincidental count match that
// masked the membership drift SPEC-0300-0010's 4th/5th editions introduced,
// per architecture-mapper §3.2.12 / traceability.md's explicit warning: "件
// 数一致〈34/20〉だけでは差分を検出できないため`toContain`/`not.toContain`
// の更新が必須"). This update brings every assertion in this file up to the
// 5th-edition (34-entry) action set and, per that same warning, asserts
// MEMBERSHIP (not just counts) so a future regression back to the 3rd/4th
// edition's set is caught even though several of these edits happen to
// preserve the same aggregate counts (34 actions, 20 same-across-profiles).

describe("ACTION_IDS (SPEC-0300-0010 第5版 R-21, R-21-2)", () => {
  it("contains exactly 34 action ids", () => {
    expect(ACTION_IDS).toHaveLength(34);
    expect(new Set(ACTION_IDS).size).toBe(34); // no duplicates
  });

  it("R-21-2/ISS-0070: does NOT contain jump_add_url (moved to §4.4, URL jump abolished by SPEC-0300-0013 R-256)", () => {
    expect(ACTION_IDS).not.toContain("jump_add_url");
  });

  it("R-21-1/ISS-0038: contains new_folder (newly added in the 4th edition, not present in `main`'s 46-action set)", () => {
    expect(ACTION_IDS).toContain("new_folder");
  });

  it("still contains the 3 SPEC-0300-0013 (P4) actions untouched by this revision", () => {
    expect(ACTION_IDS).toContain("history");
    expect(ACTION_IDS).toContain("history_jump_list");
    expect(ACTION_IDS).toContain("jump_add");
  });

  it("R-27 (13 items): none of the scope-excluded actions are present", () => {
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
      "jump_add_url",
    ];
    expect(EXCLUDED_ACTION_IDS).toEqual(excluded);
    for (const id of excluded) {
      expect(ACTION_IDS).not.toContain(id);
    }
  });

  it("EXCLUDED_ACTION_IDS (R-27, 第5版) has exactly 13 entries", () => {
    expect(EXCLUDED_ACTION_IDS).toHaveLength(13);
    expect(new Set(EXCLUDED_ACTION_IDS).size).toBe(13);
  });
});

describe("WINDOWS_DEFAULTS (SPEC-0300-0010 第5版 R-21, §4.2, P1 actions)", () => {
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

  it("R-22-1/ISS-0038: new_folder's windows default is Ctrl+Shift+N", () => {
    expect(WINDOWS_DEFAULTS.new_folder).toBe("Ctrl+Shift+N");
  });

  it("does not define a binding for jump_add_url (removed, §4.4)", () => {
    expect(WINDOWS_DEFAULTS.jump_add_url).toBeUndefined();
  });

  it("Ctrl+Shift+N (new_folder) does not collide with any other windows binding, including Ctrl+N (new_file)", () => {
    expect(WINDOWS_DEFAULTS.new_file).toBe("Ctrl+N");
    const values = Object.entries(WINDOWS_DEFAULTS)
      .filter(([id]) => id !== "new_folder")
      .map(([, v]) => v);
    expect(values).not.toContain("Ctrl+Shift+N");
  });
});

describe("VIM_DEFAULTS (SPEC-0300-0010 第5版 R-22, ISS-0020 resolved)", () => {
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

  it("R-22-1/ISS-0038: new_folder's vim default is also Ctrl+Shift+N (identical across profiles)", () => {
    expect(VIM_DEFAULTS.new_folder).toBe("Ctrl+Shift+N");
  });

  it("does not define a binding for jump_add_url (removed, §4.4)", () => {
    expect(VIM_DEFAULTS.jump_add_url).toBeUndefined();
  });
});

describe("SAME_ACROSS_PROFILES_ACTION_IDS (SPEC-0300-0010 第5版 R-23)", () => {
  it("lists exactly the 20 actions whose windows and vim bindings are identical", () => {
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toHaveLength(20);
    for (const id of SAME_ACROSS_PROFILES_ACTION_IDS) {
      expect(WINDOWS_DEFAULTS[id]).toBe(VIM_DEFAULTS[id]);
    }
  });

  it("R-23 (第5版): includes new_folder (identical Ctrl+Shift+N on both profiles) and no longer includes jump_add_url", () => {
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("new_folder");
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).not.toContain("jump_add_url");
  });

  it("includes toggle_size and toggle_time (ISS-0020 resolved: identical across profiles)", () => {
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("toggle_size");
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("toggle_time");
  });

  it("still includes the 3 SPEC-0300-0013 (P4) actions (history/history_jump_list/jump_add all share bindings across profiles)", () => {
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("history");
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("history_jump_list");
    expect(SAME_ACROSS_PROFILES_ACTION_IDS).toContain("jump_add");
  });
});

describe("PHASE1_ACTION_IDS (SPEC-0300-0010 R-26, §4.2 region column — unaffected by the 5th-edition action-set change)", () => {
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

  it("does not include new_folder (§4.2 区分 P2/SPEC-0300-0011, not P1)", () => {
    expect(PHASE1_ACTION_IDS).not.toContain("new_folder");
  });
});
