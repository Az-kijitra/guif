<script lang="ts">
  // SPEC-0300-0018 §8, §9, §11 / SPEC-0200-0001 §3.9.6, §3.9.10: display only (props + callbacks).
  // The transparent backdrop sits BEHIND the menu and covers the viewport, so a click outside
  // closes the menu without reaching the row / tree node / path bar underneath (R-1087).
  import { REGION_NAMES } from "$lib/shared/messages";
  import { computeMenuPosition } from "./menu-position";
  import type { MenuEntry, MenuEntryId } from "./menu-model";

  let {
    entries,
    highlightedId,
    cursor,
    onRun,
    onHighlight,
    onOutsideClose,
    onOutsideAuxClick,
  }: {
    entries: readonly MenuEntry[];
    highlightedId: MenuEntryId | null;
    cursor: { x: number; y: number };
    onRun: (id: MenuEntryId) => void;
    onHighlight: (id: MenuEntryId) => void;
    onOutsideClose: (e: { x: number; y: number }) => void;
    onOutsideAuxClick: (e: { button: number; x: number; y: number }) => void;
  } = $props();

  // R-1070: measure, place (flip + 8px clamp) before the first paint, then take the keyboard focus (R-1085).
  function placeMenu(node: HTMLElement, at: { x: number; y: number }) {
    const rect = node.getBoundingClientRect();
    const root = document.documentElement;
    const pos = computeMenuPosition({
      cursor: at,
      menu: { width: rect.width, height: rect.height },
      viewport: { width: root.clientWidth, height: root.clientHeight },
    });
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    node.focus({ preventScroll: true });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="ctx-backdrop"
  role="presentation"
  onmousedown={(e) => e.preventDefault()}
  onclick={(e) => onOutsideClose({ x: e.clientX, y: e.clientY })}
  onauxclick={(e) => onOutsideAuxClick({ button: e.button, x: e.clientX, y: e.clientY })}
></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="ctx-menu"
  role="menu"
  tabindex="-1"
  lang="ja"
  aria-label={REGION_NAMES.contextMenu}
  aria-activedescendant={highlightedId === null ? undefined : `ctx-item-${highlightedId}`}
  use:placeMenu={cursor}
  onmousedown={(e) => e.preventDefault()}
>
  {#each entries as entry, index (index)}
    {#if entry.type === "separator"}
      <div class="ctx-sep" role="separator"></div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="ctx-item"
        class:highlighted={entry.id === highlightedId}
        role="menuitem"
        tabindex="-1"
        id={`ctx-item-${entry.id}`}
        aria-disabled={entry.enabled ? undefined : "true"}
        aria-describedby={entry.reason === undefined ? undefined : `ctx-reason-${entry.id}`}
        onclick={() => {
          if (entry.enabled) onRun(entry.id);
        }}
        onmouseenter={() => {
          if (entry.enabled) onHighlight(entry.id);
        }}
      >
        <span class="ctx-label">{entry.label}</span>
        {#if entry.reason !== undefined}
          <span class="ctx-reason" id={`ctx-reason-${entry.id}`}>{entry.reason}</span>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 19;
    background: transparent;
  }
  .ctx-menu {
    position: fixed;
    left: 0;
    top: 0;
    min-width: 160px;
    max-width: 260px;
    max-height: 70vh;
    overflow: auto;
    padding: 4px 0;
    background: var(--ui-surface);
    border: 1px solid var(--ui-border-active); /* SPEC-0300-0023 R-1812 */
    color: var(--ui-fg);
    box-shadow: 0 8px 20px var(--ui-shadow-2);
    z-index: 20;
    font-size: var(--ui-font-size);
    outline: none;
  }
  .ctx-item {
    display: block;
    padding: 4px 10px;
    cursor: default;
  }
  .ctx-item.highlighted {
    background: var(--ui-hover);
    color: var(--ui-cursor-fg);
    font-weight: bold;
  }
  .ctx-item.highlighted .ctx-reason {
    color: inherit;
  }
  .ctx-item[aria-disabled="true"] .ctx-label {
    color: var(--ui-muted-2);
  }
  .ctx-reason {
    display: block;
    font-size: var(--ui-font-size);
    color: var(--ui-muted);
    overflow-wrap: anywhere;
  }
  .ctx-sep {
    height: 1px;
    margin: 4px 0;
    background: var(--ui-border);
  }
</style>
