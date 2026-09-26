// SPEC-0300-0011 §10 (R-81, R-84, R-86): error-code translation and
// batch-failure-list formatting for display.

// R-84/R-86: translate a known error code to a human-readable message. An
// unrecognized code returns null so the caller can fall back to the raw
// message rather than displaying nothing. `permission_denied` has its own
// dedicated message, distinct from the generic `io_error` fallback.
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
};

export function translateErrorCode(code: string): string | null {
  return ERROR_TRANSLATIONS[code] ?? null;
}

export interface FailureEntry {
  path: string;
  code: string;
  message: string;
}

export interface FailureListResult {
  shown: FailureEntry[];
  truncated: boolean;
}

const MAX_SHOWN_FAILURES = 5;

// R-81: show at most the first 5 failures, with the rest indicated as
// truncated.
export function formatFailureList(failures: readonly FailureEntry[]): FailureListResult {
  return {
    shown: failures.slice(0, MAX_SHOWN_FAILURES),
    truncated: failures.length > MAX_SHOWN_FAILURES,
  };
}
