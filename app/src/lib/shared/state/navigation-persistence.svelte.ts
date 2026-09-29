// Sole owner of the navigation.toml debounce timer, the "initial load
// succeeded" flag, the dirty flag and the save-in-flight guard
// (SPEC-0200-0001 §3.2.6, MUST-47/48/55, SHOULD-70). Does NOT import any
// feature module; features register a snapshot/hydrate pair at module init.
//
// SPEC-0200-0001 §3.6.11.11 SHOULD-118/130 (MUST-88): the "participants +
// debounce + dirty flag + flush" mechanics themselves are now the
// domain-agnostic `shared/persistence-coordinator.ts` factory; this module is
// a thin adapter translating `configLoadNavigation`/`configSaveNavigation`'s
// shapes to/from that factory's `{data, notice}` contract, while preserving
// its own existing public API (`createNavigationPersistenceCoordinator`/
// `navigationPersistence`, SHOULD-130 condition 3).
//
// `hydrateAll()`'s contract (MUST-88): `Promise<string | null>` (the notice
// text, or `null`) -- it no longer calls `statusMessage.show` itself; that is
// `routes/startup-wiring.ts`'s responsibility (R-45-6/R-77-6 concatenate
// three separate startup notices into one).

import {
  configLoadNavigation,
  configSaveNavigation,
  type NavigationData,
} from "$lib/shared/ipc/config";
import { createPersistenceCoordinator } from "$lib/shared/persistence-coordinator";
import { statusMessage } from "$lib/shared/state/status-message.svelte";

export type NavigationPersistenceParticipant = {
  getSnapshot(): Partial<NavigationData>;
  hydrate(data: NavigationData): void;
};

export function createNavigationPersistenceCoordinator() {
  return createPersistenceCoordinator<NavigationData>({
    load: async () => {
      const result = await configLoadNavigation();
      const notice = result.recoveredFromCorruption
        ? "Navigation data was corrupted and has been reset. The original file was backed up." // R-242 item 3
        : null;
      return { data: result.data, notice };
    },
    save: configSaveNavigation,
    onSaveError: () => statusMessage.show("Failed to save navigation data."),
  });
}

export const navigationPersistence = createNavigationPersistenceCoordinator();
