import { tick } from "svelte";
import type { FuzzyMatchItem } from "$lib/shared/ipc/fuzzy";
import type { FuzzySearchState } from "$lib/features/fuzzy-search/fuzzy-search-state.svelte";
import type { FileListState } from "$lib/features/file-list/file-list-state.svelte";

export interface FuzzyWiringDeps {
  fuzzySearchState: FuzzySearchState;
  fileListState: FileListState;
  afterUserNavigation: (navPromise: Promise<unknown>) => Promise<void>;
  focusContainer: () => void;
  closeMenus: () => void;
}

export function createFuzzySearchWiring(deps: FuzzyWiringDeps) {
  function openFuzzySearch(): void {
    deps.closeMenus();
    deps.fuzzySearchState.open(deps.fileListState.currentPath);
  }

  async function handleFuzzySelect(item: FuzzyMatchItem): Promise<void> {
    deps.fuzzySearchState.close();
    if (item.isDir) {
      await deps.afterUserNavigation(deps.fileListState.navigate(item.path));
    } else {
      const normalized = item.path.replace(/\\/g, "/");
      const lastSlash = normalized.lastIndexOf("/");
      const parentDir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : deps.fileListState.currentPath;
      await deps.afterUserNavigation(deps.fileListState.navigate(parentDir));
      await tick();
      const idx = deps.fileListState.entries.findIndex((e) => e.path.replace(/\\/g, "/") === normalized);
      if (idx >= 0) {
        deps.fileListState.focusIndex(idx);
      }
    }
    deps.focusContainer();
  }

  return {
    openFuzzySearch,
    handleFuzzySelect,
  };
}
