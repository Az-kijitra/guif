// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/context-menu/` (menu item names, disabled reasons, notices, copy-path status). Pure strings and pure
// templates only; which one to show is decided by `menu-model.ts`. Imports only `$lib/shared/messages`.

import { OPERATION_NAMES, SHARED_SENTENCES } from "$lib/shared/messages";

// Item names. The keys are the `MenuItemId` values (checked in menu-model.ts by `Record<MenuItemId, string>`).
export const MENU_ITEM_LABELS = {
  open: "開く",
  os_open: "OSの関連付けで開く",
  copy: OPERATION_NAMES.copy,
  cut: OPERATION_NAMES.cut,
  paste: OPERATION_NAMES.paste,
  copy_path: "パスのコピー",
  delete: OPERATION_NAMES.delete,
  rename: OPERATION_NAMES.rename,
  zip_create: OPERATION_NAMES.zipCompress,
  zip_extract: OPERATION_NAMES.zipExtract, // W-22
  new_file: "新規作成…", // W-26
} as const;

// Disabled reasons (R-1040).
export const MENU_REASONS = {
  oneOnly: "1件だけ選択してください",
  folder: SHARED_SENTENCES.folderNotAllowed, // W-25
  notZip: SHARED_SENTENCES.notZipFile,
  clipboardEmpty: "クリップボードが空です",
} as const;

// R-1056: execution-time notices.
export const MENU_NOTICES = {
  noSelection: SHARED_SENTENCES.noSelection,
  noTarget: SHARED_SENTENCES.noTarget,
  extractOneAtATime: SHARED_SENTENCES.extractOneAtATime,
} as const;

// copy-path-text.ts (R-1060-1~3).
export const COPY_PATH_MESSAGES = {
  failed: "パスをコピーできませんでした",
  copied: (count: number): string => `パスをコピーしました(${count} 件)`,
} as const;
