// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `routes/` (status-bar fixed items, the list-error prefix, the progress dialog's cancelling label, the viewer
// window's placeholder, the overlay aria-labels). Pure strings and pure templates only; imports only
// `$lib/shared/messages`.

export const ROUTE_MESSAGES = {
  // status bar (R-971 #1~#5)
  statusFocus: "フォーカス: ",
  statusSort: "並び替え: ",
  statusSelected: "選択: ",
  statusHidden: "隠し: ",
  statusOn: "オン",
  statusOff: "オフ",
  statusFilter: "絞り込み: ",

  // ProgressDialog.svelte
  cancelling: "キャンセル中…",

  // viewer window (W-50)
  viewerNoFile: "ファイルが選択されていません",
} as const;

// W-13: the list-error prefix (the body is the message built by list-state).
export function listErrorText(message: string): string {
  return `エラー: ${message}`;
}
