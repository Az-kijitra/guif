import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1703 (W-B0 / W-B1), R-1705 (W-B2 / W-B5), R-1751 3 / 5 (W-B3 / W-B6 / W-B7 / W-B9), R-1791 / R-1804 (W-B4),
//   R-1700-1 / R-1704 (W-B8), R-1820 (the order: colours W-B0 / W-B1 / W-B5 / W-B2 -> font W-B7 / W-B6 / W-B9 / W-B3 -> layout W-B7 / W-B4),
//   R-1822 (the sentences), R-1662 (a list shows the first five and `ほか {m} 件`), R-1642 (no line -> the line part is not written),
//   AC-1702, AC-1704, AC-1707, AC-1709, AC-1751, AC-1755 (vii), AC-1791; SPEC-0300-0019 第6版 §4.10 (the sentences' authority), R-1201 (the wording
//   lives in messages.ts), SPEC-0300-0022 R-1661 (joined by ONE half-width space).
// Architecture: SPEC-0200-0001 §3.18.4: `features/appearance/notice.ts` (new feature; wording + notices only; imports `$lib/shared/*` only):
//   buildAppearanceNotice(problems: readonly ProblemDto[]): string | null     // W-B0..W-B7, W-B9 in the R-1820 order; "unused" problems are NOT here
//   buildUnusedNotice(problems: readonly ProblemDto[]): string | null         // W-B8 (the caller puts it after the external apps and before W-AC)
//   ProblemDto is the type of `shared/ipc/appearance.ts` (SPEC-0200-0001 §3.18.15 SHOULD-3). The back end sends RAW values; this module replaces
//   control characters (U+0000-U+001F, U+007F) of a W-B9 name with `?` for display (the DTO keeps the raw name).
//
// Module under test (not yet implemented): ./notice.ts

import { buildAppearanceNotice, buildUnusedNotice } from "./notice";

type P = Parameters<typeof buildAppearanceNotice>[0][number];
const p = (x: Record<string, unknown>): P => x as unknown as P;

const USABLE = ["default", "nord", "monokai", "catppuccin", "solarized", "light"];

describe("W-B0: the preset name cannot be used (R-1703)", () => {
  it("AC-1702 (i): with the line", () => {
    expect(buildAppearanceNotice([p({ kind: "presetUnusable", line: 3, value: "dracula", usable: USABLE })])).toBe(
      'config.toml の 3 行目の配色 "dracula" は使えないため、nord を使います(使える値: default、nord、monokai、catppuccin、solarized、light)。',
    );
  });

  it("without a line the `{N} 行目の` part is not written (R-1642)", () => {
    expect(buildAppearanceNotice([p({ kind: "presetUnusable", line: null, value: "x", usable: USABLE })])).toBe(
      'config.toml の配色 "x" は使えないため、nord を使います(使える値: default、nord、monokai、catppuccin、solarized、light)。',
    );
  });

  it("the list of usable values comes from the DTO (no second copy of the names in the front end)", () => {
    const text = buildAppearanceNotice([p({ kind: "presetUnusable", line: 1, value: "x", usable: ["a", "b"] })]);
    expect(text).toContain("(使える値: a、b)");
  });
});

describe("W-B1: the key's value is not a string (R-1703)", () => {
  it.each(["preset", "name", "theme"])("AC-1702 (ii)/(iii): key %s", (key) => {
    expect(buildAppearanceNotice([p({ kind: "presetWrongType", line: 3, key })])).toBe(
      `config.toml の 3 行目の ${key} は文字列で書いてください。配色は nord を使います。`,
    );
  });

  it("without a line", () => {
    expect(buildAppearanceNotice([p({ kind: "presetWrongType", line: null, key: "theme" })])).toBe(
      "config.toml の theme は文字列で書いてください。配色は nord を使います。",
    );
  });
});

describe("W-B5: `colors` is not a table (R-1705, AC-1707)", () => {
  it("with the line", () => {
    expect(buildAppearanceNotice([p({ kind: "colorsNotTable", line: 4 })])).toBe(
      "config.toml の 4 行目の colors は [colors] の表で書いてください。配色の色をそのまま使います。",
    );
  });
});

