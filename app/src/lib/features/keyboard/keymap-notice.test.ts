import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0010 R-45-2 / R-45-5 / R-45-6 (第15版), AC-62-2;
//   SPEC-0300-0017 R-917-5 (the 3 cases: file missing / whole file unreadable / input_keymap_custom
//   of the wrong type), AC-950, AC-958, AC-959;
//   SPEC-0300-0019 W-30 / W-30-2 / W-31 / W-32, AC-1209 (i) (i-3), AC-1211, R-1204 3.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.4 / §3.13.7: `buildKeymapLoadNotice(parseError,
//   invalidActions, opts?: { alsoDefaultsAppearance?: boolean })`. `KeymapParseErrorLike` gains `wholeFile?: boolean`.
//   Stage B (SPEC-0200-0001 §3.13.3): the notices are Japanese. The TOML parser message after `詳細: ` stays
//   English (R-1204 3). `wholeFile === false` -> the W-30-2 sentence only; `true` / `undefined` -> W-30 / W-31.
//   features/keyboard/ does not know the theme: it only receives a boolean (§4.1).
//
// Module under test: ./keymap-notice.ts.

import { buildKeymapLoadNotice } from "./keymap-notice";

const W30_CLOSING = "既定のキー割り当てを使います。";
// SPEC-0300-0019 第3版 W-31 (SPEC-0300-0021 R-1504 / D-13): when the whole file is unreadable the external apps fall back to the default four too.
const W31_CLOSING = "既定のキー割り当て、配色(nord)、外部アプリの既定の登録を使います。";
const W30_2 = "config.toml の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。";
const W30_2_AT = (n: number): string => `config.toml の ${n} 行目の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。`;

describe("buildKeymapLoadNotice: behaviour when `opts` is omitted (R-45-2 / R-45-5)", () => {
  it("returns null when there is no parse error and no invalid action (R-45-1: no notice)", () => {
    expect(buildKeymapLoadNotice(null, [])).toBeNull();
  });

  it("W-30 (R-45-2): a parse error with a line number names the line and ends with the keymap-only closing", () => {
    expect(buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [])).toBe(
      `config.toml の 3 行目を読み込めなかったため、${W30_CLOSING} 詳細: bad toml`,
    );
  });

  it("W-30 (R-45-2): a parse error without a line number says `config.toml を`", () => {
    expect(buildKeymapLoadNotice({ message: "not utf-8", line: null }, [])).toBe(
      `config.toml を読み込めなかったため、${W30_CLOSING} 詳細: not utf-8`,
    );
  });

  it("W-32 (R-45-5): invalid actions are listed with their count, joined by ', '", () => {
    expect(buildKeymapLoadNotice(null, ["undo", "sort_menu"])).toBe(
      "config.toml の不正なキー割り当て 2 件を無視しました: undo, sort_menu。",
    );
  });

  it("a parse error takes precedence over invalid actions", () => {
    const text = buildKeymapLoadNotice({ message: "x", line: null }, ["undo"]) ?? "";
    expect(text).toContain("読み込めなかった");
    expect(text).not.toContain("無視しました");
  });

  it("AC-1212: none of the old English sentences remains in any of the notices", () => {
    const texts = [
      buildKeymapLoadNotice({ message: "bad toml", line: 3 }, []),
      buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [], { alsoDefaultsAppearance: true }),
      buildKeymapLoadNotice(null, ["undo"]),
      buildKeymapLoadNotice({ message: "bad toml", line: 3, wholeFile: false }, []),
    ].join("\n");
    expect(texts).not.toContain("could not be read");
    expect(texts).not.toContain("Using the default keymap");
    expect(texts).not.toContain("Ignored");
    expect(texts).not.toContain("override(s)");
  });
});

describe("buildKeymapLoadNotice: opts.alsoDefaultsAppearance (W-31 第6版 / SPEC-0300-0023 R-1823: the whole file is unreadable, so the colour scheme is nord too)", () => {
  it("W-31, true: the closing sentence also says the default colour scheme (nord) is used", () => {
    expect(
      buildKeymapLoadNotice({ message: "bad toml", line: 3, wholeFile: true }, [], { alsoDefaultsAppearance: true }),
    ).toBe(`config.toml の 3 行目を読み込めなかったため、${W31_CLOSING} 詳細: bad toml`);
  });

  it("W-31, true, without a line number (read error / not UTF-8): the TOML message stays English after `詳細: `", () => {
    expect(
      buildKeymapLoadNotice({ message: "not utf-8", line: null, wholeFile: true }, [], { alsoDefaultsAppearance: true }),
    ).toBe(`config.toml を読み込めなかったため、${W31_CLOSING} 詳細: not utf-8`);
  });

  it("W-31: `wholeFile` omitted counts as 'the whole file is unreadable' (existing callers stay compatible)", () => {
    expect(buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [], { alsoDefaultsAppearance: true })).toBe(
      `config.toml の 3 行目を読み込めなかったため、${W31_CLOSING} 詳細: bad toml`,
    );
  });

  it("W-30 (alsoDefaultsAppearance false / {} / undefined) for a whole-file error: identical, never mentions the theme", () => {
    const err = { message: "bad toml", line: 3, wholeFile: true };
    const base = buildKeymapLoadNotice(err, []);
    expect(buildKeymapLoadNotice(err, [], { alsoDefaultsAppearance: false })).toBe(base);
    expect(buildKeymapLoadNotice(err, [], {})).toBe(base);
    expect(buildKeymapLoadNotice(err, [], undefined)).toBe(base);
    expect(base).not.toContain("配色");
  });

  it("alsoDefaultsAppearance has no effect without a parse error (null stays null; invalid actions keep their text)", () => {
    expect(buildKeymapLoadNotice(null, [], { alsoDefaultsAppearance: true })).toBeNull();
    expect(buildKeymapLoadNotice(null, ["undo"], { alsoDefaultsAppearance: true })).toBe(
      "config.toml の不正なキー割り当て 1 件を無視しました: undo。",
    );
  });
});

