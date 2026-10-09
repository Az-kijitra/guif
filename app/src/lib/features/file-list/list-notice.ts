// SPEC-0300-0009 第16版 R-26 / R-26-1 (SPEC-0200-0001 §3.13.15): pure decision for the `項目なし` notice on an empty
// file list. Priority: error -> loading -> empty. `error` is judged by truthiness, like the panel's `{#if error}`
// (an empty string means "no error").

export function shouldShowEmptyNotice(input: {
  loading: boolean;
  error: string | null;
  entryCount: number;
}): boolean {
  return !input.loading && !input.error && input.entryCount === 0;
}
