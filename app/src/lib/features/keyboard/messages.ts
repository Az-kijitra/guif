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
  closingKeymapAndTheme: "既定のキー割り当てとテーマ(OS の設定に従う)を使います。", // W-31
  // W-30-2: input_keymap_custom is not a table (no detail, the theme is not touched)
  customKeymapUnreadable: "config.toml の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。",
  // W-32
  invalidOverrides: (count: number, ids: readonly string[]): string =>
    `config.toml の不正なキー割り当て ${count} 件を無視しました: ${ids.join(", ")}。`,
} as const;
