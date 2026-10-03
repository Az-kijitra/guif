<script lang="ts">
  // Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
  // review item 1): the file list's own region (loading/error, the listbox,
  // and the sort menu overlay anchored to it, R-34-16). Presentation + wiring of
  // the measurement helpers; all state/decision logic stays in features/file-list/
  // and routes/*-wiring.ts.
  // SPEC-0300-0017 §3/§9: the outer frame (border, W/H measurement), the overlaid
  // loading/error notice (R-906), the grid list body sized by the geometry
  // (R-955/R-956), the column scroll + edge markers (R-958/R-959), and the click on
  // the frame's free space (R-956-1).
  import { onMount } from "svelte";
  import type { FsEntry } from "$lib/shared/ipc/fs";
  import type { SortKey, SortOrder } from "$lib/features/file-list/sort";
  import SortMenu from "$lib/features/file-list/SortMenu.svelte";
  import { columnScroll } from "$lib/features/file-list/column-scroll";
  import { computeEdgeMarkerRows, computeNameCellWidth, type ListGeometry } from "$lib/features/file-list/list-layout";
  import type { MeasureText } from "$lib/features/file-list/name-ellipsis";
  import { createCanvasMeasurer } from "$lib/features/file-list/text-measure";
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
    geometry,
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
    geometry: ListGeometry;
    containerEl?: HTMLDivElement;
    // clientWidth / clientHeight of the outer FRAME (W and H + 6, §3.8.2).
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

  // R-949: text widths come from a canvas in the list's own font; rebuilt once the
  // fonts have loaded.
  let measure = $state<MeasureText | undefined>();
  onMount(() => {
    if (containerEl === undefined) return;
    const font = getComputedStyle(containerEl).font;
    measure = createCanvasMeasurer(font);
    void document.fonts.ready.then(() => {
      measure = createCanvasMeasurer(font);
    });
  });

  let scrollLeft = $state(0);
  let focusIndex = $derived(entries.findIndex((e) => e.path === focusedPath));
  let nameAvail = $derived(computeNameCellWidth({ colWidth: geometry.colWidth, showSize, showTime }));
  let markers = $derived(
    computeEdgeMarkerRows({
      scrollLeft,
      pitch: geometry.pitch,
      rows: geometry.rows,
      cols: geometry.cols,
      needed: geometry.needed,
      entryCount: entries.length,
    }),
  );

  // R-956-1: a click in the frame outside the list body keeps the keyboard focus on
  // the list (never `document.body`); selection / focus row are untouched.
  function handleFrameClick(event: MouseEvent): void {
    if (containerEl !== undefined && !containerEl.contains(event.target as Node)) containerEl.focus();
  }
</script>

<div class="file-list-region">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="file-list-frame"
    data-context-area="list"
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    onclick={handleFrameClick}
  >
    {#if loading}
      <p class="list-notice">Loading…</p>
    {/if}
    {#if error}
      <p role="alert" class="list-notice error">Error: {error}</p>
    {/if}

    <div
      bind:this={containerEl}
      class="file-list"
      tabindex="0"
      role="listbox"
      data-focus-area="list"
      aria-multiselectable={ariaMultiselectable}
      aria-activedescendant={ariaActivedescendant}
      style:width="{geometry.bodyWidth}px"
      style:height="{geometry.bodyHeight}px"
      style:grid-template-rows="repeat({geometry.rows}, var(--list-row-height))"
      style:--list-col-width="{geometry.colWidth}px"
      use:columnScroll={{
        focusIndex,
        rows: geometry.rows,
        cols: geometry.cols,
        pitch: geometry.pitch,
        needed: geometry.needed,
        onScroll: (value: number) => (scrollLeft = value),
      }}
    >
      {#each entries as entry, index (entry.path)}
        <FileListRow
          {entry}
          focused={entry.path === focusedPath}
          selected={selected.has(entry.path)}
          {showSize}
          {showTime}
          colWidth={geometry.colWidth}
          {nameAvail}
          {measure}
          markerLeft={index === markers.leftIndex}
          markerRight={index === markers.rightIndex}
          {onRowClick}
          {onRowDblClick}
        />
      {/each}
    </div>
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
    display: flex;
    flex: 1;
    min-width: 0;
  }
  /* R-903 / R-904: the outer frame carries the border and background; its client size
     (W, H + 6) is what the geometry is computed from. */
  .file-list-frame {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--ui-border);
    background: var(--ui-surface);
  }
  /* R-955: column-flow grid; no scrollbar, no wheel scrolling (R-958). */
  .file-list {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--list-col-width);
    column-gap: 16px;
    row-gap: 0;
    box-sizing: content-box;
    padding: 2px 0 4px;
    overflow: hidden;
    font: 12px var(--ui-font-mono);
  }
  /* R-968 / R-966: the list shows the frame while it has keyboard focus, and the
     focus row's frame switches from muted to the focus colour. */
  .file-list:focus {
    outline: 1px solid var(--ui-focused);
    outline-offset: -1px;
  }
  .file-list:focus :global(.file-list-row.focused) {
    outline-color: var(--ui-focused);
  }
  /* R-906: overlaid at the frame's top-left; never changes the body's size. */
  .list-notice {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 1;
    box-sizing: border-box;
    max-width: calc(100% - 8px);
    margin: 0;
    padding: 2px 6px;
    border: 1px solid var(--ui-border);
    background: var(--ui-surface);
    font-size: 12px;
    overflow-wrap: anywhere;
    pointer-events: none;
  }
  .list-notice.error {
    color: var(--ui-error);
  }
</style>
