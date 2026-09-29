// SPEC-0300-0013 R-243/R-244/R-245; SPEC-0300-0009 R-77-2/R-77-2-1/R-77-5.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.6
//   (MUST-47/48/55, the original navigation-only implementation),
//   §3.6.11.11 SHOULD-118/130.
//
// Domain-agnostic "participants + debounce + dirty flag + flush" factory,
// extracted out of `shared/state/navigation-persistence.svelte.ts` so a
// second instance (Phase 7's `ui-state.toml` coordinator) does not duplicate
// the same subtle concurrency contract (MUST-55's "keep looping while dirty
// OR in flight").
//
// SHOULD-130 conditions: (1) `load`/`save`/`onSaveError` are injected -- this
// module imports neither `shared/ipc/config.ts` nor
// `shared/state/status-message.svelte.ts` directly. (2) plain `.ts`, no
// Svelte runes.

export interface PersistenceParticipant<T> {
  getSnapshot(): Partial<T>;
  hydrate(data: T): void;
}

export interface PersistenceCoordinatorDeps<T> {
  load: () => Promise<{ data: T; notice: string | null }>;
  save: (data: T) => Promise<void>;
  onSaveError?: (e: unknown) => void;
  debounceMs?: number; // default 400 (R-243)
}

const DEFAULT_DEBOUNCE_MS = 400;

export function createPersistenceCoordinator<T extends object>(deps: PersistenceCoordinatorDeps<T>) {
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const participants: PersistenceParticipant<T>[] = [];
  let hydrated = false; // stays false if the initial load fails
  let dirty = false;
  let baseline: T | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let savePromise: Promise<void> | null = null;

  function register(p: PersistenceParticipant<T>): void {
    participants.push(p);
  }

  function snapshot(): T {
    return Object.assign({}, baseline, ...participants.map((p) => p.getSnapshot())) as T;
  }

  async function flush(): Promise<void> {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (!hydrated) return; // never save before a successful load
    // Keep going until nothing is in flight AND nothing is dirty. A
    // concurrent flush() may start a follow-up save while this one awaits; we
    // must not return before that save finishes (MUST-55).
    for (;;) {
      const inflight = savePromise;
      if (inflight !== null) {
        try {
          await inflight;
        } catch {
          // failure of the earlier save is handled by its own caller; dirty
          // was re-armed there, so the next iteration retries once.
        }
        if (savePromise === inflight) savePromise = null;
        continue;
      }
      if (!dirty) return;
      dirty = false;
      const data = snapshot();
      baseline = data;
      const current: Promise<void> = deps.save(data).finally(() => {
        if (savePromise === current) savePromise = null;
      });
      savePromise = current;
      try {
        await current;
      } catch (e) {
        // Keep the unsaved changes pending and stop (no busy-retry loop).
        dirty = true;
        deps.onSaveError?.(e);
        return;
      }
    }
  }

  function requestSave(): void {
    if (!hydrated) return; // defensive only
    dirty = true;
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void flush();
    }, debounceMs);
  }

  async function hydrateAll(): Promise<string | null> {
    let result;
    try {
      result = await deps.load();
    } catch {
      // never enable saving after a failed load.
      return "Failed to load data. Changes will not be saved this session.";
    }
    baseline = result.data;
    for (const p of participants) p.hydrate(result.data);
    hydrated = true;
    return result.notice;
  }

  return {
    register,
    requestSave,
    flush,
    hydrateAll,
    get hydrated() {
      return hydrated;
    },
  };
}
