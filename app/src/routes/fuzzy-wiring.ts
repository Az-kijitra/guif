import { tick } from "svelte";
import type { FuzzyMatchItem } from "$lib/shared/ipc/fuzzy";
import type { FuzzySearchState } from "$lib/features/fuzzy-search/fuzzy-search-state.svelte";
import type { createFileListState } from "$lib/features/file-list/list-state.svelte";
import type { NavigateResult } from "$lib/shared/navigation-result";

type FileListState = ReturnType<typeof createFileListState>;

export interface FuzzyWiringDeps {
  fuzzySearchState: FuzzySearchState;
  fileListState: FileListState;
  afterUserNavigation: (navigation: Promise<NavigateResult>) => Promise<NavigateResult>;
  focusContainer: () => void;
  closeMenus: () => void;
}

/**
 * SPEC-0300-0024: the folder that contains `path` (a native absolute path such as `C:\a\b.txt`).
 * A file directly under a drive yields the drive root WITH its separator (`C:\`), which is what
 * the backend's absolute-path check accepts (`C:` alone is rejected). `null` when there is no parent.
 */
export function parentDirOf(path: string): string | null {
  const sep = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (sep < 0) return null;
  const parent = path.slice(0, sep);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent === "" ? null : parent;
}

const samePath = (a: string, b: string): boolean => a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();

export function createFuzzySearchWiring(deps: FuzzyWiringDeps) {
  function openFuzzySearch(): void {
    deps.closeMenus();
    deps.fuzzySearchState.open(deps.fileListState.currentPath, deps.fileListState.showHidden());
  }

  /** Esc or a click on the backdrop: close and give the focus back to the list (like the other overlays). */
  function closeFuzzySearch(): void {
    deps.fuzzySearchState.close();
    deps.focusContainer();
  }

  async function handleFuzzySelect(item: FuzzyMatchItem): Promise<void> {
    deps.fuzzySearchState.close();
    if (item.isDir) {
      await deps.afterUserNavigation(deps.fileListState.navigate(item.path));
    } else {
      const parentDir = parentDirOf(item.path) ?? deps.fileListState.currentPath;
      await deps.afterUserNavigation(deps.fileListState.navigate(parentDir));
      await tick();
      const idx = deps.fileListState.entries.findIndex((e: { path: string }) => samePath(e.path, item.path));
      if (idx >= 0) {
        deps.fileListState.focusIndex(idx);
      }
    }
    deps.focusContainer();
  }

  return {
    openFuzzySearch,
    closeFuzzySearch,
    handleFuzzySelect,
  };
}
