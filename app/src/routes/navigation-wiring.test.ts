import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0200-0001 §3.2.4 (afterUserNavigation), §3.2.6 (close handler),
//   §3.2.7 (initial path), §3.2.9-1 (MUST-56 / SHOULD-66 overlay invariants).
// DOM-independent parts of routes/+page.svelte, exercised with injected fakes.

import { createNavigationHistoryState } from "$lib/features/navigation-history/navigation-history-state.svelte";
import { createSearchState } from "$lib/features/search/search-state.svelte";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import {
  createAfterUserNavigation,
  createCloseRequestHandler,
  createOverlayController,
  loadInitialDirectory,
} from "./navigation-wiring";

afterEach(() => {
  statusMessage.clear();
  vi.useRealTimers();
});

// REVISED 2026-10-01 (unit-test-writer, Phase 8): createAfterUserNavigation
// now takes ONE options object and a NavigateResult (SPEC-0200-0001 §3.7.10.9
// SHOULD-132/133, §3.7.2: notifyFailure = R-238/R-730); loadInitialDirectory
// takes NavigateResult-returning deps plus currentSequence/
// loadIfNoNewerRequest (§3.7.10.1 MUST-96, §3.7.10.11 MUST-105). The old
// positional/`string|null` tests were replaced, not kept (contract changed).
describe("afterUserNavigation (R-210/R-211, R-238, R-726)", () => {
  function make() {
    const recordVisit = vi.fn();
    const notifyFailure = vi.fn();
    const followTree = vi.fn();
    const after = createAfterUserNavigation({ recordVisit, notifyFailure, followTree });
    return { recordVisit, notifyFailure, followTree, after };
  }

  it("success: records, follows the tree, returns the result as-is", async () => {
    const { recordVisit, followTree, notifyFailure, after } = make();
    const r = { status: "success", path: "C:\a" } as const;
    expect(await after(Promise.resolve(r))).toEqual(r);
    expect(recordVisit).toHaveBeenCalledWith("C:\a");
    expect(followTree).toHaveBeenCalledWith("C:\a");
    expect(notifyFailure).not.toHaveBeenCalled();
  });

  it("failed: notifies the message (R-238/R-730), no record/follow", async () => {
    const { recordVisit, followTree, notifyFailure, after } = make();
    await after(Promise.resolve({ status: "failed", code: "not_found", message: "nf" }));
    expect(notifyFailure).toHaveBeenCalledWith("nf");
    expect(recordVisit).not.toHaveBeenCalled();
    expect(followTree).not.toHaveBeenCalled();
  });

  it("stale (R-726) and noop: nothing happens, no notification", async () => {
    const { recordVisit, followTree, notifyFailure, after } = make();
    await after(Promise.resolve({ status: "stale" }));
    await after(Promise.resolve({ status: "noop" }));
    expect(recordVisit).not.toHaveBeenCalled();
    expect(followTree).not.toHaveBeenCalled();
    expect(notifyFailure).not.toHaveBeenCalled();
  });

  it("followTree is optional", async () => {
    const recordVisit = vi.fn();
    const after = createAfterUserNavigation({ recordVisit, notifyFailure: vi.fn() });
    await expect(after(Promise.resolve({ status: "success", path: "C:\a" }))).resolves.toBeDefined();
    expect(recordVisit).toHaveBeenCalled();
  });
});

