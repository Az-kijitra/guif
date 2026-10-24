// The thin `onListAction` switch extracted from +page.svelte
// (SPEC-0200-0001 §3.3.5): every dependency is injected; this module imports
// no feature module (SPEC-0300-0010 R-17: the keyboard layer only resolves
// action ids, each feature implements its own action).
//
import { decideOpen } from "$lib/features/viewer/open-decision";
import { computeTreeFocusReassignment } from "$lib/features/file-list/aria";
import type { NavigateResult } from "$lib/shared/navigation-result";

// SPEC-0300-0015 §3.5.3: `case "open"` no longer unconditionally calls
// `fileList.openFocused()`. It branches on the focused entry's `entryType`
// and `event.shiftKey` via `open-decision.ts`'s pure judgment
// (navigate-dir/open-file/os-open/noop) so the keyboard path and the file
// list's double-click handler share one decision (SHOULD-110).

interface EntryLike {
  name: string;
  path: string;
}

interface OpenTargetEntry {
  entryType: "file" | "dir";
  path: string;
}

export interface ListActionDeps<E extends EntryLike = EntryLike> {
  fileList: {
    moveRow(visible: readonly E[], direction: "up" | "down", extendSelection?: boolean): void;
    moveColumn(visible: readonly E[], direction: "left" | "right", rowsPerColumn: number, extendSelection?: boolean): void;
    openFocused(): Promise<NavigateResult>;
    goParent(): Promise<NavigateResult>;
    toggleFocused(visible: readonly E[]): void;
    selectAll(visible: readonly E[]): void;
    // SPEC-0200-0001 §3.6.6/§3.6.11.4/§3.6.11.5 (MUST-87/94): Phase 7 toggles
    // and the two read-only getters `toggle_tree`/`toggle_hidden` need to
    // decide whether to compose a tree reaction here.
    toggleTree(): void;
    toggleHidden(): void;
    toggleSize(): void;
    toggleTime(): void;
    clearSelection(): void;
    pageUp(visible: readonly E[], extendSelection?: boolean): void;
    pageDown(visible: readonly E[], extendSelection?: boolean): void;
    showTree(): boolean;
    showHidden(): boolean;
    sortKey(): string;
  };
  filteredEntries: () => readonly E[];
  rowsPerColumn: () => number;
  afterUserNavigation: (navigation: Promise<NavigateResult>) => Promise<NavigateResult>;
  activateSearch: () => void;
  openHistoryList: (mode: "history" | "jump") => void;
  addJump: (path: string) => void;
  currentPath: () => string;
  fileOps: { handleAction(action: string, event: { shiftKey: boolean }): boolean };
  archive: { handleAction(action: string): boolean };
  // SPEC-0300-0015 §3.5.3: the focused entry (for the "open" case's R-402/
  // R-402-1 target decision) and the viewer's open entry points (R-404,
  // R-401-2). `null` covers R-402-1 (no focus, or the focused entry is not
  // currently displayed).
  focusedEntry: () => OpenTargetEntry | null;
  viewer: { openFile(path: string): void | Promise<unknown>; openWithOsAssociation(path: string): void | Promise<unknown> };
  // SPEC-0200-0001 §3.6.6 (MUST-94): the tree's own reactions to
  // `toggle_tree`/`toggle_hidden`, composed HERE (not inside
  // list-state.svelte.ts) so list-action-wiring.ts stays the ONLY module
  // that imports both `file-list` (via `fileList` above) and the tree
  // (injected, never imported -- tree-state.svelte.ts is a sibling module in
  // the same feature, not imported by this routes/ file either). Optional:
  // callers/tests that pre-date Phase 7 (e.g. the Phase 5 ZIP wiring tests)
  // never pass these, so `isTreeFocused` defaults to "never focused" and the
  // tree-composition cases below no-op when `tree`/`sortMenu`/`focus` are
  // absent.
  isTreeFocused?: () => boolean;
  tree?: { clear(): void; followTo(path: string): Promise<void>; applyHiddenFilesChanged(showHidden: boolean): void };
  sortMenu?: { toggle(): void };
  focus?: { container(): void };
  // SPEC-0300-0016 R-710 / SPEC-0200-0001 §3.7.6: the `focus_path` action's
  // implementation (path-bar-wiring.ts::openPathBar). Optional like tree/
  // sortMenu/focus: unset => the action does nothing.
  pathBar?: { open(): void };
  // SPEC-0300-0022 R-1671 / SPEC-0200-0001 §3.17.9: the `settings` action = open the settings file (optional like pathBar: unset => nothing).
  settingsFile?: { open(): void | Promise<unknown> };
}

