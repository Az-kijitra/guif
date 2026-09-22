// Feature-local UI state for the file list (SPEC-0200-0001 §5.1: each
// feature owns its own UI-local state in its own directory; this state is
// not read by any other feature, so it does not belong under
// shared/state/). It composes the pure logic modules that already live in
// this same feature directory (list-layout, sort, selection, navigation,
// dir-load) with the fs IPC wrapper (shared/ipc/fs.ts) so that
// src/routes/+page.svelte can stay a thin composition layer with no
// business logic or state of its own (§4.1 SHOULD-19).
//
// Exported as a single module-scope instance built from Svelte 5 runes, the
// same pattern §5.3 prescribes for shared state owner modules.

import { fsListDir, type FsEntry } from "$lib/shared/ipc/fs";
import { DEFAULT_SORT_STATE, type SortState } from "./sort";
import { resetListStateOnDirChange, computeGoParentTarget } from "./dir-load";
import { selectSingle, applySelectToggle } from "./selection";
import { moveFocusRow, moveFocusColumn, type RowDirection, type ColumnDirection } from "./navigation";
import { computeListLayout, type ListLayout } from "./list-layout";
import { INITIAL_UI_STATE } from "./aria";

function createFileListState() {
  let currentPath = $state(".");
  let entries = $state<FsEntry[]>([]);
  let selected = $state<Set<string>>(new Set());
  let focusedIndex = $state(0);
  let anchor = $state<string | null>(null);
  let sort = $state<SortState>({ ...DEFAULT_SORT_STATE });
  let showHidden = $state(INITIAL_UI_STATE.showHidden);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function loadDirectory(path: string): Promise<void> {
    loading = true;
    error = null;
    try {
      const result = await fsListDir({
        path,
        showHidden,
        sortKey: sort.key,
        sortOrder: sort.order,
      });
      entries = result;
      currentPath = path;
      const reset = resetListStateOnDirChange();
      selected = reset.selected;
      focusedIndex = reset.focusedIndex;
      anchor = reset.anchor;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function focusedEntry(): FsEntry | undefined {
    return entries[focusedIndex];
  }

  function moveRow(direction: RowDirection): void {
    focusedIndex = moveFocusRow(entries, focusedIndex, direction);
  }

  function moveColumn(direction: ColumnDirection, rowsPerColumn: number): void {
    focusedIndex = moveFocusColumn(focusedIndex, direction, rowsPerColumn, entries.length);
  }

  function selectFocused(): void {
    const entry = focusedEntry();
    if (entry === undefined) return;
    const result = selectSingle(entry.path);
    selected = result.selected;
    anchor = result.anchor;
  }

  function toggleFocused(): void {
    const entry = focusedEntry();
    if (entry === undefined) return;
    const result = applySelectToggle({ selected, focusedIndex, visibleCount: entries.length }, entry.path);
    selected = result.selected;
    focusedIndex = result.focusedIndex;
  }

  // R-61: opening a directory entry navigates into it; opening a file is a
  // no-op in Phase 1 (viewer integration is a later phase, SPEC-0300-0008).
  async function openFocused(): Promise<void> {
    const entry = focusedEntry();
    if (entry === undefined || entry.entryType !== "dir") return;
    await loadDirectory(entry.path);
  }

  // R-63: go_parent works even when the current listing is empty, and is a
  // no-op once already at a filesystem root.
  async function goParent(): Promise<void> {
    const target = computeGoParentTarget({ currentPath, visibleCount: entries.length });
    if (target.shouldNavigate && target.path !== undefined) {
      await loadDirectory(target.path);
    }
  }

  function layout(containerWidth: number, containerHeight: number): ListLayout {
    return computeListLayout({
      containerWidth,
      containerHeight,
      rowHeight: undefined,
      entryCount: entries.length,
      showSize: true,
      showTime: false,
    });
  }

  return {
    get currentPath() {
      return currentPath;
    },
    get entries() {
      return entries;
    },
    get selected() {
      return selected;
    },
    get focusedIndex() {
      return focusedIndex;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    loadDirectory,
    moveRow,
    moveColumn,
    selectFocused,
    toggleFocused,
    openFocused,
    goParent,
    layout,
  };
}

export const fileListState = createFileListState();
