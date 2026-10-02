// SPEC-0300-0017 R-971 / R-972; SPEC-0200-0001 §3.8.8, §3.8.17 SHOULD-148 / SHOULD-149.
// Feeds the status bar's permanent items. The keyboard-focus location (search /
// tree / list) is a DOM-derived value, so it is tracked here (SHOULD-54 exception);
// everything else is read through injected getters.

import type { SortKey, SortOrder } from "$lib/features/file-list/sort";
import {
  buildStatusItems,
  classifyFocusTarget,
  countVisibleSelected,
  resolveFocusArea,
  type DomFocusArea,
  type StatusItem,
} from "./status-bar-model";

// The features' public state is read through these structural shapes (no feature import).
export interface StatusBarModelDeps {
  fileList: { sortKey(): SortKey; sortOrder(): SortOrder; showHidden(): boolean; readonly selected: ReadonlySet<string> };
  search: { readonly active: boolean; readonly query: string };
  history: { readonly isOpen: boolean; readonly mode: "history" | "jump" };
  sortMenu: { readonly isOpen: boolean };
  modal: { readonly isOpen: boolean };
  pathEditing: () => boolean;
  filteredEntries: () => readonly { path: string }[];
}

type FocusEventTarget = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export interface StatusBarDocument extends FocusEventTarget {
  readonly activeElement: Parameters<typeof classifyFocusTarget>[0];
}

export function createStatusBarModel(deps: StatusBarModelDeps) {
  let domArea = $state<DomFocusArea>(null);

  const items = $derived<StatusItem[]>(
    buildStatusItems({
      focusArea: resolveFocusArea({
        modalOpen: deps.modal.isOpen,
        historyOpen: deps.history.isOpen,
        historyMode: deps.history.mode,
        sortMenuOpen: deps.sortMenu.isOpen,
        pathEditing: deps.pathEditing(),
        domArea,
      }),
      sortKey: deps.fileList.sortKey(),
      sortOrder: deps.fileList.sortOrder(),
      selectedVisibleCount: countVisibleSelected(deps.filteredEntries(), deps.fileList.selected),
      showHidden: deps.fileList.showHidden(),
      searchActive: deps.search.active,
      query: deps.search.query,
    }),
  );

  // SHOULD-149: never trust `relatedTarget`; after each focus change re-read
  // `activeElement` (in a microtask, once the browser has moved the focus).
  function attach(doc: StatusBarDocument, win?: FocusEventTarget): () => void {
    const reread = (): void => {
      domArea = classifyFocusTarget(doc.activeElement ?? null);
    };
    const schedule = (): void => queueMicrotask(reread);
    doc.addEventListener("focusin", schedule);
    doc.addEventListener("focusout", schedule);
    win?.addEventListener("focus", schedule);
    win?.addEventListener("blur", schedule);
    reread();
    return () => {
      doc.removeEventListener("focusin", schedule);
      doc.removeEventListener("focusout", schedule);
      win?.removeEventListener("focus", schedule);
      win?.removeEventListener("blur", schedule);
    };
  }

  return {
    get items(): StatusItem[] {
      return items;
    },
    get domArea(): DomFocusArea {
      return domArea;
    },
    attach,
  };
}
