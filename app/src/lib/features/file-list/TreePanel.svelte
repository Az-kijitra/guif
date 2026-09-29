<script lang="ts">
  // SPEC-0300-0009 R-40~R-45, R-64~R-66. Architecture:
  // docs/architecture/proposals/SPEC-0200-0001.md §3.6.3, §3.6.11.4(e)/(g),
  // §3.6.11.11 SHOULD-124. A single `role="tree"` container (roving
  // `aria-activedescendant`, tabindex=0) + one `role="treeitem"` per node.
  // The caret is click-only (tabindex="-1", never a Tab stop, MUST-87(e)).
  //
  // SHOULD-124: node ids are prefixed (`tree:${...}`) so they never collide
  // with the file list's own row ids (`entry.path`) when the current folder
  // appears in both panels.
  import { pathComparisonKey } from "$lib/shared/path-key";
  import { computeFullyVisibleRows } from "./tree";
  import type { TreeRowView } from "./tree-state.svelte";

  // R-59-2/AC-623: the tree panel measures ITS OWN viewport (never the file
  // list's `layout.rows`, coordinator review item 2). `TREE_ROW_HEIGHT_PX`
  // is the single source of truth for both the CSS row height below and this
  // measurement, so they can never drift apart.
  const TREE_ROW_HEIGHT_PX = 24;

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
  let containerHeight = $state(0);
  $effect(() => {
    fullyVisibleRows = computeFullyVisibleRows(containerHeight, TREE_ROW_HEIGHT_PX);
  });
</script>

<div
  bind:this={containerEl}
  bind:clientHeight={containerHeight}
  class="tree-panel"
  role="tree"
  tabindex="0"
  aria-activedescendant={activeDescendant}
  onfocus={() => onContainerFocus(true)}
  onblur={() => onContainerFocus(false)}
>
  {#each rows as row (row.path)}
    <div
      id={domId(row.path)}
      class="tree-node"
      class:focused={hasFocus && focusedPath !== null && pathComparisonKey(row.path) === pathComparisonKey(focusedPath)}
      style="padding-left: {row.level * 1}rem;"
      role="treeitem"
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
        tabindex="-1"
        aria-label={row.expanded ? "Collapse" : "Expand"}
        onclick={(e) => {
          e.stopPropagation();
          onToggleExpand(row.path);
        }}
      >
        {row.expanded ? "▾" : "▸"}
      </button>
      <span class="name">{row.name}</span>
    </div>
  {/each}
</div>

<style>
  .tree-panel {
    width: 220px;
    min-width: 220px;
    max-width: 220px;
    overflow: auto;
    border: 1px solid #ccc;
  }
  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 24px; /* keep in sync with TREE_ROW_HEIGHT_PX above */
    white-space: nowrap;
    cursor: default;
  }
  .tree-node.focused {
    outline: 2px solid #2266dd;
    outline-offset: -2px;
  }
  .tree-node[aria-selected="true"] {
    background: #dbe9ff;
  }
  .caret {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.2rem;
  }
</style>
