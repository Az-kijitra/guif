// The thin `onListAction` switch extracted from +page.svelte
// (SPEC-0200-0001 §3.3.5): every dependency is injected; this module imports
// no feature module (SPEC-0300-0010 R-17: the keyboard layer only resolves
// action ids, each feature implements its own action).

interface EntryLike {
  name: string;
  path: string;
}

export interface ListActionDeps<E extends EntryLike = EntryLike> {
  fileList: {
    moveRow(visible: readonly E[], direction: "up" | "down"): void;
    moveColumn(visible: readonly E[], direction: "left" | "right", rowsPerColumn: number): void;
    openFocused(): Promise<string | null>;
    goParent(): Promise<string | null>;
    toggleFocused(visible: readonly E[]): void;
    selectAll(visible: readonly E[]): void;
  };
  filteredEntries: () => readonly E[];
  rowsPerColumn: () => number;
  afterUserNavigation: (navigation: Promise<string | null>) => Promise<string | null>;
  activateSearch: () => void;
  openHistoryList: (mode: "history" | "jump") => void;
  addJump: (path: string) => void;
  currentPath: () => string;
  fileOps: { handleAction(action: string, event: { shiftKey: boolean }): boolean };
}

const FILE_OP_ACTIONS = new Set(["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"]);

export function createListActionHandler<E extends EntryLike>(deps: ListActionDeps<E>) {
  return function onListAction(action: string | null, event: { shiftKey: boolean }): boolean {
    if (action === null) return false;
    // SPEC-0300-0011 R-14: file operations are not navigation (R-208/R-209),
    // so afterUserNavigation is never involved.
    if (FILE_OP_ACTIONS.has(action)) return deps.fileOps.handleAction(action, event);

    switch (action) {
      case "move_up":
        deps.fileList.moveRow(deps.filteredEntries(), "up");
        return true;
      case "move_down":
        deps.fileList.moveRow(deps.filteredEntries(), "down");
        return true;
      case "move_left":
        deps.fileList.moveColumn(deps.filteredEntries(), "left", Math.max(deps.rowsPerColumn(), 1));
        return true;
      case "move_right":
        deps.fileList.moveColumn(deps.filteredEntries(), "right", Math.max(deps.rowsPerColumn(), 1));
        return true;
      case "open":
        void deps.afterUserNavigation(deps.fileList.openFocused());
        return true;
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
      default:
        return false;
    }
  };
}

export interface FileOpsContextDeps {
  currentPath: () => string;
  entries: () => readonly EntryLike[];
  filteredEntries: () => readonly EntryLike[];
  selected: () => ReadonlySet<string>;
  focusedPath: () => string | null;
}

// MUST-61 / SPEC-0300-0011 R-10-1: operation targets are limited to what is
// displayed. The focused path is reported only if it is displayed; the
// selection is intersected with the displayed entries. Re-evaluated on every
// call (all inputs are getters).
export function createFileOpsContext(deps: FileOpsContextDeps) {
  return function context(): {
    currentPath: string;
    entries: { name: string; path: string }[];
    selected: string[];
    focusedPath: string | null;
  } {
    const shown = deps.filteredEntries();
    const shownPaths = new Set(shown.map((e) => e.path));
    const focused = deps.focusedPath();
    return {
      currentPath: deps.currentPath(),
      entries: shown.map((e) => ({ name: e.name, path: e.path })),
      selected: [...deps.selected()].filter((p) => shownPaths.has(p)),
      focusedPath: focused !== null && focused !== "" && shownPaths.has(focused) ? focused : null,
    };
  };
}
