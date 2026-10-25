// SPEC-0300-0020 R-1330 / R-1330-1 / R-1331 / SPEC-0200-0001 §3.14.1-6. Pure.
// The shortcut table of the menu bar: the keymap's CURRENT bindings (the default keymap with `input_keymap_custom` applied, an invalid
// override falling back to the default as `resolveBinding` does), each in the keymap's normal form, joined with ",". Only routes may
// use both the keyboard feature (resolve + normalise) and the menu-bar feature (which only formats the injected strings).

import { DEFAULT_KEYMAP } from "$lib/features/keyboard/keymap-defaults";
import { normalizeKeyString, resolveBinding } from "$lib/features/keyboard/keymap-resolve";
import type { ItemId } from "$lib/features/menu-bar/menu-model";

// Items that run a keymap action of the same id. `os_open` is a fixed key and `copy_path` has no key (R-1331).
// `config_open` runs the `settings` action (below) and `config_check` has no key (SPEC-0300-0022 R-1670).
const ACTION_ITEMS: readonly ItemId[] = [
  "open", "new_file", "new_folder", "rename", "delete", "zip_create", "zip_extract", "exit",
  "cut", "copy", "paste", "select_all", "clear_selection", "search",
  "toggle_tree", "toggle_hidden", "toggle_size", "toggle_time", "sort_menu",
  "go_parent", "focus_path", "history", "history_jump_list", "jump_add", "fuzzy_find_file",
];

// SPEC-0300-0010 §3.1 #2: Shift+Enter is a fixed key.
const OS_OPEN_FIXED = "Shift+Enter";

export function buildShortcutTable(customOverrides: Record<string, string>): Partial<Record<ItemId, string>> {
  const table: Partial<Record<ItemId, string>> = {};
  for (const id of ACTION_ITEMS) {
    const bindings = resolveBinding({ customOverrides, actionId: id, defaultBinding: DEFAULT_KEYMAP[id] ?? "" });
    table[id] = bindings.map(normalizeKeyString).join(",");
  }
  table.os_open = OS_OPEN_FIXED;
  // SPEC-0300-0022 R-1670: 設定ファイルを開く shows the CURRENT assignment of `settings` (menu-model falls back to Ctrl+, when empty, T-28).
  const settings = resolveBinding({ customOverrides, actionId: "settings", defaultBinding: DEFAULT_KEYMAP.settings ?? "" });
  table.config_open = settings.map(normalizeKeyString).join(",");
  return table;
}
