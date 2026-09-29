<script lang="ts">
  // Extracted from +page.svelte (SPEC-0200-0001 §3.6.11.10 MUST-93, coordinator
  // review item 1): R-104/R-216, the search bar and history/jump list share
  // one region below the path bar, mutually exclusive (§3.2.9-1). Pure
  // presentation + prop forwarding; all decision logic stays in
  // routes/navigation-wiring.ts / routes/search-wiring.ts (unchanged).
  import SearchBar from "$lib/features/search/SearchBar.svelte";
  import NavigationHistoryList from "$lib/features/navigation-history/NavigationHistoryList.svelte";

  let {
    searchActive,
    query,
    regexMode,
    filterError,
    searchInputEl = $bindable(),
    onQueryInput,
    onRegexModeChange,
    onSearchCancel,
    onSearchSubmit,
    onSearchInputFocus,
    onSearchInputBlur,
    historyOpen,
    historyItems,
    historySelectedIndex,
    historyLabel,
    historyListEl = $bindable(),
    onHistoryRowClick,
    onHistoryRemove,
  }: {
    searchActive: boolean;
    query: string;
    regexMode: boolean;
    filterError: string | null;
    searchInputEl?: HTMLInputElement;
    onQueryInput: (value: string) => void;
    onRegexModeChange: (value: boolean) => void;
    onSearchCancel: () => void;
    onSearchSubmit: () => void;
    onSearchInputFocus: () => void;
    onSearchInputBlur: () => void;
    historyOpen: boolean;
    historyItems: readonly string[];
    historySelectedIndex: number;
    historyLabel: string;
    historyListEl?: HTMLDivElement;
    onHistoryRowClick: (index: number) => void;
    onHistoryRemove: (index: number) => void;
  } = $props();
</script>

{#if searchActive}
  <SearchBar
    bind:inputEl={searchInputEl}
    {query}
    {regexMode}
    error={filterError}
    onQueryInput={(value) => onQueryInput(value)}
    onRegexModeChange={(value) => onRegexModeChange(value)}
    onCancel={onSearchCancel}
    onSubmit={onSearchSubmit}
    onInputFocus={onSearchInputFocus}
    onInputBlur={onSearchInputBlur}
  />
{/if}
{#if historyOpen}
  <NavigationHistoryList
    bind:listEl={historyListEl}
    items={historyItems}
    selectedIndex={historySelectedIndex}
    label={historyLabel}
    onRowClick={onHistoryRowClick}
    onRemove={onHistoryRemove}
  />
{/if}
