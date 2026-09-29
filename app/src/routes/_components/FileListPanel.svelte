<script lang="ts">
  // Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
  // review item 1): the file list's own region (loading/error, the listbox,
  // and the sort menu overlay anchored to it, R-34-16). Pure presentation;
  // all state/decision logic stays in features/file-list/ and routes/*-wiring.ts.
  import type { FsEntry } from "$lib/shared/ipc/fs";
  import type { SortKey, SortOrder } from "$lib/features/file-list/sort";
  import SortMenu from "$lib/features/file-list/SortMenu.svelte";
  import FileListRow from "./FileListRow.svelte";

  let {
    loading,
    error,
    entries,
    focusedPath,
    selected,
    showSize,
    showTime,
    ariaMultiselectable,
    ariaActivedescendant,
    rows,
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
    loading: boolean;
    error: string | null;
    entries: readonly FsEntry[];
    focusedPath: string;
    selected: ReadonlySet<string>;
    showSize: boolean;
    showTime: boolean;
    ariaMultiselectable: true;
    ariaActivedescendant?: string;
    rows: number;
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

<div class="file-list-region">
  {#if loading}
    <p>Loading…</p>
  {/if}
  {#if error}
    <p role="alert" class="error">Error: {error}</p>
  {/if}

  <div
    bind:this={containerEl}
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    class="file-list"
    tabindex="0"
    role="listbox"
    aria-multiselectable={ariaMultiselectable}
    aria-activedescendant={ariaActivedescendant}
    style="grid-template-rows: repeat({Math.max(rows, 1)}, 2rem); grid-auto-flow: column;"
  >
    {#each entries as entry (entry.path)}
      <FileListRow
        {entry}
        focused={entry.path === focusedPath}
        selected={selected.has(entry.path)}
        {showSize}
        {showTime}
        {onRowClick}
        {onRowDblClick}
      />
    {/each}
  </div>

  {#if sortMenuOpen}
    <SortMenu
      highlightedKey={sortMenuHighlightedKey}
      currentSortKey={sortMenuCurrentKey}
      currentSortOrder={sortMenuCurrentOrder}
      onClose={onSortMenuClose}
    />
  {/if}
</div>

<style>
  .file-list-region {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .file-list {
    display: grid;
    grid-auto-columns: 352px;
    gap: 0 0.5rem;
    overflow: auto;
    border: 1px solid #ccc;
    padding: 0.25rem;
    min-height: 200px;
  }
  .error {
    color: #b00020;
  }
</style>
