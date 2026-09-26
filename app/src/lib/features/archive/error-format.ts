// SPEC-0300-0014 R-394/R-395: translation of the backend's machine-readable
// error codes. The translation lives ONLY here (SPEC-0200-0001 §3.4.1); the
// Rust side returns codes and the library message. Not shared with
// features/file-ops (§4.1). There is no password-related code (R-390-1).

const ERROR_TRANSLATIONS: Record<string, string> = {
  no_items: "対象が指定されていません。",
  not_found: "対象が見つかりません。",
  invalid_path: "パスが正しくありません。",
  invalid_name: "名前に使用できない文字、または長すぎる名前が含まれています。",
  already_exists: "同じ名前の項目がすでに存在します。",
  destination_inside_source: "出力先がZIPにする対象の内部にあります。",
  destination_not_found: "出力先のフォルダが見つかりません。",
  destination_not_dir: "展開先がフォルダではありません。",
  zip_corrupt: "ZIPファイルが壊れているか、読み取れません。",
  zip_unsupported: "この形式のZIPには対応していません。",
  zip_encrypted: "暗号化されたZIPは展開できません。",
  zip_entry_rejected: "安全でない、または重複するエントリが含まれているため展開できません。",
  zip_too_large: "ZIPが大きすぎる(エントリ数または展開後のサイズが上限を超えている)ため処理できません。",
  insufficient_space: "空き容量が足りません。",
  conflict: "同名の項目がすでに存在するため処理を中止しました。",
  permission_denied: "権限がないため操作を実行できませんでした。",
  io_error: "入出力エラーが発生しました。",
  unknown: "不明なエラーが発生しました。",
  canceled: "操作はキャンセルされました。",
};

// R-394: an unrecognised code has no translation so the caller falls back to
// the original message.
export function translateArchiveErrorCode(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(ERROR_TRANSLATIONS, code) ? ERROR_TRANSLATIONS[code] : null;
}

export interface ArchiveErrorLike {
  code: string;
  message: string;
  entryPath?: string;
}

// R-395-1/R-395-4: translation + the offending path + the library message as
// a detail (never lost, never repeated when it is just the bare code).
export function formatArchiveError(e: ArchiveErrorLike): string {
  const translated = translateArchiveErrorCode(e.code);
  const message = e.message ?? "";
  const parts: string[] = [];
  if (translated !== null) {
    parts.push(translated);
  } else {
    parts.push(message !== "" ? message : e.code);
  }
  if (e.entryPath !== undefined && e.entryPath !== "") parts.push(`対象: ${e.entryPath}`);
  if (translated !== null && message !== "" && message !== e.code) parts.push(`詳細: ${message}`);
  return parts.join(" ");
}

// R-395-1: a pre-validation rejection - tell the user nothing was written.
export function formatPreflightError(e: ArchiveErrorLike): string {
  return `${formatArchiveError(e)} 何も書き込まれていません。`;
}
