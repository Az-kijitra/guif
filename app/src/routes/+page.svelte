<script lang="ts">
  // routes/+page.svelte (SPEC-0200-0001 §4.1 path 2): composition layer only —
  // it instantiates/injects the features' state and controllers and renders
  // them; all decision logic lives in features/ and routes/*-wiring.ts.
  // `filteredEntries` (SPEC-0300-0012 R-115~R-118) is the sole feature-to-
  // feature bridge (§3.1.2 path 2; R-129/AC-128).
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import {
    attachGlobalKeydownListener,
    dispatchKeydown,
    type DispatchContext,
  } from "$lib/features/keyboard/key-dispatch";
  import type { KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
  import { fileListState } from "$lib/features/file-list/list-state.svelte";
  import { computeFileListAria } from "$lib/features/file-list/aria";
  import { resolveFocusIndexForVisibleSet } from "$lib/features/file-list/navigation";
  import { searchState } from "$lib/features/search/search-state.svelte";
  import { computeFilteredEntries } from "$lib/features/search/matching";
  import SearchBar from "$lib/features/search/SearchBar.svelte";
  import { navigationHistoryState } from "$lib/features/navigation-history/navigation-history-state.svelte";
  import { resolveListKeyIntent } from "$lib/features/navigation-history/list-ops";
  import NavigationHistoryList from "$lib/features/navigation-history/NavigationHistoryList.svelte";
  import { modalHost } from "$lib/shared/state/modal-host.svelte";
  import ModalHost from "./_components/modal/ModalHost.svelte";
  import { navigationPersistence } from "$lib/shared/state/navigation-persistence.svelte";
  import { statusMessage } from "$lib/shared/state/status-message.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { homeDir } from "@tauri-apps/api/path";
  import {
    createAfterUserNavigation,
    createCloseRequestHandler,
    createOverlayController,
    loadInitialDirectory,
  } from "./navigation-wiring";
  import { createListActionHandler } from "./list-action-wiring";
  import { createOperationControllers } from "./operations-wiring";
  import { createSearchActionHandler } from "./search-wiring";
  import {
    computeDispatchOverlayFlags,
    createModalFocusController,
    createModalKeyHandler,
    syncHistoryWithModal,
  } from "./overlay-wiring";
  import { createMainViewerOpenController } from "./viewer-open-wiring";
  import { createRowInteractionHandlers } from "./row-interaction-wiring";
  import FileListRow from "./_components/FileListRow.svelte";

  let containerEl: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  // DOM references used only to sequence `.focus()` calls (§3.1.5, §3.2.9-1,
  // §3.3.2) — not domain state.
  let searchInputEl: HTMLInputElement | undefined = $state();
  let historyListEl: HTMLDivElement | undefined = $state();
  let dialogEl: HTMLDivElement | undefined = $state();

  let layout = $derived(fileListState.layout(containerWidth || 800, containerHeight || 400));

  // R-116: recomputed via Svelte reactivity (matching.ts is pure).
  let filterResult = $derived(
    computeFilteredEntries(fileListState.entries, {
      active: searchState.active,
      query: searchState.query,
      regexMode: searchState.regexMode,
    }),
  );
  let filteredEntries = $derived(filterResult.filteredEntries);

  let keydownHandler: ((event: Event) => void) | undefined;
  let unlistenClose: (() => void) | undefined;
  let destroyed = false;

  // §3.2.4: the single call-through point for every R-208 user-initiated move
  // (openFocused / goParent / history+jump confirm / initial path). Reload
  // paths (F5, toggle_hidden, file watching; R-209) must NOT use this.
  const afterUserNavigation = createAfterUserNavigation((path) =>
    navigationHistoryState.recordVisit(path),
  );

  // §3.2.9-1: mutual exclusion of search bar / history list plus all DOM
  // focus sequencing.
  const overlay = createOverlayController({
    search: searchState,
    history: navigationHistoryState,
    focus: {
      container: () => containerEl?.focus(),
      historyList: () => historyListEl?.focus(),
      searchInput: () => searchInputEl?.focus(),
    },
    nextTick: tick,
    navigate: (path) => void afterUserNavigation(fileListState.loadDirectory(path)),
  });
  const { activateSearch, openHistoryList } = overlay;

  // §3.2.6 (MUST-52): onCloseRequested performs the flush.
  function requestAppExit(): void {
    try {
      getCurrentWindow()
        .close()
        .catch(() => {});
    } catch {
      // Not running inside Tauri (plain browser dev): nothing to close.
    }
  }

  // Both exit routes (hardcoded Ctrl+Q and a keymap-bound "exit") converge here.
  function exitOnly(action: string): boolean {
    if (action !== "exit") return false;
    requestAppExit();
    return true;
  }

  function focusedPath(): string {
    return fileListState.entries[fileListState.focusedIndex]?.path ?? "";
  }

  function isFocusedPathVisible(): boolean {
    const path = focusedPath();
    return path !== "" && filteredEntries.some((e) => e.path === path);
  }

  // §3.5.3/R-408: fire-and-forget from the caller's side; failures are
  // reported via the shared status line (R-405-5/R-406/R-513).
  const viewerOpenController = createMainViewerOpenController((message) => statusMessage.show(message));

  // R-401-5/R-402/R-402-1/R-402-2 (SPEC-0300-0009 R-50~R-52, ISS-0132): mouse
  // click selection and the double-click composition, extracted to
  // row-interaction-wiring.ts (MUST-80: this file stays ≤400 lines).
  const { focusedEntry, handleRowClick, handleRowDblClick } = createRowInteractionHandlers({
    fileList: fileListState,
    filteredEntries: () => filteredEntries,
    isFocusedPathVisible,
    afterUserNavigation,
    viewer: viewerOpenController,
  });

  // §3.3.5: the search-bar action switch lives in search-wiring.ts (R-105~R-109).
  const handleSearchAction = createSearchActionHandler({
    search: searchState,
    focusContainer: () => containerEl?.focus(),
    entries: () => fileListState.entries,
    filteredEntries: () => filteredEntries,
    focusedIndex: () => fileListState.focusedIndex,
    resolveFocusIndex: resolveFocusIndexForVisibleSet,
    focusIndex: (index) => fileListState.focusIndex(index),
  });

  // Phase 2 (SPEC-0300-0011) file operations and Phase 5 (SPEC-0300-0014) ZIP
  // create/extract: both see the displayed entries only (MUST-61) and reload
  // without recording a visit (R-208/R-209, R-397). Assembly: operations-wiring.
  const { fileOps, archive } = createOperationControllers({
    modal: modalHost,
    status: statusMessage,
    currentPath: () => fileListState.currentPath,
    entries: () => fileListState.entries,
    filteredEntries: () => filteredEntries,
    selected: () => fileListState.selected,
    focusedPath: () => focusedPath(),
    reload: (opts) => fileListState.reload(opts),
  });

  const onListAction = createListActionHandler({
    fileList: fileListState,
    filteredEntries: () => filteredEntries,
    rowsPerColumn: () => layout.rows,
    afterUserNavigation,
    activateSearch,
    openHistoryList,
    addJump: (path) => navigationHistoryState.addJump(path),
    currentPath: () => fileListState.currentPath,
    fileOps,
    archive,
    focusedEntry,
    viewer: viewerOpenController,
  });

  // §3.3.2: modal keys (Escape/Enter/Tab...) are fixed, keymap-independent.
  const modalFocus = createModalFocusController({
    getDialogEl: () => dialogEl,
    focusContainer: () => containerEl?.focus(),
    nextTick: tick,
    getActiveElement: () => document.activeElement,
  });
  const handleModalKey = createModalKeyHandler({ modal: modalHost, focus: modalFocus });

  // §3.3.13-6: focus control runs in $effect (after the DOM update, so the
  // background is no longer inert when the container is refocused).
  $effect(() => {
    const topId = modalHost.topId;
    untrack(() => void modalFocus.onTopIdChange(topId));
  });
  // §3.3.2 exclusion invariant (SHOULD-85).
  $effect(() => {
    syncHistoryWithModal({ modalOpen: modalHost.isOpen, history: navigationHistoryState });
  });

  onMount(() => {
    void bootstrap();
  });

  // §3.2.6/§3.2.7: single async IIFE. Only hydrateAll() is awaited before the
  // key listener is attached; the initial directory load is fire-and-forget.
  async function bootstrap(): Promise<void> {
    await navigationPersistence.hydrateAll();
    if (destroyed) return;

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
        isMenuBarActive: false,
        isTreeFocused: false,
        // §3.3.2: modal + history list = overlay; search flags masked while a modal is shown.
        ...computeDispatchOverlayFlags({
          modalOpen: modalHost.isOpen,
          historyOpen: navigationHistoryState.isOpen,
          searchActive: searchState.active,
          searchInputFocused: searchState.inputFocused,
        }),
        customOverrides: {},
        onHardcodedShortcut: exitOnly,
        onExitAction: exitOnly,
        // §3.2.8: the history/jump list rides on the existing overlay slot.
        onOverlayKey: (action, overlayEvent) => {
          if (modalHost.isOpen) return handleModalKey(overlayEvent);
          if (!navigationHistoryState.isOpen) return false;
          return overlay.handleIntent(resolveListKeyIntent(overlayEvent, action));
        },
        onMenuBarKey: () => false,
        onTreeAction: () => false,
        onListAction,
        onSearchAction: handleSearchAction,
      };

      const handled = dispatchKeydown(keydownLike, ctx);
      if (handled) {
        ke.preventDefault();
      }
    };

    attachGlobalKeydownListener(window, keydownHandler);

    // R-208 #6 / §3.2.7: fire-and-forget (not awaited).
    void loadInitialDirectory({
      lastVisited: navigationHistoryState.visitHistory[0],
      load: (path) => afterUserNavigation(fileListState.loadDirectory(path)),
      homeDir,
    });

    // R-244: flush pending navigation data before the window closes.
    try {
      const unlisten = await getCurrentWindow().onCloseRequested(
        createCloseRequestHandler({ flush: () => navigationPersistence.flush() }),
      );
      if (destroyed) unlisten();
      else unlistenClose = unlisten;
    } catch {
      // Not running inside Tauri (plain browser dev).
    }
  }

  onDestroy(() => {
    destroyed = true;
    unlistenClose?.();
    if (keydownHandler !== undefined) {
      window.removeEventListener("keydown", keydownHandler, { capture: true });
    }
  });