const FILE_OP_ACTIONS = new Set(["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"]);
// SPEC-0300-0014 R-305: ZIP create / extract. Not navigation either (R-397).
const ZIP_ACTIONS = new Set(["zip_create", "zip_extract"]);
// R-14-14: these 9 file-operation actions do nothing while the tree has
// focus (everything else -- toggle_*/sort_menu/clear_selection/search/
// history/go_parent -- keeps working as usual).
const TREE_FOCUS_BLOCKED_ACTIONS = new Set([...FILE_OP_ACTIONS, ...ZIP_ACTIONS]);

// SPEC-0300-0020 R-1340-1: where the call comes from. The key-only suppression (R-14-14 / R-15-1) does not apply to the menu.
export interface ListActionOptions {
  source?: "key" | "menu";
}

export function createListActionHandler<E extends EntryLike>(deps: ListActionDeps<E>) {
  return function onListAction(action: string | null, event: { shiftKey: boolean; repeat?: boolean }, opts?: ListActionOptions): boolean {
    if (action === null) return false;

    // R-14-14: consumed but a no-op while the tree has focus (keys only; the menu skips this guard, R-1340-1).
    if (opts?.source !== "menu" && (deps.isTreeFocused?.() ?? false) && TREE_FOCUS_BLOCKED_ACTIONS.has(action)) return true;

    // SPEC-0300-0011 R-14: file operations are not navigation (R-208/R-209),
    // so afterUserNavigation is never involved.
    if (FILE_OP_ACTIONS.has(action)) return deps.fileOps.handleAction(action, event);
    if (ZIP_ACTIONS.has(action)) return deps.archive.handleAction(action);

    switch (action) {
      case "move_up":
        if (event.shiftKey) deps.fileList.moveRow(deps.filteredEntries(), "up", true);
        else deps.fileList.moveRow(deps.filteredEntries(), "up");
        return true;
      case "move_down":
        if (event.shiftKey) deps.fileList.moveRow(deps.filteredEntries(), "down", true);
        else deps.fileList.moveRow(deps.filteredEntries(), "down");
        return true;
      case "move_left":
        if (event.shiftKey) deps.fileList.moveColumn(deps.filteredEntries(), "left", Math.max(deps.rowsPerColumn(), 1), true);
        else deps.fileList.moveColumn(deps.filteredEntries(), "left", Math.max(deps.rowsPerColumn(), 1));
        return true;
      case "move_right":
        if (event.shiftKey) deps.fileList.moveColumn(deps.filteredEntries(), "right", Math.max(deps.rowsPerColumn(), 1), true);
        else deps.fileList.moveColumn(deps.filteredEntries(), "right", Math.max(deps.rowsPerColumn(), 1));
        return true;
      case "open": {
        const focused = deps.focusedEntry();
        const decision = decideOpen(focused, event.shiftKey);
        switch (decision) {
          case "navigate-dir":
            void deps.afterUserNavigation(deps.fileList.openFocused());
            return true;
          case "open-file":
            // R-408: fire-and-forget -- must not block the UI thread.
            void deps.viewer.openFile((focused as OpenTargetEntry).path);
            return true;
          case "os-open":
            void deps.viewer.openWithOsAssociation((focused as OpenTargetEntry).path);
            return true;
          case "noop":
            return true;
        }
        return true;
      }
      case "go_parent":
        void deps.afterUserNavigation(deps.fileList.goParent());
        return true;
      case "select_toggle":
        deps.fileList.toggleFocused(deps.filteredEntries());
        return true;
      case "select_all":
        // R-123/SPEC-0300-0009 R-55: the visible (filtered) entries only.
        deps.fileList.selectAll(deps.filteredEntries());
        return true;
      case "search":
        deps.activateSearch();
        return true;
      // R-222/R-223: no entries.length guards on purpose.
      case "history":
        deps.openHistoryList("history");
        return true;
      case "history_jump_list":
        deps.openHistoryList("jump");
        return true;
      case "jump_add": {
        // R-212-1: nothing to register while the current directory is
        // undetermined (the key is still consumed).
        const path = deps.currentPath();
        if (path) deps.addJump(path);
        return true;
      }
      // ---------------------------------------------------------------
      // Phase 7 (SPEC-0300-0009 R-59/R-54-1/R-74-1; SPEC-0200-0001 §3.6.6).
      // ---------------------------------------------------------------
      case "toggle_hidden":
        deps.fileList.toggleHidden();
        deps.tree?.applyHiddenFilesChanged(deps.fileList.showHidden());
        return true;
      case "toggle_size":
        deps.fileList.toggleSize();
        return true;
      case "toggle_time":
        deps.fileList.toggleTime();
        return true;
      case "clear_selection":
        deps.fileList.clearSelection();
        return true;
      case "page_up":
        if (event.shiftKey) deps.fileList.pageUp(deps.filteredEntries(), true);
        else deps.fileList.pageUp(deps.filteredEntries());
        return true;
      case "page_down":
        if (event.shiftKey) deps.fileList.pageDown(deps.filteredEntries(), true);
        else deps.fileList.pageDown(deps.filteredEntries());
        return true;
      case "sort_menu":
        deps.sortMenu?.toggle();
        return true;
      // R-710/R-710-3: also reachable while the tree has focus (not in
      // TREE_FOCUS_BLOCKED_ACTIONS).
      case "focus_path":
        deps.pathBar?.open();
        return true;
      // SPEC-0300-0022 R-1606: an auto-repeat is consumed but runs nothing (a menu call has no `repeat`).
      case "settings":
        if (!event.repeat) void deps.settingsFile?.open();
        return true;
      // MUST-94: the tree's reaction to toggle_tree is composed HERE (not
      // inside list-state.svelte.ts) so file-list/list-state.svelte.ts never
      // imports tree-state.svelte.ts (avoids a circular feature-internal
      // import, §3.6.11.4(b)/(f)).
      case "toggle_tree": {
        const wasTreeFocused = deps.isTreeFocused?.() ?? false;
        deps.fileList.toggleTree(); // flag flip + save request only
        const nowVisible = deps.fileList.showTree();
        if (nowVisible) {
          void deps.tree?.followTo(deps.currentPath());
        } else {
          deps.tree?.clear();
          // R-14/AC-09: hiding the tree while it had focus reassigns focus
          // to the file list container (shared judgment, not reimplemented
          // here -- code-reviewer minor item, 2026-09-29).
          const reassignment = computeTreeFocusReassignment({
            focusRegion: wasTreeFocused ? "tree" : "file-list",
            treeNowVisible: false,
          });
          if (reassignment.focusRegion === "file-list" && wasTreeFocused) deps.focus?.container();
        }
        return true;
      }
      default:
        return false;
    }
  };
}

