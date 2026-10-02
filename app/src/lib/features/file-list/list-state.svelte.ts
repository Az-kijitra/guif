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
import { normalizeFsListDirError, type FsListDirError } from "$lib/shared/ipc/fs-error";
import { translateErrorCode } from "$lib/shared/error-text";
import type { NavigateResult } from "$lib/shared/navigation-result";
import { DEFAULT_SORT_STATE, nextSortState, type SortKey, type SortState } from "./sort";
import { resetListStateOnDirChange, computeGoParentTarget, reconcileAfterReload } from "./dir-load";
import {
  selectSingle,
  applySelectToggle,
  selectAllVisible,
  invertSelectionVisible,
} from "./selection";
import { resolveRowClick } from "./click";
import {
  moveFocusPage,
  moveFocusRow,
  moveFocusColumn,
  toVisualIndex,
  toRealIndex,
  type RowDirection,
  type ColumnDirection,
} from "./navigation";
import { computeListGeometry, type ListGeometry } from "./list-layout";
import { INITIAL_UI_STATE } from "./aria";
import { SORT_KEYS } from "./sort";
import { uiStatePersistence } from "./ui-state-persistence";
import type { UiStateData } from "$lib/shared/ipc/config";

export function createFileListState() {
  let currentPath = $state(".");
  let entries = $state<FsEntry[]>([]);
  let selected = $state<Set<string>>(new Set());
  let focusedIndex = $state(0);
  let anchor = $state<string | null>(null);
  let sort = $state<SortState>({ ...DEFAULT_SORT_STATE });
  let showHidden = $state(INITIAL_UI_STATE.showHidden);
  // SPEC-0300-0009 R-21/R-13; SPEC-0200-0001 §3.6.6: persisted display-state
  // (ui-state.toml) fields the tree/toggle_* actions read/flip. A
  // `requestUiStateSave` callback (registered via `onUiStateChange`) is
  // invoked after every toggle so `+page.svelte`'s ui-state persistence
  // coordinator can debounce a save without this module importing
  // `shared/ipc/config.ts`/`shared/persistence-coordinator.ts` directly.
  let showSize = $state(INITIAL_UI_STATE.showSize);
  let showTime = $state(INITIAL_UI_STATE.showTime);
  let showTree = $state(INITIAL_UI_STATE.showTree);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let onUiStateChangeCallback: (() => void) | undefined;

  function requestUiStateSave(): void {
    onUiStateChangeCallback?.();
  }

  // SPEC-0200-0001 §3.7.10.1/§3.7.10.12 (MUST-96/97/105/106, SHOULD-135):
  // loadDirectory / navigate / reload share ONE listing core (fetchEntries)
  // and ONE outrun guard (loadSequence): only the most recently issued
  // request may touch state. Stale results never touch state.
  let loadSequence = 0;
  // The sequence of the latest navigation request (not reload) while it is
  // still unsettled; null otherwise. reload() is deferred only while the
  // latest request is such a navigation (MUST-106).
  let pendingNavigateSeq: number | null = null;
  let pendingReloadAfterNavigate: { focusPath?: string; clearSelection?: boolean } | null = null;

  // R-731: message table (features/file-list may use shared/error-text).
  function describeFsListDirError(err: FsListDirError): string {
    switch (err.code) {
      case "access_denied":
        return translateErrorCode("permission_denied") ?? err.message;
      case "not_found":
        return translateErrorCode("not_found") ?? err.message;
      case "not_a_directory":
        return translateErrorCode("not_a_directory") ?? err.message;
      default:
        return err.message;
    }
  }

  type CoreFetchResult =
    | { outcome: "stale" }
    | { outcome: "failed"; code: string; message: string }
    | { outcome: "success"; entries: FsEntry[] };

  async function fetchEntries(path: string, mySequence: number): Promise<CoreFetchResult> {
    try {
      const result = await fsListDir({
        path,
        showHidden,
        sortKey: sort.key,
        sortOrder: sort.order,
      });
      if (mySequence !== loadSequence) return { outcome: "stale" };
      return { outcome: "success", entries: result };
    } catch (e) {
      if (mySequence !== loadSequence) return { outcome: "stale" };
      const err = normalizeFsListDirError(e);
      return { outcome: "failed", code: err.code, message: describeFsListDirError(err) };
    }
  }

  async function runNavigation(
    path: string,
    mySequence: number,
    onFailure: (message: string) => void,
  ): Promise<NavigateResult> {
    pendingNavigateSeq = mySequence;
    loading = true;
    try {
      const core = await fetchEntries(path, mySequence);
      if (core.outcome === "stale") return { status: "stale" };
      if (core.outcome === "failed") {
        onFailure(core.message);
        return { status: "failed", code: core.code, message: core.message };
      }
      entries = core.entries;
      currentPath = path;
      error = null; // MUST-96: a successful move clears a stale banner
      const reset = resetListStateOnDirChange();
      selected = reset.selected;
      focusedIndex = reset.focusedIndex;
      anchor = reset.anchor;
      return { status: "success", path };
    } finally {
      if (mySequence === loadSequence) loading = false;
      if (mySequence === pendingNavigateSeq) pendingNavigateSeq = null;
    }
  }

  // SHOULD-145: re-issue a reload that was deferred while the latest
  // navigation was pending. After a successful move the captured
  // focusPath/clearSelection belong to the OLD directory and are dropped.
  function flushPendingReloadIfLatestSettled(mySequence: number, result: NavigateResult): void {
    if (mySequence !== pendingNavigateSeq && pendingNavigateSeq !== null) return;
    if (pendingReloadAfterNavigate === null) return;
    // Outrun by a non-navigation request (a reload): that request owns the
    // outcome, nothing to re-issue.
    if (mySequence !== loadSequence && result.status === "stale") return;
    const opts = pendingReloadAfterNavigate;
    pendingReloadAfterNavigate = null;
    void reload(result.status === "success" ? undefined : opts);
  }

  // R-726/R-238: a user-initiated move. Never writes the error banner
  // (failures are reported through the returned value).
  async function navigate(path: string): Promise<NavigateResult> {
    const mySequence = ++loadSequence;
    const result = await runNavigation(path, mySequence, () => {});
    flushPendingReloadIfLatestSettled(mySequence, result);
    return result;
  }

  // Initial-load entry (SPEC-0300-0009 R-77): on a non-stale failure the
  // permanent error banner is set, since no list exists to keep showing.
  async function loadDirectory(path: string): Promise<NavigateResult> {
    const mySequence = ++loadSequence;
    const result = await runNavigation(path, mySequence, (message) => {
      error = message;
    });
    flushPendingReloadIfLatestSettled(mySequence, result);
    return result;
  }

  // MUST-105: loads only when no other request was issued since sinceSeq.
  function currentSequence(): number {
    return loadSequence;
  }

  async function loadIfNoNewerRequest(path: string, sinceSeq: number): Promise<NavigateResult> {
    if (sinceSeq !== loadSequence) return { status: "stale" };
    return loadDirectory(path);
  }

  // SPEC-0200-0001 §3.3.6: re-list the CURRENT path without discarding
  // selection/focus (unlike a navigation, R-72). Not a navigation (R-209):
  // callers must not record a visit. While the latest navigation is still
  // pending the reload is deferred and re-issued after it settles (MUST-97).
  async function reload(opts?: { focusPath?: string; clearSelection?: boolean }): Promise<string | null> {
    if (pendingNavigateSeq !== null && pendingNavigateSeq === loadSequence) {
      pendingReloadAfterNavigate = { ...(pendingReloadAfterNavigate ?? {}), ...opts };
      return null;
    }
    const mySequence = ++loadSequence;
    const path = currentPath;
    try {
      const core = await fetchEntries(path, mySequence);
      if (core.outcome === "stale") return null;
      if (core.outcome === "failed") {
        error = core.message;
        return null;
      }
      const result = core.entries;
      const reconciled = reconcileAfterReload({
        prevEntries: entries,
        prevSelected: selected,
        prevFocusedPath: entries[focusedIndex]?.path ?? null,
        nextEntries: result,
        focusPath: opts?.focusPath,
        clearSelection: opts?.clearSelection,
      });
      entries = result;
      selected = reconciled.selected;
      focusedIndex = reconciled.focusedIndex;
      if (anchor !== null && !reconciled.selected.has(anchor)) anchor = null;
      error = null;
      return path;
    } finally {
      if (mySequence === loadSequence) loading = false;
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

  // SPEC-0300-0009 R-50~R-52 (SPEC-0300-0015 R-401-5/ISS-0132): mouse click
  // selection, delegated to the pure `click.ts` (§3.5.3). `visible` is in
  // display order (routes' `filteredEntries`); `focusedIndex` is converted
  // back to real-entry space like every other movement/selection wrapper.
  function clickRow(
    visible: readonly FsEntry[],
    path: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean },
  ): void {
    if (visible.length === 0) return;
    const result = resolveRowClick(
      visible.map((e) => e.path),
      { selected, anchor },
      path,
      modifiers,
    );
    selected = result.selected;
    anchor = result.anchor;
    const nextReal = toRealIndex(result.focusedIndex, entries, visible);
    if (nextReal !== -1) focusedIndex = nextReal;
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
  async function openFocused(): Promise<NavigateResult> {
    const entry = focusedEntry();
    if (entry === undefined || entry.entryType !== "dir") return { status: "noop" };
    return navigate(entry.path);
  }

  // R-63: go_parent works even when the current listing is empty, and is a
  // no-op once already at a filesystem root.
  async function goParent(): Promise<NavigateResult> {
    const target = computeGoParentTarget({ currentPath, visibleCount: entries.length });
    if (target.shouldNavigate && target.path !== undefined) {
      return navigate(target.path);
    }
    return { status: "noop" };
  }

  // SPEC-0300-0017 R-956 / SPEC-0200-0001 §3.8.6: the full geometry from the file list
  // FRAME's size. `entryCount` defaults to all entries; routes passes the search-filtered
  // count (file-list never imports search, §3.1.2 path 2). `rowHeight` comes from
  // `--list-row-height` (undefined => the 32px fallback).
  function layout(
    frameWidth: number,
    frameHeight: number,
    entryCount: number = entries.length,
    rowHeight: number | undefined = undefined,
  ): ListGeometry {
    return computeListGeometry({ frameWidth, frameHeight, rowHeight, entryCount, showSize, showTime });
  }

  // SPEC-0200-0001 §3.6.6: toggles flip a flag and request a save; the
  // eventual re-render (showSize/showTime) or reload (showHidden) is the
  // only observable effect -- these never import tree-state.svelte.ts
  // (MUST-94: ties to the tree are composed in routes/list-action-wiring.ts).
  function toggleHidden(): void {
    showHidden = !showHidden;
    const focusPath = focusedEntry()?.path;
    void reload({ focusPath });
    requestUiStateSave();
  }

  function toggleSize(): void {
    showSize = !showSize;
    requestUiStateSave();
  }

  function toggleTime(): void {
    showTime = !showTime;
    requestUiStateSave();
  }

  // MUST-94: flag flip + save request ONLY -- the tree's own
  // clear()/followTo() reaction lives in routes/list-action-wiring.ts's
  // `toggle_tree` case (§3.6.11.4(b)/(f)).
  function toggleTree(): void {
    showTree = !showTree;
    requestUiStateSave();
  }

  // R-34-13: selection/search state is untouched; the caller (sort-menu
  // wiring) reloads with the current focus path preserved.
  function applySort(key: SortKey): void {
    sort = nextSortState(sort, key);
    const focusPath = focusedEntry()?.path;
    void reload({ focusPath });
    requestUiStateSave();
  }

  // R-54-1: clears the selection; focus is unaffected.
  function clearSelection(): void {
    selected = new Set();
    anchor = null;
  }

  // R-59-1: page_up/page_down move by "1列分の行数" (R-16-1's `rows`, the
  // SAME value `layout()` computes and routes/+page.svelte already exposes
  // as `rowsPerColumn` for move_left/move_right). The caller reports the
  // measured value via `setPageRows` (reactively, whenever the container is
  // resized) rather than `pageUp`/`pageDown` taking it as a call argument,
  // so the existing single-argument `fileList.pageUp(filtered)` call in
  // routes/list-action-wiring.ts (and its frozen test) is unaffected.
  let pageRows = $state(1);

  function setPageRows(rows: number): void {
    pageRows = Math.max(1, rows);
  }

  function pageUp(visible: readonly FsEntry[]): void {
    movePage(visible, "up");
  }

  function pageDown(visible: readonly FsEntry[]): void {
    movePage(visible, "down");
  }

  function movePage(visible: readonly FsEntry[], direction: "up" | "down"): void {
    if (visible.length === 0) return;
    const visualIndex = toVisualIndex(focusedIndex, entries, visible);
    const safeVisualIndex = visualIndex === -1 ? 0 : visualIndex;
    const nextVisual = moveFocusPage(visible, safeVisualIndex, direction, pageRows);
    const nextReal = toRealIndex(nextVisual, entries, visible);
    if (nextReal === -1) return;
    focusedIndex = nextReal;
  }

  function onUiStateChange(callback: () => void): void {
    onUiStateChangeCallback = callback;
  }

  // §3.6.11.11: applied ONLY at startup (before the first fs_list_dir,
  // R-77-3-1), never re-applied mid-session. `sortKey`/`sortOrder` arrive as
  // plain strings from `ui-state.toml`'s IPC DTO; an out-of-range value
  // (should already be defaulted by the backend, AC-629 (iii)) is ignored
  // defensively rather than corrupting `sort`.
  function hydrateUiState(data: UiStateData): void {
    showHidden = data.uiShowHidden;
    showSize = data.uiShowSize;
    showTime = data.uiShowTime;
    showTree = data.uiShowTree;
    const key = (SORT_KEYS as readonly string[]).includes(data.sortKey) ? (data.sortKey as SortKey) : sort.key;
    const order = data.sortOrder === "asc" || data.sortOrder === "desc" ? data.sortOrder : sort.order;
    sort = { key, order };
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
    showTree: () => showTree,
    showHidden: () => showHidden,
    showSize: () => showSize,
    showTime: () => showTime,
    sortKey: () => sort.key,
    sortOrder: () => sort.order,
    loadDirectory,
    navigate,
    currentSequence,
    loadIfNoNewerRequest,
    reload,
    moveRow,
    moveColumn,
    selectFocused,
    toggleFocused,
    clickRow,
    selectAll,
    invertSelection,
    focusIndex,
    openFocused,
    goParent,
    layout,
    toggleHidden,
    toggleSize,
    toggleTime,
    toggleTree,
    applySort,
    clearSelection,
    pageUp,
    pageDown,
    setPageRows,
    onUiStateChange,
    hydrateUiState,
  };
}

export const fileListState = createFileListState();

// SPEC-0200-0001 §3.6.6/§3.6.11.11 (SHOULD-118/130): self-registers with the
// ui-state.toml persistence coordinator, mirroring the existing
// navigation-history-state.svelte.ts/search-state.svelte.ts precedent. Only
// the module-scope singleton participates (not every `createFileListState()`
// instance a test builds), so isolated test instances stay side-effect-free.
uiStatePersistence.register({
  getSnapshot: () => ({
    uiShowHidden: fileListState.showHidden(),
    uiShowSize: fileListState.showSize(),
    uiShowTime: fileListState.showTime(),
    uiShowTree: fileListState.showTree(),
    sortKey: fileListState.sortKey(),
    sortOrder: fileListState.sortOrder(),
  }),
  hydrate: (data) => fileListState.hydrateUiState(data),
});
fileListState.onUiStateChange(() => uiStatePersistence.requestSave());
