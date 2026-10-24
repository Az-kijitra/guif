/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as keymapDefaultsModule from "./keymap-defaults";
import { ACTION_IDS, DEFAULT_KEYMAP, EXCLUDED_ACTION_IDS, PHASE1_ACTION_IDS } from "./keymap-defaults";

// Spec: SPEC-0300-0010 (keyboard navigation / default keymap detail),
//   **第8版** §4 (R-20, R-20-1, R-21~R-27, §4.2, §4.4), AC-55, AC-55-1
// Module under test: ./keymap-defaults.ts
//
// Update (Phase 2 wiring, ISS-0105, SPEC-0200-0001 §3.3.9): the keymap
// profile concept is abolished (R-20-1). The former two-profile tables and
// the same-across-profiles list are gone; the single default table is
// renamed `DEFAULT_KEYMAP` (was the windows table). The only way for a user
// to change a binding is `input_keymap_custom` (R-30~R-32, R-41).
//
// R-21/R-21-2 (第5版, ISS-0070 RESOLVED): the action id set has exactly 34
//   entries. `jump_add_url` was removed and `new_folder` (ISS-0038) added —
//   the count stays 34 but the *membership* changed, so membership (not just
//   counts) is asserted.
// R-22-1 (ISS-0038): new_folder's default is Ctrl+Shift+N
// R-26: "後続" (subsequent-phase) actions keep their id/binding definitions
// R-27 (第5版): 13 scope-excluded actions must not appear anywhere in the
//   action set
//
// MUST-62 / AC-55-1: AC-55-1 requires that a case-insensitive search of the
// source tree (INCLUDING test code) for the retired identifiers finds 0
// hits. Therefore this file never writes those identifiers as contiguous
// literals; they are assembled at run time with join("").

const RETIRED_IDENTIFIERS = [
  ["VIM", "_DEFAULTS"].join(""),
  ["Keymap", "Profile"].join(""),
  ["keymap", "_profile"].join(""),
  ["SAME_ACROSS", "_PROFILES"].join(""),
];
const RENAMED_WINDOWS_TABLE = ["WINDOWS", "_DEFAULTS"].join("");

function findFilesMatching(pattern: RegExp, extensions: RegExp): string[] {
  const srcRoot = resolve(__dirname, "../../..");
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "node_modules" || name === ".svelte-kit") continue;
        walk(full);
      } else if (extensions.test(name) && pattern.test(readFileSync(full, "utf-8"))) {
        hits.push(full);
      }
    }
  };
  walk(srcRoot);
  return hits;
}

