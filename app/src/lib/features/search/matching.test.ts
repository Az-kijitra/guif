import { describe, expect, it } from "vitest";
import { computeFilteredEntries } from "./matching";

// Spec: SPEC-0300-0012 (search: partial match + regex, detail) §4, §5
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.1.2
//   `computeFilteredEntries(entries, { active, query, regexMode }) ->
//    { filteredEntries, error }` — a DOM/Tauri-free pure function (R-128-1),
//   called from routes/+page.svelte's `$derived` (not by any other feature
//   directly, R-129/AC-128).
//
// Module under test (not yet implemented): ./matching.ts
//
// AC-129: this whole file exercises the matching logic as plain exported
// functions with no DOM/Tauri dependency (no jsdom, no mocked invoke()),
// which is itself the evidence AC-129 requires.
//
// Only `name` (never `path`) participates in matching (R-112-1); entries are
// represented with the minimal shape the module needs.

interface Entry {
  name: string;
  path: string;
}

function entry(name: string, path = `/root/${name}`): Entry {
  return { name, path };
}

describe("computeFilteredEntries — live partial-match filtering (R-110, R-112, AC-104~AC-108)", () => {
  it("AC-104/R-110: filters as soon as a query is supplied, with no confirm step required", () => {
    const entries = [entry("apple.txt"), entry("banana.txt"), entry("apricot.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "ap", regexMode: false });
    expect(result.filteredEntries.map((e) => e.name)).toEqual(["apple.txt", "apricot.txt"]);
  });

  it("AC-105/R-110/R-133: recomputes synchronously — no debounce/throttle/async delay is interposed", () => {
    const entries = [entry("apple.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "a", regexMode: false });
    // A debounced/throttled/async implementation would need to return a
    // Promise (or otherwise defer); a same-tick plain object return is the
    // observable proof that no delay sits between the query and the result.
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as unknown as { then?: unknown }).then).toBe("undefined");
    expect(result.filteredEntries).toHaveLength(1);
  });

  it("AC-106/R-112: partial match ignores case — a lowercase query matches an uppercase name", () => {
    const entries = [entry("ABC.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "abc", regexMode: false });
    expect(result.filteredEntries).toHaveLength(1);
  });

  it("AC-106/R-112: partial match ignores case — an uppercase query matches too", () => {
    const entries = [entry("ABC.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "ABC", regexMode: false });
    expect(result.filteredEntries).toHaveLength(1);
  });

  it("AC-107/R-112-1: a string that appears only in the path (not the name) does not match", () => {
    const entries = [{ name: "file.txt", path: "/secret-parent/file.txt" }];
    const result = computeFilteredEntries(entries, {
      active: true,
      query: "secret-parent",
      regexMode: false,
    });
    expect(result.filteredEntries).toHaveLength(0);
  });

  it("AC-108/R-111: surrounding whitespace in the query is trimmed before matching", () => {
    const entries = [entry("apple.txt"), entry("banana.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "  apple  ", regexMode: false });
    expect(result.filteredEntries.map((e) => e.name)).toEqual(["apple.txt"]);
  });

  it("AC-108/R-111: a whitespace-only query shows every entry (no filtering applied)", () => {
    const entries = [entry("apple.txt"), entry("banana.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "   ", regexMode: false });
    expect(result.filteredEntries).toEqual(entries);
  });

  it("R-111: an empty (after trim) query also clears any previously-reported regex error", () => {
    const entries = [entry("apple.txt")];
    const invalid = computeFilteredEntries(entries, { active: true, query: "[", regexMode: true });
    expect(invalid.error).not.toBeNull();
    const cleared = computeFilteredEntries(entries, { active: true, query: "   ", regexMode: true });
    expect(cleared.error).toBeNull();
  });
});

describe("computeFilteredEntries — regex mode (R-113, AC-109~AC-112)", () => {
  it("AC-109/R-113-2: regex mode matches case-insensitively regardless of the pattern's own case", () => {
    const entries = [entry("Apple.txt"), entry("banana.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "^a", regexMode: true });
    expect(result.filteredEntries.map((e) => e.name)).toEqual(["Apple.txt"]);
  });

  it("AC-110/R-113-3: an invalid pattern (e.g. '[') does not throw", () => {
    const entries = [entry("apple.txt"), entry("banana.txt")];
    expect(() =>
      computeFilteredEntries(entries, { active: true, query: "[", regexMode: true }),
    ).not.toThrow();
  });

  it("AC-110/R-113-3: an invalid pattern falls back to showing every entry unfiltered", () => {
    const entries = [entry("apple.txt"), entry("banana.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "[", regexMode: true });
    expect(result.filteredEntries).toEqual(entries);
  });

  it("AC-110/R-113-4: an invalid pattern reports a 1-line 'invalid regular expression' error", () => {
    const entries = [entry("apple.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "[", regexMode: true });
    expect(result.error).toBe("正規表現が不正です");
  });

  it("AC-111/R-113-5: the error clears once the pattern becomes valid again", () => {
    const entries = [entry("apple.txt")];
    const invalid = computeFilteredEntries(entries, { active: true, query: "[", regexMode: true });
    expect(invalid.error).not.toBeNull();
    const fixed = computeFilteredEntries(entries, { active: true, query: "[a-z]+", regexMode: true });
    expect(fixed.error).toBeNull();
  });

  it("a valid regex query reports a null error", () => {
    const entries = [entry("apple.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "app.*", regexMode: true });
    expect(result.error).toBeNull();
  });

  it("AC-112: with regexMode=false, a regex-looking query is treated as a literal substring, not a pattern", () => {
    const entries = [entry("Apple.txt")];
    // "^a" is not a literal substring of the lowercased name "apple.txt";
    // if this were mistakenly evaluated as a regex, it would match (regex
    // mode is off, so it must not).
    const result = computeFilteredEntries(entries, { active: true, query: "^a", regexMode: false });
    expect(result.filteredEntries).toHaveLength(0);
  });
});

describe("computeFilteredEntries — inactive search / full-list passthrough (R-115~R-118)", () => {
  it("AC-103/R-117: an inactive search returns every entry, regardless of the query text", () => {
    const entries = [entry("apple.txt"), entry("banana.txt")];
    const result = computeFilteredEntries(entries, { active: false, query: "apple", regexMode: false });
    expect(result.filteredEntries).toEqual(entries);
  });

  it("R-117: an active search with an empty (trimmed) query also returns every entry, same order", () => {
    const entries = [entry("banana.txt"), entry("apple.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "", regexMode: false });
    expect(result.filteredEntries).toEqual(entries);
  });

  it("R-115/AC-118: filtering never mutates the source entries array or its order", () => {
    const entries = [entry("banana.txt"), entry("apple.txt")];
    const before = [...entries];
    computeFilteredEntries(entries, { active: true, query: "apple", regexMode: false });
    expect(entries).toEqual(before);
  });

  it("R-118: a query matching nothing yields an empty filteredEntries array (no throw, no dedicated message — that is a display concern outside this module)", () => {
    const entries = [entry("apple.txt")];
    const result = computeFilteredEntries(entries, { active: true, query: "zzz", regexMode: false });
    expect(result.filteredEntries).toEqual([]);
  });
});
