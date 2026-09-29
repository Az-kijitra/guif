import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0013 R-243/R-244/R-245; SPEC-0300-0009 R-77-2/R-77-2-1/
//   R-77-5.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.6 (MUST-
//   47/48/55, the original navigation-only implementation),
//   §3.6.11.11 SHOULD-118/130: this NEW, domain-agnostic factory extracts
//   the "participants + debounce + dirty flag + flush" pattern out of
//   `shared/state/navigation-persistence.svelte.ts` so a second instance
//   (Phase 7's `ui-state.toml` coordinator, `features/file-list/`) does not
//   duplicate the same subtle concurrency contract (MUST-55's "keep looping
//   while dirty OR in flight").
//
// SHOULD-130 conditions this file pins:
//   (1) load/save/onSaveError are injected -- this module imports NEITHER
//       `shared/ipc/config.ts` NOR `shared/state/status-message.svelte.ts`
//       directly (the mock below would be pointless/misleading otherwise:
//       there is nothing to mock, by design).
//   (2) plain `.ts`, no Svelte runes (importable and testable with zero
//       Svelte/DOM environment).
//   (3) (checked in navigation-persistence.test.ts instead, not here):
//       `createNavigationPersistenceCoordinator`/`navigationPersistence`'s
//       own public API names are preserved after code-generator rewires them
//       on top of this factory.
//
// Module under test (not yet implemented): ./persistence-coordinator.ts
//
// Contract assumed (documented in the handback report):
//   createPersistenceCoordinator<T>(deps: {
//     load: () => Promise<{ data: T; notice: string | null }>;
//     save: (data: T) => Promise<void>;
//     onSaveError?: (e: unknown) => void;
//     debounceMs?: number; // default 400 (R-243)
//   }) -> {
//     register(p: { getSnapshot(): Partial<T>; hydrate(data: T): void }): void;
//     requestSave(): void;
//     flush(): Promise<void>;
//     hydrateAll(): Promise<string | null>; // MUST-88's Promise<string|null> contract
//     readonly hydrated: boolean;
//   }
// A load() REJECTION (not just a load() that itself reports a recoverable
// notice) is caught internally: hydrated stays false, and hydrateAll()
// resolves to some non-null string (the exact wording is left to
// code-generator, SHOULD-119) rather than throwing.

import { createPersistenceCoordinator } from "./persistence-coordinator";

interface Data {
  a: string[];
  b: string[];
}

function emptyData(): Data {
  return { a: [], b: [] };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("before hydrateAll() resolves: requestSave()/flush() are defensive no-ops", () => {
  it("requestSave() then advancing time never calls save()", async () => {
    const save = vi.fn();
    const coordinator = createPersistenceCoordinator<Data>({ load: () => new Promise(() => {}), save });
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it("hydrated starts false", () => {
    const coordinator = createPersistenceCoordinator<Data>({ load: () => new Promise(() => {}), save: vi.fn() });
    expect(coordinator.hydrated).toBe(false);
  });
});

describe("hydrateAll() -- success", () => {
  it("distributes the loaded data to every registered participant and flips hydrated to true, resolving to null when there is no notice", async () => {
    const loaded: Data = { a: ["x"], b: ["y"] };
    const load = vi.fn().mockResolvedValue({ data: loaded, notice: null });
    const coordinator = createPersistenceCoordinator<Data>({ load, save: vi.fn() });
    const hydratedCalls: Data[] = [];
    coordinator.register({ getSnapshot: () => ({}), hydrate: (d) => hydratedCalls.push(d) });

    const notice = await coordinator.hydrateAll();

    expect(coordinator.hydrated).toBe(true);
    expect(hydratedCalls).toEqual([loaded]);
    expect(notice).toBeNull();
  });

  it("resolves to the notice text load() itself reported (e.g. a corruption recovery) without calling onSaveError", async () => {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: "recovered from corruption" });
    const onSaveError = vi.fn();
    const coordinator = createPersistenceCoordinator<Data>({ load, save: vi.fn(), onSaveError });

    const notice = await coordinator.hydrateAll();

    expect(coordinator.hydrated).toBe(true); // a recovered load still counts as successful
    expect(notice).toBe("recovered from corruption");
    expect(onSaveError).not.toHaveBeenCalled();
  });
});

describe("hydrateAll() -- the load() promise itself rejects (MUST-48(b) analog)", () => {
  it("resolves to a non-null notice string (never throws, never undefined) and leaves hydrated false", async () => {
    const load = vi.fn().mockRejectedValue(new Error("io error"));
    const coordinator = createPersistenceCoordinator<Data>({ load, save: vi.fn() });

    const notice = await coordinator.hydrateAll();

    expect(coordinator.hydrated).toBe(false);
    expect(typeof notice).toBe("string");
    expect((notice as string).length).toBeGreaterThan(0);
  });

  it("keeps requestSave()/flush() disabled for the rest of the session", async () => {
    const load = vi.fn().mockRejectedValue(new Error("io error"));
    const save = vi.fn();
    const coordinator = createPersistenceCoordinator<Data>({ load, save });
    await coordinator.hydrateAll();

    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(1000);
    await coordinator.flush();

    expect(save).not.toHaveBeenCalled();
  });
});

describe("requestSave() debouncing (R-243, default 400ms)", () => {
  async function hydratedCoordinator(save = vi.fn().mockResolvedValue(undefined)) {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: null });
    const coordinator = createPersistenceCoordinator<Data>({ load, save });
    await coordinator.hydrateAll();
    return { coordinator, save };
  }

  it("does not save immediately -- waits ~400ms after the request", async () => {
    const { coordinator, save } = await hydratedCoordinator();
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(399);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("a custom debounceMs is honored", async () => {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: null });
    const save = vi.fn().mockResolvedValue(undefined);
    const coordinator = createPersistenceCoordinator<Data>({ load, save, debounceMs: 100 });
    await coordinator.hydrateAll();
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves the merged snapshot of every registered participant", async () => {
    const { coordinator, save } = await hydratedCoordinator();
    coordinator.register({ getSnapshot: () => ({ a: ["p1"] }), hydrate: () => {} });
    coordinator.register({ getSnapshot: () => ({ b: ["p2"] }), hydrate: () => {} });

    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ a: ["p1"], b: ["p2"] }));
  });
});

