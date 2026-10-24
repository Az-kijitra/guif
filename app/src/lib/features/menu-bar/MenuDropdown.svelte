<script lang="ts">
  // SPEC-0300-0020 §10 / §11 (R-1382~R-1384, R-1390~R-1392) / SPEC-0200-0001 §3.14.1-1: display only (props + callbacks).
  // The dropdown of one menu. The highlight is shown with `aria-activedescendant`; the keyboard focus stays on the heading.
  import { computeDropdownPosition } from "./dropdown-position";
  import type { BarEntry, BarItemId } from "./menu-model";

  let {
    label,
    entries,
    highlightId,
    anchor,
    onRun,
    onHover,
  }: {
    label: string;
    entries: readonly BarEntry[];
    highlightId: string | null;
    anchor: HTMLElement | undefined;
    onRun: (id: BarItemId) => void;
    onHover: (id: BarItemId) => void;
  } = $props();

  const CHECK_MARK = "✓";

  // R-1382: the lower left of the heading, shifted left to stay 8px inside the window's right edge.
  function place(node: HTMLElement, at: HTMLElement | undefined) {
    if (at === undefined) return;
    const heading = at.getBoundingClientRect();
    const pos = computeDropdownPosition({
      heading: { left: heading.left, bottom: heading.bottom },
      menuWidth: node.getBoundingClientRect().width,
      viewportWidth: document.documentElement.clientWidth,
    });
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
  }

  // aria-keyshortcuts uses the modifier name `Control`.
  const ariaShortcut = (text: string): string => text.replace(/^Ctrl\b/, "Control").replace(/\+Ctrl\b/, "+Control");
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="dropdown"
  role="menu"
  tabindex="-1"
  lang="ja"
  aria-label={label}
  aria-activedescendant={highlightId === null ? undefined : `menubar-item-${highlightId}`}
  use:place={anchor}
  onmousedown={(e) => e.preventDefault()}
>
  {#each entries as entry, index (index)}
    {#if entry.type === "separator"}
      <div class="sep" role="separator"></div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="item"
        class:highlighted={entry.id === highlightId}
        role={entry.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
        tabindex="-1"
        id={`menubar-item-${entry.id}`}
        aria-checked={entry.checked}
        aria-disabled={entry.enabled ? undefined : "true"}
        aria-describedby={entry.reason === undefined ? undefined : `menubar-reason-${entry.id}`}
        aria-keyshortcuts={entry.shortcutText === undefined ? undefined : ariaShortcut(entry.shortcutText)}
        onclick={() => {
          if (entry.enabled) onRun(entry.id);
        }}
        onmouseenter={() => {
          if (entry.enabled) onHover(entry.id);
        }}
      >
        <span class="check" aria-hidden="true">{entry.checked === true ? CHECK_MARK : ""}</span>
        <span class="name">
          <span class="label">{entry.label}</span>
          {#if entry.reason !== undefined}
            <span class="reason" id={`menubar-reason-${entry.id}`}>{entry.reason}</span>
          {/if}
        </span>
        <span class="shortcut">{entry.shortcutText ?? ""}</span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .dropdown {
    position: fixed;
    left: 0;
    top: 0;
    min-width: 260px;
    max-height: 70vh;
    overflow: auto;
    box-sizing: border-box;
    padding: 4px 0;
    background: var(--ui-surface);
    border: 1px solid var(--ui-border-active); /* SPEC-0300-0023 R-1812 */
    color: var(--ui-fg);
    box-shadow: 0 8px 20px var(--ui-shadow-2);
    z-index: 20;
    font-size: var(--ui-font-size);
    outline: none;
  }
  .item {
    display: flex;
    align-items: baseline;
    gap: 0;
    padding: 6px 12px;
    cursor: default;
  }
  /* R-1812: the emphasised item takes the cursor colours and bold. */
  .item.highlighted {
    background: var(--ui-hover);
    color: var(--ui-cursor-fg);
    font-weight: bold;
  }
  .item.highlighted .reason,
  .item.highlighted .shortcut {
    color: inherit;
  }
  .check {
    flex: none;
    width: 1.5em;
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
  }
  .label {
    display: block;
  }
  .reason {
    display: block;
    font-size: var(--ui-font-size);
    color: var(--ui-muted);
    overflow-wrap: anywhere;
  }
  .shortcut {
    flex: none;
    margin-left: 24px;
    text-align: right;
    color: var(--ui-muted);
  }
  .item[aria-disabled="true"] .label,
  .item[aria-disabled="true"] .shortcut {
    color: var(--ui-muted-2);
  }
  .sep {
    height: 1px;
    margin: 4px 0;
    background: var(--ui-border);
  }
</style>
