<script lang="ts">
  // SPEC-0300-0009 R-40~R-45, R-64~R-66; SPEC-0300-0017 §7 (R-935~R-942: node
  // labels, carets, scrolling); SPEC-0300-0023 R-1760 .. R-1764 / R-1800 .. R-1804 (frame + heading, ▾ ▸, ch indent, cursor / current colours, width in %). Architecture:
  // docs/architecture/proposals/SPEC-0200-0001.md §3.6.3, §3.6.11.4(e)/(g),
  // §3.6.11.11 SHOULD-124, §3.8.4. A single `role="tree"` container (roving
  // `aria-activedescendant`, tabindex=0) + one `role="treeitem"` per node.
  // The caret is click-only (tabindex="-1", never a Tab stop, MUST-87(e)).
  //
  // SHOULD-124: node ids are prefixed (`tree:${...}`) so they never collide
  // with the file list's own row ids (`entry.path`) when the current folder
  // appears in both panels.
  import { pathComparisonKey } from "$lib/shared/path-key";
  import { computeFullyVisibleRows, treeIndentCh, treeNodeLabel, treeNodeTitle } from "./tree";
  import { treeHeadingText } from "./pane-layout";
  import { readRowHeightPx } from "./text-measure";
  import { TREE_MESSAGES } from "./messages";
  import { ICONS } from "$lib/shared/file-icons";
  import type { TreeRowView } from "./tree-state.svelte";

  // R-59-2 / R-942 / AC-623: the tree panel measures ITS OWN viewport (never the
  // file list's `layout.rows`). The row height is read from the same CSS variable
  // (`--list-row-height`) the node height uses, so they can never drift apart.
  const FALLBACK_ROW_HEIGHT_PX = 16; // SPEC-0300-0023 第2版 R-1754

  let {
    rows,
    focusedPath,
    currentDirPath,
    hasFocus,
    widthPx,
    containerEl = $bindable(),
    fullyVisibleRows = $bindable(1),
    onToggleExpand,
    onSelectPath,
    onContainerFocus,
  }: {
    rows: TreeRowView[];
    focusedPath: string | null;
    currentDirPath: string;
    hasFocus: boolean;
    // R-1804: the panel's width (frame included) in px, from FileListBody (floor of the body width x tree_width_percent / 100).
    widthPx: number;
    containerEl?: HTMLDivElement;
    fullyVisibleRows?: number;
    onToggleExpand: (path: string) => void;
    onSelectPath: (path: string) => void;
    onContainerFocus: (focused: boolean) => void;
  } = $props();

  const isCursor = (path: string): boolean => focusedPath !== null && pathComparisonKey(path) === pathComparisonKey(focusedPath);

  function domId(path: string): string {
    return `tree:${pathComparisonKey(path)}`;
  }

  let activeDescendant = $derived(focusedPath !== null ? domId(focusedPath) : undefined);

  // SPEC-0300-0009 R-40-1 / SPEC-0300-0017 R-941: when the focus position changes (keys,
  // following the list), scroll it into view -- only then, so toggling another node does not
  // jump the view. The node may not be rendered yet while the ancestors are still expanding,
  // hence the check runs again as `rows` changes until the node exists.
  let revealedFor: string | null = null;
  $effect(() => {
    void rows;
    if (focusedPath === null || containerEl === undefined || revealedFor === focusedPath) return;
    const node = containerEl.ownerDocument.getElementById(domId(focusedPath));
    if (node === null) return;
    revealedFor = focusedPath;
    const view = containerEl.getBoundingClientRect();
    const target = node.getBoundingClientRect();
    const top = view.top + containerEl.clientTop;
    const bottom = top + containerEl.clientHeight;
    if (target.top < top) containerEl.scrollTop -= top - target.top;
    else if (target.bottom > bottom) containerEl.scrollTop += target.bottom - bottom;
  });
  let containerHeight = $state(0);
  $effect(() => {
    fullyVisibleRows = computeFullyVisibleRows(containerHeight, readRowHeightPx() ?? FALLBACK_ROW_HEIGHT_PX);
  });
</script>

<!-- R-1761: the frame colour follows the same boolean (treeState.hasFocus) as the cursor row. -->
<div class="pane tree-pane" class:active={hasFocus} style:width="{widthPx}px">
  <div class="pane-title" role="presentation">{treeHeadingText()}</div>
  <div class="pane-body">
    <div
      bind:this={containerEl}
      bind:clientHeight={containerHeight}
      class="tree-panel"
      role="tree"
      tabindex="0"
      data-focus-area="tree"
      aria-activedescendant={activeDescendant}
      onfocus={() => onContainerFocus(true)}
      onblur={() => onContainerFocus(false)}
    >
      {#each rows as row (row.path)}
        <div
          id={domId(row.path)}
          class="tree-node"
          class:cursor={hasFocus && isCursor(row.path)}
          class:cursor-idle={!hasFocus && isCursor(row.path)}
          class:current={pathComparisonKey(row.path) === pathComparisonKey(currentDirPath)}
          style="padding-left: {treeIndentCh(row.level)}ch;"
          role="treeitem"
          title={treeNodeTitle(row.path)}
          aria-level={row.level + 1}
          aria-expanded={row.expanded}
          aria-selected={pathComparisonKey(row.path) === pathComparisonKey(currentDirPath)}
          onclick={() => {
            onSelectPath(row.path);
            containerEl?.focus();
          }}
        >
          <button
            type="button"
            class="caret"
            class:leaf={row.leaf}
            tabindex="-1"
            aria-hidden={row.leaf ? "true" : undefined}
            aria-label={row.expanded ? TREE_MESSAGES.collapse : TREE_MESSAGES.expand}
            onclick={(e) => {
              e.stopPropagation();
              onToggleExpand(row.path);
            }}
          >
            {row.expanded ? "▾" : "▸"}
          </button>
          <span class="nf-icon tree-icon" aria-hidden="true">{row.expanded ? ICONS.folderOpen : ICONS.folder}</span>
          <span class="name">{treeNodeLabel(row.path, row.level, row.name)}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .tree-pane {
    flex: none;
  }
  .tree-panel {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none; /* R-941: wheel / keys scroll; no scrollbar */
    font-family: var(--ui-font);
    font-size: var(--ui-font-size);
    color: var(--ui-fg);
    outline: none; /* R-1761: the frame colour replaces the container's focus outline (R-968) */
  }
  .tree-node {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: var(--list-row-height);
    line-height: var(--list-row-height);
    white-space: pre;
    cursor: default;
  }
  /* R-1803: normal < the cursor without focus < the current folder < the cursor with focus (the order of these rules). */
  .tree-node.cursor-idle {
    color: var(--ui-tree-cursor);
  }
  .tree-node.current {
    color: var(--ui-tree-current);
    font-weight: bold;
  }
  .tree-node.cursor {
    background: var(--ui-cursor-bg);
    color: var(--ui-cursor-fg);
    font-weight: bold;
  }
  /* R-1800 / R-1801: the mark column is 2ch wide and has the colour of the row's text. */
  .caret {
    flex: none;
    width: 2ch;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* R-937: a node known to have no children hides the caret but keeps its place. */
  .caret.leaf {
    visibility: hidden;
  }
  .tree-icon {
    flex: none;
    width: 2ch;
    margin-right: 0.5ch;
  }
  .name {
    min-width: 0;
    overflow: hidden;
  }
</style>