describe("W-B2: colours that cannot be understood (R-1705, R-1822, AC-1704)", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `k${i + 1}`, line: i + 1 }));

  it("lists `name(N 行目)` joined by `, `", () => {
    expect(buildAppearanceNotice([p({ kind: "colorsUnparsable", items: [{ name: "folder", line: 12 }, { name: "file", line: 13 }] })])).toBe(
      "config.toml の [colors] の色 2 件を解釈できないため、配色の色を使います: folder(12 行目), file(13 行目)。",
    );
  });

  it("an item without a line is just its name", () => {
    expect(buildAppearanceNotice([p({ kind: "colorsUnparsable", items: [{ name: "folder", line: null }] })])).toBe(
      "config.toml の [colors] の色 1 件を解釈できないため、配色の色を使います: folder。",
    );
  });

  it("AC-1704: seven items -> {n} is 7, the first five are listed and the rest is `ほか 2 件`", () => {
    expect(buildAppearanceNotice([p({ kind: "colorsUnparsable", items: items(7) })])).toBe(
      "config.toml の [colors] の色 7 件を解釈できないため、配色の色を使います: k1(1 行目), k2(2 行目), k3(3 行目), k4(4 行目), k5(5 行目), ほか 2 件。",
    );
  });

  it("exactly five items are all listed (no `ほか`)", () => {
    expect(buildAppearanceNotice([p({ kind: "colorsUnparsable", items: items(5) })])).not.toContain("ほか");
  });
});

describe("W-B3 / W-B4: numbers out of range (R-1751 3, R-1791, R-1804)", () => {
  it("W-B3: [font] size, with the default and the range from the DTO (AC-1751)", () => {
    expect(buildAppearanceNotice([p({ kind: "fontSize", line: 4, key: "size", default: 16, min: 10, max: 24 })])).toBe(
      "config.toml の 4 行目の [font] の size を解釈できないため、既定の 16 を使います(10〜24 の整数)。",
    );
  });

  it("W-B4: min_col_width (default 24, 10〜80)", () => {
    expect(buildAppearanceNotice([p({ kind: "layoutValue", line: 3, key: "min_col_width", default: 24, min: 10, max: 80 })])).toBe(
      "config.toml の 3 行目の min_col_width を解釈できないため、既定の 24 を使います(10〜80 の整数)。",
    );
  });

  it("W-B4: tree_width_percent (default 24, 10〜50; AC-1791)", () => {
    expect(buildAppearanceNotice([p({ kind: "layoutValue", line: 6, key: "tree_width_percent", default: 24, min: 10, max: 50 })])).toBe(
      "config.toml の 6 行目の tree_width_percent を解釈できないため、既定の 24 を使います(10〜50 の整数)。",
    );
  });

  it("without a line (both)", () => {
    expect(buildAppearanceNotice([p({ kind: "fontSize", line: null, key: "size", default: 16, min: 10, max: 24 })])).toBe(
      "config.toml の [font] の size を解釈できないため、既定の 16 を使います(10〜24 の整数)。",
    );
    expect(buildAppearanceNotice([p({ kind: "layoutValue", line: null, key: "min_col_width", default: 24, min: 10, max: 80 })])).toBe(
      "config.toml の min_col_width を解釈できないため、既定の 24 を使います(10〜80 の整数)。",
    );
  });
});

describe("W-B6 / W-B7 / W-B9: the font family and non-table sections", () => {
  it("W-B6", () => {
    expect(buildAppearanceNotice([p({ kind: "fontFamily", line: 5 })])).toBe(
      "config.toml の 5 行目の [font] の family を解釈できないため、既定のフォントを使います(文字列か文字列の配列。制御文字は使えません)。",
    );
  });

  it.each(["font", "layout"])("W-B7: %s is not a table (AC-1751 `font = \"x\"`)", (key) => {
    expect(buildAppearanceNotice([p({ kind: "notTable", line: 2, key })])).toBe(
      `config.toml の 2 行目の ${key} は [${key}] の表で書いてください。既定の値を使います。`,
    );
  });

  it("W-B9 (AC-1755 (vii)): the control character of the raw name is shown as `?`", () => {
    expect(buildAppearanceNotice([p({ kind: "fontFamilyElements", line: 3, names: ["Bad\x01"] })])).toBe(
      'config.toml の 3 行目の [font] の family の "Bad?" は使えないため除きます(制御文字を含む名前・空白だけの名前は使えません)。',
    );
  });

  it("W-B9: several names are quoted and joined by `、`; NUL and DEL are replaced too; a blank-only name stays as it is", () => {
    expect(buildAppearanceNotice([p({ kind: "fontFamilyElements", line: 3, names: ["A\x00B", "  ", "C\x7f"] })])).toBe(
      'config.toml の 3 行目の [font] の family の "A?B"、"  "、"C?" は使えないため除きます(制御文字を含む名前・空白だけの名前は使えません)。',
    );
  });

  it("W-B9: a tab and a newline are control characters as well (U+0009 / U+000A -> `?`)", () => {
    expect(buildAppearanceNotice([p({ kind: "fontFamilyElements", line: 1, names: ["a\tb\nc"] })])).toContain('"a?b?c"');
  });

  it("W-B9: ordinary characters (including Japanese) are not replaced", () => {
    expect(buildAppearanceNotice([p({ kind: "fontFamilyElements", line: 1, names: ["BIZ UDゴシック "] })])).toContain('"BIZ UDゴシック "');
  });
});

