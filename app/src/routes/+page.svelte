<script lang="ts">
  // routes/+page.svelte (SPEC-0200-0001 §4.1 path 2): composition only; decisions live in
  // features/ and routes/*-wiring.ts (`filteredEntries` is the sole feature bridge, §3.1.2).
  import "../app.css"; // R-913: the main window only (never +layout.svelte / the viewer).
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import { REGION_NAMES } from "$lib/shared/messages";
  import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
  import { fileListState } from "$lib/features/file-list/list-state.svelte";
  import { createSortMenuState } from "$lib/features/file-list/sort-menu-state.svelte";
  import { uiStatePersistence } from "$lib/features/file-list/ui-state-persistence";
  import { computeFileListAria } from "$lib/features/file-list/aria";
  import { resolveFocusIndexForVisibleSet } from "$lib/features/file-list/navigation";
  import PathBar from "$lib/features/path-bar/PathBar.svelte";
  import { searchState } from "$lib/features/search/search-state.svelte";
  import { navigationHistoryState } from "$lib/features/navigation-history/navigation-history-state.svelte";
  import { resolveListKeyIntent } from "$lib/features/navigation-history/list-ops";
  import { modalHost } from "$lib/shared/state/modal-host.svelte";
  import ModalHost from "./_components/modal/ModalHost.svelte";
  import OverlayRegion from "./_components/OverlayRegion.svelte";
  import FileListBody from "./_components/FileListBody.svelte";
  import StatusBar from "./_components/StatusBar.svelte";
  import { navigationPersistence } from "$lib/shared/state/navigation-persistence.svelte";
  import { statusMessage } from "$lib/shared/state/status-message.svelte";
  import { homeDir } from "@tauri-apps/api/path";
  import { createNavigationFollowers, createOverlayController } from "./navigation-wiring";
  import { createPathBarController } from "./path-bar-wiring";
  import { exitOnly, runBootstrap } from "./bootstrap-wiring";
  import { createListTreeControllers } from "./list-tree-controllers-wiring";
  import { createOperationControllers } from "./operations-wiring";
  import { createSearchActionHandler } from "./search-wiring";
  import { createHistoryRowHandlers } from "./history-row-wiring";
  import { createModalWiring } from "./modal-wiring.svelte";
  import { createSortMenuController } from "./sort-menu-wiring";
  import { createFocusedPathView, createTabStopController, resolveCurrentStop } from "./focus-wiring";
  import { externalAppsState } from "$lib/features/external-apps/external-apps-state.svelte";
  import { createEntryWiring } from "./entry-wiring";
  import { createMainContextMenu } from "./context-menu-main.svelte";
  import ContextMenuHost from "./_components/ContextMenuHost.svelte";
  import MenuBar from "$lib/features/menu-bar/MenuBar.svelte";
  import { createMenuBarWiring } from "./menu-bar-wiring.svelte";
  import { loadKeymapForStartup, runStartupHydrate } from "./startup-wiring";
  import { createMainViewerOpenController } from "./viewer-open-wiring";
  import { createRowInteractionHandlers } from "./row-interaction-wiring";
  import { createMainTreeState } from "./tree-wiring";
  import { createStatusBarModel } from "./status-bar-wiring.svelte";
  import { createListView } from "./list-view-wiring.svelte";

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

  // R-116 filter result / R-956 geometry / R-59-1 page rows (§3.10.1 S4).
  const listView = createListView({
    fileList: fileListState,
    search: searchState,
    size: () => ({ width: containerWidth, height: containerHeight }),
  });
  let filterResult = $derived(listView.filterResult);
  let filteredEntries = $derived(listView.filteredEntries);
  let layout = $derived(listView.layout);

  const { treeState, listDirForTree } = createMainTreeState({
    isVisible: () => fileListState.showTree(),
    notify: (message) => statusMessage.show(message),
  });
  const sortMenuState = createSortMenuState();

  let keydownHandler: ((event: Event) => void) | undefined;
  let unlistenClose: (() => void) | undefined;
  let destroyed = false;

  // §3.2.4/§3.6.11.4(f): the single call-through point for every R-208 move;
  // also where the tree follows the list (MUST-94: no list<->tree import).
  // The initial load (R-208 #6) records/follows the same way but stays silent
  // on failure: a vanished last-visited path just falls back to home.
  const { afterUserNavigation, afterInitialLoad } = createNavigationFollowers({
    recordVisit: (path) => navigationHistoryState.recordVisit(path),
    followTree: (path) => void treeState.followTo(path),
    notify: (m) => statusMessage.show(m),
  });

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
  const historyRows = createHistoryRowHandlers({ history: navigationHistoryState, overlay, focusContainer: focus.container });
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

  const sortMenu = createSortMenuController({ fileList: fileListState, focus, state: sortMenuState });

  const isTreeFocused = () => treeState.hasFocus;
  // Bug fix (coordinator WebView2 finding): TabStopControllerDeps.focus is
  // {tree/search/list}, NOT `focus` above's {container/tree/historyList/
  // searchInput} shape -- passing `focus` directly threw on every Tab press.
  const onTabStop = createTabStopController({
    treeVisible: () => fileListState.showTree(),
    searchVisible: () => searchState.active,
    currentStop: () => resolveCurrentStop({ isTreeFocused: isTreeFocused(), searchInputFocused: searchState.inputFocused }),
    focus: { tree: focus.tree, search: focus.searchInput, list: focus.container },
  });

  const { focusedPath, isFocusedPathVisible } = createFocusedPathView({
    fileList: fileListState,
    filteredEntries: () => filteredEntries,
  });

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
  const { fileOps, archive, clipboard } = createOperationControllers({
    modal: modalHost,
    status: statusMessage,
    currentPath: () => fileListState.currentPath,
    entries: () => fileListState.entries,
    filteredEntries: () => filteredEntries,
    selected: () => fileListState.selected,
    focusedPath: () => focusedPath(),
    reload: (opts) => fileListState.reload(opts),
  });

  // SPEC-0300-0021/0022 entrances (no logic). closeMenus closes ONLY what is open (R-1671-1: closeNow() alone would steal the focus); both are made below.
  const { externalApps, settingsFile } = createEntryWiring({
    entries: () => externalAppsState.entries, filteredEntries: () => filteredEntries, focusedPath, currentPath: () => fileListState.currentPath, status: statusMessage,
    closeMenus: () => { if (contextMenu.state.isOpen) contextMenu.closeNow(); if (menuBar.keys.active) menuBar.deactivate(true); },
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
    sortMenuToggle: sortMenu.toggle,
    focusContainer: focus.container,
    treeFullyVisibleRows: () => treeFullyVisibleRows,
    pathBar,
    settingsFile,
  });

  // SPEC-0300-0018: right-click menu; delegates to the controllers above (no logic here).
  const contextMenu = createMainContextMenu({
    fileList: fileListState,
    filteredEntries: () => filteredEntries,
    overlays: [modalHost, navigationHistoryState, sortMenuState],
    clipboard,
    focus,
    fileOps,
    archive,
    viewer: viewerOpenController,
    navigate: (path) => afterUserNavigation(fileListState.navigate(path)),
    status: statusMessage,
    externalApps,
  });
  $effect(() => {
    const path = fileListState.currentPath;
    untrack(() => contextMenu.onCurrentPathChange(path)); // R-1056: a changed directory closes the menu.
  });

  // SPEC-0300-0020: menu bar; calls the same handlers as the keys (with source "menu") on the file list's targets.
  const menuBar = createMenuBarWiring({
    fileList: fileListState, filteredEntries: () => filteredEntries, focusedPath, clipboard, focus, search: searchState,
    overlays: [modalHost, navigationHistoryState, sortMenuState, contextMenu.state], pathEditing: () => pathBar.state.editing, isTreeFocused, onListAction, externalApps, settingsFile,
  });

  const { handleModalKey } = createModalWiring({
    modal: modalHost,
    history: navigationHistoryState,
    sortMenu: sortMenuState,
    contextMenu: contextMenu.state,
    getDialogEl: () => dialogEl,
    focusContainer: focus.container,
  });

  // R-971/R-972: permanent status items (focus area tracked from the DOM, SHOULD-149).
  const status = createStatusBarModel({
    fileList: fileListState,
    search: searchState,
    history: navigationHistoryState,
    sortMenu: sortMenuState,
    contextMenu: contextMenu.state,
    menuBar: menuBar.view,
    modal: modalHost,
    pathEditing: () => pathBar.state.editing,
    filteredEntries: () => filteredEntries,
  });

  onMount(() => {
    void bootstrap();
    const detach = [status.attach(document, window), contextMenu.attach(document, window), menuBar.attach(window)];
    return () => detach.forEach((d) => d());
  });

  // §3.6.2/§3.6.11.11: startup notices are concatenated (config -> ui-state ->
  // navigation) and applied (ui-state -> config -> navigation) before the
  // first fs_list_dir (R-77-3-1), via startup-wiring.ts.
  async function bootstrap(): Promise<void> {
    await runStartupHydrate({
      loadUiState: async () => ({ notice: await uiStatePersistence.hydrateAll() }),
      loadKeymap: loadKeymapForStartup,
      loadNavigation: () => navigationPersistence.hydrateAll(),
    });
    if (destroyed) return;
    ready = true;

    const boot = await runBootstrap({
      menuBar: menuBar.keys,
      keydown: {
        isTreeFocused,
        customOverrides: () => keymapState.customOverrides,
        modal: modalHost,
        history: navigationHistoryState,
        sortMenu: sortMenuState,
        contextMenu: { get isOpen() { return contextMenu.state.isOpen; }, handleKey: contextMenu.handleKey },
        search: searchState,
        onHardcodedShortcut: settingsFile.onHardcoded,
        onExitAction: exitOnly,
        handleModalKey,
        handleSortMenuKey: sortMenu.handleKey,
        sortMenuToggle: sortMenu.toggle,
        resolveHistoryIntent: (event, action) => overlay.handleIntent(resolveListKeyIntent(event, action)),
        onTreeAction,
        onListAction,
        onSearchAction: handleSearchAction,
        onTabStop,
        pathBar: { get editing() { return pathBar.state.editing; }, ...pathBar.keys },
        externalApps,
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

<!-- §3.3.2: inert while a modal shows (<ModalHost> is outside <main>). R-10-11: path bar -> body
     -> status bar; the menu bar is the first child (SPEC-0300-0020 R-1300). R-901/R-913: <main> is always rendered
     (document rules apply from the first paint); its body is gated on `ready` (SHOULD-120). -->
<main class="app-shell ui-root" inert={modalHost.isOpen}>
  {#if ready}
    <MenuBar view={menuBar.view} actions={menuBar.actions} />
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
      historyLabel={navigationHistoryState.mode === "history" ? REGION_NAMES.history : REGION_NAMES.jumpList}
      bind:historyListEl
      onHistoryRowClick={historyRows.onHistoryRowClick}
      onHistoryRemove={historyRows.onHistoryRemove}
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
      geometry={layout}
      bind:containerEl
      bind:containerWidth
      bind:containerHeight
      onRowClick={handleRowClick}
      onRowDblClick={handleRowDblClick}
      sortMenuOpen={sortMenuState.isOpen}
      sortMenuHighlightedKey={sortMenuState.highlightedKey}
      sortMenuCurrentKey={fileListState.sortKey()}
      sortMenuCurrentOrder={fileListState.sortOrder()}
      onSortMenuClose={sortMenu.closeNow}
    />

    <StatusBar items={status.items} message={statusMessage.text} />
    <ContextMenuHost menu={contextMenu} />
  {/if}
</main>

<ModalHost
  top={modalHost.top}
  bind:dialogEl
  dispatch={(intent) => modalHost.dispatch(intent)}
  setFieldValue={(id, value) => modalHost.setFieldValue(id, value)}
  setChecked={(checked) => modalHost.setChecked(checked)}
/>

