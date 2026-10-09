// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/archive/` (ZIP dialogs, progress, result reports, the ZIP error-code table, controller messages).
// Pure strings and pure templates only; which message to show is decided by the caller (P3 / P7).
// Imports only `$lib/shared/messages`.

import { COMMON, OPERATION_NAMES, SHARED_SENTENCES } from "$lib/shared/messages";

export const ARCHIVE_MESSAGES = {
  // create / extract forms
  createTitle: OPERATION_NAMES.zipCompress, // W-40
  createCountLine: (count: number): string => `対象: ${count}件`,
  createOutputLabel: "出力先",
  createSubmit: "圧縮", // W-41
  extractTitle: OPERATION_NAMES.zipExtract, // W-42
  extractZipLine: (zipPath: string): string => `ZIP: ${zipPath}`,
  extractDestinationLabel: "展開先",
  extractSubmit: "展開",
  cancel: COMMON.cancel,

  // overwrite confirmation (output ZIP already exists)
  overwriteZipTitle: "同じ名前のZIPがあります",
  existsLine: (name: string): string => `「${name}」はすでに存在します。`,
  overwriteQuestion: "上書きしますか?",
  overwrite: COMMON.overwrite,

  // entry conflict confirmation (extract)
  conflictTitle: "同じ名前のファイルがあります",
  conflictReplace: "上書きすると、既存のファイルが置き換えられます。",
  conflictCount: (total: number): string => `(競合: 全${total}件)`,
  skip: COMMON.skip,
  applyToAll: COMMON.applyToAll,
  close: COMMON.close,

  // progress
  progressCreateTitle: OPERATION_NAMES.zipCompress, // W-42
  progressExtractTitle: OPERATION_NAMES.zipExtract, // W-42
  progressCreateVerb: "圧縮中", // W-43
  progressExtractVerb: "展開中",
  progressLabel: (verb: string, name: string, index: number, total: number): string =>
    `${verb} ${name} (${index}/${total})`,
  preparing: "準備中…",

  // controller messages
  busy: "別のZIP操作を実行中です",
  noTarget: SHARED_SENTENCES.noTarget,
  extractOneAtATime: SHARED_SENTENCES.extractOneAtATime,
  notZipFile: SHARED_SENTENCES.notZipFile,
  blankOutput: "出力パスを入力してください",
  blankDestination: "展開先を入力してください",

  // result reports
  createCanceled: "ZIPへの圧縮をキャンセルしました", // W-45
  extractCanceled: "ZIPの展開をキャンセルしました", // W-49 (one definition for result-report.ts and archive-controller.ts)
  skippedLinks: (count: number): string => `(リンク${count}件をスキップ)`,
  createSuccess: (name: string, skippedLinks: string): string => `${name} を作成しました${skippedLinks}`,
  createFailedTitle: "ZIPに圧縮できませんでした", // W-44
  extractFailedTitle: "ZIPを展開できませんでした", // W-48 (all three failure paths use this one title)
  skippedFiles: (count: number): string => `(${count}件をスキップ)`,
  extractSuccess: (destination: string, extracted: number, skipSuffix: string): string =>
    `${destination} に${extracted}件を展開しました${skipSuffix}`,
  extractPartiallyCanceled: (extracted: number, total: number, destination: string): string =>
    `ZIPの展開を途中でキャンセルしました(${extracted}/${total}件を ${destination} に展開済み)`,
  extractPartialLine: (extracted: number, total: number): string => `途中まで展開しました(${extracted}/${total}件)。`,
  extractDestinationLine: (destination: string): string => `展開先: ${destination}`,
  extractedFilesRemain: "展開済みのファイルは残っています。",

  // error formatting
  targetPart: (entryPath: string): string => `対象: ${entryPath}`,
  detailPart: (message: string): string => `${COMMON.detailPrefix}${message}`,
  nothingWritten: " 何も書き込まれていません。",
} as const;

// ZIP error-code table (translated by `translateArchiveErrorCode` in error-format.ts; W-25).
export const ARCHIVE_ERROR_MESSAGES: Record<string, string> = {
  no_items: "対象が指定されていません。",
  not_found: "対象が見つかりません。",
  invalid_path: "パスが正しくありません。",
  invalid_name: "名前に使用できない文字、または長すぎる名前が含まれています。",
  already_exists: "同じ名前の項目がすでに存在します。",
  destination_inside_source: "出力先がZIPにする対象の内部にあります。",
  destination_not_found: "出力先のフォルダーが見つかりません。",
  destination_not_dir: "展開先がフォルダーではありません。",
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
