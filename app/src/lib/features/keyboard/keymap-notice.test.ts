import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0010 R-45-2 / R-45-5 / R-45-6 (第15版), AC-62-2;
//   SPEC-0300-0017 R-917-5 (the 3 cases: file missing / whole file unreadable / input_keymap_custom
//   of the wrong type), AC-950, AC-958, AC-959;
//   SPEC-0300-0019 W-30 / W-30-2 / W-31 / W-32, AC-1209 (i) (i-3), AC-1211, R-1204 3.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.4 / §3.13.7: `buildKeymapLoadNotice(parseError,
//   invalidActions, opts?: { alsoDefaultsTheme?: boolean })`. `KeymapParseErrorLike` gains `wholeFile?: boolean`.
//   Stage B (SPEC-0200-0001 §3.13.3): the notices are Japanese. The TOML parser message after `詳細: ` stays
//   English (R-1204 3). `wholeFile === false` -> the W-30-2 sentence only; `true` / `undefined` -> W-30 / W-31.
//   features/keyboard/ does not know the theme: it only receives a boolean (§4.1).
//
// Module under test: ./keymap-notice.ts.

import { buildKeymapLoadNotice } from "./keymap-notice";

const W30_CLOSING = "既定のキー割り当てを使います。";
const W31_CLOSING = "既定のキー割り当てとテーマ(OS の設定に従う)を使います。";
const W30_2 = "config.toml の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。";

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
      buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [], { alsoDefaultsTheme: true }),
      buildKeymapLoadNotice(null, ["undo"]),
      buildKeymapLoadNotice({ message: "bad toml", line: 3, wholeFile: false }, []),
    ].join("\n");
    expect(texts).not.toContain("could not be read");
    expect(texts).not.toContain("Using the default keymap");
    expect(texts).not.toContain("Ignored");
    expect(texts).not.toContain("override(s)");
  });
});

describe("buildKeymapLoadNotice: opts.alsoDefaultsTheme (W-31 / R-917-5 case 2: the whole file is unreadable)", () => {
  it("W-31, true: the closing sentence also says the default theme (following the OS) is used", () => {
    expect(
      buildKeymapLoadNotice({ message: "bad toml", line: 3, wholeFile: true }, [], { alsoDefaultsTheme: true }),
    ).toBe(`config.toml の 3 行目を読み込めなかったため、${W31_CLOSING} 詳細: bad toml`);
  });

  it("W-31, true, without a line number (read error / not UTF-8): the TOML message stays English after `詳細: `", () => {
    expect(
      buildKeymapLoadNotice({ message: "not utf-8", line: null, wholeFile: true }, [], { alsoDefaultsTheme: true }),
    ).toBe(`config.toml を読み込めなかったため、${W31_CLOSING} 詳細: not utf-8`);
  });

  it("W-31: `wholeFile` omitted counts as 'the whole file is unreadable' (existing callers stay compatible)", () => {
    expect(buildKeymapLoadNotice({ message: "bad toml", line: 3 }, [], { alsoDefaultsTheme: true })).toBe(
      `config.toml の 3 行目を読み込めなかったため、${W31_CLOSING} 詳細: bad toml`,
    );
  });

  it("W-30 (alsoDefaultsTheme false / {} / undefined) for a whole-file error: identical, never mentions the theme", () => {
    const err = { message: "bad toml", line: 3, wholeFile: true };
    const base = buildKeymapLoadNotice(err, []);
    expect(buildKeymapLoadNotice(err, [], { alsoDefaultsTheme: false })).toBe(base);
    expect(buildKeymapLoadNotice(err, [], {})).toBe(base);
    expect(buildKeymapLoadNotice(err, [], undefined)).toBe(base);
    expect(base).not.toContain("テーマ");
  });

  it("alsoDefaultsTheme has no effect without a parse error (null stays null; invalid actions keep their text)", () => {
    expect(buildKeymapLoadNotice(null, [], { alsoDefaultsTheme: true })).toBeNull();
    expect(buildKeymapLoadNotice(null, ["undo"], { alsoDefaultsTheme: true })).toBe(
      "config.toml の不正なキー割り当て 1 件を無視しました: undo。",
    );
  });
});

describe("buildKeymapLoadNotice: W-30-2 (wholeFile === false: input_keymap_custom is not a table; AC-1209 (i-3))", () => {
  const typeError = { message: "input_keymap_custom must be a table", line: null, wholeFile: false };

  it("is exactly the W-30-2 sentence", () => {
    expect(buildKeymapLoadNotice(typeError, [])).toBe(W30_2);
  });

  it("has no `詳細:`, no Rust message, no English sentence and no `テーマ`", () => {
    const text = buildKeymapLoadNotice(typeError, []) ?? "";
    expect(text).not.toContain("詳細:");
    expect(text).not.toContain("must be a table");
    expect(text).not.toContain("Using the default keymap");
    expect(text).not.toContain("テーマ");
    expect(text.endsWith("既定のキー割り当てを使います。")).toBe(true);
  });

  it("does not look at alsoDefaultsTheme (the theme is read normally in this case)", () => {
    expect(buildKeymapLoadNotice(typeError, [], { alsoDefaultsTheme: true })).toBe(W30_2);
    expect(buildKeymapLoadNotice(typeError, [], { alsoDefaultsTheme: false })).toBe(W30_2);
  });

  it("does not use the message or a line number even when one is given", () => {
    expect(buildKeymapLoadNotice({ message: "anything else", line: 7, wholeFile: false }, [])).toBe(W30_2);
  });
});
