// SPEC-0300-0019 第2版 §4.7 W-60~W-88 / SPEC-0200-0001 §3.14.1-1 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/menu-bar/` (the bar's aria-label, the headings, the item names). Pure strings and pure templates only; which one to
// show is decided by `menu-model.ts`. Imports only `$lib/shared/messages`.
// The reasons of a disabled item are NOT here: they are the shared constants the key operations use (SHARED_SENTENCES, AC-1314).

import { OPERATION_NAMES } from "$lib/shared/messages";

// W-60
export const MENU_BAR_LABEL = "メニューバー";

// W-61~W-64: the heading name (also the dropdown's aria-label) and its access key (T-04).
export const MENU_HEADINGS = {
  file: { name: "ファイル", accessKey: "F" },
  edit: { name: "編集", accessKey: "E" },
  view: { name: "表示", accessKey: "V" },
  go: { name: "移動", accessKey: "G" },
} as const;

// The visible heading text, e.g. `ファイル(F)` (the letter is underlined by CSS in the component).
export function headingLabel(name: string, accessKey: string): string {
  return `${name}(${accessKey})`;
}

// W-65~W-88: the item names. The keys are the `ItemId` values (checked in menu-model.ts by `Record<ItemId, string>`).
export const ITEM_LABELS = {
  open: "開く",
  os_open: "OSの関連付けで開く",
  new_file: "新規作成…",
  new_folder: "新しいフォルダー…",
  rename: OPERATION_NAMES.rename,
  delete: OPERATION_NAMES.delete,
  zip_create: OPERATION_NAMES.zipCompress,
  zip_extract: OPERATION_NAMES.zipExtract,
  exit: "終了",
  cut: OPERATION_NAMES.cut,
  copy: OPERATION_NAMES.copy,
  paste: OPERATION_NAMES.paste,
  copy_path: "パスのコピー",
  select_all: "すべて選択",
  clear_selection: "選択の解除",
  search: "検索",
  toggle_tree: "ツリー",
  toggle_hidden: "隠しファイル",
  toggle_size: "サイズの列",
  toggle_time: "更新日時の列",
  sort_menu: "並び替え…",
  go_parent: "親フォルダーへ",
  focus_path: "パス欄へ移動",
  history: "履歴",
  history_jump_list: "ジャンプリスト",
  jump_add: "ジャンプリストに追加",
} as const;
