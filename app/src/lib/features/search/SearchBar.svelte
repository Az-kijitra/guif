<script lang="ts">
  // features/search/SearchBar.svelte — SPEC-0300-0012 §3 (R-102~R-109-3),
  // R-113 (regex toggle), R-118 (no dedicated empty-result message; the file
  // list's existing generic "no items" state covers a 0-result filter).
  //
  // R-10 (SPEC-0300-0010): this component NEVER registers its own
  // `onkeydown` handler. Escape/Enter/ArrowUp/ArrowDown (R-121) are resolved
  // exclusively by the single global capture-phase listener in
  // features/keyboard/key-dispatch.ts's R-14-2 guard
  // (docs/architecture/proposals/SPEC-0200-0001.md §3.1.4); this component
  // only renders the <input>/toggle/Clear/Apply controls and forwards their
  // native DOM events (oninput/onclick/onsubmit/onfocus/onblur) to the
  // callbacks routes/+page.svelte supplies. It holds no state of its own
  // (query/regexMode/error are all props owned by features/search/
  // search-state.svelte.ts and routes' `$derived` filter result, §3.1.2).

  interface Props {
    query: string;
    regexMode: boolean;
    error: string | null;
    inputEl?: HTMLInputElement;
    onQueryInput: (value: string) => void;
    onRegexModeChange: (value: boolean) => void;
    onCancel: () => void;
    onSubmit: () => void;
    onInputFocus: () => void;
    onInputBlur: () => void;
  }

  let {
    query,
    regexMode,
    error,
    inputEl = $bindable(),
    onQueryInput,
    onRegexModeChange,
    onCancel,
    onSubmit,
    onInputFocus,
    onInputBlur,
  }: Props = $props();
</script>

<form
  class="search-bar"
  data-focus-area="search"
  onsubmit={(event) => {
    // R-109-3: form submission never navigates the page.
    event.preventDefault();
    onSubmit();
  }}
>
  <input
    bind:this={inputEl}
    type="text"
    class="search-input"
    aria-label="Search"
    value={query}
    oninput={(event) => onQueryInput((event.currentTarget as HTMLInputElement).value)}
    onfocus={onInputFocus}
    onblur={onInputBlur}
  />
  <button
    type="button"
    class="regex-toggle"
    aria-pressed={regexMode}
    onclick={() => onRegexModeChange(!regexMode)}
  >
    .*
  </button>
  <button type="submit" class="apply-button">Apply</button>
  <button type="button" class="clear-button" onclick={onCancel}>Clear</button>
  {#if error}
    <span role="alert" class="search-error">{error}</span>
  {/if}
</form>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--ui-border);
    background: var(--ui-surface-2);
  }
  .search-input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid var(--ui-border-strong);
    border-radius: 4px;
    background: var(--ui-surface);
    font-family: inherit;
    font-size: 13px;
  }
  .regex-toggle[aria-pressed="true"] {
    background: var(--ui-surface-3);
  }
  .search-error {
    margin-left: auto;
    color: var(--ui-error);
    font-size: 12px;
  }
</style>
