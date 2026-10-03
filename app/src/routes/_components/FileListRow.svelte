<script lang="ts">
  // Extracted from +page.svelte (SPEC-0300-0009 R-50~R-52 click selection,
  // implemented in Phase 6 per SPEC-0300-0015 R-401-5/ISS-0132; R-402-2's
  // double-click). Pure presentation + DOM event -> callback translation; all
  // selection/open DECISION logic lives in `click.ts`/`open-decision.ts`
  // (called by the parent, not here).
  // SPEC-0300-0017 §8: grid row look (R-945~R-948), name elision that keeps the
  // extension (R-949, via the injected `measure`), edge markers (R-959).
  import type { FsEntry } from "$lib/shared/ipc/fs";
  // SPEC-0300-0009 R-20-11/R-20-12 (SPEC-0200-0001 §3.6.7): display-only
  // formatting; `entry.size`/`entry.modified` themselves stay the raw
  // backend values used for sorting.
  import { formatModifiedForDisplay, formatSize } from "$lib/features/file-list/format";
  import { rowGridTemplate } from "$lib/features/file-list/list-layout";
  import { ellipsizeFileName, type MeasureText } from "$lib/features/file-list/name-ellipsis";

  let {
    entry,
    focused,
    selected,
    showSize = true,
    showTime = false,
    colWidth,
    nameAvail,
    measure,
    markerLeft = false,
    markerRight = false,
    onRowClick,
    onRowDblClick,
  }: {
    entry: FsEntry;
    focused: boolean;
    selected: boolean;
    showSize?: boolean;
    showTime?: boolean;
    // Column width / name-cell width (list-layout.ts); `measure` is undefined until
    // the fonts are known (the CSS ellipsis covers that moment).
    colWidth: number;
    nameAvail: number;
    measure?: MeasureText;
    markerLeft?: boolean;
    markerRight?: boolean;
    onRowClick: (path: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
    onRowDblClick: (entry: FsEntry) => void;
  } = $props();

  const isDir = $derived(entry.entryType === "dir");
  const icon = $derived(isDir ? "📁" : "📄"); // R-990
  // R-949: the width left for the name = name cell - (icon + space) - markers (G1).
  const shownName = $derived.by(() => {
    if (measure === undefined) return entry.name;
    const markers = (markerLeft ? measure("◀") : 0) + (markerRight ? measure("▶") : 0);
    const avail = nameAvail - measure(icon + " ") - markers;
    return ellipsizeFileName({ name: entry.name, ext: entry.ext, isDir, avail }, measure);
  });
</script>

<div
  id={entry.path}
  data-entry-path={entry.path}
  class="file-list-row"
  class:focused
  role="option"
  aria-selected={selected}
  aria-label={entry.name}
  style:grid-template-columns={rowGridTemplate(showSize, showTime, colWidth)}
  onclick={(e) => onRowClick(entry.path, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
  ondblclick={() => onRowDblClick(entry)}
>
  <span class="name" title={entry.name}>
    <span class="name-text">{icon} {shownName}</span>
    {#if markerLeft}<span class="marker" aria-hidden="true">◀</span>{/if}
    {#if markerRight}<span class="marker" aria-hidden="true">▶</span>{/if}
  </span>
  {#if showSize}
    <span class="size">{isDir ? "" : formatSize(entry.size)}</span>
  {/if}
  {#if showTime}
    <span class="modified">{formatModifiedForDisplay(entry.modified)}</span>
  {/if}
</div>

<style>
  .file-list-row {
    display: grid;
    align-items: center;
    box-sizing: border-box;
    height: var(--list-row-height);
    width: var(--list-col-width);
    padding: 4px 6px;
    column-gap: 2px;
    border-top: 1px solid var(--ui-border-muted);
    overflow: hidden;
    cursor: default;
  }
  /* R-967: the focus row keeps a frame without keyboard focus (muted); the list's
     own :focus rule switches it to --ui-focused (R-966). */
  .file-list-row.focused {
    outline: 1px solid var(--ui-muted);
    outline-offset: -1px;
  }
  .file-list-row[aria-selected="true"] {
    background: var(--ui-selected);
  }
  .name {
    display: flex;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .marker {
    flex: none;
    color: var(--ui-muted);
  }
  .size,
  .modified {
    overflow: hidden;
    text-align: right;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ui-muted);
    font-size: 11px;
  }
</style>