describe("loadInitialDirectory (§3.7.2, MUST-96, MUST-105)", () => {
  type R = { status: "success"; path: string } | { status: "stale" } | { status: "failed"; code: string; message: string };
  const ok = (path: string): R => ({ status: "success", path });
  const failed: R = { status: "failed", code: "not_found", message: "x" };
  function deps(over: Record<string, unknown> = {}) {
    return {
      lastVisited: undefined as string | undefined,
      load: vi.fn(async (p: string): Promise<R> => ok(p)),
      currentSequence: vi.fn(() => 1),
      loadIfNoNewerRequest: vi.fn(async (p: string, _s: number): Promise<R> => ok(p)),
      homeDir: vi.fn(async () => "H"),
      ...over,
    };
  }

  it("lastVisited success: no home lookup", async () => {
    const d = deps({ lastVisited: "C:\last" });
    expect(await loadInitialDirectory(d as never)).toEqual(ok("C:\last"));
    expect(d.homeDir).not.toHaveBeenCalled();
  });

  it("MUST-96: lastVisited stale -> returns stale, NO fallback to home", async () => {
    const d = deps({ lastVisited: "C:\last", load: vi.fn(async () => ({ status: "stale" })) });
    expect(await loadInitialDirectory(d as never)).toEqual({ status: "stale" });
    expect(d.homeDir).not.toHaveBeenCalled();
    expect(d.loadIfNoNewerRequest).not.toHaveBeenCalled();
  });

  it("lastVisited failed -> home via loadIfNoNewerRequest with the sequence recorded BEFORE homeDir()", async () => {
    let seq = 5;
    const d = deps({
      lastVisited: "C:\gone",
      load: vi.fn(async () => failed),
      currentSequence: vi.fn(() => seq),
      homeDir: vi.fn(async () => {
        seq = 6; // user navigates while waiting
        return "H";
      }),
    });
    await loadInitialDirectory(d as never);
    expect(d.loadIfNoNewerRequest).toHaveBeenCalledWith("H", 5);
  });

  it("MUST-105: no lastVisited also goes through loadIfNoNewerRequest (not plain load)", async () => {
    const d = deps();
    expect(await loadInitialDirectory(d as never)).toEqual(ok("H"));
    expect(d.load).not.toHaveBeenCalled();
    expect(d.loadIfNoNewerRequest).toHaveBeenCalledWith("H", 1);
  });

  it("MUST-105: if the home load comes back stale, that is returned as-is", async () => {
    const d = deps({ loadIfNoNewerRequest: vi.fn(async () => ({ status: "stale" })) });
    expect(await loadInitialDirectory(d as never)).toEqual({ status: "stale" });
  });

  it("homeDir failure -> failed result (no throw)", async () => {
    const d = deps({ homeDir: vi.fn(async () => { throw new Error("no tauri"); }) });
    expect((await loadInitialDirectory(d as never)).status).toBe("failed");
  });
});

describe("closeSearchForPathBar (R-710-5, SPEC-0200-0001 §3.7.6)", () => {
  it("cancels the search (R-108 reset) WITHOUT moving focus to the file list", () => {
    const { search, focus, controller } = makeOverlay([], []);
    search.open();
    (controller as unknown as { closeSearchForPathBar: () => void }).closeSearchForPathBar();
    expect(search.active).toBe(false);
    expect(focus.container).not.toHaveBeenCalled();
  });
});

function makeOverlay(visits: string[], jumps: string[]) {
  const search = createSearchState();
  const history = createNavigationHistoryState();
  history.hydrate(visits, jumps);
  const focus = { container: vi.fn(), historyList: vi.fn(), searchInput: vi.fn() };
  const navigate = vi.fn();
  const controller = createOverlayController({
    search,
    history,
    focus,
    nextTick: () => Promise.resolve(),
    navigate,
  });
  return { search, history, focus, navigate, controller };
}

describe("openHistoryList (§3.2.9-1, MUST-56)", () => {
  it("MUST-56: with the search bar open and an empty list, the bar closes, the list stays closed and focus returns to the file list", () => {
    const { search, history, focus, controller } = makeOverlay([], []);
    search.open();

    controller.openHistoryList("history");

    expect(search.active).toBe(false);
    expect(history.isOpen).toBe(false);
    expect(focus.container).toHaveBeenCalled();
    expect(focus.historyList).not.toHaveBeenCalled();
    expect(statusMessage.text).not.toBeNull();
  });

  it("with items: opens the list and focuses the listbox after a tick, not the file list", async () => {
    const { history, focus, controller } = makeOverlay(["C:\\a"], []);
    controller.openHistoryList("history");
    await Promise.resolve();
    await Promise.resolve();
    expect(history.isOpen).toBe(true);
    expect(focus.historyList).toHaveBeenCalled();
    expect(focus.container).not.toHaveBeenCalled();
  });
});

describe("search bar / list exclusion invariant (SHOULD-66)", () => {
  it("activateSearch closes an open list before opening the search bar", async () => {
    const { search, history, focus, controller } = makeOverlay(["C:\\a"], []);
    controller.openHistoryList("history");
    expect(history.isOpen).toBe(true);

    controller.activateSearch();
    await Promise.resolve();
    await Promise.resolve();

    expect(history.isOpen).toBe(false);
    expect(search.active).toBe(true);
    expect(focus.searchInput).toHaveBeenCalled();
  });

  it("openHistoryList closes an open search bar; the two are never open together", () => {
    const { search, history, controller } = makeOverlay(["C:\\a"], []);
    controller.activateSearch();
    expect(search.active && history.isOpen).toBe(false);

    controller.openHistoryList("history");
    expect(search.active).toBe(false);
    expect(history.isOpen).toBe(true);
  });
});

