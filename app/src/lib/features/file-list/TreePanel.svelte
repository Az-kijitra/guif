<script lang="ts">
  // SPEC-0300-0009 R-40~R-45, R-64~R-66; SPEC-0300-0017 §7 (R-935~R-942: node
  // look, labels, carets). Architecture:
  // docs/architecture/proposals/SPEC-0200-0001.md §3.6.3, §3.6.11.4(e)/(g),
  // §3.6.11.11 SHOULD-124, §3.8.4. A single `role="tree"` container (roving
  // `aria-activedescendant`, tabindex=0) + one `role="treeitem"` per node.
  // The caret is click-only (tabindex="-1", never a Tab stop, MUST-87(e)).
  //
  // SHOULD-124: node ids are prefixed (`tree:${...}`) so they never collide
  // with the file list's own row ids (`entry.path`) when the current folder
  // appears in both panels.
  import { pathComparisonKey } from "$lib/shared/path-key";
  import { computeFullyVisibleRows, treeIndentPx, treeNodeLabel, treeNodeTitle } from "./tree";
  import { readRowHeightPx } from "./text-measure";
  import { TREE_MESSAGES } from "./messages";
  import type { TreeRowView } from "./tree-state.svelte";

  // R-59-2 / R-942 / AC-623: the tree panel measures ITS OWN viewport (never the
  // file list's `layout.rows`). The row height is read from the same CSS variable
  // (`--list-row-height`) the node height uses, so they can never drift apart.
  const FALLBACK_ROW_HEIGHT_PX = 28;

  let {
    rows,
    focusedPath,
    currentDirPath,
    hasFocus,
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
    containerEl?: HTMLDivElement;
    fullyVisibleRows?: number;
    onToggleExpand: (path: string) => void;
    onSelectPath: (path: string) => void;
    onContainerFocus: (focused: boolean) => void;
  } = $props();

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
      class:focused={hasFocus && focusedPath !== null && pathComparisonKey(row.path) === pathComparisonKey(focusedPath)}
      style="padding-left: {treeIndentPx(row.level)}px;"
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
        {row.expanded ? "▼" : "▶"}
      </button>
      <span class="name">{treeNodeLabel(row.path, row.level, row.name)}</span>
    </div>
  {/each}
</div>

<style>
  .tree-panel {
    box-sizing: border-box;
    flex: none;
    width: 220px;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none; /* R-941: wheel / keys scroll; no scrollbar */
    border: 1px solid var(--ui-border);
    background: var(--ui-surface);
    font: 12px var(--ui-font-mono);
  }
  /* R-968: the container shows the focus frame while it holds keyboard focus. */
  .tree-panel:focus {
    outline: 1px solid var(--ui-focused);
    outline-offset: -1px;
  }
  .tree-node {
    display: flex;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    height: var(--list-row-height);
    white-space: nowrap;
    cursor: default;
  }
  .tree-node.focused {
    outline: 1px solid var(--ui-focused);
    outline-offset: -1px;
  }
  .tree-node[aria-selected="true"] {
    background: var(--ui-selected);
  }
  .caret {
    flex: none;
    width: 16px;
    padding: 0;
    border: none;
    background: none;
    color: var(--ui-muted);
    font: inherit;
    cursor: pointer;
  }
  /* R-937: a node known to have no children hides the caret but keeps its place. */
  .caret.leaf {
    visibility: hidden;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
