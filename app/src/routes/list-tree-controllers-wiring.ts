// Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
// review item 1): assembles `onListAction`/`onTreeAction` from the raw
// feature state singletons + a handful of callbacks, absorbing the
// dependency-object construction that would otherwise sit inline in
// +page.svelte. Every dependency is injected; this module imports only the
// two existing `*-wiring.ts` factories (routes -> routes, no feature import
// of its own beyond the `FsEntry` type).

import type { FsEntry } from "$lib/shared/ipc/fs";
import { createListActionHandler, type ListActionDeps } from "./list-action-wiring";
import { createTreeActionHandler } from "./tree-action-wiring";

export interface TreeStateLike {
  clear(): void;
  followTo(path: string): Promise<void>;
  applyHiddenFilesChanged(showHidden: boolean): void;
  moveFocus(direction: "up" | "down"): void;
  moveFocusPage(direction: "up" | "down", pageSize: number): void;
  handleMoveRight(): void;
  handleMoveLeft(): void;
  selectFocused(): { path: string } | null;
}

export interface ListTreeControllersDeps {
  fileList: ListActionDeps<FsEntry>["fileList"] & { loadDirectory(path: string): Promise<string | null> };
  treeState: TreeStateLike;
  filteredEntries: () => readonly FsEntry[];
  rowsPerColumn: () => number;
  afterUserNavigation: (navigation: Promise<string | null>) => Promise<string | null>;
  activateSearch: () => void;
  openHistoryList: (mode: "history" | "jump") => void;
  addJump: (path: string) => void;
  currentPath: () => string;
  fileOps: ListActionDeps<FsEntry>["fileOps"];
  archive: ListActionDeps<FsEntry>["archive"];
  focusedEntry: ListActionDeps<FsEntry>["focusedEntry"];
  viewer: ListActionDeps<FsEntry>["viewer"];
  isTreeFocused: () => boolean;
  sortMenuToggle: () => void;
  focusContainer: () => void;
  treeFullyVisibleRows: () => number;
}

export function createListTreeControllers(deps: ListTreeControllersDeps) {
  const onListAction = createListActionHandler<FsEntry>({
    fileList: deps.fileList,
    filteredEntries: deps.filteredEntries,
    rowsPerColumn: deps.rowsPerColumn,
    afterUserNavigation: deps.afterUserNavigation,
    activateSearch: deps.activateSearch,
    openHistoryList: deps.openHistoryList,
    addJump: deps.addJump,
    currentPath: deps.currentPath,
    fileOps: deps.fileOps,
    archive: deps.archive,
    focusedEntry: deps.focusedEntry,
    viewer: deps.viewer,
    isTreeFocused: deps.isTreeFocused,
    tree: {
      clear: () => deps.treeState.clear(),
      followTo: (path) => deps.treeState.followTo(path),
      applyHiddenFilesChanged: (showHidden) => deps.treeState.applyHiddenFilesChanged(showHidden),
    },
    sortMenu: { toggle: deps.sortMenuToggle },
    focus: { container: deps.focusContainer },
  });

  const onTreeAction = createTreeActionHandler({
    tree: {
      moveFocus: (direction) => deps.treeState.moveFocus(direction),
      moveFocusPage: (direction, pageSize) => deps.treeState.moveFocusPage(direction, pageSize),
      handleMoveRight: () => deps.treeState.handleMoveRight(),
      handleMoveLeft: () => deps.treeState.handleMoveLeft(),
      selectFocused: () => deps.treeState.selectFocused(),
    },
    afterUserNavigation: deps.afterUserNavigation,
    loadDirectory: (path) => deps.fileList.loadDirectory(path),
    fullyVisibleRows: deps.treeFullyVisibleRows,
    currentPath: deps.currentPath,
  });

  return { onListAction, onTreeAction };
}
