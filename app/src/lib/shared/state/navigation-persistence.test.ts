import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0013 R-243 (debounced save-on-change), R-244 (save
//   completes before exit — ISS-0078), R-242 item 3 (corruption notice),
//   R-245/R-245-1 (unconditional adoption of load results)
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.6
//   (MUST-47: sole owner of the debounce timer / hydrated flag / save-dirty
//   flag / IPC calls, moved out of routes/+page.svelte; MUST-48(b): never
//   save before a successful load; MUST-55: `flush()`'s `dirty`-flag while
//   loop, so a change arriving during an in-flight save is not lost;
//   SHOULD-70: `snapshot()` falls back to `baseline`, not `[]`, for an
//   unregistered participant's slice)
//
// Module under test (not yet implemented): ./navigation-persistence.svelte.ts
//
// This is a shared/state/ owner module (§5.2, registered in
// docs/architecture/traceability.md). features/navigation-history/ and
// features/search/ each register themselves as a "participant"
// ({getSnapshot, hydrate}) at module-init time (inversion-of-control, same
// pattern as §4.1 route 1's command registry) — this file tests the
// coordinator's own factory (`createNavigationPersistenceCoordinator`) in
// isolation using hand-written stub participants, never importing
// features/navigation-history/ or features/search/ (shared/ must not depend
// on features/, §4.1).
//
// $lib/shared/ipc/config is mocked so these tests never perform a real Tauri
// invoke() call (SPEC-0400-0001 §3). $lib/shared/state/status-message.svelte
// is used un-mocked (it is itself a dependency-free shared/state/ module, and
// navigation-persistence.svelte.ts imports the real singleton directly per
// the architecture doc's own design) — its `clear()` is called in afterEach
// to avoid cross-test leakage of the auto-dismiss timer.

vi.mock("$lib/shared/ipc/config", () => ({
  configLoadNavigation: vi.fn(),
  configSaveNavigation: vi.fn(),
}));

import { configLoadNavigation, configSaveNavigation, type NavigationData } from "$lib/shared/ipc/config";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import {
  createNavigationPersistenceCoordinator,
  type NavigationPersistenceParticipant,
} from "./navigation-persistence.svelte";

function emptyData(): NavigationData {
  return { visitHistory: [], jumpList: [], searchHistory: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stubParticipant(
  initialSlice: Partial<NavigationData>,
): NavigationPersistenceParticipant & { setSlice(next: Partial<NavigationData>): void; hydrated: NavigationData[] } {
  let slice = initialSlice;
  const hydrated: NavigationData[] = [];
  return {
    getSnapshot: () => slice,
    hydrate: (data: NavigationData) => hydrated.push(data),
    setSlice(next: Partial<NavigationData>) {
      slice = next;
    },
    hydrated,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.mocked(configLoadNavigation).mockReset();
  vi.mocked(configSaveNavigation).mockReset();
  statusMessage.clear();
  vi.useRealTimers();
});

describe("before hydrateAll() resolves: requestSave()/flush() are defensive no-ops (MUST-48(b))", () => {
  it("requestSave() followed by advancing time never calls configSaveNavigation", async () => {
    const coordinator = createNavigationPersistenceCoordinator();
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(1000);
    expect(configSaveNavigation).not.toHaveBeenCalled();
  });

  it("flush() called directly is a no-op", async () => {
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.flush();
    expect(configSaveNavigation).not.toHaveBeenCalled();
  });

  it("hydrated starts false", () => {
    const coordinator = createNavigationPersistenceCoordinator();
    expect(coordinator.hydrated).toBe(false);
  });
});

describe("hydrateAll() — success path (R-245)", () => {
  it("calls configLoadNavigation, distributes the loaded data to every registered participant, and flips hydrated to true", async () => {
    const loaded: NavigationData = { visitHistory: ["C:\\a"], jumpList: ["C:\\j"], searchHistory: ["q"] };
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: loaded, recoveredFromCorruption: false });
    const coordinator = createNavigationPersistenceCoordinator();
    const participant = stubParticipant({});
    coordinator.register(participant);

    await coordinator.hydrateAll();

    expect(coordinator.hydrated).toBe(true);
    expect(participant.hydrated).toEqual([loaded]);
  });

  it("does not post a status message when the load succeeded without corruption", async () => {
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: emptyData(), recoveredFromCorruption: false });
    const coordinator = createNavigationPersistenceCoordinator();

    await coordinator.hydrateAll();

    expect(statusMessage.text).toBeNull();
  });

  it("R-242 item 3: posts a status message when the load result reports a corruption recovery", async () => {
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: emptyData(), recoveredFromCorruption: true });
    const coordinator = createNavigationPersistenceCoordinator();

    await coordinator.hydrateAll();

    expect(coordinator.hydrated).toBe(true); // recovery still counts as a successful load
    expect(statusMessage.text).not.toBeNull();
  });
});

