// SPEC-0300-0019 第6版 §4.10 W-B0~W-B9 / SPEC-0300-0023 R-1822 / SPEC-0200-0001 §3.18.4 (SPEC-0300-0019 R-1201): the on-screen wording used only
// by `features/appearance/` (the notices about the colour scheme, the font and the layout in config.toml). Pure strings and pure templates only.
// `config.toml`, `preset`, `[colors]`, `[font]`, `[layout]` and the key names are not translated (R-1203 4). The back end sends codes and values only.

import { COMMON } from "$lib/shared/messages";

// The head of a sentence: `config.toml の` + (` {N} 行目の` when the line is known, R-1642) + `sep` (a half-width space in front of an ASCII word, nothing in front of Japanese).
function head(line: number | null, sep = " "): string {
  return `config.toml の${line === null ? "" : ` ${line} 行目の`}${sep}`;
}

export const APPEARANCE_MESSAGES = {
  // W-B0
  presetUnusable: (line: number | null, value: string, usable: readonly string[]): string =>
    `${head(line, "")}配色 "${value}" は使えないため、nord を使います(使える値: ${usable.join("、")})。`,
  // W-B1
  presetWrongType: (line: number | null, key: string): string => `${head(line)}${key} は文字列で書いてください。配色は nord を使います。`,
  // W-B5
  colorsNotTable: (line: number | null): string => `${head(line)}colors は [colors] の表で書いてください。配色の色をそのまま使います。`,
  // W-B2: `list` is like `folder(12 行目), file(13 行目)` (cut after 5 items by `limitList`).
  colorsUnparsable: (n: number, list: string): string => `config.toml の [colors] の色 ${n} 件を解釈できないため、配色の色を使います: ${list}。`,
  // W-B3 / W-B4: the default and the range come from the back end.
  fontSize: (line: number | null, def: number, min: number, max: number): string =>
    `${head(line)}[font] の size を解釈できないため、既定の ${def} を使います(${min}〜${max} の整数)。`,
  layoutValue: (line: number | null, key: string, def: number, min: number, max: number): string =>
    `${head(line)}${key} を解釈できないため、既定の ${def} を使います(${min}〜${max} の整数)。`,
  // W-B6
  fontFamily: (line: number | null): string =>
    `${head(line)}[font] の family を解釈できないため、既定のフォントを使います(文字列か文字列の配列。制御文字は使えません)。`,
  // W-B7
  notTable: (line: number | null, key: string): string => `${head(line)}${key} は [${key}] の表で書いてください。既定の値を使います。`,
  // W-B9: `names` is like `"A?B"、"  "` (already quoted and joined).
  fontFamilyElements: (line: number | null, names: string): string =>
    `${head(line)}[font] の family の ${names} は使えないため除きます(制御文字を含む名前・空白だけの名前は使えません)。`,
  quoteName: (name: string): string => `"${name}"`,
  nameSeparator: "、",
  // W-B8: `list` is like `name(3 行目、preset を使います)` (cut after 5 items by `limitList`).
  unusedSettings: (n: number, list: string): string => `config.toml の使われない設定 ${n} 件があります: ${list}。`,
  unusedItem: (name: string, line: number | null, used: string): string =>
    line === null ? `${name}(${used} を使います)` : `${name}(${line} 行目、${used} を使います)`,
  colorItem: (name: string, line: number | null): string => (line === null ? name : `${name}(${line} 行目)`),
  // Shared with the other lists: `ほか {m} 件` is COMMON.listRest.
  listRest: COMMON.listRest,
} as const;
