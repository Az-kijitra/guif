<script lang="ts">
  // features/navigation-history/NavigationHistoryList.svelte — SPEC-0300-0013
  // R-215 (inline listbox, not a modal), R-217 (icon / path / delete button),
  // R-220 (listbox ARIA, no aria-multiselectable).
  //
  // R-10 (SPEC-0300-0010): this component NEVER registers its own `onkeydown`
  // handler; keys are resolved by the single global listener
  // (key-dispatch.ts -> routes' onOverlayKey -> list-ops.resolveListKeyIntent).
  // It holds no state (items/selectedIndex are props read from
  // navigation-history-state.svelte.ts) and does not render the empty-list
  // notice (R-218 is delegated to shared/state/status-message, §3.2.9-2).

  import { NAVIGATION_HISTORY_MESSAGES } from "./messages";

  interface Props {
    items: readonly string[];
    selectedIndex: number;
    label: string;
    listEl?: HTMLDivElement;
    onRowClick: (index: number) => void;
    onRemove: (index: number) => void;
  }

  let { items, selectedIndex, label, listEl = $bindable(), onRowClick, onRemove }: Props = $props();

  function rowId(index: number): string {
    return `nav-history-item-${index}`;
  }

  // Keep the active row visible when the selection moves by keyboard.
  $effect(() => {
    listEl?.querySelector(`#${rowId(selectedIndex)}`)?.scrollIntoView?.({ block: "nearest" });
  });
</script>

<div
  bind:this={listEl}
  class="nav-history-list"
  role="listbox"
  tabindex="0"
  aria-label={label}
  aria-activedescendant={items.length > 0 ? rowId(selectedIndex) : undefined}
>
  {#each items as path, index (path)}
    <div
      id={rowId(index)}
      class="nav-history-row"
      class:selected={index === selectedIndex}
      role="option"
      aria-selected={index === selectedIndex}
      onclick={() => onRowClick(index)}
    >
      <span class="icon" aria-hidden="true">📁</span>
      <span class="path" title={path}>{path}</span>
      <button
        type="button"
        class="remove"
        tabindex="-1"
        aria-label={NAVIGATION_HISTORY_MESSAGES.removeItem(path)}
        onmousedown={(event) => event.preventDefault()}
        onclick={(event) => {
          event.stopPropagation();
          onRemove(index);
        }}
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .nav-history-list {
    max-height: 240px;
    overflow-y: auto;
    box-sizing: border-box;
    /* SPEC-0300-0023 R-1812: a pop-up list with the active frame colour. */
    border: 1px solid var(--ui-border-active);
    background: var(--ui-surface);
    color: var(--ui-fg);
  }
  .nav-history-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .nav-history-row.selected {
    background: var(--ui-hover);
    color: var(--ui-cursor-fg);
    font-weight: bold;
  }
  .path {
    flex: 1;
    min-width: 0;
    font-family: var(--ui-font-mono);
    font-size: var(--ui-font-size);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
