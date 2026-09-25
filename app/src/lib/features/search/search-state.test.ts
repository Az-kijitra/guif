import { describe, expect, it } from "vitest";
import { createSearchState } from "./search-state.svelte";

// --- Phase 4 (SPEC-0300-0013) extension --------------------------------
// Spec: SPEC-0300-0013 §11 (R-247~R-250, R-248-1~R-248-4), SPEC-0300-0012
//   R-121/R-122 (呼び出しUIは直近1件のまま、変更なし)
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.5
//   (search-state.svelte.ts's `history: string|null` -> `historyList:
//   string[]` extension; `history` getter kept as `historyList[0] ?? null`
//   for backward compatibility, MUST-43-adjacent regression-avoidance)
//
// This is a breaking *internal* change (the module now stores a bounded MRU
// list instead of a single value) but is backward-compatible at the public
// `history`/`historyPrev()` surface — every pre-existing test above this
// comment block continues to describe correct, unchanged behavior under the
// new implementation (the `history` getter is derived from `historyList[0]`)
// and is intentionally left unmodified. The new tests below exercise the
// newly-added `historyList`/`hydrateHistory` surface directly.
//
// $lib/shared/state/status-message.svelte is not touched by this module;
// no additional mocking is required for these tests (confirm() calling
// $lib/shared/state/navigation-persistence.svelte's requestSave() is a
// real-singleton no-op here, exactly as in
// features/navigation-history/navigation-history-state.test.ts, since
// hydrateAll() is never invoked in this file so `hydrated` stays false).

describe("historyList (R-247, R-248, R-248-1, R-248-2, AC-245, AC-245-1)", () => {
  it("starts empty", () => {
    const s = createSearchState();
    expect(s.historyList).toEqual([]);
  });

  it("confirm() adds the trimmed query to the front of historyList", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("report");
    s.confirm();
    expect(s.historyList).toEqual(["report"]);
  });

  it("R-248-2: re-confirming an already-present query moves it to the front instead of duplicating it", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("first");
    s.confirm();
    s.setQuery("second");
    s.confirm();
    s.setQuery("first");
    s.confirm();
    expect(s.historyList).toEqual(["first", "second"]);
  });

  it("AC-245: confirming 21 distinct queries keeps only the 20 most recent, dropping the first-confirmed one", () => {
    const s = createSearchState();
    s.open();
    for (let i = 0; i < 21; i++) {
      s.setQuery(`query-${i}`);
      s.confirm();
    }
    expect(s.historyList).toHaveLength(20);
    expect(s.historyList).not.toContain("query-0");
    expect(s.historyList[0]).toBe("query-20"); // most recently confirmed is first
  });

  it("AC-245-1: re-confirming an existing query does not increase historyList's length", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("repeat");
    s.confirm();
    s.setQuery("other");
    s.confirm();
    s.setQuery("repeat");
    s.confirm();
    expect(s.historyList).toHaveLength(2);
  });

  it("the public `history` getter stays in sync with historyList[0] (backward compatibility)", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("a");
    s.confirm();
    s.setQuery("b");
    s.confirm();
    expect(s.history).toBe(s.historyList[0]);
    expect(s.history).toBe("b");
  });

  it("AC-245-2: historyPrev (ArrowUp) still loads only the single most-recent entry, even when historyList holds many", () => {
    const s = createSearchState();
    s.open();
    for (let i = 0; i < 5; i++) {
      s.setQuery(`q${i}`);
      s.confirm();
    }
    s.setQuery("typing something else");
    s.historyPrev();
    expect(s.query).toBe("q4");
  });
});

