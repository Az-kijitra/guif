// SPEC-0300-0015 R-447, R-513: the ONLY place that translates a viewer error
// code into a user-facing string (SPEC-0200-0001 §3.5.7/§3.5.9). The Rust
// `ViewerErrorCode` enum is not shared across the IPC boundary -- only the
// wire strings are kept consistent (SPEC-0300-0011 第6版 R-85, ISS-0128).

export type ViewerDisplayErrorCode =
  | "not_found"
  | "not_a_file"
  | "permission_denied"
  | "viewer_path_not_allowed"
  | "viewer_image_too_large"
  | "image_decode_failed" // R-485 (frontend-only: <img> failed to decode)
  | "unsupported_kind" // R-493 (frontend-only: navigated to an OS-open file)
  | "io_error"
  | "invalid_path" // R-89-2 / R-447: a path argument that is not absolute (same wording as shared/error-text.ts)
  | "unknown";

const MESSAGES: Record<ViewerDisplayErrorCode, string> = {
  not_found: "ファイルが見つかりません。",
  not_a_file: "フォルダは表示できません。",
  permission_denied: "アクセス権がないため開けません。",
  viewer_path_not_allowed: "このファイルは読み込めません。",
  viewer_image_too_large: "画像が大きすぎるため表示できません(上限 50 MiB)。",
  image_decode_failed: "画像を表示できません。",
  unsupported_kind: "このファイルはビューアで表示できません。",
  io_error: "読み込み中にエラーが発生しました。",
  invalid_path: "パスが正しくありません。",
  unknown: "不明なエラーが発生しました。",
};

const FALLBACK = "エラーが発生しました。";

// R-447: never leaks the internal `code=<code>; <message>` representation
// (or the raw code string itself) into the display text; an unrecognized
// code (a future backend addition this build does not know) still returns a
// safe string instead of throwing.
export function formatViewerError(code: ViewerDisplayErrorCode): string {
  return MESSAGES[code] ?? FALLBACK;
}
