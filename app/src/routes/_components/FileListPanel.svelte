<script lang="ts">
  // Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
  // review item 1): the file list's own region (loading/error, the listbox,
  // and the sort menu overlay anchored to it, R-34-16). Presentation + wiring of
  // the measurement helpers; all state/decision logic stays in features/file-list/
  // and the routes wiring files.
  // SPEC-0300-0023 (replaces SPEC-0300-0017 §3/§9 for the look): the frame `.pane` with its heading (R-1760 .. R-1763), the INNER body whose size
  // the geometry is computed from, only the drawn PAGE of the entries (R-1792 / R-1793; no scrolling), a vertical line on every drawn column but
  // the last (R-1794), `項目なし` as text on the first row (R-1790), and the loading/error notice (R-906).
  import { onMount } from "svelte";
  import { COMMON } from "$lib/shared/messages";
  import { listErrorText } from "../messages";
  import type { FsEntry } from "$lib/shared/ipc/fs";
  import type { SortKey, SortOrder } from "$lib/features/file-list/sort";
  import { shouldShowEmptyNotice } from "$lib/features/file-list/list-notice";
  import SortMenu from "$lib/features/file-list/SortMenu.svelte";
  import { computeNameCellWidth, type ListGeometry } from "$lib/features/file-list/list-layout";
  import { listHeadingText } from "$lib/features/file-list/pane-layout";
  import type { MeasureText } from "$lib/features/file-list/name-ellipsis";
  import { createCanvasMeasurer } from "$lib/features/file-list/text-measure";
  import { appearanceState } from "$lib/shared/state/appearance-state.svelte";
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
    // clientWidth / clientHeight of the INNER body (below the heading, inside the frame line): W and H of R-1792.
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

  // R-1788: text widths come from a canvas in the list's own font; rebuilt once the fonts have loaded. §3.18.6: the same measurer gives
  // `ch` (the advance of `0`), which the column maths of the wiring uses.
  let measure = $state<MeasureText | undefined>();
  onMount(() => {
    if (containerEl === undefined) return;
    const font = getComputedStyle(containerEl).font;
    const build = (): void => {
      const measurer = createCanvasMeasurer(font);
      appearanceState.setCh(measurer("0"));
      measure = measurer;
    };
    build();
    void document.fonts.ready.then(build);
  });

  // R-1761 / MINOR-9: ONE boolean decides the frame colour and the cursor row.
  let listFocused = $state(false);
  // SPEC-0300-0009 R-26: `項目なし` when the render target is empty (not loading, no error).
  let showEmpty = $derived(shouldShowEmptyNotice({ loading, error, entryCount: entries.length }));
  const nameAvailOf = (colWidth: number, separator: boolean): number =>
    computeNameCellWidth({ colWidth, ch: appearanceState.ch, showSize, showTime, separator });
  let page = $derived(entries.slice(geometry.first, geometry.last + 1));
  let heading = $derived(
    listHeadingText({
      count: entries.length,
      sortKey: sortMenuCurrentKey,
      sortOrder: sortMenuCurrentOrder,
      hasLeft: geometry.startCol > 0,
      hasRight: geometry.startCol + geometry.shown < geometry.totalCols,
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
  <div class="pane file-list-frame" class:active={listFocused} data-context-area="list" onclick={handleFrameClick}>
    <div class="pane-title" role="presentation">{heading}</div>
    <div class="pane-body" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
      {#if loading}
        <p class="list-notice">{COMMON.loading}</p>
      {/if}
      {#if error}
        <p role="alert" class="list-notice error">{listErrorText(error)}</p>
      {/if}
      {#if showEmpty}
        <p id="file-list-empty" class="list-empty">{COMMON.noItems}</p>
      {/if}

      <div
        bind:this={containerEl}
        class="file-list"
        tabindex="0"
        role="listbox"
        aria-describedby={showEmpty ? "file-list-empty" : undefined}
        data-focus-area="list"
        aria-multiselectable={ariaMultiselectable}
        aria-activedescendant={ariaActivedescendant}
        onfocus={() => (listFocused = true)}
        onblur={() => (listFocused = false)}
        style:width="{geometry.bodyWidth}px"
        style:height="{geometry.bodyHeight}px"
        style:grid-template-columns={geometry.colWidths.map((w) => `${w}px`).join(" ")}
        style:grid-template-rows="repeat({geometry.rows}, var(--list-row-height))"
      >
        {#each page as entry, i (entry.path)}
          {@const col = Math.floor(i / geometry.rows)}
          <FileListRow
            {entry}
            focused={entry.path === focusedPath}
            {listFocused}
            selected={selected.has(entry.path)}
            {showSize}
            {showTime}
            separator={col < geometry.shown - 1}
            nameAvail={nameAvailOf(geometry.colWidths[col] ?? geometry.bodyWidth, col < geometry.shown - 1)}
            {measure}
            {onRowClick}
            {onRowDblClick}
          />
        {/each}
      </div>
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
  /* The frame (`.pane` in app.css) fills the region; its INNER body is what the geometry is computed from. */
  .file-list-frame {
    flex: 1;
    overflow: hidden;
  }
  /* R-1792 .. R-1794: the drawn page as a column-flow grid of `colWidths` columns; no scrollbar, no scrolling. */
  .file-list {
    display: grid;
    grid-auto-flow: column;
    row-gap: 0;
    box-sizing: border-box;
    overflow: hidden;
    font-family: var(--ui-font);
    font-size: var(--ui-font-size);
    outline: none;
  }
  /* R-1794: a vertical line on every drawn column but the last, inside the column width. */
  .file-list :global(.file-list-row.sep) {
    box-sizing: border-box;
    border-right: 1px solid var(--ui-border);
  }
  /* R-906: overlaid at the body's top-left; never changes the body's size. */
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
    font-size: var(--ui-font-size);
    overflow-wrap: anywhere;
    pointer-events: none;
  }
  .list-notice.error {
    color: var(--ui-error);
  }
  /* R-1790 / SHOULD-4: plain text on the first row (after the 2ch mark column); the click goes through to the list. */
  .list-empty {
    position: absolute;
    top: 0;
    left: 2ch;
    z-index: 1;
    margin: 0;
    color: var(--ui-border);
    font-family: var(--ui-font);
    font-size: var(--ui-font-size);
    line-height: var(--list-row-height);
    white-space: pre;
    pointer-events: none;
  }
</style>
