<script lang="ts">
  // SPEC-0300-0020 §2 / §8 / §10 / §11 / SPEC-0200-0001 §3.14.1-1: display only (props + callbacks).
  // The keyboard focus is moved onto the highlighted heading button itself while the bar is active (R-1392), so the status bar's
  // "focus: menu" (R-1372) and the real focus agree. Headings and items are never tab stops.
  import { MENU_BAR_LABEL, MENU_HEADINGS } from "./messages";
  import { MENU_ORDER } from "./menu-bar-keys";
  import type { MenuBarActions, MenuBarView } from "./menu-bar-view";
  import MenuDropdown from "./MenuDropdown.svelte";

  let { view, actions }: { view: MenuBarView; actions: MenuBarActions } = $props();

  let headingEls: (HTMLButtonElement | undefined)[] = $state([]);

  $effect(() => {
    if (view.active) headingEls[view.headingIndex]?.focus({ preventScroll: true });
  });
</script>

<div class="menubar" role="menubar" aria-label={MENU_BAR_LABEL} lang="ja" data-menubar>
  {#each MENU_ORDER as menu, index (menu)}
    {@const heading = MENU_HEADINGS[menu]}
    <div class="slot" role="none">
      <button
        type="button"
        class="heading"
        class:current={view.active && view.headingIndex === index}
        class:keyfocus={view.active && view.headingIndex === index && view.openMenu === null}
        role="menuitem"
        tabindex="-1"
        aria-haspopup="menu"
        aria-expanded={view.openMenu === menu}
        aria-label={heading.name}
        bind:this={headingEls[index]}
        onmousedown={() => actions.onHeadingMouseDown()}
        onclick={() => actions.onHeadingClick(index)}
        onkeyup={(e) => e.preventDefault()}
        onmouseenter={() => actions.onHeadingHover(index)}
        >{heading.name}(<span class="accel">{heading.accessKey}</span>)</button
      >
      {#if view.openMenu === menu && view.entries.length > 0}
        <MenuDropdown
          label={heading.name}
          entries={view.entries}
          highlightId={view.highlightId}
          anchor={headingEls[index]}
          onRun={actions.onItemRun}
          onHover={actions.onItemHover}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  .menubar {
    display: flex;
    flex: none;
    align-items: stretch;
    box-sizing: border-box;
    padding: 3px 6px;
    /* SPEC-0300-0023 R-1760 / R-1810: a band without a frame. */
    background: var(--ui-status-bg);
    color: var(--ui-status-fg);
  }
  .slot {
    display: flex;
  }
  .heading {
    margin: 0;
    padding: 2px 6px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font-size: var(--ui-font-size);
    line-height: var(--ui-line-height);
    cursor: default;
    outline: none;
  }
  /* R-1810: the open (or key-highlighted) heading. */
  .heading.current {
    background: var(--ui-menu-active-bg);
    color: var(--ui-menu-active-fg);
    font-weight: bold;
  }
  .heading.keyfocus {
    border-color: var(--ui-focused);
  }
  .accel {
    text-decoration: underline;
  }
</style>
