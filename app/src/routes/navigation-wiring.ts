// Composition helpers extracted from routes/+page.svelte so that the
// DOM-independent parts of the Phase 4 wiring are unit-testable
// (SPEC-0200-0001 §3.2.4, §3.2.6, §3.2.7, §3.2.9-1). Every dependency is
// injected; this module imports no feature module (routes wires the real
// ones in +page.svelte).

import type { ListKeyIntent } from "$lib/features/navigation-history/list-ops";
import type { NavigateResult } from "$lib/shared/navigation-result";

// --- §3.2.4: afterUserNavigation ------------------------------------------

// The single call-through point for every R-208 user-initiated move
// (SPEC-0200-0001 §3.7.2/§3.7.10.9 SHOULD-132). On a successful result it
// records the visit (R-210/R-211) and lets the tree follow (R-45's reverse
// direction); on a failed result it reports the message (R-238/R-730, never
// the permanent error banner); stale (R-726) and noop results do nothing.
// The result is returned as-is so callers can make follow-up decisions.
// Reload-type callers (F5 / toggle_hidden / file watching, R-209) must NOT go
// through this.
//
// `followTree` is OPTIONAL (SPEC-0200-0001 §3.6.11.4 (f)); the guard for a
// hidden tree lives inside tree-state itself (MUST-102(d)).
export interface AfterUserNavigationDeps {
  recordVisit: (path: string) => void;
  notifyFailure: (message: string) => void;
  followTree?: (path: string) => void;
}

export function createAfterUserNavigation(deps: AfterUserNavigationDeps) {
  return async function afterUserNavigation(
    navigationPromise: Promise<NavigateResult>,
  ): Promise<NavigateResult> {
    const result = await navigationPromise;
    if (result.status === "success") {
      deps.recordVisit(result.path);
      deps.followTree?.(result.path);
    } else if (result.status === "failed") {
      deps.notifyFailure(result.message);
    }
    return result;
  };
}

// --- §3.2.7: initial path -------------------------------------------------

export interface InitialDirectoryDeps {
  // visitHistory[0] after hydrate, if any.
  lastVisited: string | undefined;
  // Loads a directory through afterUserNavigation (R-208 #6).
  load: (path: string) => Promise<NavigateResult>;
  // MUST-105: the request generation, and a load that only proceeds when no
  // newer request has been issued since (closes the homeDir() IPC gap).
  currentSequence: () => number;
  loadIfNoNewerRequest: (path: string, sinceSeq: number) => Promise<NavigateResult>;
  homeDir: () => Promise<string>;
}

async function fallbackToHome(deps: InitialDirectoryDeps): Promise<NavigateResult> {
  const sinceSeq = deps.currentSequence(); // recorded BEFORE the homeDir() IPC wait
  let home: string;
  try {
    home = await deps.homeDir();
  } catch {
    return { status: "failed", code: "other", message: "" };
  }
  return deps.loadIfNoNewerRequest(home, sinceSeq);
}

// visitHistory[0] -> home directory -> failed. "stale" (the user already moved
// on, R-726) never falls back to home (MUST-96).
export async function loadInitialDirectory(deps: InitialDirectoryDeps): Promise<NavigateResult> {
  if (deps.lastVisited !== undefined && deps.lastVisited !== "") {
    const result = await deps.load(deps.lastVisited);
    if (result.status !== "failed") return result;
  }
  return fallbackToHome(deps);
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
  // afterUserNavigation(fileListState.navigate(path)), fire-and-forget.
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

  // R-710-5 (SPEC-0200-0001 §3.7.6): focus_path closes an open search bar the
  // way R-108 does, but does NOT move focus to the file list (the caller
  // focuses the path bar right after).
  function closeSearchForPathBar(): void {
    deps.search.cancel();
  }

  return { closeOverlayList, activateSearch, openHistoryList, handleIntent, closeSearchForPathBar };
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
