<script lang="ts">
  // SPEC-0300-0017 §11 (R-970~R-974): the always-visible status bar. Permanent
  // items first, then the transient status message in a live region that is
  // ALWAYS in the DOM (R-974; the message element is emptied, never removed).
  // Presentation only: the items come from routes/status-bar-model.ts.
  import type { StatusItem } from "../status-bar-model";

  let { items, message }: { items: StatusItem[]; message: string | null } = $props();
</script>

<footer class="status-bar">
  {#each items as item (item.id)}
    <span class="status-item" class:filter={item.id === "filter"} data-status-item={item.id} title={item.title}>{item.text}</span>
  {/each}
  <span class="status-message" role="status" title={message ?? undefined}>{message ?? ""}</span>
</footer>

<style>
  .status-bar {
    position: relative;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    padding: 3px 6px;
    font-size: 11px;
    white-space: nowrap;
    border: 1px solid var(--ui-border);
    background: var(--ui-surface-2);
  }
  .status-item {
    flex: none;
  }
  .status-item.filter {
    flex: 0 1 auto;
    max-width: 30%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-message {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* R-974: an empty live region keeps its place in the DOM but takes no room, so the
     `gap` does not leave a stray margin (display: none would drop the live region). */
  .status-message:empty {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
</style>
