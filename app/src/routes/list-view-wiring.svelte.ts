// SPEC-0200-0001 §3.10.1 S4: the list's derived view (R-116 filter result, R-956 geometry, R-59-1
// page rows), moved out of +page.svelte. Reads go through injected getters; the page keeps the
// reactive link with `$derived(view.x)` (never a destructuring, which would freeze the values).

import { computeFilteredEntries, type SearchMatchEntry } from "$lib/features/search/matching";
import { readRowHeightPx } from "$lib/features/file-list/text-measure";

export interface ListViewDeps<T extends SearchMatchEntry, G extends { rows: number }> {
  fileList: {
    readonly entries: readonly T[];
    layout(frameWidth: number, frameHeight: number, entryCount: number, rowHeight: number | undefined): G;
    setPageRows(rows: number): void;
  };
  search: { readonly active: boolean; readonly query: string; readonly regexMode: boolean };
  size: () => { width: number; height: number };
}

export function createListView<T extends SearchMatchEntry, G extends { rows: number }>(deps: ListViewDeps<T, G>) {
  const filterResult = $derived( // R-116: recomputed via Svelte reactivity.
    computeFilteredEntries(deps.fileList.entries, {
      active: deps.search.active,
      query: deps.search.query,
      regexMode: deps.search.regexMode,
    }),
  );
  const filteredEntries = $derived(filterResult.filteredEntries);
  // R-956: geometry from the list FRAME's size and the displayed (filtered) count.
  const layout = $derived.by(() => {
    const { width, height } = deps.size();
    return deps.fileList.layout(width || 800, height || 400, filteredEntries.length, readRowHeightPx());
  });
  // R-59-1: page_up/page_down move by the SAME "R-16-1 rows" as rowsPerColumn.
  $effect(() => {
    deps.fileList.setPageRows(layout.rows);
  });
  return {
    get filterResult() { return filterResult; },
    get filteredEntries() { return filteredEntries; },
    get layout() { return layout; },
  };
}
