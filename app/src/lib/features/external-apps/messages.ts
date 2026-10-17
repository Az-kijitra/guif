// SPEC-0300-0019 第3版 §4.8 W-90~W-9D / SPEC-0300-0021 §9 / SPEC-0200-0001 §3.16.6 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/external-apps/` (the names of the four default registrations, the launch results, the start-up notice sentences).
// Pure strings and pure templates only. W-9D is the shared "no target" sentence (SHARED_SENTENCES), reused and not copied here.
// The backend sends codes and raw values only (SPEC-0300-0019 R-1201 2); the sentences are built here.

// W-90~W-93 (R-1510-1): the display names of the default registrations, keyed by their number.
export const DEFAULT_APP_NAMES = {
  1: "ターミナルで開く",
  2: "VS Codeで開く",
  3: "エクスプローラーで開く",
  4: "GitHub Desktopで開く",
} as const satisfies Readonly<Record<1 | 2 | 3 | 4, string>>;

export const EXTERNAL_APP_MESSAGES = {
  // W-94: a success has no full stop, like the other success status messages.
  launched: (name: string): string => `「${name}」を起動しました`,
  // W-95: `program` is the EXPANDED value (R-1571).
  programNotFound: (name: string, program: string): string => `「${name}」を起動できませんでした。実行ファイルが見つかりません: ${program}。`,
  // W-96
  targetMissing: (name: string): string => `「${name}」を起動できませんでした。対象が見つかりません。`,
  // W-97: the OS text goes after the label untouched (R-1573): not translated, not trimmed, no full stop added.
  failed: (name: string, message: string): string => `「${name}」を起動できませんでした。 詳細: ${message}`,
  // W-98
  invalidPath: (name: string): string => `「${name}」を起動できませんでした。パスが正しくありません。`,
  // W-99
  outOfScope: (name: string): string => `「${name}」を起動できませんでした。テスト用の範囲の外です。`,
  // W-9A: `list` is like `3(VS Codeで開く), 21(上限を超えています)` (built by notice.ts).
  invalidRegistrations: (n: number, list: string): string => `config.toml の外部アプリの登録 ${n} 件を使いません: ${list}。`,
  // W-9B
  typeError: "config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。",
  // W-9C: `list` is like `ターミナルで開く: Ctrl+Alt+C, ...`.
  unusableKeys: (n: number, list: string): string => `外部アプリのキー ${n} 件は使いません(正しくないか、他の操作と重なっています): ${list}。`,
  // The reason shown in place of a name for a registration over the limit (R-1505).
  limitReason: "上限を超えています",
} as const;
