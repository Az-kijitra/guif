<script lang="ts">
  // SPEC-0300-0015 R-420-1: the actual route guard runs synchronously in
  // `+layout.ts`'s `load` (before this component's children mount).
  // SPEC-0300-0018 R-1010~R-1013: one guard for the main window and the viewer
  // (suppresses the WebView's native context menu except in text inputs).
  import { onMount } from "svelte";
  import { attachContextMenuGuard } from "$lib/shared/contextmenu-guard";

  let { children } = $props();

  onMount(() => attachContextMenuGuard(document));
</script>

{@render children()}
