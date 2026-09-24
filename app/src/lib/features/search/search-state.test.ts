import { describe, expect, it } from "vitest";
import { createSearchState } from "./search-state.svelte";

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
