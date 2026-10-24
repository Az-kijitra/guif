// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/file-list/`. Pure strings only; imports at most `$lib/shared/messages` (never another feature).

// W-06: sort-key names. The key type is a literal union (not `SortKey`) so this module imports no sibling;
// `sort.ts` checks it with `satisfies Record<SortKey, string>`.
export const SORT_KEY_LABELS: Record<"name" | "size" | "type" | "modified", string> = {
  name: "名前",
  size: "サイズ",
  type: "種類",
  modified: "更新日時",
};

// SPEC-0300-0019 第6版 W-C0 / W-C1 (SPEC-0300-0023 R-1763 / R-1764 / R-1795): the headings of the two frames.
export const PANE_MESSAGES = {
  // W-C0: `ファイル (78 件) [並び: 種類 昇順]`; `key` is a W-06 name.
  listHeading: (count: number, key: string, order: "asc" | "desc"): string =>
    `ファイル (${count} 件) [並び: ${key} ${order === "asc" ? "昇順" : "降順"}]`,
  // R-1795: markers for hidden columns, in the heading (in front of / behind the text).
  hiddenLeft: "◀ ",
  hiddenRight: " ▶",
  // W-C1
  treeHeading: "ドライブ / ツリー",
} as const;

// W-11: tree node toggle (aria-label of the caret).
export const TREE_MESSAGES = {
  collapse: "折りたたみ", // W-11
  expand: "展開", // W-11
} as const;

// W-34 / W-35: notices.
export const FILE_LIST_NOTICES = {
  someFoldersNotListed: "一部のフォルダーの中身を読み込めませんでした。", // W-34
  displaySettingsCorrupted: "ui-state.toml を読み込めなかったため、表示の設定を既定に戻しました。元のファイルは退避しました。", // W-35 (R-77-3)
} as const;
