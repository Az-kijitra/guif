// SPEC-0300-0019 第5版 §4.9 W-A2~W-AD / SPEC-0300-0022 §8.1 / SPEC-0200-0001 §3.17.8 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/settings-file/` (the open result, the check result, the unknown-settings notice). W-A0 / W-A1 (the menu item names) are in
// `features/menu-bar/messages.ts` (ITEM_LABELS). Pure strings and pure templates only.
// `config.toml`, `config.sample.toml` and `VS Code` are not translated (R-1203 4). The back end sends codes and the OS text only (R-1201 2);
// `{message}` is the OS text as it is (R-1204).

import { COMMON } from "$lib/shared/messages";

export const SETTINGS_FILE_MESSAGES = {
  // W-A2: a success has no full stop, like the other success status messages.
  openedWithVsCode: "config.toml を VS Code で開きました",
  // W-A3
  openedByAssociation: "VS Code が見つからないため、Windows の関連付けで config.toml を開きます",
  // W-A4: placed in front of W-A2 / W-A3 / W-A5 / W-A7 / W-AD with no separator.
  templateCreated: "config.toml を作成しました。",
  // W-A5
  openFailed: (message: string): string => `config.toml を開けませんでした。 ${COMMON.detailPrefix}${message}`,
  // W-A6
  templateFailed: (message: string): string => `config.toml を作成できませんでした。 ${COMMON.detailPrefix}${message}`,
  // W-A7 (debug builds only)
  outOfScope: "config.toml を開けませんでした。テスト用の範囲の外です。",
  // W-A8: after the result, one half-width space in front.
  sampleFailed: (message: string): string => `config.sample.toml を書き出せませんでした。 ${COMMON.detailPrefix}${message}`,
  // W-A9: the prefix of a check result (with its trailing half-width space).
  checkPrefix: "設定ファイルのチェック(次の起動での扱い): ",
  // W-AA
  checkOk: "問題はありません。変更は再起動で反映されます",
  // W-AB
  checkNoFile: "config.toml がないため、既定の設定を使います。",
  // W-AC: `list` is like `ui_them(2 行目), external_apps の 2 番目の agrs(18 行目)` (cut after 5 items by `limitList`).
  unknownSettings: (n: number, list: string): string => `config.toml の不明な設定 ${n} 件を無視しました: ${list}。`,
  unknownKey: (name: string): string => name,
  // SPEC-0300-0023 AC-1756 (SPEC-0300-0019 第6版 W-AC): a key inside [theme] / [colors] / [font] / [layout].
  unknownTableKey: (table: string, name: string): string => `[${table}] の ${name}`,
  unknownAppField: (position: number, name: string): string => `external_apps の ${position} 番目の ${name}`,
  atLine: (line: number): string => `(${line} 行目)`,
  // W-AD
  notAFile: "config.toml を開けませんでした。ファイルではありません。",
} as const;
