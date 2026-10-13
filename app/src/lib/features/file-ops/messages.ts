// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/file-ops/` (dialogs, status messages, progress titles, result reports, clipboard notices).
// Pure strings and pure templates only; which message to show is decided by the caller.
// Imports only `$lib/shared/messages`.

import { COMMON, OPERATION_NAMES, SHARED_SENTENCES } from "$lib/shared/messages";

export const FILE_OPS_MESSAGES = {
  busy: "別のファイル操作を実行中です",
  blankName: "名前を入力してください",
  noPasteItems: SHARED_SENTENCES.noPasteItems,

  // conflict dialog (paste)
  conflictTitle: "同じ名前の項目があります",
  conflictExists: (name: string): string => `「${name}」はすでに存在します。`,
  conflictFolderMerge: "上書きすると、フォルダーはマージ(同名ファイルは置換)されます。", // W-25
  conflictCount: (total: number): string => `(競合: 全${total}件)`,

  // progress dialog
  progressMovePrefix: "移動中",
  progressCopyPrefix: "コピー中",
  progressMoveTitle: "移動",
  progressCopyTitle: OPERATION_NAMES.copy,

  // delete confirmation
  deleteHeadSingle: (name: string): string => `「${name}」`,
  deleteHeadMany: (count: number): string => `${count}件の項目`,
  deletePermanentLine: (head: string): string => `${head}を完全に削除します。`,
  deleteTrashLine: (head: string): string => `${head}をごみ箱に移動します。`,
  deleteMoreMark: "…",
  deleteIrreversible: "この操作は取り消せません。",
  deletePermanentTitle: "完全に削除",
  deleteConfirmTitle: "削除の確認",
  deletePermanentButton: "完全に削除する",
  deleteTrashButton: "削除する",

  // rename
  renameOneAtATime: SHARED_SENTENCES.renameOneAtATime,
  renameTitle: OPERATION_NAMES.rename,
  renameNameLabel: COMMON.name,
  renameSubmit: "変更", // W-15

  // new file / new folder
  createTitle: "新規作成",
  createKindLabel: "種別",
  createKindFile: "ファイル",
  createKindFolder: "フォルダー", // W-25
  createNameLabel: COMMON.name,
  createSubmit: "作成",
} as const;

// result-report.ts: batch summary -> status text.
export const RESULT_REPORT_MESSAGES = {
  verbCopy: OPERATION_NAMES.copy,
  verbMove: "移動",
  verbDelete: OPERATION_NAMES.delete,
  skippedSuffix: (skipped: number): string => `(${skipped}件スキップ)`,
  success: (ok: number, verb: string, skippedSuffix: string): string => `${ok}件を${verb}しました${skippedSuffix}`,
  canceled: (ok: number): string => `キャンセルしました(${ok}件完了)`,
  failedStatus: (ok: number, verb: string, failed: number): string =>
    `${ok}件を${verb}しました。${failed}件は失敗しました`,
  failedTitle: (verb: string): string => `${verb}できなかった項目`,
  moreFailures: (rest: number): string => `ほか${rest}件…`,
} as const;

// clipboard-messages.ts: CB-06 / CB-13 status texts.
export const CLIPBOARD_MESSAGES = {
  noticeCutChanged: "(切り取りの後にクリップボードが変わったため、コピーしました)",
  noticeCutWriteFailed: "(切り取りをOSのクリップボードに書き込めなかったため、コピーしました)",
  verbCut: "切り取りました",
  verbCopy: "コピーしました",
  countWithVerb: (count: number, verb: string): string => `${count}件を${verb}`,
  osWriteFailed: "(OSのクリップボードには書き込めませんでした)",
} as const;
