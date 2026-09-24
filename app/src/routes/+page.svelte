<script lang="ts">
  // routes/+page.svelte (SPEC-0200-0001 §4.1 path 2: composition layer only —
  // no state, no business logic of its own beyond decision-free DOM-focus
  // sequencing, §3.1.5). It wires three features together:
  // - features/file-list/list-state.svelte.ts owns the directory listing,
  //   selection and focus state and exposes action functions.
  // - features/search/search-state.svelte.ts owns the search bar's UI state
  //   (active/query/regexMode/history, SPEC-0300-0012 §3.1.2).
  // - features/keyboard/key-dispatch.ts owns "which key maps to which
  //   action id"; this file only forwards resolved action ids to the
  //   owning feature's own action functions (§4.3: keyboard never
  //   implements the actions themselves).
  //
  // `filteredEntries` (SPEC-0300-0012 R-115~R-118) is computed here as a
  // `$derived` from both features' public values, calling
  // features/search/matching.ts's pure `computeFilteredEntries` — this is
  // the only feature-to-feature bridge (§3.1.2 path ②; neither feature
  // directly imports the other, R-129/AC-128).
  import { onMount, onDestroy, tick } from "svelte";
  import {
    attachGlobalKeydownListener,
    dispatchKeydown,
    type DispatchContext,
    type SearchAction,
  } from "$lib/features/keyboard/key-dispatch";
  import type { KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
  import { fileListState } from "$lib/features/file-list/list-state.svelte";
  import { computeFileListAria, computeRowAria } from "$lib/features/file-list/aria";
  import { resolveFocusIndexForVisibleSet } from "$lib/features/file-list/navigation";
  import { searchState } from "$lib/features/search/search-state.svelte";
  import { computeFilteredEntries } from "$lib/features/search/matching";
  import SearchBar from "$lib/features/search/SearchBar.svelte";

  let containerEl: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  // §3.1.5 (MUST-39): a DOM element reference exposed by <SearchBar>, used
  // only to sequence `.focus()` calls — not a domain state value (SHOULD-54).
  let searchInputEl: HTMLInputElement | undefined = $state();

  let layout = $derived(fileListState.layout(containerWidth || 800, containerHeight || 400));

  // SPEC-0300-0012 §3.1.2: the sole feature-to-feature bridge. Reads both
  // features' public values and delegates the actual matching algorithm to
  // features/search/matching.ts's pure function (R-116: recomputes whenever
  // entries/active/query/regexMode change, via Svelte reactivity).
  let filterResult = $derived(
    computeFilteredEntries(fileListState.entries, {
      active: searchState.active,
      query: searchState.query,
      regexMode: searchState.regexMode,
    }),
  );
  let filteredEntries = $derived(filterResult.filteredEntries);

  let keydownHandler: ((event: Event) => void) | undefined;

  function focusedPath(): string {
    return fileListState.entries[fileListState.focusedIndex]?.path ?? "";
  }

  function isFocusedPathVisible(): boolean {
    const path = focusedPath();
    return path !== "" && filteredEntries.some((e) => e.path === path);
  }

  // R-105/R-105-1/R-105-2, R-107/R-107-1, R-109-2-1 (SPEC-0200-0001 §3.1.5):
  // the 4 search-bar actions resolved by key-dispatch's R-14-2 guard (or, in
  // the future, non-keyboard triggers) land here. Only DOM-focus sequencing
  // lives in this file; all decision logic (which real index to land on,
  // whether the bar stays open) is delegated to the owning features' pure
  // functions/state methods.
  function handleSearchAction(action: SearchAction): void {
    switch (action) {
      case "cancel":
        // R-108/R-106 #1,#2: Escape / Clear button.
        searchState.cancel();
        // R-107/R-107-1: explicitly restore focus to the file list.
        containerEl?.focus();
        break;
      case "confirm": {
        // R-109-1/R-109-2/R-106 #3: Enter / Apply.
        searchState.confirm();
        if (!searchState.active) {
          // R-109-1: empty (trimmed) query closed the bar; restore focus to
          // the file list (R-107).
          containerEl?.focus();
        } else {
          // R-109-2-1: move focus into the list at the resolved real index,
          // if any (rule 3: filteredEntries empty -> leave focus in the
          // search input).
          const resolved = resolveFocusIndexForVisibleSet(
            fileListState.entries,
            filteredEntries,
            fileListState.focusedIndex,
          );
          if (resolved !== null) {
            fileListState.focusIndex(resolved);
            containerEl?.focus();
          }
        }
        break;
      }
      case "history_prev":
        searchState.historyPrev();
        break;
      case "query_clear":
        searchState.queryClear();
        break;
    }
  }

  onMount(() => {
    void fileListState.loadDirectory(".");

    keydownHandler = (event: Event) => {
      const ke = event as KeyboardEvent;
      const keydownLike: KeydownLikeEvent = {
        key: ke.key,
        ctrlKey: ke.ctrlKey,
        altKey: ke.altKey,
        shiftKey: ke.shiftKey,
        metaKey: ke.metaKey,
        isComposing: ke.isComposing,
      };

      const ctx: DispatchContext = {
        isSettingsOpen: false,
        isOverlayOpen: false,
        isMenuBarActive: false,
        isTreeFocused: false,
        isSearchInputFocused: searchState.inputFocused,
        isSearchActive: searchState.active,
        profile: "windows",
        customOverrides: {},
        onHardcodedShortcut: () => false,
        onExitAction: () => false,
        onOverlayKey: () => false,
        onMenuBarKey: () => false,
        onTreeAction: () => false,
        onSearchAction: handleSearchAction,
        onListAction: (action) => {
          if (action === null) return false;
          switch (action) {
            case "move_up":
              fileListState.moveRow(filteredEntries, "up");
              return true;
            case "move_down":
              fileListState.moveRow(filteredEntries, "down");
              return true;
            case "move_left":
              fileListState.moveColumn(filteredEntries, "left", Math.max(layout.rows, 1));
              return true;
            case "move_right":
              fileListState.moveColumn(filteredEntries, "right", Math.max(layout.rows, 1));
              return true;
            case "open":
              void fileListState.openFocused();
              return true;
            case "go_parent":
              void fileListState.goParent();
              return true;
            case "select_toggle":
              fileListState.toggleFocused(filteredEntries);
              return true;
            case "select_all":
              // R-123/SPEC-0300-0009 R-55: select_all targets the visible
              // (filtered) entries only.
              fileListState.selectAll(filteredEntries);
              return true;
            case "search":
              // R-105/R-105-1/R-105-2: activate (or re-affirm) the search
              // bar and move DOM focus into its <input> once it has
              // rendered.
              searchState.open();
              void tick().then(() => searchInputEl?.focus());
              return true;
            default:
              return false;
          }
        },
      };

      const handled = dispatchKeydown(keydownLike, ctx);
      if (handled) {
        ke.preventDefault();
      }
    };

    attachGlobalKeydownListener(window, keydownHandler);
  });

  onDestroy(() => {
    if (keydownHandler !== undefined) {
      window.removeEventListener("keydown", keydownHandler, { capture: true });
    }
  });
</script>

<main>
  <h1>ReflexFiles Successor — Phase 1</h1>

  <!-- R-104: positioned between the menu bar and the path bar. Phase 1's
       minimal vertical slice has not yet built a dedicated menu bar
       component (later phase), so the search bar is placed directly below
       the heading and above the path display, which stands in for that
       boundary in this slice. -->
  {#if searchState.active}
    <SearchBar
      bind:inputEl={searchInputEl}
      query={searchState.query}
      regexMode={searchState.regexMode}
      error={filterResult.error}
      onQueryInput={(value) => searchState.setQuery(value)}
      onRegexModeChange={(value) => searchState.setRegexMode(value)}
      onCancel={() => handleSearchAction("cancel")}
      onSubmit={() => handleSearchAction("confirm")}
      onInputFocus={() => searchState.setInputFocused(true)}
      onInputBlur={() => searchState.setInputFocused(false)}
    />
  {/if}

  <p class="current-path">Current directory: {fileListState.currentPath}</p>

  {#if fileListState.loading}
    <p>Loading…</p>
  {/if}
  {#if fileListState.error}
    <p role="alert" class="error">Error: {fileListState.error}</p>
  {/if}

  <div
    bind:this={containerEl}
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    class="file-list"
    tabindex="0"
    role="listbox"
    aria-multiselectable={computeFileListAria({
      focusedPath: focusedPath(),
      isFocusedPathVisible: isFocusedPathVisible(),
    })["aria-multiselectable"]}
    aria-activedescendant={computeFileListAria({
      focusedPath: focusedPath(),
      isFocusedPathVisible: isFocusedPathVisible(),
    })["aria-activedescendant"]}
    style="grid-template-rows: repeat({Math.max(layout.rows, 1)}, 2rem); grid-auto-flow: column;"
  >
    {#each filteredEntries as entry (entry.path)}
      <div
        id={entry.path}
        class="file-list-row"
        class:focused={entry.path === focusedPath()}
        role={computeRowAria({ selected: fileListState.selected.has(entry.path) }).role}
        aria-selected={computeRowAria({ selected: fileListState.selected.has(entry.path) })["aria-selected"]}
      >
        <span class="name">{entry.entryType === "dir" ? "📁" : "📄"} {entry.name}</span>
        <span class="size">{entry.entryType === "dir" ? "" : entry.size}</span>
        <span class="modified">{entry.modified}</span>
      </div>
    {/each}
  </div>
</main>

<style>
  main {
    font-family: sans-serif;
    padding: 0.5rem 1rem;
  }
  .current-path {
    font-family: monospace;
  }
  .error {
    color: #b00020;
  }
  .file-list {
    display: grid;
    grid-auto-columns: 352px;
    gap: 0 0.5rem;
    overflow: auto;
    border: 1px solid #ccc;
    padding: 0.25rem;
    min-height: 200px;
  }
  .file-list-row {
    display: grid;
    grid-template-columns: 1fr 72px 140px;
    align-items: center;
    padding: 0 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-list-row.focused {
    outline: 2px solid #2266dd;
    outline-offset: -2px;
  }
  .file-list-row[aria-selected="true"] {
    background: #dbe9ff;
  }
</style>
