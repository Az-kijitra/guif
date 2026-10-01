// SPEC-0200-0001 §3.7.10.2(c) (architecture-guardian 16th audit, MUST-98(c)):
// the R-731/R-84/R-86 error-code -> Japanese message table, extracted from
// `features/file-ops/error-format.ts` (SHOULD-129's `path-key` extraction is
// the precedent) so `features/path-bar/` and `features/file-list/` can both
// translate a code WITHOUT a feature-to-feature import (§4.1).
// `features/file-ops/error-format.ts` re-exports `translateErrorCode`.

const ERROR_TRANSLATIONS: Record<string, string> = {
  invalid_name: "名前に使用できない文字が含まれています。",
  invalid_kind: "種別が不正です。",
  parent_not_found: "作成先のフォルダが見つかりません。",
  already_exists: "同じ名前の項目がすでに存在します。",
  same_path: "コピー元と貼り付け先が同じです。",
  not_found: "対象が見つかりません。",
  invalid_path: "パスが正しくありません。",
  no_items: "対象が選択されていません。",
  destination_not_found: "宛先フォルダが見つかりません。",
  destination_not_dir: "宛先がフォルダではありません。",
  destination_inside_source: "宛先がコピー元の内部にあります。",
  overwrite_ancestor: "コピー先の上位フォルダを上書きすることはできません。",
  permission_denied: "権限がないため操作を実行できませんでした。",
  conflict: "同名の項目がすでに存在するため処理を中止しました。",
  io_error: "入出力エラーが発生しました。",
  unknown: "不明なエラーが発生しました。",
  canceled: "操作はキャンセルされました。",
  // SPEC-0300-0016 R-731-1.
  not_a_directory: "フォルダーではありません。",
};

// R-84/R-86: an unrecognized code returns null so the caller can fall back to
// the raw message rather than displaying nothing.
export function translateErrorCode(code: string): string | null {
  return ERROR_TRANSLATIONS[code] ?? null;
}