describe("hydrateHistory (R-247, R-248-3, MUST-49(a) — order-preserving dedupe+limit, NOT applyMru)", () => {
  it("adopts the loaded list as historyList", () => {
    const s = createSearchState();
    s.hydrateHistory(["newest", "older"]);
    expect(s.historyList).toEqual(["newest", "older"]);
  });

  it("deduplicates (keeping the first/newest occurrence) while preserving relative order", () => {
    const s = createSearchState();
    s.hydrateHistory(["a", "b", "a", "c"]);
    expect(s.historyList).toEqual(["a", "b", "c"]);
  });

  it("R-248-3: truncates an over-limit loaded list to 20, keeping the head (newest-first) and dropping the tail", () => {
    const s = createSearchState();
    const loaded = Array.from({ length: 21 }, (_, i) => `q${i}`); // index 0 = newest
    s.hydrateHistory(loaded);
    expect(s.historyList).toHaveLength(20);
    expect(s.historyList).toEqual(loaded.slice(0, 20));
  });

  it("an empty loaded list yields an empty historyList and a null `history` getter", () => {
    const s = createSearchState();
    s.hydrateHistory([]);
    expect(s.historyList).toEqual([]);
    expect(s.history).toBeNull();
  });

  it("hydrateHistory does not itself count as a confirm (does not, by itself, trigger any query mutation)", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("typed");
    s.hydrateHistory(["restored"]);
    expect(s.query).toBe("typed"); // untouched
    expect(s.history).toBe("restored");
  });
});

// Spec: SPEC-0300-0012 (search: partial match + regex, detail) §3, §6
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.1.2, §3.1.4,
//   §3.1.4-1 (MUST-43)
//
// Module under test (not yet implemented): ./search-state.svelte.ts
//
// Expected public surface (feature-local UI state, SPEC-0200-0001 §5.1,
// analogous to features/file-list/list-state.svelte.ts):
//   get active(): boolean          — R-103
//   get query(): string            — R-110/R-111
//   get regexMode(): boolean       — R-113/R-113-1 (default off)
//   get history(): string | null   — R-121/R-122 (only the single
//                                     most-recent confirmed query, no stack)
//   get inputFocused(): boolean    — derived `active && rawFocused`
//                                     (§3.1.4-1, MUST-43 — NOT the raw
//                                     onfocus/onblur-tracked value)
//   open(): void                   — R-105/R-105-1/R-105-2
//   setQuery(value: string): void
//   setRegexMode(value: boolean): void
//   cancel(): void                 — R-108 (Escape / Clear button, R-106 #1/#2)
//   confirm(): void                — R-109-1/R-109-2 (Enter / Apply, R-106 #3
//                                     when the query is empty)
//   historyPrev(): void            — R-121 ArrowUp / onSearchAction("history_prev")
//   queryClear(): void             — R-121 ArrowDown / onSearchAction("query_clear")
//   setInputFocused(value: boolean): void — wired to the search <input>'s
//                                     onfocus/onblur (raw tracking only)
//
// Testability note: `createSearchState()` is a **factory** (not just a
// singleton export) so each test below can start from a fresh, independent
// instance — this mirrors the equivalent `createFileListState()` factory
// export this same TDD pass requires from features/file-list/list-state.svelte.ts
// (see navigation/list-state test files). A bare module-scope singleton
// cannot be reset between tests without it.

describe("initial state (R-103, R-113-1, AC-103, AC-112)", () => {
  it("starts inactive, with an empty query, substring mode, no history and no input focus", () => {
    const s = createSearchState();
    expect(s.active).toBe(false);
    expect(s.query).toBe("");
    expect(s.regexMode).toBe(false); // AC-112: regex mode defaults to off
    expect(s.history).toBeNull();
    expect(s.inputFocused).toBe(false);
  });
});

describe("open (R-105, R-105-1, R-105-2, AC-102)", () => {
  it("activates the search bar", () => {
    const s = createSearchState();
    s.open();
    expect(s.active).toBe(true);
  });

  it("R-105-2: re-invoking open() while already active does not reset the current query", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("report");
    s.open();
    expect(s.active).toBe(true);
    expect(s.query).toBe("report");
  });
});

describe("cancel (R-108, R-106 #1/#2 — Escape / Clear button, AC-115)", () => {
  it("clears the query text", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("report");
    s.cancel();
    expect(s.query).toBe("");
  });

  it("deactivates the search bar", () => {
    const s = createSearchState();
    s.open();
    s.cancel();
    expect(s.active).toBe(false);
  });
});