describe("handleIntent (§3.2.9-1)", () => {
  it("confirm: closes, refocuses the file list, then navigates to the selected path", () => {
    const { history, focus, navigate, controller } = makeOverlay(["C:\\b", "C:\\a"], []);
    controller.openHistoryList("history");
    controller.handleIntent("move_down");

    expect(controller.handleIntent("confirm")).toBe(true);

    expect(history.isOpen).toBe(false);
    expect(focus.container).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("C:\\a");
  });

  it("delete of the last item closes the list and refocuses the file list", () => {
    const { history, focus, controller } = makeOverlay(["C:\\only"], []);
    controller.openHistoryList("history");
    controller.handleIntent("delete");
    expect(history.isOpen).toBe(false);
    expect(focus.container).toHaveBeenCalled();
  });

  it("cancel closes and refocuses; trap is consumed; null is not consumed", () => {
    const { history, focus, controller } = makeOverlay(["C:\\a"], []);
    controller.openHistoryList("history");
    expect(controller.handleIntent("trap")).toBe(true);
    expect(history.isOpen).toBe(true);
    expect(controller.handleIntent(null)).toBe(false);
    expect(controller.handleIntent("cancel")).toBe(true);
    expect(history.isOpen).toBe(false);
    expect(focus.container).toHaveBeenCalled();
  });

  it("switch_jump to an empty list keeps the current mode", () => {
    const { history, controller } = makeOverlay(["C:\\a"], []);
    controller.openHistoryList("history");
    controller.handleIntent("switch_jump");
    expect(history.mode).toBe("history");
    expect(history.isOpen).toBe(true);
  });
});

describe("createCloseRequestHandler (§3.2.6)", () => {
  it("awaits the flush", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    await createCloseRequestHandler({ flush })();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not hang past the timeout when flush never resolves", async () => {
    vi.useFakeTimers();
    const handler = createCloseRequestHandler({ flush: () => new Promise<void>(() => {}), timeoutMs: 3000 });
    const done = vi.fn();
    void handler().then(done);
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it("swallows flush failures so the window can still close", async () => {
    const handler = createCloseRequestHandler({ flush: () => Promise.reject(new Error("x")) });
    await expect(handler()).resolves.toBeUndefined();
  });

  it("re-entrant calls do not flush twice", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const handler = createCloseRequestHandler({ flush });
    await handler();
    await handler();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// Phase 7 (SPEC-0200-0001 §3.6.11.1 MUST-84, last bullet): opening the
// search bar or the jump/history list closes an already-open sort menu (the
// mirror image of syncSortMenuWithModal in overlay-wiring.ts, which closes
// the sort menu when a MODAL opens). The sort menu never closes the search
// bar itself (that direction is intentionally one-way, MUST-84).
//
// `sortMenu` is a NEW, OPTIONAL dependency on `OverlayControllerDeps` (like
// `onTabStop` on `DispatchContext`), so every existing `makeOverlay()` call
// site above -- which never passes it -- keeps working unmodified.
// ---------------------------------------------------------------------

function makeOverlayWithSortMenu(visits: string[] = [], jumps: string[] = []) {
  const search = createSearchState();
  const history = createNavigationHistoryState();
  history.hydrate(visits, jumps);
  const focus = { container: vi.fn(), historyList: vi.fn(), searchInput: vi.fn() };
  const navigate = vi.fn();
  const sortMenu = { isOpen: true, close: vi.fn() };
  const controller = createOverlayController({
    search,
    history,
    focus,
    nextTick: () => Promise.resolve(),
    navigate,
    sortMenu,
  } as never);
  return { search, history, focus, navigate, sortMenu, controller };
}

describe("activateSearch/openHistoryList close an open sort menu (SPEC-0200-0001 §3.6.11.1 MUST-84)", () => {
  it("activateSearch closes an open sort menu", async () => {
    const { sortMenu, controller } = makeOverlayWithSortMenu();
    controller.activateSearch();
    expect(sortMenu.close).toHaveBeenCalledTimes(1);
  });

  it("openHistoryList closes an open sort menu", () => {
    const { sortMenu, controller } = makeOverlayWithSortMenu();
    controller.openHistoryList("history");
    expect(sortMenu.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the sort menu is already closed", () => {
    const search = createSearchState();
    const history = createNavigationHistoryState();
    const focus = { container: vi.fn(), historyList: vi.fn(), searchInput: vi.fn() };
    const sortMenu = { isOpen: false, close: vi.fn() };
    const controller = createOverlayController({
      search,
      history,
      focus,
      nextTick: () => Promise.resolve(),
      navigate: vi.fn(),
      sortMenu,
    } as never);
    controller.activateSearch();
    expect(sortMenu.close).not.toHaveBeenCalled();
  });

  it("backward compatible: omitting sortMenu entirely does not throw", () => {
    const { controller } = makeOverlay([], []);
    expect(() => controller.activateSearch()).not.toThrow();
  });
});
