import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0010 R-45-4/R-45-4-1/R-45-5/R-18-2, AC-62/AC-62-1.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.11.3
//   (MUST-86, "recommendation A"): ALL per-element keymap validation
//   (known-action-id check, key-string grammar, `delete`+Shift rejection)
//   is consolidated into this ONE TypeScript function so it can never drift
//   from the actual matching logic in keymap-resolve.ts (the withdrawn
//   design had Rust re-implement this grammar independently, which silently
//   diverged -- see the guardian's MUST-86 (i)-(iv) findings).
//
// Module under test (not yet implemented): ./keymap-validate.ts's new
// `validateKeymapEntries` export (the existing `validateCustomOverride`,
// tested in ./delete-override-validation.test.ts, is unaffected and reused
// internally by the new function per the design, step 5).

import { validateKeymapEntries } from "./keymap-validate";

describe("validateKeymapEntries: step 1 -- unknown action ids are ignored (R-45-4 (i))", () => {
  it("AC-62 (i): an action id outside the 34 known ids is not adopted and is reported invalid", () => {
    const r = validateKeymapEntries([{ actionId: "undo", value: "Ctrl+Z" }]);
    expect(r.effective).not.toHaveProperty("undo");
    expect(r.invalidActions).toContain("undo");
  });

  it("a known action id is not reported invalid merely for existing", () => {
    const r = validateKeymapEntries([{ actionId: "toggle_hidden", value: "Ctrl+Alt+H" }]);
    expect(r.invalidActions).not.toContain("toggle_hidden");
  });
});

describe("validateKeymapEntries: step 2 -- a non-string TOML value is invalid (R-45-4 (ii)/AC-62 (ii))", () => {
  it("AC-62 (ii): value: null (e.g. `sort_menu = 123`) falls back, and is reported invalid", () => {
    const r = validateKeymapEntries([{ actionId: "sort_menu", value: null }]);
    expect(r.effective).not.toHaveProperty("sort_menu");
    expect(r.invalidActions).toContain("sort_menu");
  });
});

describe("validateKeymapEntries: step 3 -- an empty string is a VALID disabling override (R-31), not an error", () => {
  it("an empty string value is adopted as-is and is NOT reported invalid", () => {
    const r = validateKeymapEntries([{ actionId: "help_keymap", value: "" }]);
    expect(r.effective.help_keymap).toBe("");
    expect(r.invalidActions).not.toContain("help_keymap");
  });
});

describe("validateKeymapEntries: step 4 -- key-string grammar (R-45-4-1/AC-62-1)", () => {
  it("AC-62-1 (i): an unknown key name ('Ctrl+Foo') is invalid", () => {
    const r = validateKeymapEntries([{ actionId: "toggle_size", value: "Ctrl+Foo" }]);
    expect(r.effective).not.toHaveProperty("toggle_size");
    expect(r.invalidActions).toContain("toggle_size");
  });

  it("AC-62-1 (ii): an empty modifier ('Ctrl+') is invalid", () => {
    const r = validateKeymapEntries([{ actionId: "toggle_time", value: "Ctrl+" }]);
    expect(r.effective).not.toHaveProperty("toggle_time");
    expect(r.invalidActions).toContain("toggle_time");
  });

  it("AC-62-1 (iii): a duplicated modifier ('Ctrl+Ctrl+F') is invalid", () => {
    const r = validateKeymapEntries([{ actionId: "search", value: "Ctrl+Ctrl+F" }]);
    expect(r.effective).not.toHaveProperty("search");
    expect(r.invalidActions).toContain("search");
  });

  it("AC-62-1 (iv): an empty comma-separated element ('Ctrl+A,,Ctrl+Q') is invalid", () => {
    const r = validateKeymapEntries([{ actionId: "select_all", value: "Ctrl+A,,Ctrl+Q" }]);
    expect(r.effective).not.toHaveProperty("select_all");
    expect(r.invalidActions).toContain("select_all");
  });

  it("AC-62-1 (v): a modifier ORDER violation ('Shift+Ctrl+B') is still VALID (order is normalized, not rejected)", () => {
    const r = validateKeymapEntries([{ actionId: "toggle_tree", value: "Shift+Ctrl+B" }]);
    expect(r.effective.toggle_tree).toBe("Shift+Ctrl+B");
    expect(r.invalidActions).not.toContain("toggle_tree");
  });

  it("a valid multi-binding (comma-separated) value is accepted", () => {
    const r = validateKeymapEntries([{ actionId: "sort_menu", value: "S,Ctrl+Alt+S" }]);
    expect(r.effective.sort_menu).toBe("S,Ctrl+Alt+S");
  });

  it("case-insensitive modifiers/key names are valid (MUST-86(i)/(iii))", () => {
    const r = validateKeymapEntries([{ actionId: "toggle_hidden", value: "ctrl+alt+h" }]);
    expect(r.invalidActions).not.toContain("toggle_hidden");
    expect(r.effective.toggle_hidden).toBe("ctrl+alt+h"); // raw value kept; canonicalization happens at match time
  });

  it("the 'Plus'/'Comma' key-body words are valid (発注者決定 2026-09-27)", () => {
    const r = validateKeymapEntries([{ actionId: "settings", value: "Ctrl+Comma" }]);
    expect(r.invalidActions).not.toContain("settings");
    expect(r.effective.settings).toBe("Ctrl+Comma");
  });

  it("a bare '+' or ',' as the key body is invalid (must use the word form)", () => {
    const r = validateKeymapEntries([{ actionId: "settings", value: "Ctrl++" }]);
    expect(r.invalidActions).toContain("settings");
  });
});

describe("validateKeymapEntries: step 5 -- delete + Shift is invalid (R-18-2)", () => {
  it("AC-62 (iii): Shift+F8 assigned to delete falls back, and is reported invalid", () => {
    const r = validateKeymapEntries([{ actionId: "delete", value: "Shift+F8" }]);
    expect(r.effective).not.toHaveProperty("delete");
    expect(r.invalidActions).toContain("delete");
  });

  it("delete without Shift is valid", () => {
    const r = validateKeymapEntries([{ actionId: "delete", value: "F8" }]);
    expect(r.effective.delete).toBe("F8");
    expect(r.invalidActions).not.toContain("delete");
  });

  it("Shift is fine for actions OTHER than delete", () => {
    const r = validateKeymapEntries([{ actionId: "sort_menu", value: "Shift+S" }]);
    expect(r.effective.sort_menu).toBe("Shift+S");
  });
});

describe("validateKeymapEntries: AC-62 combined scenario (R-45-4/R-45-5/R-18-2)", () => {
  it("mixes an unknown id, an unparseable value, an invalid delete override, and one valid entry", () => {
    const r = validateKeymapEntries([
      { actionId: "undo", value: "Ctrl+Z" },
      { actionId: "sort_menu", value: null },
      { actionId: "delete", value: "Shift+F8" },
      { actionId: "toggle_time", value: "Ctrl+Alt+T" },
    ]);
    expect(r.effective).toEqual({ toggle_time: "Ctrl+Alt+T" });
    expect(new Set(r.invalidActions)).toEqual(new Set(["undo", "sort_menu", "delete"]));
  });
});

describe("validateKeymapEntries: no entries", () => {
  it("an empty entry list yields empty effective overrides and no invalid actions", () => {
    const r = validateKeymapEntries([]);
    expect(r.effective).toEqual({});
    expect(r.invalidActions).toEqual([]);
  });
});