describe("confirm (R-109-1, R-109-2, R-106 #3, AC-113, AC-114)", () => {
  it("AC-114/R-109-1: with an empty (trimmed) query, confirm closes the search bar", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("   ");
    s.confirm();
    expect(s.active).toBe(false);
  });

  it("AC-113/R-109-2: with a non-empty query, confirm keeps the bar open", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("report");
    s.confirm();
    expect(s.active).toBe(true);
    expect(s.query).toBe("report"); // filtering is unaffected by confirm (R-109-2)
  });

  it("AC-113/R-109-2: with a non-empty query, confirm records it as the (single) most-recent history entry", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("report");
    s.confirm();
    expect(s.history).toBe("report");
  });

  it("R-122: confirming a second query replaces the history with only the newest one (no stack of past queries)", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("first");
    s.confirm();
    s.setQuery("second");
    s.confirm();
    expect(s.history).toBe("second");
  });
});

describe("historyPrev / queryClear (R-121, R-122, AC-124)", () => {
  it("AC-124: historyPrev loads the single most-recent confirmed query back into the input", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("first");
    s.confirm();
    s.setQuery("something-else");
    s.historyPrev();
    expect(s.query).toBe("first");
  });

  it("historyPrev with no prior confirmed query is a no-op (does not throw, leaves the current text untouched)", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("typed");
    expect(() => s.historyPrev()).not.toThrow();
    expect(s.query).toBe("typed");
  });

  it("AC-124: historyPrev never reaches further back than the single most-recent entry (no cycling through older queries)", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("first");
    s.confirm();
    s.setQuery("second");
    s.confirm();
    s.queryClear();
    s.historyPrev();
    expect(s.query).toBe("second");
    s.historyPrev(); // pressing ArrowUp again
    expect(s.query).toBe("second"); // still "second" — "first" is unreachable
  });

  it("AC-124: queryClear resets the input text to empty", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("typed");
    s.queryClear();
    expect(s.query).toBe("");
  });

  it("queryClear does not close the search bar (contrast with cancel)", () => {
    const s = createSearchState();
    s.open();
    s.setQuery("typed");
    s.queryClear();
    expect(s.active).toBe(true);
  });
});

describe("inputFocused derivation — §3.1.4-1 / MUST-43 (most important regression guard)", () => {
  it("(a) rawFocused=true while active=true derives inputFocused=true", () => {
    const s = createSearchState();
    s.open();
    s.setInputFocused(true);
    expect(s.inputFocused).toBe(true);
  });

  it("(b) MUST-43: inputFocused becomes false as soon as active becomes false via cancel(), even though the raw focus flag was never explicitly cleared (simulates a browser that fails to fire `blur` when the <input> unmounts)", () => {
    const s = createSearchState();
    s.open();
    s.setInputFocused(true);
    s.cancel(); // note: does NOT call setInputFocused(false)
    expect(s.active).toBe(false);
    expect(s.inputFocused).toBe(false);
  });

  it("MUST-43: inputFocused also becomes false via the confirm()-with-empty-query close path (R-106 #3), without an explicit blur", () => {
    const s = createSearchState();
    s.open();
    s.setInputFocused(true);
    s.setQuery("   ");
    s.confirm();
    expect(s.active).toBe(false);
    expect(s.inputFocused).toBe(false);
  });

  it("inputFocused round-trips back to true once the bar is reopened and focus is re-applied after being closed", () => {
    const s = createSearchState();
    s.open();
    s.setInputFocused(true);
    s.cancel();
    expect(s.inputFocused).toBe(false);
    s.open();
    s.setInputFocused(true);
    expect(s.inputFocused).toBe(true);
  });

  it("an ordinary blur (setInputFocused(false)) while still active also derives inputFocused=false, without closing the bar", () => {
    const s = createSearchState();
    s.open();
    s.setInputFocused(true);
    s.setInputFocused(false);
    expect(s.inputFocused).toBe(false);
    expect(s.active).toBe(true); // blur alone must not close the search bar
  });

  it("inputFocused is false before the bar has ever been opened, even if setInputFocused(true) is called out of sequence", () => {
    const s = createSearchState();
    s.setInputFocused(true); // defensive: focus tracked before activation
    expect(s.active).toBe(false);
    expect(s.inputFocused).toBe(false);
  });
});