describe("hydrateAll() — the load itself fails (MUST-48(b): I/O error, or the .bak rename failed)", () => {
  it("leaves hydrated false and posts a status message, without throwing", async () => {
    vi.mocked(configLoadNavigation).mockRejectedValueOnce(new Error("io error"));
    const coordinator = createNavigationPersistenceCoordinator();

    await expect(coordinator.hydrateAll()).resolves.toBeUndefined();

    expect(coordinator.hydrated).toBe(false);
    expect(statusMessage.text).not.toBeNull();
  });

  it("keeps requestSave()/flush() disabled for the rest of the session (never overwrite a file we merely failed to read)", async () => {
    vi.mocked(configLoadNavigation).mockRejectedValueOnce(new Error("io error"));
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.hydrateAll();

    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(1000);
    await coordinator.flush();

    expect(configSaveNavigation).not.toHaveBeenCalled();
  });
});

describe("requestSave() debouncing (R-243)", () => {
  async function hydratedCoordinator(loaded: NavigationData = emptyData()) {
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: loaded, recoveredFromCorruption: false });
    vi.mocked(configSaveNavigation).mockResolvedValue(undefined);
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.hydrateAll();
    return coordinator;
  }

  it("does not save immediately — waits ~400ms after the request", async () => {
    const coordinator = await hydratedCoordinator();
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(399);
    expect(configSaveNavigation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(configSaveNavigation).toHaveBeenCalledTimes(1);
  });

  it("coalesces multiple requestSave() calls within the debounce window into a single save", async () => {
    const coordinator = await hydratedCoordinator();
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(200);
    coordinator.requestSave(); // resets the timer
    await vi.advanceTimersByTimeAsync(200); // 400ms since the 1st call, but only 200ms since the 2nd
    expect(configSaveNavigation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200); // now 400ms since the 2nd call
    expect(configSaveNavigation).toHaveBeenCalledTimes(1);
  });

  it("saves the merged snapshot of every registered participant's current slice", async () => {
    const coordinator = await hydratedCoordinator();
    const visits = stubParticipant({ visitHistory: ["C:\\a"] });
    const jumps = stubParticipant({ jumpList: ["C:\\j"] });
    coordinator.register(visits);
    coordinator.register(jumps);

    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    expect(configSaveNavigation).toHaveBeenCalledWith(
      expect.objectContaining({ visitHistory: ["C:\\a"], jumpList: ["C:\\j"] }),
    );
  });
});

describe("flush() (R-244, ISS-0078 termination flush)", () => {
  async function hydratedCoordinator(loaded: NavigationData = emptyData()) {
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: loaded, recoveredFromCorruption: false });
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.hydrateAll();
    return coordinator;
  }

  it("saves immediately, without waiting for the debounce timer, and cancels the pending timer", async () => {
    const coordinator = await hydratedCoordinator();
    vi.mocked(configSaveNavigation).mockResolvedValueOnce(undefined);
    coordinator.requestSave();

    await coordinator.flush();

    expect(configSaveNavigation).toHaveBeenCalledTimes(1);

    // The debounce timer that requestSave() had armed must have been
    // canceled by flush() — advancing time further must not trigger a
    // second, redundant save.
    await vi.advanceTimersByTimeAsync(1000);
    expect(configSaveNavigation).toHaveBeenCalledTimes(1);
  });

  it("with no pending changes, flush() is a no-op (does not call configSaveNavigation)", async () => {
    const coordinator = await hydratedCoordinator();
    await coordinator.flush();
    expect(configSaveNavigation).not.toHaveBeenCalled();
  });

  it("MUST-55: a change that arrives while a save is still in flight is not lost — flush() saves again with the latest snapshot", async () => {
    const coordinator = await hydratedCoordinator();
    const participant = stubParticipant({ visitHistory: ["v1"] });
    coordinator.register(participant);

    const firstSave = deferred<void>();
    vi.mocked(configSaveNavigation).mockReturnValueOnce(firstSave.promise);
    vi.mocked(configSaveNavigation).mockResolvedValue(undefined); // the 2nd (and any further) call

    coordinator.requestSave(); // dirty = true
    const flushPromise = coordinator.flush(); // enters the while(dirty) loop, calls configSaveNavigation once, then awaits the still-pending firstSave

    // Before the first save resolves, a new change arrives (e.g. the user
    // confirms another jump-add while the debounced save is already in
    // flight) — this is exactly the Ctrl+Q / debounce-timer race MUST-55
    // guards against.
    participant.setSlice({ visitHistory: ["v1", "v2"] });
    coordinator.requestSave(); // dirty = true again

    firstSave.resolve();
    await flushPromise;

    expect(configSaveNavigation).toHaveBeenCalledTimes(2);
    expect(configSaveNavigation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ visitHistory: ["v1", "v2"] }),
    );
  });

  it("code-review M-1: a second flush() (Ctrl+Q) that started while a save was in flight does not return before the follow-up save for a later change has finished", async () => {
    const coordinator = await hydratedCoordinator();
    const participant = stubParticipant({ visitHistory: ["v1"] });
    coordinator.register(participant);

    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    vi.mocked(configSaveNavigation).mockReturnValueOnce(firstSave.promise);
    vi.mocked(configSaveNavigation).mockReturnValueOnce(secondSave.promise);

    coordinator.requestSave();
    const flushA = coordinator.flush(); // debounce-triggered save #1 (in flight)
    participant.setSlice({ visitHistory: ["v1", "v2"] });
    coordinator.requestSave(); // change while #1 is in flight
    let bDone = false;
    const flushB = coordinator.flush().then(() => {
      bDone = true;
    }); // exit-time flush

    firstSave.resolve();
    await vi.advanceTimersByTimeAsync(0);
    // save #2 (the latest change) has started but not finished: neither flush may be done.
    expect(configSaveNavigation).toHaveBeenCalledTimes(2);
    expect(bDone).toBe(false);

    secondSave.resolve();
    await Promise.all([flushA, flushB]);
    expect(bDone).toBe(true);
    expect(configSaveNavigation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ visitHistory: ["v1", "v2"] }),
    );
  });

  it("two overlapping flush() calls with nothing new to save after the first in-flight save resolves only save once", async () => {
    const coordinator = await hydratedCoordinator();
    const inFlight = deferred<void>();
    vi.mocked(configSaveNavigation).mockReturnValueOnce(inFlight.promise);
    vi.mocked(configSaveNavigation).mockResolvedValue(undefined); // safety net if the implementation under test over-saves

    coordinator.requestSave();
    const flushA = coordinator.flush(); // consumes `dirty`, calls save #1, awaits in-flight promise
    const flushB = coordinator.flush(); // sees savePromise already set, awaits the same in-flight promise

    inFlight.resolve();
    await Promise.all([flushA, flushB]);

    expect(configSaveNavigation).toHaveBeenCalledTimes(1);
  });
});

