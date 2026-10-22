import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1642 (the reading side returns each key's line; the TypeScript validation only passes it on to the notice and
//   does not decide on lines), AC-1646 (no second validation: the verdict of an entry is the same with or without a line), AC-1640 / AC-1643 (the lines
//   of the invalid actions reach W-32).
// Architecture: SPEC-0200-0001 §3.17.8: `RawKeymapEntryLike.line?: number | null`; `ValidatedKeymap.invalidActionLines: (number | null)[]`, PARALLEL to
//   `invalidActions` (same length, same order; null = no line known or the entry carried none).
//
// Module under test: ./keymap-validate.ts

import { validateKeymapEntries } from "./keymap-validate";

describe("invalidActionLines is parallel to invalidActions (R-1642)", () => {
  it("each invalid entry's line is kept, in the order of invalidActions", () => {
    const r = validateKeymapEntries([
      { actionId: "copy", value: "Ctrl+", line: 12 },
      { actionId: "toggle_time", value: "Ctrl+Alt+T", line: 13 },
      { actionId: "undo", value: "Ctrl+Z", line: 14 },
      { actionId: "sort_menu", value: null, line: 15 },
    ]);
    expect(r.invalidActions).toEqual(["copy", "undo", "sort_menu"]);
    expect(r.invalidActionLines).toEqual([12, 14, 15]);
  });

  it("a valid entry's line is not listed (only the invalid ones have a line)", () => {
    const r = validateKeymapEntries([{ actionId: "toggle_time", value: "Ctrl+Alt+T", line: 13 }]);
    expect(r.invalidActions).toEqual([]);
    expect(r.invalidActionLines).toEqual([]);
    expect(r.effective).toEqual({ toggle_time: "Ctrl+Alt+T" });
  });

  it("an entry without a line (undefined) or with null gives null at its position", () => {
    const r = validateKeymapEntries([
      { actionId: "undo", value: "x" },
      { actionId: "copy", value: "Ctrl+", line: null },
      { actionId: "delete", value: "Shift+F8", line: 7 },
    ]);
    expect(r.invalidActions).toEqual(["undo", "copy", "delete"]);
    expect(r.invalidActionLines).toEqual([null, null, 7]);
  });

  it("same length as invalidActions in every case, including no entries", () => {
    expect(validateKeymapEntries([]).invalidActionLines).toEqual([]);
    const r = validateKeymapEntries([
      { actionId: "a", value: "x", line: 1 },
      { actionId: "b", value: "y" },
    ]);
    expect(r.invalidActionLines).toHaveLength(r.invalidActions.length);
  });

  it("each of the four invalid kinds (unknown id, non-string, bad grammar, delete+Shift) records its line", () => {
    const r = validateKeymapEntries([
      { actionId: "nope", value: "Ctrl+X", line: 1 },
      { actionId: "copy", value: null, line: 2 },
      { actionId: "cut", value: "Ctrl+Bogus+X", line: 3 },
      { actionId: "delete", value: "Shift+Delete", line: 4 },
    ]);
    expect(r.invalidActionLines).toEqual([1, 2, 3, 4]);
  });
});

describe("AC-1646: the verdict does not depend on the line (no second validation)", () => {
  const entries = [
    { actionId: "copy", value: "Ctrl+" },
    { actionId: "toggle_time", value: "Ctrl+Alt+T" },
    { actionId: "undo", value: "Ctrl+Z" },
    { actionId: "rename", value: "" },
  ];
  it("effective and invalidActions are the same for the entries with and without lines", () => {
    const without = validateKeymapEntries(entries);
    const withLines = validateKeymapEntries(entries.map((e, i) => ({ ...e, line: 10 + i })));
    expect(withLines.effective).toEqual(without.effective);
    expect(withLines.invalidActions).toEqual(without.invalidActions);
  });
});
