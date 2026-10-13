// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording that is
// shared by more than one feature (or by routes and a feature). A LEAF module: it imports nothing.
// Pure strings and pure template functions only -- which message to show is decided by the caller.
//
// Stage C (SPEC-0300-0019 W-01~W-55): the wording is Japanese and follows the R-1220 term table.

// R-1220 terms.
export const OPERATION_NAMES = {
  cut: "切り取り", // R-1220
  copy: "コピー", // R-1220
  paste: "貼り付け", // R-1220
  rename: "名前の変更", // R-1220
  delete: "削除", // R-1220
  zipCompress: "ZIPに圧縮", // R-1220 / W-40
  zipExtract: "ZIPを展開", // R-1220 / W-42
} as const;

// Names of the focus areas / regions (status bar W-23 / W-24; aria-labels in stage C).
export const REGION_NAMES = {
  dialog: "ダイアログ",
  history: "履歴", // W-09 / W-23
  jumpList: "ジャンプリスト",
  sortMenu: "並び替えメニュー", // W-24 / W-27
  contextMenu: "右クリックメニュー",
  path: "パス", // W-07
  search: "検索", // W-02
  tree: "ツリー",
  list: "一覧",
  menuBar: "メニュー", // W-89
  none: "なし",
} as const;

// Common words used by several features.
export const COMMON = {
  cancel: "キャンセル",
  close: "閉じる",
  overwrite: "上書き",
  skip: "スキップ",
  applyToAll: "すべてに適用",
  name: "名前", // the label of the name input field
  loading: "読み込み中…", // W-12 / W-51
  noItems: "項目なし", // W-14 / W-16
  detailPrefix: "詳細: ", // R-1204
} as const;

// Sentences that more than one feature shows.
export const SHARED_SENTENCES = {
  noTarget: "対象がありません",
  noSelection: "選択がありません",
  notZipFile: "ZIPファイルではありません",
  extractOneAtATime: "展開は1件ずつ指定してください",
  renameOneAtATime: "名前の変更は1件ずつ行えます", // SPEC-0300-0020 R-1320 (shared with the menu bar)
  noPasteItems: "貼り付ける項目がありません",
  folderNotAllowed: "フォルダーには使えません", // W-25
} as const;

// W-25: the file-operation error-code table (read by `translateErrorCode` in shared/error-text.ts).
export const FILE_OP_ERROR_MESSAGES: Record<string, string> = {
  invalid_name: "名前に使用できない文字が含まれています。",
  invalid_kind: "種別が不正です。",
  parent_not_found: "作成先のフォルダーが見つかりません。",
  already_exists: "同じ名前の項目がすでに存在します。",
  same_path: "コピー元と貼り付け先が同じです。",
  not_found: "対象が見つかりません。",
  invalid_path: "パスが正しくありません。",
  no_items: "対象が選択されていません。",
  destination_not_found: "宛先フォルダーが見つかりません。",
  destination_not_dir: "宛先がフォルダーではありません。",
  destination_inside_source: "宛先がコピー元の内部にあります。",
  overwrite_ancestor: "コピー先の上位フォルダーを上書きすることはできません。",
  permission_denied: "権限がないため操作を実行できませんでした。",
  conflict: "同名の項目がすでに存在するため処理を中止しました。",
  io_error: "入出力エラーが発生しました。",
  unknown: "不明なエラーが発生しました。",
  canceled: "操作はキャンセルされました。",
  // SPEC-0300-0016 R-731-1.
  not_a_directory: "フォルダーではありません。",
};

// Notices produced by shared modules.
export const SHARED_NOTICES = {
  // W-33
  themeInvalid: 'config.toml の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。',
  // W-36 (R-242 item 3)
  navigationCorrupted: "navigation.toml を読み込めなかったため、履歴・ジャンプリスト・検索履歴を空にしました。元のファイルは退避しました。",
  // W-37
  navigationSaveFailed: "履歴・ジャンプリスト・検索履歴を保存できませんでした。",
  // W-38
  loadFailed: "保存データを読み込めなかったため、今回の変更は保存しません。",
} as const;