</script>

<!-- §3.3.2: the background is inert while a modal is shown; <ModalHost> is
     rendered outside <main>. -->
<main inert={modalHost.isOpen}>
  <h1>ReflexFiles Successor — Phase 1</h1>

  <p class="current-path">Current directory: {fileListState.currentPath}</p>

  <!-- R-104/R-216: search bar and history/jump list share one region below
       the path bar; mutually exclusive (§3.2.9-1). -->
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
  {#if navigationHistoryState.isOpen}
    <NavigationHistoryList
      bind:listEl={historyListEl}
      items={navigationHistoryState.mode === "history"
        ? navigationHistoryState.visitHistory
        : navigationHistoryState.jumpList}
      selectedIndex={navigationHistoryState.selectedIndex}
      label={navigationHistoryState.mode === "history" ? "Visit history" : "Jump list"}
      onRowClick={(index) => {
        navigationHistoryState.selectIndex(index);
        overlay.handleIntent("confirm");
      }}
      onRemove={(index) => {
        navigationHistoryState.removeIndex(index);
        if (!navigationHistoryState.isOpen) containerEl?.focus();
      }}
    />
  {/if}
  {#if statusMessage.text}
    <p role="status" class="status-message">{statusMessage.text}</p>
  {/if}

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
      <FileListRow
        {entry}
        focused={entry.path === focusedPath()}
        selected={fileListState.selected.has(entry.path)}
        onRowClick={handleRowClick}
        onRowDblClick={handleRowDblClick}
      />
    {/each}
  </div>
</main>

<ModalHost
  top={modalHost.top}
  bind:dialogEl
  dispatch={(intent) => modalHost.dispatch(intent)}
  setFieldValue={(id, value) => modalHost.setFieldValue(id, value)}
  setChecked={(checked) => modalHost.setChecked(checked)}
/>

<style>
  main {
    font-family: sans-serif;
    padding: 0.5rem 1rem;
  }
  .current-path {
    font-family: monospace;
  }
  .status-message {
    color: #555;
    margin: 0.25rem 0;
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
</style>
