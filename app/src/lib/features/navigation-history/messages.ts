// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/navigation-history/`. Pure strings and pure templates only.

export const NAVIGATION_HISTORY_MESSAGES = {
  removeItem: (path: string): string => `${path} を一覧から削除`, // W-10 (aria-label of the delete button)
  addedJump: (path: string): string => `ジャンプリストに追加しました: ${path}`,
} as const;
