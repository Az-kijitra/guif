// SPEC-0200-0001 §3.13.2 / §3.13.7 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only
// by `features/keyboard/` (the keymap-load notice). Pure strings and pure templates only; which one to use is
// decided by `keymap-notice.ts`.

import { COMMON } from "$lib/shared/messages";

export const KEYMAP_MESSAGES = {
  // W-30 / W-31. `at` is `config.toml を` or `config.toml の N 行目を` (see `readTarget`); `closing` is one of the two closing sentences.
  readTarget: (line: number | null): string => (line !== null ? `config.toml の ${line} 行目を` : "config.toml を"),
  readFailed: (target: string, closing: string, message: string): string =>
    `${target}読み込めなかったため、${closing} ${COMMON.detailPrefix}${message}`,
  closingKeymapOnly: "既定のキー割り当てを使います。",
  closingKeymapAndTheme: "既定のキー割り当て、テーマ(OS の設定に従う)、外部アプリの既定の登録を使います。", // W-31 (SPEC-0300-0019 第3版)
  // W-30-2: input_keymap_custom is not a table (no detail, the theme is not touched)
  customKeymapUnreadable: "config.toml の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。",
  // W-30-2 with the line (SPEC-0300-0019 第5版)
  customKeymapUnreadableAt: (line: number): string =>
    `config.toml の ${line} 行目の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。`,
  // W-32: `list` is like `copy(12 行目), undo` (cut after 5 items by `limitList`; SPEC-0300-0022 R-1662).
  invalidOverrides: (count: number, list: string): string => `config.toml の不正なキー割り当て ${count} 件を無視しました: ${list}。`,
  // One W-32 item with its line: `copy(12 行目)`.
  idAtLine: (id: string, line: number): string => `${id}(${line} 行目)`,
} as const;
