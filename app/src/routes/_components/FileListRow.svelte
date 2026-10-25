<script lang="ts">
  // Extracted from +page.svelte (SPEC-0300-0009 R-50~R-52 click selection,
  // implemented in Phase 6 per SPEC-0300-0015 R-401-5/ISS-0132; R-402-2's
  // double-click). Pure presentation + DOM event -> callback translation; all
  // selection/open DECISION logic lives in `click.ts`/`open-decision.ts`
  // (called by the parent, not here).
  // SPEC-0300-0023 R-1780 .. R-1788: the row of the tuif look: mark column (`* `), name, size (`<DIR>` for a folder), time; one colour for the
  // whole row by priority cursor > selected > folder > executable > normal; the name is shortened by the injected `measure` (R-1788).
  import type { FsEntry } from "$lib/shared/ipc/fs";
  // SPEC-0300-0009 R-20-11/R-20-12 (SPEC-0200-0001 §3.6.7): display-only
  // formatting; `entry.size`/`entry.modified` themselves stay the raw
  // backend values used for sorting.
  import { formatModifiedForDisplay, formatSizeCell, isExecutableName, selectionMark } from "$lib/features/file-list/format";
  import { rowGridTemplate } from "$lib/features/file-list/list-layout";
  import { ellipsizeFileName, type MeasureText } from "$lib/features/file-list/name-ellipsis";
  import { getFileIcon } from "$lib/shared/file-icons";

  let {
    entry,
    focused,
    listFocused,
    selected,
    showSize = true,
    showTime = false,
    separator = false,
    nameAvail,
    measure,
    onRowClick,
    onRowDblClick,
  }: {
    entry: FsEntry;
    // This row is the cursor row.
    focused: boolean;
    // The list body has keyboard focus (the ONE boolean that also colours the frame, R-1761).
    listFocused: boolean;
    selected: boolean;
    showSize?: boolean;
    showTime?: boolean;
    // R-1794: a vertical line on the right (every drawn column but the last).
    separator?: boolean;
    // Width left for the name (list-layout.ts::computeNameCellWidth); `measure` is undefined until the fonts are known
    // (the name is then shown whole and the cell clips it).
    nameAvail: number;
    measure?: MeasureText;
    onRowClick: (path: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
    onRowDblClick: (entry: FsEntry) => void;
  } = $props();

  const isDir = $derived(entry.entryType === "dir");
  const exe = $derived(!isDir && isExecutableName(entry.name));
  const shownName = $derived.by(() => {
    if (measure === undefined) return entry.name;
    return ellipsizeFileName({ name: entry.name, ext: entry.ext, isDir, avail: nameAvail }, measure);
  });
</script>

<div
  id={entry.path}
  data-entry-path={entry.path}
  class="file-list-row"
  class:cursor={focused && listFocused}
  class:idle={focused && !listFocused}
  class:selected
  class:dir={isDir}
  class:exe
  class:sep={separator}
  role="option"
  aria-selected={selected}
  aria-label={entry.name}
  style:grid-template-columns={rowGridTemplate(showSize, showTime)}
  onclick={(e) => onRowClick(entry.path, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
  ondblclick={() => onRowDblClick(entry)}
>
  <span class="mark" aria-hidden="true">{selectionMark(selected)}</span>
  <span class="name" title={entry.name}>
    <span class="nf-icon row-icon" aria-hidden="true">{getFileIcon(entry.name, isDir)}</span>
    <span class="name-text">{shownName}</span>
  </span>
  {#if showSize}
    <span class="size">{formatSizeCell(isDir, entry.size)}</span>
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
    padding: 0;
    column-gap: 1ch;
    overflow: hidden;
    cursor: default;
    font-family: var(--ui-font);
    font-size: var(--ui-font-size);
    line-height: var(--list-row-height);
    white-space: pre;
    color: var(--ui-fg);
  }
  /* R-1785: the colour priority is the order of these rules (equal specificity): normal < executable < folder < selected < cursor. */
  .file-list-row.exe {
    color: var(--ui-executable);
  }
  .file-list-row.dir {
    color: var(--ui-folder);
    font-weight: bold;
  }
  .file-list-row.selected {
    color: var(--ui-selected-fg);
    font-weight: bold;
  }
  .file-list-row.cursor {
    background: var(--ui-cursor-bg);
    color: var(--ui-cursor-fg);
    font-weight: bold;
  }
  /* R-1786: with no list focus the cursor row keeps only a frame (no background, the colour of the row stays). */
  .file-list-row.idle {
    outline: 1px solid var(--ui-border-active);
    outline-offset: -1px;
  }
  .mark {
    overflow: hidden;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
  }
  .row-icon {
    width: 2ch;
    margin-right: 0.5ch;
  }
  .name-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .size,
  .modified {
    overflow: hidden;
    text-align: right;
  }
</style>
