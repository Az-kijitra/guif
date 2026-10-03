<script lang="ts">
  // SPEC-0200-0001 §3.9.1: thin layer that hands the wiring's state to the display component.
  import ContextMenu from "$lib/features/context-menu/ContextMenu.svelte";
  import type { createContextMenuWiring } from "../context-menu-wiring.svelte";

  let { menu }: { menu: ReturnType<typeof createContextMenuWiring> } = $props();
  const snapshot = $derived(menu.state.snapshot);
</script>

{#if snapshot !== null}
  <ContextMenu
    entries={snapshot.entries}
    highlightedId={menu.state.highlightedId}
    cursor={snapshot.cursor}
    onRun={menu.run}
    onHighlight={(id) => menu.state.highlight(id)}
    onOutsideClose={menu.onOutsideClose}
    onOutsideAuxClick={menu.onOutsideAuxClick}
  />
{/if}
