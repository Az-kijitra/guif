// SPEC-0300-0009 §4 (R-30~R-33): sort key/order state. The actual comparison
// is performed by the backend (fs_list_dir, R-32); the frontend never
// re-sorts the entries it receives.

export const SORT_KEYS = ["name", "size", "type", "modified"] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortOrder = "asc" | "desc";

export interface SortState {
  key: SortKey;
  order: SortOrder;
}

// R-30 note (ISS-0022-c resolved): initial default is name/asc.
export const DEFAULT_SORT_STATE: SortState = { key: "name", order: "asc" };

// R-31: re-selecting the current key toggles asc<->desc; a different key
// resets the order to asc.
export function nextSortState(current: SortState, selectedKey: SortKey): SortState {
  if (current.key === selectedKey) {
    return { key: selectedKey, order: current.order === "asc" ? "desc" : "asc" };
  }
  return { key: selectedKey, order: "asc" };
}

// R-32: render entries in the exact order the backend returned them, without
// mutating or re-sorting the input array.
export function renderEntriesInBackendOrder<T>(entries: readonly T[]): T[] {
  return entries.slice();
}

// SPEC-0300-0009 R-34-14/AC-618; SPEC-0200-0001 §3.6.5: move the sort menu's
// highlighted key up/down through SORT_KEYS, wrapping around at either end.
export function moveSortMenuHighlight(current: SortKey, direction: "up" | "down"): SortKey {
  const index = SORT_KEYS.indexOf(current);
  const delta = direction === "down" ? 1 : -1;
  const next = (index + delta + SORT_KEYS.length) % SORT_KEYS.length;
  return SORT_KEYS[next];
}

// Phase 9 (SPEC-0300-0017 R-971 #2 / R-983; SPEC-0200-0001 §3.8.17 SHOULD-148):
// labels shared by the status bar and the sort menu (one source for the marks).

const SORT_KEY_LABELS: Record<SortKey, string> = {
  name: "名前",
  size: "サイズ",
  type: "種類",
  modified: "更新日時",
};

export function sortKeyLabel(key: SortKey): string {
  return SORT_KEY_LABELS[key];
}

// P-20: ascending "↑", descending "↓".
export function sortOrderMark(order: SortOrder): string {
  return order === "asc" ? "↑" : "↓";
}
