// Feature-local UI state for the search bar (SPEC-0200-0001 §5.1: not read by
// any other feature — SPEC-0300-0012 R-129 mandates that `features/search/`
// and `features/file-list/` never import one another; connection happens in
// routes/+page.svelte, §3.1.2). Mirrors the pattern used by
// features/file-list/list-state.svelte.ts (factory function + module-scope
// singleton).
//
// Owns active/query/regexMode/history (R-103, R-110~R-113, R-121/R-122).
// Deliberately does NOT own `filteredEntries`/`error` — those are derived by
// routes/+page.svelte from features/search/matching.ts (§3.1.2).

export type SearchAction = "cancel" | "confirm" | "history_prev" | "query_clear";

export function createSearchState() {
  let active = $state(false);
  let query = $state("");
  let regexMode = $state(false);
  // R-121/R-122: only the single most-recent confirmed query is kept (no
  // history stack).
  let history = $state<string | null>(null);
  // Raw onfocus/onblur-tracked value (non-public — see `inputFocused` below).
  let rawFocused = $state(false);

  // R-105/R-105-1/R-105-2: activates the search bar. Re-invoking while
  // already active does not reset the current query — this function never
  // touches `query`.
  function open(): void {
    active = true;
  }

  function setQuery(value: string): void {
    query = value;
  }

  function setRegexMode(value: boolean): void {
    regexMode = value;
  }

  // R-108/R-106 #1,#2 (Escape / Clear button): reset the query text and
  // deactivate the search bar.
  function cancel(): void {
    query = "";
    active = false;
  }

  // R-109-1/R-109-2/R-106 #3 (Enter / Apply):
  //  - empty (trimmed) query: closes the search bar (R-106 #3).
  //  - non-empty query: stays open, recorded as the single most-recent
  //    history entry (R-122); filtering itself is unaffected (already live,
  //    R-110).
  function confirm(): void {
    const trimmed = query.trim();
    if (trimmed === "") {
      active = false;
      return;
    }
    history = trimmed;
  }

  // R-121/R-122 (ArrowUp): loads the single most-recent confirmed query back
  // into the input. No-op (does not throw, leaves the current text
  // untouched) when there is no prior confirmed query.
  function historyPrev(): void {
    if (history === null) return;
    query = history;
  }

  // R-121 (ArrowDown): resets the input text only — does not close the bar.
  function queryClear(): void {
    query = "";
  }

  // Wired to the search <input>'s onfocus/onblur handlers (raw tracking
  // only). The public `inputFocused` getter below derives the value actually
  // consumed by features/keyboard/key-dispatch.ts's R-14-2 guard.
  function setInputFocused(value: boolean): void {
    rawFocused = value;
  }

  return {
    get active() {
      return active;
    },
    get query() {
      return query;
    },
    get regexMode() {
      return regexMode;
    },
    get history() {
      return history;
    },
    // §3.1.4-1 (MUST-43): derived as `active && rawFocused`, NOT the raw
    // onfocus/onblur-tracked value alone. The search bar closing via any of
    // R-106's 3 exit paths (cancel()/confirm()-with-empty-query) sets
    // `active = false` through this module's own function calls — regardless
    // of whether the <input>'s `blur` event actually fired when it was
    // removed from the DOM. This makes `inputFocused` self-correct to
    // `false` without depending on DOM unmount/focus-restoration timing
    // (§3.1.5's `containerEl?.focus()` is NOT relied upon here).
    get inputFocused() {
      return active && rawFocused;
    },
    open,
    setQuery,
    setRegexMode,
    cancel,
    confirm,
    historyPrev,
    queryClear,
    setInputFocused,
  };
}

export const searchState = createSearchState();
