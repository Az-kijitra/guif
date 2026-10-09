// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/viewer/` (the viewer error-code table). Pure strings only; `formatViewerError` in error-format.ts keeps
// the lookup (P7). 

// The keys are the `ViewerDisplayErrorCode` values (checked in error-format.ts by `Record<ViewerDisplayErrorCode, string>`).
export const VIEWER_ERROR_MESSAGES = {
  not_found: "ファイルが見つかりません。",
  not_a_file: "フォルダーは表示できません。", // W-25
  permission_denied: "アクセス権がないため開けません。",
  viewer_path_not_allowed: "このファイルは読み込めません。",
  viewer_image_too_large: "画像が大きすぎるため表示できません(上限 50 MiB)。",
  image_decode_failed: "画像を表示できません。",
  unsupported_kind: "このファイルはビューアで表示できません。",
  io_error: "読み込み中にエラーが発生しました。",
  invalid_path: "パスが正しくありません。",
  unknown: "不明なエラーが発生しました。",
} as const;

export const VIEWER_FALLBACK = "エラーが発生しました。";