describe("flush() (SHOULD-130 condition 3 precedent: allSettled-safe termination flush)", () => {
  it("saves immediately without waiting for the debounce timer, and cancels the pending timer", async () => {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: null });
    const save = vi.fn().mockResolvedValue(undefined);
    const coordinator = createPersistenceCoordinator<Data>({ load, save });
    await coordinator.hydrateAll();
    coordinator.requestSave();

    await coordinator.flush();
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1); // no redundant second save
  });

  it("with nothing pending, flush() is a no-op", async () => {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: null });
    const save = vi.fn();
    const coordinator = createPersistenceCoordinator<Data>({ load, save });
    await coordinator.hydrateAll();
    await coordinator.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("a change arriving while a save is in flight is not lost -- flush() saves again with the latest snapshot", async () => {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: null });
    const save = vi.fn();
    const coordinator = createPersistenceCoordinator<Data>({ load, save });
    await coordinator.hydrateAll();
    let slice: Partial<Data> = { a: ["v1"] };
    coordinator.register({ getSnapshot: () => slice, hydrate: () => {} });

    const firstSave = deferred<void>();
    save.mockReturnValueOnce(firstSave.promise);
    save.mockResolvedValue(undefined);

    coordinator.requestSave();
    const flushPromise = coordinator.flush();

    slice = { a: ["v1", "v2"] };
    coordinator.requestSave();

    firstSave.resolve();
    await flushPromise;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ a: ["v1", "v2"] }));
  });

  it("a save failure invokes onSaveError and keeps the change pending (dirty stays true)", async () => {
    const load = vi.fn().mockResolvedValue({ data: emptyData(), notice: null });
    const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const onSaveError = vi.fn();
    const coordinator = createPersistenceCoordinator<Data>({ load, save, onSaveError });
    await coordinator.hydrateAll();

    coordinator.requestSave();
    await coordinator.flush();

    expect(onSaveError).toHaveBeenCalledTimes(1);

    // R-77-5: operation continues -- a later flush can still succeed.
    coordinator.requestSave();
    await coordinator.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("register(): an unregistered slice falls back to the hydrated baseline, not an empty value", () => {
  it("a slice with no registered participant is preserved from the load baseline", async () => {
    const loaded: Data = { a: ["from-disk"], b: ["also-from-disk"] };
    const load = vi.fn().mockResolvedValue({ data: loaded, notice: null });
    const save = vi.fn().mockResolvedValue(undefined);
    const coordinator = createPersistenceCoordinator<Data>({ load, save });
    await coordinator.hydrateAll();

    coordinator.register({ getSnapshot: () => ({ a: ["new"] }), hydrate: () => {} });
    coordinator.requestSave();
    await vi.advanceTimersByTimeAsync(400);

    expect(save).toHaveBeenCalledWith({ a: ["new"], b: ["also-from-disk"] });
  });
});
