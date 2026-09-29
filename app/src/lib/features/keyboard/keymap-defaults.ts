// SPEC-0300-0010 §4 (R-20~R-27): default keymap data (action id set, the
// default binding table). This module owns *data only* — key-event
// resolution/dispatch logic lives in ./keymap-resolve.ts and
// ./key-dispatch.ts (SPEC-0200-0001 §4.3: keyboard only owns the
// key-to-command-id mapping, never the command implementations themselves).

// R-21: the full action id set (34 entries, after removing the 12
// scope-excluded actions per R-27/§4.4).
export const ACTION_IDS = [
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "page_up",
  "page_down",
  "select_toggle",
  "select_all",
  "clear_selection",
  "open",
  "go_parent",
  "exit",
  "settings",
  "help_keymap",
  "focus_path",
  "toggle_hidden",
  "toggle_tree",
  "copy",
  "cut",
  "paste",
  "delete",
  "rename",
  "new_file",
  "refresh",
  "search",
  "sort_menu",
  "history_jump_list",
  "jump_add",
  "new_folder",
  "history",
  "toggle_size",
  "toggle_time",
  "zip_create",
  "zip_extract",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

// R-27/§4.4: scope-excluded actions must never appear in ACTION_IDS or in
// the code/keymap (SPEC-0100-0005 R-08).
export const EXCLUDED_ACTION_IDS = [
  "undo",
  "redo",
  "duplicate",
  "prefix_date",
  "properties",
  "open_explorer",
  "open_cmd",
  "open_terminal_cmd",
  "open_terminal_powershell",
  "open_terminal_wsl",
  "open_vscode",
  "open_git_client",
  "jump_add_url", // SPEC-0300-0013 R-256 / SPEC-0300-0010 5th edition 4.4
] as const;

// §4.2 (8th ed., R-20-1): the single default keymap (all 34 actions). The
// profile concept is abolished; users change bindings only via custom
// overrides (R-30~R-32).
export const DEFAULT_KEYMAP: Record<string, string> = {
  move_up: "ArrowUp",
  move_down: "ArrowDown",
  move_left: "ArrowLeft",
  move_right: "ArrowRight",
  page_up: "PageUp",
  page_down: "PageDown",
  select_toggle: "Space",
  select_all: "Ctrl+A",
  clear_selection: "Escape",
  open: "Enter",
  go_parent: "Backspace",
  exit: "Ctrl+Q",
  // SPEC-0200-0001 §3.6.11.3 (MUST-86, 発注者決定 2026-09-27): the key BODY
  // is the word "Comma", not the literal "," character (eventKeyToken(",")
  // now maps to "Comma"; matchesHardcodedShortcut's literal was updated to
  // match).
  settings: "Ctrl+Comma",
  help_keymap: "F1",
  focus_path: "Ctrl+L",
  toggle_hidden: "Ctrl+H",
  toggle_tree: "Ctrl+Shift+B",
  copy: "Ctrl+C",
  cut: "Ctrl+X",
  paste: "Ctrl+V",
  delete: "Delete",
  rename: "F2",
  new_file: "Ctrl+N",
  refresh: "F5",
  search: "/",
  sort_menu: "S",
  history_jump_list: "Ctrl+J",
  jump_add: "Ctrl+Shift+J",
  new_folder: "Ctrl+Shift+N",
  history: "Ctrl+Y",
  toggle_size: "Ctrl+Shift+S",
  toggle_time: "Ctrl+Shift+T",
  zip_create: "Ctrl+Alt+Z",
  zip_extract: "Ctrl+Alt+X",
};

// R-26/§4.2: actions implemented/verified in Phase 1 (SPEC-0300-0009 /
// SPEC-0300-0010). All other actions are defined but no-op until their
// implementation phase.
export const PHASE1_ACTION_IDS = [
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "page_up",
  "page_down",
  "select_toggle",
  "select_all",
  "clear_selection",
  "open",
  "go_parent",
  "exit",
  "toggle_hidden",
  "toggle_tree",
  "sort_menu",
  "toggle_size",
  "toggle_time",
] as const;
