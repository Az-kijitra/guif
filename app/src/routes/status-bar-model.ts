// SPEC-0300-0017 R-970~R-976 / SPEC-0200-0001 §3.8.8: pure model of the status
// bar's permanent items. DOM/Svelte-independent.

import { sortKeyLabel, sortOrderMark, type SortKey, type SortOrder } from "$lib/features/file-list/sort";

export type FocusArea = "dialog" | "history" | "jump" | "sort-menu" | "context-menu" | "path" | "search" | "tree" | "list" | "none";
export type DomFocusArea = "search" | "tree" | "list" | null;

export interface FocusAreaInput {
  modalOpen: boolean;
  historyOpen: boolean;
  historyMode: "history" | "jump";
  sortMenuOpen: boolean;
  contextMenuOpen?: boolean; // SPEC-0300-0018 R-1113
  pathEditing: boolean;
  domArea: DomFocusArea;
}

export interface StatusItem {
  id: "focus" | "sort" | "selected" | "hidden" | "filter";
  text: string;
  title?: string;
}

export interface StatusItemsInput {
  focusArea: FocusArea;
  sortKey: SortKey;
  sortOrder: SortOrder;
  selectedVisibleCount: number;
  showHidden: boolean;
  searchActive: boolean;
  query: string;
}

// R-972: the first matching state, in priority order 1..8.
export function resolveFocusArea(input: FocusAreaInput): FocusArea {
  if (input.modalOpen) return "dialog";
  if (input.historyOpen) return input.historyMode === "jump" ? "jump" : "history";
  if (input.sortMenuOpen) return "sort-menu";
  if (input.contextMenuOpen) return "context-menu";
  if (input.pathEditing) return "path";
  if (input.domArea === "search") return "search";
  if (input.domArea === "tree") return "tree";
  if (input.domArea === "list") return "list";
  return "none";
}

const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  dialog: "ダイアログ",
  history: "訪問履歴",
  jump: "ジャンプリスト",
  "sort-menu": "ソートメニュー",
  "context-menu": "右クリックメニュー",
  path: "パス",
  search: "検索",
  tree: "ツリー",
  list: "一覧",
  none: "なし",
};

export function focusAreaLabel(area: FocusArea): string {
  return FOCUS_AREA_LABELS[area];
}

// R-971 #1~#5 (R-976: Japanese wording). #5 only while the search bar is active and the
// query is non-blank; the query is shown as typed.
export function buildStatusItems(input: StatusItemsInput): StatusItem[] {
  const items: StatusItem[] = [
    { id: "focus", text: `フォーカス: ${focusAreaLabel(input.focusArea)}` },
    { id: "sort", text: `並び替え: ${sortKeyLabel(input.sortKey)} ${sortOrderMark(input.sortOrder)}` },
    { id: "selected", text: `選択: ${input.selectedVisibleCount}` },
    { id: "hidden", text: `隠し: ${input.showHidden ? "オン" : "オフ"}` },
  ];
  if (input.searchActive && input.query.trim() !== "") {
    const text = `絞り込み: ${input.query}`;
    items.push({ id: "filter", text, title: text });
  }
  return items;
}

// R-971 #3 (P-12): selected entries among the visible (filtered) ones.
export function countVisibleSelected(visible: readonly { path: string }[], selected: ReadonlySet<string>): number {
  let count = 0;
  for (const entry of visible) {
    if (selected.has(entry.path)) count += 1;
  }
  return count;
}

// R-972 #5~#7: which `data-focus-area` region holds the element (null when none).
export function classifyFocusTarget(
  el: { closest(selector: string): { getAttribute(name: string): string | null } | null } | null,
): DomFocusArea {
  if (el === null) return null;
  const marked = el.closest("[data-focus-area]");
  if (marked === null) return null;
  const value = marked.getAttribute("data-focus-area");
  return value === "search" || value === "tree" || value === "list" ? value : null;
}
