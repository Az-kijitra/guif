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

import { applyMru, dedupeAndLimit } from "$lib/shared/mru-list";
import { navigationPersistence } from "$lib/shared/state/navigation-persistence.svelte";

const SEARCH_HISTORY_LIMIT = 20; // R-248

export type SearchAction = "cancel" | "confirm" | "history_prev" | "query_clear";

export function createSearchState() {
  let active = $state(false);
  let query = $state("");
  let regexMode = $state(false);
  // R-247/R-248: bounded MRU list (max 20, plain-string identity, no path
  // normalization: R-248-2). The UI (R-122) still recalls only [0].
  let historyList = $state<string[]>([]);
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
    historyList = applyMru(historyList, trimmed, SEARCH_HISTORY_LIMIT);
    navigationPersistence.requestSave();
  }

  // Startup hydrate: order-preserving dedupe + limit (MUST-49). Does not
  // request a save.
  function hydrateHistory(loaded: readonly string[]): void {
    historyList = dedupeAndLimit(loaded, SEARCH_HISTORY_LIMIT);
  }

  // R-121/R-122 (ArrowUp): loads the single most-recent confirmed query back
  // into the input. No-op (does not throw, leaves the current text
  // untouched) when there is no prior confirmed query.
  function historyPrev(): void {
    const latest = historyList[0];
    if (latest === undefined) return;
    query = latest;
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
    get history(): string | null {
      return historyList[0] ?? null;
    },
    get historyList() {
      return historyList;
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
    hydrateHistory,
    queryClear,
    setInputFocused,
  };
}

export const searchState = createSearchState();

navigationPersistence.register({
  getSnapshot: () => ({ searchHistory: $state.snapshot(searchState.historyList) }),
  hydrate: (data) => searchState.hydrateHistory(data.searchHistory),
});