describe("buildKeymapLoadNotice: W-30-2 (wholeFile === false: input_keymap_custom is not a table; AC-1209 (i-3))", () => {
  const typeError = { message: "input_keymap_custom must be a table", line: null, wholeFile: false };

  it("is exactly the W-30-2 sentence", () => {
    expect(buildKeymapLoadNotice(typeError, [])).toBe(W30_2);
  });

  it("has no `詳細:`, no Rust message, no English sentence and no `配色`", () => {
    const text = buildKeymapLoadNotice(typeError, []) ?? "";
    expect(text).not.toContain("詳細:");
    expect(text).not.toContain("must be a table");
    expect(text).not.toContain("Using the default keymap");
    expect(text).not.toContain("配色");
    expect(text.endsWith("既定のキー割り当てを使います。")).toBe(true);
  });

  it("does not look at alsoDefaultsAppearance (the theme is read normally in this case)", () => {
    expect(buildKeymapLoadNotice(typeError, [], { alsoDefaultsAppearance: true })).toBe(W30_2);
    expect(buildKeymapLoadNotice(typeError, [], { alsoDefaultsAppearance: false })).toBe(W30_2);
  });

  // SPEC-0300-0022 R-1642 / 第5版 W-30-2: the line of the `input_keymap_custom` key (or table heading) is named when the reading side has it.
  it("SPEC-0300-0022 W-30-2 with a line: `config.toml の {N} 行目の input_keymap_custom を解釈できないため、…`; the message is still not used", () => {
    expect(buildKeymapLoadNotice({ message: "anything else", line: 7, wholeFile: false }, [])).toBe(W30_2_AT(7));
    expect(buildKeymapLoadNotice({ message: "anything else", line: 7, wholeFile: false }, [], { alsoDefaultsAppearance: true })).toBe(W30_2_AT(7));
  });

  it("SPEC-0300-0022: a null line keeps the sentence without a line (R-1642 \"行番号が得られない項目は、行を書かない\")", () => {
    expect(buildKeymapLoadNotice({ message: "x", line: null, wholeFile: false }, [])).toBe(W30_2);
  });
});

// SPEC-0300-0022 R-1642 / R-1660 / R-1662 / 第5版 W-32: each id carries its line as `copy(12 行目)`; the list is cut after 5 items (`ほか {m} 件`) while {n}
// stays the full count. The lines come from `validateKeymapEntries().invalidActionLines` (parallel to `invalidActions`) via `opts.invalidActionLines`.
describe("buildKeymapLoadNotice: W-32 with lines and the 5-item cut (SPEC-0300-0022 AC-1640, AC-1643)", () => {
  it("AC-1640: `copy(12 行目)` -- the id, then the line in half-width parentheses", () => {
    expect(buildKeymapLoadNotice(null, ["copy"], { invalidActionLines: [12] })).toBe(
      "config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。",
    );
  });

  it("an id whose line is null is listed without parentheses, beside ones that have a line", () => {
    expect(buildKeymapLoadNotice(null, ["undo", "copy"], { invalidActionLines: [null, 12] })).toBe(
      "config.toml の不正なキー割り当て 2 件を無視しました: undo, copy(12 行目)。",
    );
  });

  it("without `invalidActionLines` the sentence is exactly the pre-SPEC-0300-0022 one", () => {
    expect(buildKeymapLoadNotice(null, ["undo", "sort_menu"], {})).toBe("config.toml の不正なキー割り当て 2 件を無視しました: undo, sort_menu。");
  });

  it("five items are listed in full", () => {
    const ids = ["a1", "a2", "a3", "a4", "a5"];
    expect(buildKeymapLoadNotice(null, ids, { invalidActionLines: [1, 2, 3, 4, 5] })).toBe(
      "config.toml の不正なキー割り当て 5 件を無視しました: a1(1 行目), a2(2 行目), a3(3 行目), a4(4 行目), a5(5 行目)。",
    );
  });

  it("AC-1643: eight invalid entries -> {n} is 8, the list is the first five and `ほか 3 件`", () => {
    const ids = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
    expect(buildKeymapLoadNotice(null, ids, { invalidActionLines: [1, 2, 3, 4, 5, 6, 7, 8] })).toBe(
      "config.toml の不正なキー割り当て 8 件を無視しました: a1(1 行目), a2(2 行目), a3(3 行目), a4(4 行目), a5(5 行目), ほか 3 件。",
    );
  });

  it("the cut also applies when no line is known", () => {
    expect(buildKeymapLoadNotice(null, ["a", "b", "c", "d", "e", "f"], {})).toBe(
      "config.toml の不正なキー割り当て 6 件を無視しました: a, b, c, d, e, ほか 1 件。",
    );
  });

  it("a parse error still takes precedence over the invalid actions, lines or not", () => {
    const text = buildKeymapLoadNotice({ message: "x", line: 2 }, ["copy"], { invalidActionLines: [12] }) ?? "";
    expect(text).toContain("2 行目を読み込めなかった");
    expect(text).not.toContain("copy");
  });
});