describe("SHOULD-70: snapshot() falls back to the last-known baseline for an unregistered participant's slice", () => {
  it("a slice with no registered participant is preserved from the hydrated baseline, not wiped to an empty array", async () => {
    const loaded: NavigationData = { visitHistory: ["C:\\a"], jumpList: ["C:\\j"], searchHistory: ["q"] };
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: loaded, recoveredFromCorruption: false });
    vi.mocked(configSaveNavigation).mockResolvedValueOnce(undefined);
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.hydrateAll();

    // Only a visitHistory-owning participant registers; nobody claims
    // jumpList/searchHistory in this test (simulating a participant that, by
    // a future refactor, failed to register its module-init side effect).
    const visits = stubParticipant({ visitHistory: ["C:\\a", "C:\\b"] });
    coordinator.register(visits);

    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    expect(configSaveNavigation).toHaveBeenCalledWith({
      visitHistory: ["C:\\a", "C:\\b"],
      jumpList: ["C:\\j"], // preserved from baseline, not []
      searchHistory: ["q"], // preserved from baseline, not []
    });
  });

  it("a second, later save still carries forward a slice that no participant has ever registered for", async () => {
    const loaded: NavigationData = { visitHistory: [], jumpList: ["C:\\j"], searchHistory: [] };
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: loaded, recoveredFromCorruption: false });
    vi.mocked(configSaveNavigation).mockResolvedValue(undefined);
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.hydrateAll();

    const visits = stubParticipant({ visitHistory: ["C:\\a"] });
    coordinator.register(visits);
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    // A second, unrelated participant (covering searchHistory only)
    // registers late and triggers its own save; jumpList — which no
    // participant in this test ever covers — must still be carried forward
    // from the original load baseline on this second save too.
    const search = stubParticipant({ searchHistory: ["q"] });
    coordinator.register(search);
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    expect(configSaveNavigation).toHaveBeenLastCalledWith({
      visitHistory: ["C:\\a"],
      jumpList: ["C:\\j"],
      searchHistory: ["q"],
    });
  });
});

describe("register()", () => {
  it("merges slices from multiple participants into one NavigationData", async () => {
    vi.mocked(configLoadNavigation).mockResolvedValueOnce({ data: emptyData(), recoveredFromCorruption: false });
    vi.mocked(configSaveNavigation).mockResolvedValueOnce(undefined);
    const coordinator = createNavigationPersistenceCoordinator();
    await coordinator.hydrateAll();

    coordinator.register(stubParticipant({ visitHistory: ["v"] }));
    coordinator.register(stubParticipant({ jumpList: ["j"] }));
    coordinator.register(stubParticipant({ searchHistory: ["s"] }));

    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    expect(configSaveNavigation).toHaveBeenCalledWith({
      visitHistory: ["v"],
      jumpList: ["j"],
      searchHistory: ["s"],
    });
  });
});
