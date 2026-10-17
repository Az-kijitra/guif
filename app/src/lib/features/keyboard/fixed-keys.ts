// SPEC-0300-0021 R-1551 1 / SPEC-0200-0001 §3.16.6, §3.16.15 SHOULD-218: the FIXED keys a registration may not use (SPEC-0300-0010 §3.1).
// `Shift+Enter` / `Shift+Delete` are caught by the R-34 rescue match of `open` / `delete` by default, and are listed explicitly so that
// remapping those actions does not free them (design question Q-5). The list is in the normal form of `keymap-resolve.ts` and is tested
// against `matchesHardcodedShortcut` / `matchesMenuBarActivation` so that a drift is detected.

export const RESERVED_FIXED_KEYS: readonly string[] = [
  "Ctrl+Q",
  "Ctrl+Comma",
  "Shift+Enter",
  "Shift+Delete",
  "Tab",
  "Shift+Tab",
  "F10",
  "Alt+F",
  "Alt+E",
  "Alt+V",
  "Alt+G",
];

// The four keys that have no predicate of their own (they are not hard-coded shortcuts or menu bar activation keys).
export const FIXED_KEYS_WITHOUT_PREDICATE: readonly string[] = ["Shift+Enter", "Shift+Delete", "Tab", "Shift+Tab"];
