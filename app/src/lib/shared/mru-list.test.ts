import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0013 §3.2 (R-205, R-206, R-206-1, R-248-2), SPEC-0300-0012
//   R-122-1 (search history sharing the same MRU policy)
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.3
//   (shared/mru-list.ts rationale — one shared implementation for visit
//   history, jump list, and search history), MUST-49(a)(b) (dedupeAndLimit
//   must not reverse order), SHOULD-67 (string-only, no generics — YAGNI)
//
// Module under test (not yet implemented): ./mru-list.ts
//
// This is a DOM/Tauri-independent, string-only utility module shared by
// features/navigation-history/list-ops.ts (visit history + jump list, keyed
// by pathComparisonKey) and features/search/search-state.svelte.ts (search
// history, keyed by plain string identity — no path normalization, R-248-2).
// It is NOT a "shared state" module (§5.2 registration is not required — see
// the architecture doc's rationale): it holds no state of its own.

import { applyMru, dedupeAndLimit } from "./mru-list";

describe("applyMru — used when adding a single new item (R-206)", () => {
  it("adds a new item to the front of an empty list", () => {
    expect(applyMru([], "a", 10)).toEqual(["a"]);
  });

  it("moves an existing duplicate (by identity, default keyFn) to the front instead of duplicating it", () => {
    expect(applyMru(["b", "a", "c"], "a", 10)).toEqual(["a", "b", "c"]);
  });

  it("prepends a genuinely new item ahead of the existing list", () => {
    expect(applyMru(["b", "c"], "a", 10)).toEqual(["a", "b", "c"]);
  });

  it("enforces the limit by dropping from the tail (oldest) once the list would exceed it", () => {
    expect(applyMru(["b", "c"], "a", 2)).toEqual(["a", "b"]);
  });

  it("uses a custom keyFn for duplicate detection (e.g. case-insensitive)", () => {
    const foldCase = (s: string) => s.toLowerCase();
    expect(applyMru(["Foo", "Bar"], "FOO", 10, foldCase)).toEqual(["FOO", "Bar"]);
  });

  it("the re-added item's own (new) form replaces the previous stored form on a duplicate hit", () => {
    const foldCase = (s: string) => s.toLowerCase();
    const result = applyMru(["C:\\Old\\Case"], "c:\\old\\case", 10, foldCase);
    expect(result).toEqual(["c:\\old\\case"]);
  });

  it("a limit of 1 keeps only the newly-added item", () => {
    expect(applyMru(["b", "c"], "a", 1)).toEqual(["a"]);
  });
});

describe("dedupeAndLimit — used when hydrating an already-MRU-ordered list from disk (MUST-49(a)(b))", () => {
  it("returns an empty array for an empty input", () => {
    expect(dedupeAndLimit([], 10)).toEqual([]);
  });

  it("keeps the first occurrence of a duplicate (by default identity keyFn) and drops later ones", () => {
    expect(dedupeAndLimit(["a", "b", "a", "c"], 10)).toEqual(["a", "b", "c"]);
  });

  it("preserves the original relative order (regression guard: must NOT reverse, unlike folding applyMru from the front would)", () => {
    expect(dedupeAndLimit(["first", "second", "third"], 10)).toEqual(["first", "second", "third"]);
  });

  it("truncates to the limit once enough unique items have been collected, stopping the scan early", () => {
    const input = ["a", "b", "c", "d", "e"];
    expect(dedupeAndLimit(input, 3)).toEqual(["a", "b", "c"]);
  });

  it("a trailing duplicate present after the limit-truncated prefix does not extend the result", () => {
    const input = ["a", "b", "c", "a"]; // limit=3 already reached at "c"; trailing dup of "a" is unreachable either way
    expect(dedupeAndLimit(input, 3)).toEqual(["a", "b", "c"]);
  });

  it("uses a custom keyFn for duplicate detection (case-insensitive path comparison)", () => {
    const foldCase = (s: string) => s.toLowerCase();
    expect(dedupeAndLimit(["C:\\A", "c:\\a", "C:\\B"], 10, foldCase)).toEqual(["C:\\A", "C:\\B"]);
  });

  it("limit exactly equal to the number of unique items performs no truncation", () => {
    expect(dedupeAndLimit(["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
  });
});