describe("ACTION_IDS (SPEC-0300-0010 第8版 R-21, R-21-2)", () => {
  it("contains exactly 34 action ids", () => {
    expect(ACTION_IDS).toHaveLength(34);
    expect(new Set(ACTION_IDS).size).toBe(34); // no duplicates
  });

  it("R-21-2/ISS-0070: does NOT contain jump_add_url (moved to §4.4, URL jump abolished by SPEC-0300-0013 R-256)", () => {
    expect(ACTION_IDS).not.toContain("jump_add_url");
  });

  it("R-21-1/ISS-0038: contains new_folder", () => {
    expect(ACTION_IDS).toContain("new_folder");
  });

  it("still contains the 3 SPEC-0300-0013 (P4) actions", () => {
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

describe("DEFAULT_KEYMAP (Windows-like as primary, Vim-like as secondary per tuif)", () => {
  const expectedP1: Record<string, string> = {
    move_up: "ArrowUp,K",
    move_down: "ArrowDown,J",
    move_left: "ArrowLeft,H",
    move_right: "ArrowRight,L",
    page_up: "PageUp,Ctrl+U",
    page_down: "PageDown,Ctrl+D",
    select_toggle: "Space,V",
    select_all: "Ctrl+A,Shift+V",
    clear_selection: "Escape",
    open: "Enter",
    go_parent: "Backspace,Minus",
    exit: "Ctrl+Q",
    toggle_hidden: "Ctrl+H,Dot",
    toggle_tree: "Ctrl+Shift+B,T",
    sort_menu: "S",
    toggle_size: "Ctrl+Shift+S",
    toggle_time: "Ctrl+Shift+T",
  };

  it.each(Object.entries(expectedP1))("default for %s is %s", (actionId, key) => {
    expect(DEFAULT_KEYMAP[actionId]).toBe(key);
  });

  // SPEC-0300-0010 §4.2 row 13 (第11版承認後の追補; SPEC-0200-0001 §3.6.11.3
  // MUST-86, 発注者決定 2026-09-27): the internal representation of "Ctrl+,"
  // is "Ctrl+Comma" (the key BODY is the word "Comma", not the literal ","
  // character) -- this is what keymap-resolve.ts's new eventKeyToken(",")
  // -> "Comma" mapping requires matchesHardcodedShortcut's literal to say, or
  // the hardcoded Ctrl+, shortcut (priority 1) stops firing entirely.
  it("settings' default is internally represented as 'Ctrl+Comma' (MUST-86, not the literal 'Ctrl+,')", () => {
    expect(DEFAULT_KEYMAP.settings).toBe("Ctrl+Comma");
  });

  it("Phase 2 defaults with Vim-like secondaries: copy/cut/paste/delete/rename/new_file/new_folder", () => {
    expect(DEFAULT_KEYMAP.copy).toBe("Ctrl+C,Y");
    expect(DEFAULT_KEYMAP.cut).toBe("Ctrl+X,X");
    expect(DEFAULT_KEYMAP.paste).toBe("Ctrl+V,P");
    expect(DEFAULT_KEYMAP.delete).toBe("Delete,D");
    expect(DEFAULT_KEYMAP.rename).toBe("F2,R");
    expect(DEFAULT_KEYMAP.new_file).toBe("Ctrl+N,A");
    expect(DEFAULT_KEYMAP.new_folder).toBe("Ctrl+Shift+N,Shift+A");
  });

  it("does not define a binding for jump_add_url (removed, §4.4)", () => {
    expect(DEFAULT_KEYMAP.jump_add_url).toBeUndefined();
  });

  it("Ctrl+Shift+N (new_folder) does not collide with any other default binding, including Ctrl+N (new_file)", () => {
    const values = Object.entries(DEFAULT_KEYMAP)
      .filter(([id]) => id !== "new_folder")
      .map(([, v]) => v);
    expect(values).not.toContain("Ctrl+Shift+N");
  });

  it("every action id has a default binding and there are no extra keys", () => {
    expect(Object.keys(DEFAULT_KEYMAP).sort()).toEqual([...ACTION_IDS].sort());
  });
});

describe("Vim-like navigation keys (H/J/K/L etc.) are supported as secondary keys", () => {
  it("move actions have Windows arrow keys first and Vim hjkl second", () => {
    expect(DEFAULT_KEYMAP.move_left).toBe("ArrowLeft,H");
    expect(DEFAULT_KEYMAP.move_right).toBe("ArrowRight,L");
    expect(DEFAULT_KEYMAP.move_up).toBe("ArrowUp,K");
    expect(DEFAULT_KEYMAP.move_down).toBe("ArrowDown,J");
  });

  it("page actions include PageUp/Down and Ctrl+U/D", () => {
    expect(DEFAULT_KEYMAP.page_up).toBe("PageUp,Ctrl+U");
    expect(DEFAULT_KEYMAP.page_down).toBe("PageDown,Ctrl+D");
  });
});

describe("AC-55-1: the profile concept is gone from the source tree (R-20-1, R-42-1, ISS-0105)", () => {
  it("keymap-defaults exports none of the retired profile tables / lists / types", () => {
    const exported = Object.keys(keymapDefaultsModule);
    for (const retired of RETIRED_IDENTIFIERS) {
      expect(exported).not.toContain(retired);
    }
    expect(exported).not.toContain(RENAMED_WINDOWS_TABLE);
  });

  it("exports the single default table as DEFAULT_KEYMAP", () => {
    expect(typeof DEFAULT_KEYMAP).toBe("object");
  });

  it("no retired identifier remains anywhere under app/src (test code included, case-insensitive)", () => {
    const pattern = new RegExp(RETIRED_IDENTIFIERS.join("|"), "i");
    expect(findFilesMatching(pattern, /\.(ts|svelte|js|json|md)$/)).toEqual([]);
  });

  it("the former windows-table identifier is fully renamed (no reference left in app/src)", () => {
    expect(findFilesMatching(new RegExp(RENAMED_WINDOWS_TABLE), /\.(ts|svelte|js)$/)).toEqual([]);
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

  it("does not include new_folder (§4.2 区分 P2/SPEC-0300-0011, not P1)", () => {
    expect(PHASE1_ACTION_IDS).not.toContain("new_folder");
  });
});
