// SPEC-0300-0012 §4, §5 (R-110~R-118): DOM/Tauri-free pure matching logic for
// the search feature (R-128-1/AC-129). Called from routes/+page.svelte's
// `$derived` (SPEC-0200-0001 §3.1.2) — `features/search/` never imports
// `features/file-list/` directly (R-129/AC-128); the caller supplies the
// entries array and reads back the filtered result.

import { SEARCH_MESSAGES } from "./messages";

export interface SearchMatchEntry {
  name: string;
  path: string;
}

export interface SearchMatchOptions {
  active: boolean;
  query: string;
  regexMode: boolean;
}

export interface SearchMatchResult<T extends SearchMatchEntry> {
  filteredEntries: T[];
  error: string | null;
}

// R-113-4: 1-line "invalid regular expression" message (ja).
const INVALID_REGEX_MESSAGE = SEARCH_MESSAGES.invalidRegex;

// R-116: recomputed from 4 inputs (entries/active/query/regexMode). R-110/
// R-133: synchronous, no debounce/throttle — the return value is a plain
// object, never a Promise or otherwise deferred.
export function computeFilteredEntries<T extends SearchMatchEntry>(
  entries: readonly T[],
  options: SearchMatchOptions,
): SearchMatchResult<T> {
  // R-111: trim before evaluating.
  const trimmedQuery = options.query.trim();

  // R-117: inactive search, or an empty (trimmed) query, passes every entry
  // through unfiltered (same order) and clears any previously-reported regex
  // error.
  if (!options.active || trimmedQuery === "") {
    return { filteredEntries: [...entries], error: null };
  }

  if (options.regexMode) {
    let pattern: RegExp;
    try {
      // R-113-2: always case-insensitive; users cannot supply their own
      // flags.
      pattern = new RegExp(trimmedQuery, "i");
    } catch {
      // R-113-3/R-113-4: an invalid pattern falls back to showing every
      // entry unfiltered, with an inline error message (never throws, never
      // blocks the app).
      return { filteredEntries: [...entries], error: INVALID_REGEX_MESSAGE };
    }
    // R-113-5: a valid pattern reports a null error (clearing any prior one).
    return {
      filteredEntries: entries.filter((entry) => pattern.test(entry.name)),
      error: null,
    };
  }

  // R-112/R-112-1: case-insensitive substring match against the entry name
  // only (never `path`).
  const lowerQuery = trimmedQuery.toLowerCase();
  return {
    filteredEntries: entries.filter((entry) => entry.name.toLowerCase().includes(lowerQuery)),
    error: null,
  };
}
