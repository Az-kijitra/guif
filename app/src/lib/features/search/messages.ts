// SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (SPEC-0300-0019 R-1201): the on-screen wording used only by
// `features/search/`. Pure strings only.

export const SEARCH_MESSAGES = {
  inputLabel: "検索", // W-02 (aria-label of the input)
  regexToggleLabel: "正規表現", // W-03 (aria-label of the `.*` toggle)
  apply: "適用", // W-04
  clear: "クリア", // W-05
  invalidRegex: "正規表現が不正です", // R-113-4
} as const;
