// Shared MRU helpers (SPEC-0200-0001 §3.2.3, SHOULD-67: string-only, no
// generics). Stateless pure functions used by visit history, jump list, and
// search history.

// Used when adding ONE new item: the item moves to the front, any existing
// duplicate (by keyFn) is removed, then the list is truncated to `limit`.
export function applyMru(
  list: readonly string[],
  item: string,
  limit: number,
  keyFn: (item: string) => string = (s) => s,
): string[] {
  const key = keyFn(item);
  const withoutDuplicate = list.filter((existing) => keyFn(existing) !== key);
  return [item, ...withoutDuplicate].slice(0, limit);
}

// Used when hydrating an already-MRU-ordered list from disk (MUST-49(a)(b)).
// Keeps the FIRST occurrence of each key and preserves relative order
// (folding through applyMru would reverse the order).
export function dedupeAndLimit(
  list: readonly string[],
  limit: number,
  keyFn: (item: string) => string = (s) => s,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (result.length >= limit) break;
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
