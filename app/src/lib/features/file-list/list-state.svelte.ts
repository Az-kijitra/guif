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
// same pattern §5.3 prescribes for shared state owner modules. Also exports
// the underlying factory (`createFileListState`) so tests can build isolated
// instances (SPEC-0300-0012/traceability.md SHOULD-38 follow-up).
//
// SPEC-0300-0012 (search) / SPEC-0200-0001 §3.1.2, §3.1.3 (MUST-37), §3.1.4-2
// (MUST-44): `focusedIndex` continues to be stored on the `entries`
// (real/unfiltered) basis at all times. The movement/selection wrappers below
// accept an explicit `visible` array (routes' `filteredEntries`, §3.1.2) and
// internally convert real <-> visual index spaces via
// toVisualIndex/toRealIndex (features/file-list/navigation.ts) before
// touching `focusedIndex`, applying the §3.1.4-2 (MUST-44) 3-step defense so
// a filtered-out (hidden) entry is never moved into or selected.

import { fsListDir, type FsEntry } from "$lib/shared/ipc/fs";
import { DEFAULT_SORT_STATE, type SortState } from "./sort";
import { resetListStateOnDirChange, computeGoParentTarget } from "./dir-load";
import {
  selectSingle,
  applySelectToggle,
  selectAllVisible,
  invertSelectionVisible,
} from "./selection";
import {
  moveFocusRow,
  moveFocusColumn,
  toVisualIndex,
  toRealIndex,
  type RowDirection,
  type ColumnDirection,
} from "./navigation";
import { computeListLayout, type ListLayout } from "./list-layout";
import { INITIAL_UI_STATE } from "./aria";

export function createFileListState() {
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

  // §3.1.4-2 (MUST-44) step 1: an empty `visible` makes every movement/
  // selection wrapper an immediate no-op.
  function moveRow(visible: readonly FsEntry[], direction: RowDirection): void {
    if (visible.length === 0) return;
    const visualIndex = toVisualIndex(focusedIndex, entries, visible);
    // §3.1.3: a -1 (currently-hidden focus) falls back to visual index 0 as
    // a defensive starting point for the movement calculation.
    const safeVisualIndex = visualIndex === -1 ? 0 : visualIndex;
    const nextVisual = moveFocusRow(visible, safeVisualIndex, direction);
    const nextReal = toRealIndex(nextVisual, entries, visible);
    // §3.1.4-2 (MUST-44) step 3: never write an unresolved (-1) index.
    if (nextReal === -1) return;
    focusedIndex = nextReal;
  }

  function moveColumn(visible: readonly FsEntry[], direction: ColumnDirection, rowsPerColumn: number): void {
    if (visible.length === 0) return;
    const visualIndex = toVisualIndex(focusedIndex, entries, visible);
    const safeVisualIndex = visualIndex === -1 ? 0 : visualIndex;
    // SHOULD-47: totalCount is visible.length (visual space), not
    // entries.length.
    const nextVisual = moveFocusColumn(safeVisualIndex, direction, rowsPerColumn, visible.length);
    const nextReal = toRealIndex(nextVisual, entries, visible);
    if (nextReal === -1) return;
    focusedIndex = nextReal;
  }

  // §3.1.4-2 (MUST-44) step 2: a selection-changing operation no-ops when the
  // currently focused real entry is not part of `visible` (prevents
  // selecting a hidden entry, R-123).
  function selectFocused(visible: readonly FsEntry[]): void {
    if (visible.length === 0) return;
    const entry = focusedEntry();
    if (entry === undefined) return;
    if (toVisualIndex(focusedIndex, entries, visible) === -1) return;
    const result = selectSingle(entry.path);
    selected = result.selected;
    anchor = result.anchor;
  }

  function toggleFocused(visible: readonly FsEntry[]): void {
    if (visible.length === 0) return;
    const entry = focusedEntry();
    if (entry === undefined) return;
    const visualIndex = toVisualIndex(focusedIndex, entries, visible);
    if (visualIndex === -1) return;
    const result = applySelectToggle(
      { selected, focusedIndex: visualIndex, visibleCount: visible.length },
      entry.path,
    );
    selected = result.selected;
    const nextReal = toRealIndex(result.focusedIndex, entries, visible);
    if (nextReal !== -1) {
      focusedIndex = nextReal;
    }
  }

  // SHOULD-37(a)/SPEC-0300-0009 R-54/R-55/SPEC-0300-0012 R-123: select_all and
  // invert-selection operate on the visible (filtered) entries only. Neither
  // touches `focusedIndex`, so no real<->visual conversion is needed.
  function selectAll(visible: readonly FsEntry[]): void {
    if (visible.length === 0) return;
    selected = selectAllVisible(visible.map((e) => e.path));
  }

  function invertSelection(visible: readonly FsEntry[]): void {
    if (visible.length === 0) return;
    selected = invertSelectionVisible(
      visible.map((e) => e.path),
      selected,
    );
  }

  // §3.1.3/MUST-39: public update function for routes to reflect the result
  // of resolveFocusIndexForVisibleSet (R-109-2-1) into state.
  function focusIndex(realIndex: number): void {
    focusedIndex = realIndex;
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
    selectAll,
    invertSelection,
    focusIndex,
    openFocused,
    goParent,
    layout,
  };
}

export const fileListState = createFileListState();
