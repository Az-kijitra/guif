// SPEC-0200-0001 §3.8.11: the tree state's production wiring, extracted from
// +page.svelte (line budget). Composition only: the child query (R-41), the
// visibility gate and the failure notice are injected; decisions live in
// features/file-list/{tree,tree-state}.

import { createTreeState } from "$lib/features/file-list/tree-state.svelte";
import { getTreeChildQuery } from "$lib/features/file-list/tree";
import { fsListDir, fsListDrives } from "$lib/shared/ipc/fs";

export interface MainTreeStateDeps {
  isVisible: () => boolean;
  notify: (message: string) => void;
}

export function createMainTreeState(deps: MainTreeStateDeps) {
  // R-41: dir-only, name/asc, independent of the list's own sort.
  async function listDirForTree(path: string, showHidden: boolean) {
    const query = getTreeChildQuery(path);
    const entries = await fsListDir({ path: query.path, showHidden, sortKey: query.sortKey, sortOrder: query.sortOrder });
    return entries.filter((e) => e.entryType === "dir").map((e) => ({ path: e.path, name: e.name }));
  }
  const treeState = createTreeState({
    listDir: listDirForTree,
    isVisible: deps.isVisible,
    onLoadFailureNotice: deps.notify,
    listDrives: () => fsListDrives(), // R-782: async, DI-able
  });
  return { treeState, listDirForTree };
}
