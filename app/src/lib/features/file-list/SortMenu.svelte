<script lang="ts">
  // SPEC-0300-0009 R-34-11~R-34-17. Architecture:
  // docs/architecture/proposals/SPEC-0200-0001.md §3.6.5, §3.6.11.8
  // (MUST-91: outside-click closes via a transparent backdrop BEHIND the
  // menu -- clicks on the menu itself never reach the backdrop, and clicks
  // outside never reach the file list/tree behind it).
  import { SORT_KEYS, type SortKey, type SortOrder } from "./sort";

  let {
    highlightedKey,
    currentSortKey,
    currentSortOrder,
    onClose,
  }: {
    highlightedKey: SortKey;
    currentSortKey: SortKey;
    currentSortOrder: SortOrder;
    onClose: () => void;
  } = $props();

  const LABELS: Record<SortKey, string> = { name: "Name", size: "Size", type: "Type", modified: "Modified" };
</script>

<!-- MUST-91: the backdrop sits BEHIND the menu (lower z-index) but covers the
     whole viewport, so an outside click closes the menu without any event
     ever reaching the row/tree-node underneath. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sort-menu-backdrop" role="presentation" onclick={onClose}></div>
<div class="sort-menu" role="menu">
  {#each SORT_KEYS as key (key)}
    <div class="sort-menu-item" role="menuitemradio" aria-checked={key === currentSortKey} class:highlighted={key === highlightedKey}>
      <span class="check">{key === currentSortKey ? (currentSortOrder === "asc" ? "▲" : "▼") : ""}</span>
      <span class="label">{LABELS[key]}</span>
    </div>
  {/each}
</div>

<style>
  .sort-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: transparent;
  }
  .sort-menu {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 11;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    min-width: 140px;
  }
  .sort-menu-item {
    display: flex;
    gap: 0.4rem;
    padding: 0.25rem 0.5rem;
  }
  .sort-menu-item.highlighted {
    background: #dbe9ff;
  }
  .check {
    width: 1em;
    display: inline-block;
  }
</style>
