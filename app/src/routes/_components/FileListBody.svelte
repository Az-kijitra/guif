<script lang="ts">
  // Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
  // review item 1): the tree panel + file list side-by-side region
  // (R-10-11/AC-631, §3.6.11.4(e)). Pure presentation + prop forwarding.
  import type { FsEntry } from "$lib/shared/ipc/fs";
  import type { TreeRowView } from "$lib/features/file-list/tree-state.svelte";
  import type { SortKey, SortOrder } from "$lib/features/file-list/sort";
  import TreePanel from "$lib/features/file-list/TreePanel.svelte";
  import FileListPanel from "./FileListPanel.svelte";

  let {
    showTree,
    treeRows,
    treeFocusedPath,
    treeCurrentDirPath,
    treeHasFocus,
    treeContainerEl = $bindable(),
    treeFullyVisibleRows = $bindable(1),
    onTreeToggleExpand,
    onTreeSelectPath,
    onTreeContainerFocus,
    loading,
    error,
    entries,
    focusedPath,
    selected,
    showSize,
    showTime,
    ariaMultiselectable,
    ariaActivedescendant,
    layoutRows,
    containerEl = $bindable(),
    containerWidth = $bindable(0),
    containerHeight = $bindable(0),
    onRowClick,
    onRowDblClick,
    sortMenuOpen,
    sortMenuHighlightedKey,
    sortMenuCurrentKey,
    sortMenuCurrentOrder,
    onSortMenuClose,
  }: {
    showTree: boolean;
    treeRows: TreeRowView[];
    treeFocusedPath: string | null;
    treeCurrentDirPath: string;
    treeHasFocus: boolean;
    treeContainerEl?: HTMLDivElement;
    treeFullyVisibleRows?: number;
    onTreeToggleExpand: (path: string) => void;
    onTreeSelectPath: (path: string) => void;
    onTreeContainerFocus: (focused: boolean) => void;
    loading: boolean;
    error: string | null;
    entries: readonly FsEntry[];
    focusedPath: string;
    selected: ReadonlySet<string>;
    showSize: boolean;
    showTime: boolean;
    ariaMultiselectable: true;
    ariaActivedescendant?: string;
    layoutRows: number;
    containerEl?: HTMLDivElement;
    containerWidth?: number;
    containerHeight?: number;
    onRowClick: (path: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
    onRowDblClick: (entry: FsEntry) => void;
    sortMenuOpen: boolean;
    sortMenuHighlightedKey: SortKey;
    sortMenuCurrentKey: SortKey;
    sortMenuCurrentOrder: SortOrder;
    onSortMenuClose: () => void;
  } = $props();
</script>

<div class="body">
  {#if showTree}
    <TreePanel
      bind:containerEl={treeContainerEl}
      bind:fullyVisibleRows={treeFullyVisibleRows}
      rows={treeRows}
      focusedPath={treeFocusedPath}
      currentDirPath={treeCurrentDirPath}
      hasFocus={treeHasFocus}
      onToggleExpand={onTreeToggleExpand}
      onSelectPath={onTreeSelectPath}
      onContainerFocus={onTreeContainerFocus}
    />
  {/if}

  <FileListPanel
    bind:containerEl
    bind:containerWidth
    bind:containerHeight
    {loading}
    {error}
    {entries}
    {focusedPath}
    {selected}
    {showSize}
    {showTime}
    {ariaMultiselectable}
    {ariaActivedescendant}
    rows={layoutRows}
    {onRowClick}
    {onRowDblClick}
    {sortMenuOpen}
    {sortMenuHighlightedKey}
    {sortMenuCurrentKey}
    {sortMenuCurrentOrder}
    {onSortMenuClose}
  />
</div>

<style>
  .body {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
</style>