interface TypedEntryLike extends EntryLike {
  entryType: "file" | "dir";
}

export interface FileOpsContextDeps {
  currentPath: () => string;
  entries: () => readonly TypedEntryLike[];
  filteredEntries: () => readonly TypedEntryLike[];
  selected: () => ReadonlySet<string>;
  focusedPath: () => string | null;
}

// MUST-61 / SPEC-0300-0011 R-10-1: operation targets are limited to what is
// displayed. The focused path is reported only if it is displayed; the
// selection is intersected with the displayed entries. Re-evaluated on every
// call (all inputs are getters). MUST-67 (SPEC-0200-0001 §3.4.13-3): each
// entry carries its `entryType` (file-ops ignores it; the archive controller
// needs it to reject a DIRECTORY named x.zip).
export function createFileOpsContext(deps: FileOpsContextDeps) {
  return function context(): {
    currentPath: string;
    entries: { name: string; path: string; entryType: "file" | "dir" }[];
    selected: string[];
    focusedPath: string | null;
  } {
    const shown = deps.filteredEntries();
    const shownPaths = new Set(shown.map((e) => e.path));
    const focused = deps.focusedPath();
    return {
      currentPath: deps.currentPath(),
      entries: shown.map((e) => ({ name: e.name, path: e.path, entryType: e.entryType })),
      selected: [...deps.selected()].filter((p) => shownPaths.has(p)),
      focusedPath: focused !== null && focused !== "" && shownPaths.has(focused) ? focused : null,
    };
  };
}
