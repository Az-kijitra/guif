<script lang="ts">
  // SPEC-0300-0015 R-420-1: the actual route guard runs synchronously in
  // `+layout.ts`'s `load` (before this component's children mount); this
  // file only needs to exist and render the active route.
  let { children } = $props();
</script>

{@render children()}
