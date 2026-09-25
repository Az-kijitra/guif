// Sole owner of the navigation.toml debounce timer, the "initial load
// succeeded" flag, the dirty flag and the save-in-flight guard
// (SPEC-0200-0001 §3.2.6, MUST-47/48/55, SHOULD-70). Does NOT import any
// feature module; features register a snapshot/hydrate pair at module init.

import {
  configLoadNavigation,
  configSaveNavigation,
  type NavigationData,
} from "$lib/shared/ipc/config";
import { statusMessage } from "$lib/shared/state/status-message.svelte";

export interface NavigationPersistenceParticipant {
  getSnapshot(): Partial<NavigationData>;
  hydrate(data: NavigationData): void;
}

const SAVE_DEBOUNCE_MS = 400; // R-243

export function createNavigationPersistenceCoordinator() {
  const participants: NavigationPersistenceParticipant[] = [];
  let hydrated = false; // MUST-48(b): stays false if the initial load fails
  let dirty = false; // MUST-55
  let baseline: NavigationData = { visitHistory: [], jumpList: [], searchHistory: [] }; // SHOULD-70
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let savePromise: Promise<void> | null = null;

  function register(p: NavigationPersistenceParticipant): void {
    participants.push(p);
  }

  function snapshot(): NavigationData {
    return Object.assign({ ...baseline }, ...participants.map((p) => p.getSnapshot()));
  }

  async function flush(): Promise<void> {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (!hydrated) return; // MUST-48(b)
    // MUST-55: keep going until nothing is in flight AND nothing is dirty. A
    // concurrent flush() may start a follow-up save while this one awaits; we
    // must not return (and let the window close) before that save finishes.
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
      const current: Promise<void> = configSaveNavigation(data).finally(() => {
        if (savePromise === current) savePromise = null;
      });
      savePromise = current;
      try {
        await current;
      } catch {
        // Keep the unsaved changes pending and stop (no busy-retry loop).
        dirty = true;
        statusMessage.show("Failed to save navigation data.");
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
    }, SAVE_DEBOUNCE_MS);
  }

  async function hydrateAll(): Promise<void> {
    let result;
    try {
      result = await configLoadNavigation();
    } catch {
      // MUST-48(b): never enable saving after a failed load.
      statusMessage.show("Failed to load navigation data. Changes will not be saved this session.");
      return;
    }
    baseline = result.data;
    for (const p of participants) p.hydrate(result.data);
    if (result.recoveredFromCorruption) {
      statusMessage.show(
        "Navigation data was corrupted and has been reset. The original file was backed up.",
      ); // R-242 item 3
    }
    hydrated = true;
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

export const navigationPersistence = createNavigationPersistenceCoordinator();
