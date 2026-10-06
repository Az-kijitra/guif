import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0010 R-45-2 / R-45-5 / R-45-6 (第14版: R-45 系注記・R-45-6), AC-62-2;
//   SPEC-0300-0017 R-917-5 (the 3 cases: file missing / whole file unreadable / input_keymap_custom
//   of the wrong type), AC-950, AC-958, AC-959.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.4: `buildKeymapLoadNotice(parseError,
//   invalidActions, opts?: { alsoDefaultsTheme?: boolean })`. The trailing `Using the default keymap.` becomes
//   `Using the default keymap and the default theme (following the OS).` when `alsoDefaultsTheme` is true
//   (the whole file could not be read, so the theme falls back as well and NO separate theme notice is
//   shown). features/keyboard/ does not know the theme: it only receives a boolean (§4.1).
//
// Module under test: ./keymap-notice.ts (existing; the `opts` argument is new in Phase 12).
// The pre-existing behaviour (no `opts`) is pinned here too, so the option cannot change it.

import { buildKeymapLoadNotice } from "./keymap-notice";

describe("buildKeymapLoadNotice: existing behaviour is unchanged when `opts` is omitted (R-45-2 / R-45-5)", () => {
  it("returns null when there is no parse error and no invalid action (R-45-1: no notice)", () => {
    expect(buildKeymapLoadNotice(null, [])).toBeNull();
  });

  it("R-45-2: a parse error with a line number names the line and ends with `Using the default keymap.`", () => {
    expect(buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [])).toBe(
      "config.toml could not be read (line 3): bad toml. Using the default keymap.",
    );
  });

  it("R-45-2: a parse error without a line number omits the line part", () => {
    expect(buildKeymapLoadNotice({ message: "not utf-8", line: null }, [])).toBe(
      "config.toml could not be read: not utf-8. Using the default keymap.",
    );
  });

  it("R-45-5: invalid actions are listed with their count", () => {
    expect(buildKeymapLoadNotice(null, ["undo", "sort_menu"])).toBe(
      "Ignored 2 invalid keymap override(s) in config.toml: undo, sort_menu.",
    );
  });

  it("a parse error takes precedence over invalid actions", () => {
    const text = buildKeymapLoadNotice({ message: "x", line: null }, ["undo"]) ?? "";
    expect(text).toContain("could not be read");
    expect(text).not.toContain("Ignored");
  });
});

describe("buildKeymapLoadNotice: opts.alsoDefaultsTheme (R-917-5 case 2: the whole file is unreadable)", () => {
  it("true: the closing sentence also says the default theme (following the OS) is used", () => {
    expect(buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [], { alsoDefaultsTheme: true })).toBe(
      "config.toml could not be read (line 3): bad toml. Using the default keymap and the default theme (following the OS).",
    );
  });

  it("true, without a line number (read error / not UTF-8)", () => {
    expect(buildKeymapLoadNotice({ message: "not utf-8", line: null }, [], { alsoDefaultsTheme: true })).toBe(
      "config.toml could not be read: not utf-8. Using the default keymap and the default theme (following the OS).",
    );
  });

  it("false / `{}` / undefined: identical to the text without opts (R-917-5 case 3: the notice does not mention the theme)", () => {
    const err = { message: "input_keymap_custom must be a table", line: null };
    const base = buildKeymapLoadNotice(err, []);
    expect(buildKeymapLoadNotice(err, [], { alsoDefaultsTheme: false })).toBe(base);
    expect(buildKeymapLoadNotice(err, [], {})).toBe(base);
    expect(buildKeymapLoadNotice(err, [], undefined)).toBe(base);
    expect(base).not.toMatch(/theme/i);
  });

  it("R-917-5 case 3 wording: `Using the default keymap.` stays the closing sentence, no theme word", () => {
    const text = buildKeymapLoadNotice({ message: "input_keymap_custom must be a table", line: null }, []) ?? "";
    expect(text.endsWith("Using the default keymap.")).toBe(true);
  });

  it("alsoDefaultsTheme has no effect without a parse error (null stays null; invalid actions keep their text)", () => {
    expect(buildKeymapLoadNotice(null, [], { alsoDefaultsTheme: true })).toBeNull();
    expect(buildKeymapLoadNotice(null, ["undo"], { alsoDefaultsTheme: true })).toBe(
      "Ignored 1 invalid keymap override(s) in config.toml: undo.",
    );
  });
});
