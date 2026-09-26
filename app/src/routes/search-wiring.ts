// The search-bar action switch extracted from +page.svelte (SPEC-0200-0001
// §3.3.5). R-105/R-105-1/R-105-2, R-107/R-107-1, R-109-2-1 (SPEC-0300-0012):
// only DOM-focus sequencing lives here; all decisions are delegated to the
// injected feature functions. Imports no feature module.

export type SearchWiringAction = "cancel" | "confirm" | "history_prev" | "query_clear";

export interface SearchActionDeps<E> {
  search: {
    readonly active: boolean;
    cancel(): void;
    confirm(): void;
    historyPrev(): void;
    queryClear(): void;
  };
  focusContainer: () => void;
  entries: () => readonly E[];
  filteredEntries: () => readonly E[];
  focusedIndex: () => number;
  // features/file-list/navigation.ts's resolveFocusIndexForVisibleSet.
  resolveFocusIndex: (entries: readonly E[], visible: readonly E[], focusedIndex: number) => number | null;
  focusIndex: (realIndex: number) => void;
}

export function createSearchActionHandler<E>(deps: SearchActionDeps<E>) {
  return function handleSearchAction(action: SearchWiringAction): void {
    switch (action) {
      case "cancel":
        // R-108/R-106 #1,#2; R-107/R-107-1: restore focus to the file list.
        deps.search.cancel();
        deps.focusContainer();
        break;
      case "confirm": {
        // R-109-1/R-109-2/R-106 #3.
        deps.search.confirm();
        if (!deps.search.active) {
          // R-109-1: an empty query closed the bar.
          deps.focusContainer();
        } else {
          // R-109-2-1: focus the resolved real index, if any (nothing
          // visible -> focus stays in the search input).
          const resolved = deps.resolveFocusIndex(deps.entries(), deps.filteredEntries(), deps.focusedIndex());
          if (resolved !== null) {
            deps.focusIndex(resolved);
            deps.focusContainer();
          }
        }
        break;
      }
      case "history_prev":
        deps.search.historyPrev();
        break;
      case "query_clear":
        deps.search.queryClear();
        break;
    }
  };
}
