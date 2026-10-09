import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0009 第16版 R-26 (show `項目なし` when the render target is empty), R-26-1 (priority:
//   error -> loading -> empty notice), AC-649 (i)~(iv), AC-647 (a filter with 0 hits is the same path),
//   SPEC-0300-0019 W-16.
// Architecture: SPEC-0200-0001 §3.13.15: the pure decision function
//   `shouldShowEmptyNotice(input: { loading: boolean; error: string | null; entryCount: number }): boolean`
//   in `features/file-list/list-notice.ts` (no DOM, no runes). `FileListPanel.svelte` passes
//   `entryCount: entries.length` where `entries` is already the filtered list (`filteredEntries`).
//   The truthiness of `error` is the same as the `{#if error}` in the panel (an empty string means "no error").
//
// Module under test: ./list-notice.ts

import { shouldShowEmptyNotice } from "./list-notice";

describe("shouldShowEmptyNotice: AC-649 (i)~(iv)", () => {
  it("(i) loading with 0 entries -> false (R-26-1: the loading notice wins)", () => {
    expect(shouldShowEmptyNotice({ loading: true, error: null, entryCount: 0 })).toBe(false);
  });

  it("(ii) an error with 0 entries -> false (R-26-1: the error notice wins)", () => {
    expect(shouldShowEmptyNotice({ loading: false, error: "エラー: 対象が見つかりません。", entryCount: 0 })).toBe(false);
  });

  it("(iii) loaded, no error, 0 entries -> true (the ONLY case that shows `項目なし`)", () => {
    expect(shouldShowEmptyNotice({ loading: false, error: null, entryCount: 0 })).toBe(true);
  });

  it("(iv) 1 or more entries -> false", () => {
    expect(shouldShowEmptyNotice({ loading: false, error: null, entryCount: 1 })).toBe(false);
    expect(shouldShowEmptyNotice({ loading: false, error: null, entryCount: 250 })).toBe(false);
  });
});

describe("shouldShowEmptyNotice: the remaining combinations", () => {
  it("an empty-string error counts as 'no error' (same truthiness as the panel's `{#if error}`)", () => {
    expect(shouldShowEmptyNotice({ loading: false, error: "", entryCount: 0 })).toBe(true);
  });

  it("loading AND an error with 0 entries -> false", () => {
    expect(shouldShowEmptyNotice({ loading: true, error: "x", entryCount: 0 })).toBe(false);
  });

  it("loading with entries already shown -> false; an error with entries -> false", () => {
    expect(shouldShowEmptyNotice({ loading: true, error: null, entryCount: 3 })).toBe(false);
    expect(shouldShowEmptyNotice({ loading: false, error: "x", entryCount: 3 })).toBe(false);
  });

  it("AC-647: a filter that leaves 0 rows is just entryCount 0 -> true; clearing the filter (2 rows) -> false", () => {
    expect(shouldShowEmptyNotice({ loading: false, error: null, entryCount: 0 })).toBe(true);
    expect(shouldShowEmptyNotice({ loading: false, error: null, entryCount: 2 })).toBe(false);
  });

  it("is a pure function (same input, same output; the input object is not modified)", () => {
    const input = { loading: false, error: null, entryCount: 0 };
    const copy = { ...input };
    expect(shouldShowEmptyNotice(input)).toBe(shouldShowEmptyNotice(input));
    expect(input).toEqual(copy);
  });
});
