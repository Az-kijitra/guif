// Composition helpers extracted from routes/+page.svelte so that the
// DOM-independent parts of the Phase 4 wiring are unit-testable
// (SPEC-0200-0001 §3.2.4, §3.2.6, §3.2.7, §3.2.9-1). Every dependency is
// injected; this module imports no feature module (routes wires the real
// ones in +page.svelte).

import type { ListKeyIntent } from "$lib/features/navigation-history/list-ops";

// --- §3.2.4: afterUserNavigation ------------------------------------------

// The single call-through point for every R-208 user-initiated move.
// Records the visit only when the navigation succeeded (result !== null,
// R-210/R-211). Reload-type callers (F5 / toggle_hidden / file watching,
// R-209) must NOT go through this.
//
// SPEC-0200-0001 §3.6.11.4 (f): `followTree` is an OPTIONAL second
// dependency (like `onTabStop`/`sortMenu` elsewhere in Phase 7) -- this is
// the single point every user-initiated navigation passes through, so it is
// also where the tree follows the newly-loaded directory (R-45's reverse
// direction, list -> tree), keeping `list-state.svelte.ts` and
// `tree-state.svelte.ts` free of importing each other (MUST-94).
export function createAfterUserNavigation(
  recordVisit: (path: string) => void,
  followTree?: (path: string) => void,
) {
  return async function afterUserNavigation(
    navigationPromise: Promise<string | null>,
  ): Promise<string | null> {
    const result = await navigationPromise;
    if (result !== null) {
      recordVisit(result);
      followTree?.(result);
    }
    return result;
  };
}

// --- §3.2.7: initial path -------------------------------------------------

export interface InitialDirectoryDeps {
  // visitHistory[0] after hydrate, if any.
  lastVisited: string | undefined;
  // Loads a directory through afterUserNavigation (R-208 #6).
  load: (path: string) => Promise<string | null>;
  homeDir: () => Promise<string>;
}

// visitHistory[0] -> home directory -> undetermined (null).
export async function loadInitialDirectory(deps: InitialDirectoryDeps): Promise<string | null> {
  if (deps.lastVisited !== undefined && deps.lastVisited !== "") {
    const loaded = await deps.load(deps.lastVisited);
    if (loaded !== null) return loaded;
  }
  try {
    const home = await deps.homeDir();
    return await deps.load(home);
  } catch {
    return null;
  }
}

// --- §3.2.9-1: overlay list / search bar exclusion + focus control ---------

export interface OverlayControllerDeps {
  search: { cancel(): void; open(): void };
  history: {
    readonly isOpen: boolean;
    close(): void;
    openHistory(): void;
    openJump(): void;
    moveSelection(direction: "up" | "down" | "pageUp" | "pageDown" | "home" | "end"): void;
    switchMode(next: "history" | "jump"): void;
    removeSelected(): void;
    selectedPath(): string | null;
  };
  focus: {
    container(): void;
    historyList(): void;
    searchInput(): void;
  };
  nextTick: () => Promise<void>;
  // afterUserNavigation(fileListState.loadDirectory(path)), fire-and-forget.
  navigate: (path: string) => void;
  // SPEC-0200-0001 §3.6.11.1 (MUST-84, last bullet): OPTIONAL -- opening the
  // search bar or the jump/history list closes an already-open sort menu
  // (one-way; the sort menu never closes the search bar itself).
  sortMenu?: { readonly isOpen: boolean; close(): void };
}

export function createOverlayController(deps: OverlayControllerDeps) {
  function closeOverlayList(): void {
    deps.history.close();
    deps.focus.container();
  }

  function closeSortMenuIfOpen(): void {
    if (deps.sortMenu?.isOpen) deps.sortMenu.close();
  }

  function activateSearch(): void {
    // Mutual exclusion (§3.2.9). searchInput focus (after tick) supersedes
    // any interim focus, so no refocus is needed here.
    deps.history.close();
    closeSortMenuIfOpen();
    deps.search.open();
    void deps.nextTick().then(() => deps.focus.searchInput());
  }

  function openHistoryList(mode: "history" | "jump"): void {
    deps.search.cancel();
    closeSortMenuIfOpen();
    if (mode === "history") deps.history.openHistory();
    else deps.history.openJump();
    if (deps.history.isOpen) {
      void deps.nextTick().then(() => deps.focus.historyList());
    } else {
      // R-218 (MUST-56): stayed closed; explicitly restore focus.
      deps.focus.container();
    }
  }

  // §3.2.8/§3.2.9-1: dispatch a resolved ListKeyIntent. Returns whether the
  // key was consumed.
  function handleIntent(intent: ListKeyIntent | null): boolean {
    switch (intent) {
      case "move_up":
        deps.history.moveSelection("up");
        return true;
      case "move_down":
        deps.history.moveSelection("down");
        return true;
      case "page_up":
        deps.history.moveSelection("pageUp");
        return true;
      case "page_down":
        deps.history.moveSelection("pageDown");
        return true;
      case "home":
        deps.history.moveSelection("home");
        return true;
      case "end":
        deps.history.moveSelection("end");
        return true;
      case "switch_history":
        deps.history.switchMode("history");
        return true;
      case "switch_jump":
        deps.history.switchMode("jump");
        return true;
      case "confirm": {
        const path = deps.history.selectedPath();
        deps.history.close(); // R-235: close before moving
        deps.focus.container(); // R-225
        if (path !== null) deps.navigate(path); // R-234
        return true;
      }
      case "delete":
        deps.history.removeSelected();
        if (!deps.history.isOpen) deps.focus.container(); // R-224 #3
        return true;
      case "cancel":
        closeOverlayList(); // R-224 #1
        return true;
      case "trap":
        return true; // SHOULD-71
      default:
        return false;
    }
  }

  return { closeOverlayList, activateSearch, openHistoryList, handleIntent };
}

// --- §3.2.6: window close handling ----------------------------------------

export interface CloseRequestHandlerDeps {
  flush: () => Promise<void>;
  timeoutMs?: number;
}

// Returns the onCloseRequested handler: flush with a timeout (SHOULD-60(b)),
// re-entrancy guard (SHOULD-60(c)), and always lets the close proceed
// (no preventDefault).
export function createCloseRequestHandler(deps: CloseRequestHandlerDeps) {
  const timeoutMs = deps.timeoutMs ?? 3000;
  let closeInProgress = false;
  return async function onCloseRequested(): Promise<void> {
    if (closeInProgress) return;
    closeInProgress = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        deps.flush(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } catch {
      // best-effort: the window must still close even if the save failed.
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
