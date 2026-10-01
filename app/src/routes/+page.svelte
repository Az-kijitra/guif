<script lang="ts">
  // routes/+page.svelte (SPEC-0200-0001 §4.1 path 2): composition only -- it
  // injects state/controllers into routes/_components/; decisions live in
  // features/ and routes/*-wiring.ts (`filteredEntries`, SPEC-0300-0012
  // R-115~R-118, is the sole feature-to-feature bridge, §3.1.2 path 2).
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
  import { validateKeymapEntries } from "$lib/features/keyboard/keymap-validate";
  import { buildKeymapLoadNotice } from "$lib/features/keyboard/keymap-notice";
  import { fileListState } from "$lib/features/file-list/list-state.svelte";
  import { createTreeState } from "$lib/features/file-list/tree-state.svelte";
  import { getTreeChildQuery } from "$lib/features/file-list/tree";
  import { createSortMenuState } from "$lib/features/file-list/sort-menu-state.svelte";
  import { uiStatePersistence } from "$lib/features/file-list/ui-state-persistence";
  import { computeFileListAria } from "$lib/features/file-list/aria";
  import { resolveFocusIndexForVisibleSet } from "$lib/features/file-list/navigation";
  import { fsListDir, fsListDrives } from "$lib/shared/ipc/fs";
  import PathBar from "$lib/features/path-bar/PathBar.svelte";
  import { searchState } from "$lib/features/search/search-state.svelte";
  import { computeFilteredEntries } from "$lib/features/search/matching";
  import { navigationHistoryState } from "$lib/features/navigation-history/navigation-history-state.svelte";
  import { resolveListKeyIntent } from "$lib/features/navigation-history/list-ops";
  import { modalHost } from "$lib/shared/state/modal-host.svelte";
  import ModalHost from "./_components/modal/ModalHost.svelte";
  import OverlayRegion from "./_components/OverlayRegion.svelte";
  import FileListBody from "./_components/FileListBody.svelte";
  import StatusBar from "./_components/StatusBar.svelte";
  import { navigationPersistence } from "$lib/shared/state/navigation-persistence.svelte";
  import { statusMessage } from "$lib/shared/state/status-message.svelte";
  import { configLoadKeymap } from "$lib/shared/ipc/config";
  import { homeDir } from "@tauri-apps/api/path";
  import { createAfterUserNavigation, createOverlayController } from "./navigation-wiring";
  import { createPathBarController } from "./path-bar-wiring";
  import { exitOnly, runBootstrap } from "./bootstrap-wiring";
  import { createListTreeControllers } from "./list-tree-controllers-wiring";
  import { createOperationControllers } from "./operations-wiring";
  import { createSearchActionHandler } from "./search-wiring";
  import { createModalFocusController, createModalKeyHandler, syncHistoryWithModal, syncSortMenuWithModal } from "./overlay-wiring";
  import { closeSortMenu, createSortMenuKeyHandler, createSortMenuToggle } from "./sort-menu-wiring";
  import { createTabStopController } from "./focus-wiring";
  import { runStartupHydrate } from "./startup-wiring";
  import { createMainViewerOpenController } from "./viewer-open-wiring";
  import { createRowInteractionHandlers } from "./row-interaction-wiring";

  let ready = $state(false); // SHOULD-120: gate the body until R-77-3-1 applies.

  let containerEl: HTMLDivElement | undefined = $state();
  let treeContainerEl: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let treeFullyVisibleRows = $state(1); // R-59-2: measured by TreePanel itself.
  // DOM refs used only to sequence `.focus()` (§3.1.5/§3.2.9-1/§3.3.2/§3.6.4).
  let searchInputEl: HTMLInputElement | undefined = $state();
  let pathBarInputEl: HTMLInputElement | undefined = $state();
  let historyListEl: HTMLDivElement | undefined = $state();
  let dialogEl: HTMLDivElement | undefined = $state();

  let layout = $derived(fileListState.layout(containerWidth || 800, containerHeight || 400));
  // R-59-1: page_up/page_down move by the SAME "R-16-1 rows" as rowsPerColumn.
  $effect(() => {
    fileListState.setPageRows(layout.rows);
  });

  let filterResult = $derived( // R-116: recomputed via Svelte reactivity.
    computeFilteredEntries(fileListState.entries, {
      active: searchState.active,
      query: searchState.query,
      regexMode: searchState.regexMode,
    }),
  );
  let filteredEntries = $derived(filterResult.filteredEntries);

  // R-41: dir-only, name/asc, independent of the list's own sort.
  async function listDirForTree(path: string, showHidden: boolean) {
    const query = getTreeChildQuery(path);
    const entries = await fsListDir({ path: query.path, showHidden, sortKey: query.sortKey, sortOrder: query.sortOrder });
    return entries.filter((e) => e.entryType === "dir").map((e) => ({ path: e.path, name: e.name }));
  }
  const treeState = createTreeState({
    listDir: listDirForTree,
    isVisible: () => fileListState.showTree(),
    onLoadFailureNotice: (message) => statusMessage.show(message),
    listDrives: () => fsListDrives(), // R-782: async, DI-able
  });
  const sortMenuState = createSortMenuState();

  let keydownHandler: ((event: Event) => void) | undefined;
  let unlistenClose: (() => void) | undefined;
  let destroyed = false;

  // §3.2.4/§3.6.11.4(f): the single call-through point for every R-208 move;
  // also where the tree follows the list (MUST-94: no list<->tree import).
  // The initial load (R-208 #6) records/follows the same way but stays silent
  // on failure: a vanished last-visited path just falls back to home.
  const navHooks = {
    recordVisit: (path: string) => navigationHistoryState.recordVisit(path),
    followTree: (path: string) => void treeState.followTo(path),
  };
  const afterUserNavigation = createAfterUserNavigation({ ...navHooks, notifyFailure: (m) => statusMessage.show(m) });
  const afterInitialLoad = createAfterUserNavigation({ ...navHooks, notifyFailure: () => {} });

  const focus = {
    pathBarInput: () => pathBarInputEl,
    container: () => containerEl?.focus(),
    tree: () => treeContainerEl?.focus(),
    historyList: () => historyListEl?.focus(),
    searchInput: () => searchInputEl?.focus(),
  };

  const overlay = createOverlayController({ // §3.2.9-1: search/history/sort-menu exclusion + focus.
    search: searchState,
    history: navigationHistoryState,
    focus,
    nextTick: tick,
    navigate: (path) => void afterUserNavigation(fileListState.navigate(path)),
    sortMenu: sortMenuState,
  });
  const { activateSearch, openHistoryList } = overlay;
  // SPEC-0300-0016: path bar (R-710 focus_path, R-720 confirm, R-740 Tab).
  const pathBar = createPathBarController({
    currentPath: () => fileListState.currentPath,
    navigate: (path) => afterUserNavigation(fileListState.navigate(path)),
    listDirForCompletion: listDirForTree, // R-742: dirs only, hidden per setting
    showHidden: () => fileListState.showHidden(),
    notify: (message) => statusMessage.show(message),
    history: navigationHistoryState,
    search: searchState,
    closeSearchForPathBar: overlay.closeSearchForPathBar,
    addJump: (path) => navigationHistoryState.addJump(path),
    focus,
    nextTick: tick,
  });

  const closeSortMenuNow = () => closeSortMenu({ state: sortMenuState, focusContainer: focus.container });
  const sortMenuToggle = createSortMenuToggle({
    state: sortMenuState,
    currentSortKey: () => fileListState.sortKey(),
    closeSortMenu: closeSortMenuNow,
  });
  const handleSortMenuKey = createSortMenuKeyHandler({
    state: sortMenuState,
    applySort: (key) => fileListState.applySort(key),
    closeSortMenu: closeSortMenuNow,
  });

  const isTreeFocused = () => treeState.hasFocus;
  // Bug fix (coordinator WebView2 finding): TabStopControllerDeps.focus is
  // {tree/search/list}, NOT `focus` above's {container/tree/historyList/
  // searchInput} shape -- passing `focus` directly threw on every Tab press.
  const onTabStop = createTabStopController({
    treeVisible: () => fileListState.showTree(),
    searchVisible: () => searchState.active,
    currentStop: () => (isTreeFocused() ? "tree" : searchState.inputFocused ? "search" : "list"),
    focus: { tree: focus.tree, search: focus.searchInput, list: focus.container },
  });

  const focusedPath = (): string => fileListState.entries[fileListState.focusedIndex]?.path ?? "";
  const isFocusedPathVisible = (): boolean => {
    const path = focusedPath();
    return path !== "" && filteredEntries.some((e) => e.path === path);
  };

  let fileListAria = $derived(computeFileListAria({ focusedPath: focusedPath(), isFocusedPathVisible: isFocusedPathVisible() }));

  // §3.5.3/R-408: fire-and-forget; failures go to the shared status line.
  const viewerOpenController = createMainViewerOpenController((message) => statusMessage.show(message));

  // R-401-5/R-402 (SPEC-0300-0009 R-50~R-52): click selection + dblclick.
  const { focusedEntry, handleRowClick, handleRowDblClick } = createRowInteractionHandlers({
    fileList: fileListState,
    filteredEntries: () => filteredEntries,
    isFocusedPathVisible,
    afterUserNavigation,
    viewer: viewerOpenController,
  });

  const handleSearchAction = createSearchActionHandler({
    search: searchState,
    focusContainer: focus.container,
    entries: () => fileListState.entries,
    filteredEntries: () => filteredEntries,
    focusedIndex: () => fileListState.focusedIndex,
    resolveFocusIndex: resolveFocusIndexForVisibleSet,
    focusIndex: (index) => fileListState.focusIndex(index),
  });

  // File ops (Phase 2) + ZIP (Phase 5): displayed entries only (MUST-61).
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

  const { onListAction, onTreeAction, onTreeSelectPath } = createListTreeControllers({
    fileList: fileListState,
    treeState,
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
    isTreeFocused,
    sortMenuToggle,
    focusContainer: focus.container,
    treeFullyVisibleRows: () => treeFullyVisibleRows,
    pathBar,
  });

  const modalFocus = createModalFocusController({
    getDialogEl: () => dialogEl,
    focusContainer: focus.container,
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
  // §3.3.2/§3.6.11.1 exclusion invariants (SHOULD-85/MUST-84 (c)).
  $effect(() => {
    syncHistoryWithModal({ modalOpen: modalHost.isOpen, history: navigationHistoryState });
    syncSortMenuWithModal({ modalOpen: modalHost.isOpen, sortMenu: sortMenuState });
  });

  onMount(() => {
    void bootstrap();
  });

  // §3.6.2/§3.6.11.11: startup notices are concatenated (config -> ui-state ->
  // navigation) and applied (ui-state -> config -> navigation) before the
  // first fs_list_dir (R-77-3-1), via startup-wiring.ts.
  async function bootstrap(): Promise<void> {
    await runStartupHydrate({
      loadUiState: async () => ({ notice: await uiStatePersistence.hydrateAll() }),
      loadKeymap: async () => {
        const raw = await configLoadKeymap();
        const validated = validateKeymapEntries(raw.entries);
        keymapState.hydrate(validated.effective);
        return { notice: buildKeymapLoadNotice(raw.parseError, validated.invalidActions) };
      },
      loadNavigation: () => navigationPersistence.hydrateAll(),
    });
    if (destroyed) return;
    ready = true;

    const boot = await runBootstrap({
      keydown: {
        isTreeFocused,
        customOverrides: () => keymapState.customOverrides,
        modal: modalHost,
        history: navigationHistoryState,
        sortMenu: sortMenuState,
        search: searchState,
        onHardcodedShortcut: exitOnly,
        onExitAction: exitOnly,
        handleModalKey,
        handleSortMenuKey,
        sortMenuToggle,
        resolveHistoryIntent: (event, action) => overlay.handleIntent(resolveListKeyIntent(event, action)),
        onTreeAction,
        onListAction,
        onSearchAction: handleSearchAction,
        onTabStop,
        pathBar: { get editing() { return pathBar.state.editing; }, ...pathBar.keys },
      },
      initialDirectory: {
        lastVisited: navigationHistoryState.visitHistory[0],
        load: (path) => afterInitialLoad(fileListState.loadDirectory(path)),
        currentSequence: () => fileListState.currentSequence(),
        loadIfNoNewerRequest: (path, since) => afterInitialLoad(fileListState.loadIfNoNewerRequest(path, since)),
        homeDir,
      },
      focusContainer: focus.container,
      // R-244/R-77-2-1: flush both persistence coordinators before close.
      flush: () => Promise.allSettled([navigationPersistence.flush(), uiStatePersistence.flush()]).then(() => undefined),
      isDestroyed: () => destroyed,
      onKeydownHandler: (handler) => (keydownHandler = handler),
    });
    unlistenClose = boot.unlistenClose;
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
     rendered outside <main>. R-10-11/AC-631: path bar -> body (tree + list)
     -> status bar (§3.6.11.4(e), no <h1>, no menu bar per SPEC-0100-0005 R-08). -->
{#if ready}
  <main inert={modalHost.isOpen}>
    <PathBar
      text={pathBar.state.text}
      bind:inputEl={pathBarInputEl}
      onFocus={pathBar.handleFocus}
      onBlur={pathBar.handleBlur}
      onInput={pathBar.handleInput}
    />

    <OverlayRegion
      searchActive={searchState.active}
      query={searchState.query}
      regexMode={searchState.regexMode}
      filterError={filterResult.error}
      bind:searchInputEl
      onQueryInput={(value) => searchState.setQuery(value)}
      onRegexModeChange={(value) => searchState.setRegexMode(value)}
      onSearchCancel={() => handleSearchAction("cancel")}
      onSearchSubmit={() => handleSearchAction("confirm")}
      onSearchInputFocus={() => searchState.setInputFocused(true)}
      onSearchInputBlur={() => searchState.setInputFocused(false)}
      historyOpen={navigationHistoryState.isOpen}
      historyItems={navigationHistoryState.mode === "history" ? navigationHistoryState.visitHistory : navigationHistoryState.jumpList}
      historySelectedIndex={navigationHistoryState.selectedIndex}
      historyLabel={navigationHistoryState.mode === "history" ? "Visit history" : "Jump list"}
      bind:historyListEl
      onHistoryRowClick={(index) => {
        navigationHistoryState.selectIndex(index);
        overlay.handleIntent("confirm");
      }}
      onHistoryRemove={(index) => {
        navigationHistoryState.removeIndex(index);
        if (!navigationHistoryState.isOpen) focus.container();
      }}
    />

    <FileListBody
      showTree={fileListState.showTree()}
      treeRows={treeState.visibleRows()}
      treeFocusedPath={treeState.focusedPath}
      treeCurrentDirPath={treeState.currentDirPath}
      treeHasFocus={treeState.hasFocus}
      bind:treeContainerEl
      bind:treeFullyVisibleRows
      onTreeToggleExpand={(path) => treeState.toggleExpand(path)}
      onTreeSelectPath={onTreeSelectPath}
      onTreeContainerFocus={(focused) => treeState.setContainerFocus(focused)}
      loading={fileListState.loading}
      error={fileListState.error}
      entries={filteredEntries}
      focusedPath={focusedPath()}
      selected={fileListState.selected}
      showSize={fileListState.showSize()}
      showTime={fileListState.showTime()}
      ariaMultiselectable={fileListAria["aria-multiselectable"]}
      ariaActivedescendant={fileListAria["aria-activedescendant"]}
      layoutRows={layout.rows}
      bind:containerEl
      bind:containerWidth
      bind:containerHeight
      onRowClick={handleRowClick}
      onRowDblClick={handleRowDblClick}
      sortMenuOpen={sortMenuState.isOpen}
      sortMenuHighlightedKey={sortMenuState.highlightedKey}
      sortMenuCurrentKey={fileListState.sortKey()}
      sortMenuCurrentOrder={fileListState.sortOrder()}
      onSortMenuClose={closeSortMenuNow}
    />

    <StatusBar text={statusMessage.text} />
  </main>
{/if}

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
</style>
