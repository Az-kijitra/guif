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

describe("afterUserNavigation (R-210/R-211)", () => {
  it("records the visit and returns the path on success", async () => {
    const record = vi.fn();
    const after = createAfterUserNavigation(record);
    expect(await after(Promise.resolve("C:\\a"))).toBe("C:\\a");
    expect(record).toHaveBeenCalledWith("C:\\a");
  });

  it("does not record when the navigation failed or was outrun (null)", async () => {
    const record = vi.fn();
    const after = createAfterUserNavigation(record);
    expect(await after(Promise.resolve(null))).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
});

describe("loadInitialDirectory (§3.2.7)", () => {
  it("loads visitHistory[0] when it succeeds, without touching the home dir", async () => {
    const homeDir = vi.fn();
    const load = vi.fn().mockResolvedValue("C:\\last");
    expect(await loadInitialDirectory({ lastVisited: "C:\\last", load, homeDir })).toBe("C:\\last");
    expect(homeDir).not.toHaveBeenCalled();
  });

  it("falls back to the home dir when there is no history", async () => {
    const load = vi.fn().mockResolvedValue("C:\\Users\\me");
    const result = await loadInitialDirectory({
      lastVisited: undefined,
      load,
      homeDir: async () => "C:\\Users\\me",
    });
    expect(result).toBe("C:\\Users\\me");
    expect(load).toHaveBeenCalledWith("C:\\Users\\me");
  });

  it("falls back to the home dir when the last-visited load fails", async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("H");
    const result = await loadInitialDirectory({ lastVisited: "C:\\gone", load, homeDir: async () => "H" });
    expect(result).toBe("H");
  });

  it("stays undetermined (null) when the home dir cannot be resolved", async () => {
    const load = vi.fn().mockResolvedValue(null);
    const result = await loadInitialDirectory({
      lastVisited: undefined,
      load,
      homeDir: async () => {
        throw new Error("no tauri");
      },
    });
    expect(result).toBeNull();
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
