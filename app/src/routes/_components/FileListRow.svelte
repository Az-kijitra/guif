<script lang="ts">
  // Extracted from +page.svelte (SPEC-0300-0009 R-50~R-52 click selection,
  // implemented in Phase 6 per SPEC-0300-0015 R-401-5/ISS-0132; R-402-2's
  // double-click). Pure presentation + DOM event -> callback translation; all
  // selection/open DECISION logic lives in `click.ts`/`open-decision.ts`
  // (called by the parent, not here).
  import type { FsEntry } from "$lib/shared/ipc/fs";
  // SPEC-0300-0009 R-20-11/R-20-12 (SPEC-0200-0001 §3.6.7): display-only
  // formatting; `entry.size`/`entry.modified` themselves stay the raw
  // backend values used for sorting.
  import { formatModifiedForDisplay, formatSize } from "$lib/features/file-list/format";

  let {
    entry,
    focused,
    selected,
    showSize = true,
    showTime = false,
    onRowClick,
    onRowDblClick,
  }: {
    entry: FsEntry;
    focused: boolean;
    selected: boolean;
    showSize?: boolean;
    showTime?: boolean;
    onRowClick: (path: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
    onRowDblClick: (entry: FsEntry) => void;
  } = $props();
</script>

<div
  id={entry.path}
  class="file-list-row"
  class:focused
  role="option"
  aria-selected={selected}
  onclick={(e) => onRowClick(entry.path, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
  ondblclick={() => onRowDblClick(entry)}
>
  <span class="name">{entry.entryType === "dir" ? "📁" : "📄"} {entry.name}</span>
  {#if showSize}
    <span class="size">{entry.entryType === "dir" ? "" : formatSize(entry.size)}</span>
  {/if}
  {#if showTime}
    <span class="modified">{formatModifiedForDisplay(entry.modified)}</span>
  {/if}
</div>

<style>
  .file-list-row {
    display: grid;
    grid-template-columns: 1fr 72px 140px;
    align-items: center;
    padding: 0 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
  }
  .file-list-row.focused {
    outline: 2px solid #2266dd;
    outline-offset: -2px;
  }
  .file-list-row[aria-selected="true"] {
    background: #dbe9ff;
  }
</style>