describe("the order and the join (R-1820, R-1661)", () => {
  const all: P[] = [
    p({ kind: "layoutValue", line: 12, key: "tree_width_percent", default: 24, min: 10, max: 50 }),
    p({ kind: "fontSize", line: 8, key: "size", default: 16, min: 10, max: 24 }),
    p({ kind: "colorsUnparsable", items: [{ name: "file", line: 5 }] }),
    p({ kind: "fontFamilyElements", line: 7, names: ["Bad\x01"] }),
    p({ kind: "notTable", line: 10, key: "layout" }),
    p({ kind: "colorsNotTable", line: 4 }),
    p({ kind: "fontFamily", line: 6 }),
    p({ kind: "notTable", line: 9, key: "font" }),
    p({ kind: "presetWrongType", line: 3, key: "preset" }),
    p({ kind: "layoutValue", line: 11, key: "min_col_width", default: 24, min: 10, max: 80 }),
  ];

  it("colours (W-B1, W-B5, W-B2) -> font (W-B7, W-B6, W-B9, W-B3) -> layout (W-B7, W-B4), whatever order the DTO has", () => {
    const text = buildAppearanceNotice(all) ?? "";
    const marks = [
      "3 行目の preset は文字列",
      "4 行目の colors は [colors] の表",
      "[colors] の色 1 件",
      "9 行目の font は [font] の表",
      "6 行目の [font] の family を解釈できない",
      '7 行目の [font] の family の "Bad?"',
      "8 行目の [font] の size",
      "10 行目の layout は [layout] の表",
    ];
    const at = marks.map((m) => text.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("layout: W-B7 (layout) comes before the two W-B4 sentences; same-kind sentences keep the DTO's order", () => {
    const text = buildAppearanceNotice(all) ?? "";
    expect(text.indexOf("10 行目の layout は")).toBeLessThan(text.indexOf("11 行目の min_col_width"));
    expect(text.indexOf("11 行目の min_col_width")).toBeLessThan(text.indexOf("12 行目の tree_width_percent"));
  });

  it("the sentences are joined by exactly ONE half-width space (the whole notice is one string)", () => {
    const text = buildAppearanceNotice([p({ kind: "colorsNotTable", line: 4 }), p({ kind: "fontFamily", line: 6 })]);
    expect(text).toBe(
      "config.toml の 4 行目の colors は [colors] の表で書いてください。配色の色をそのまま使います。 " +
        "config.toml の 6 行目の [font] の family を解釈できないため、既定のフォントを使います(文字列か文字列の配列。制御文字は使えません)。",
    );
  });

  it("no problems -> null; only `unused` problems -> null (W-B8 is built by buildUnusedNotice)", () => {
    expect(buildAppearanceNotice([])).toBeNull();
    expect(buildAppearanceNotice([p({ kind: "unused", items: [{ table: "theme", name: "name", line: 3, used: "preset" }] })])).toBeNull();
  });

  it("does not modify the input array", () => {
    const input = [...all];
    buildAppearanceNotice(input);
    expect(input).toEqual(all);
  });
});

describe("W-B8: settings that are known but not used (R-1700-1, R-1704, AC-1703, AC-1709)", () => {
  it("AC-1709: `name(3 行目、preset を使います)`", () => {
    expect(buildUnusedNotice([p({ kind: "unused", items: [{ table: "theme", name: "name", line: 3, used: "preset" }] })])).toBe(
      "config.toml の使われない設定 1 件があります: name(3 行目、preset を使います)。",
    );
  });

  it("AC-1703: `background(5 行目、bg を使います)`, several items joined by `, `", () => {
    expect(
      buildUnusedNotice([
        p({
          kind: "unused",
          items: [
            { table: "colors", name: "background", line: 5, used: "bg" },
            { table: "colors", name: "selected", line: 7, used: "selected_mark" },
          ],
        }),
      ]),
    ).toBe("config.toml の使われない設定 2 件があります: background(5 行目、bg を使います), selected(7 行目、selected_mark を使います)。");
  });

  it("an item without a line drops the line part only", () => {
    expect(buildUnusedNotice([p({ kind: "unused", items: [{ table: "theme", name: "theme", line: null, used: "preset" }] })])).toBe(
      "config.toml の使われない設定 1 件があります: theme(preset を使います)。",
    );
  });

  it("no unused problem -> null (and other kinds do not count)", () => {
    expect(buildUnusedNotice([])).toBeNull();
    expect(buildUnusedNotice([p({ kind: "fontFamily", line: 1 })])).toBeNull();
    expect(buildUnusedNotice([p({ kind: "unused", items: [] })])).toBeNull();
  });
});
