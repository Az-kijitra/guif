<script lang="ts">
  // Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
  // review item 1): R-10-11/AC-631, the status bar sits below the body.
  let { text }: { text: string | null } = $props();
</script>

{#if text}
  <p role="status" class="status-message">{text}</p>
{/if}

<style>
  .status-message {
    color: #555;
    margin: 0.25rem 0;
  }
</style>
