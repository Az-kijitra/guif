// SPEC-0300-0009 R-77/R-77-2/R-77-2-1/R-77-5; SPEC-0200-0001 §3.6.6 (the
// "ui-state-sync.ts" sketch), §3.6.11.11 SHOULD-118: a thin wrapper around
// the domain-agnostic `shared/persistence-coordinator.ts` factory for
// `ui-state.toml` (the sibling of `shared/state/navigation-persistence.svelte.ts`
// for `navigation.toml`). `list-state.svelte.ts` registers itself as this
// coordinator's sole participant (mirroring the existing
// navigation-history-state.svelte.ts/search-state.svelte.ts self-registration
// precedent).

import { uiStateSave, uiStateLoad, type UiStateData } from "$lib/shared/ipc/config";
import { createPersistenceCoordinator } from "$lib/shared/persistence-coordinator";
import { FILE_LIST_NOTICES } from "./messages";

export function createUiStatePersistenceCoordinator() {
  return createPersistenceCoordinator<UiStateData>({
    load: async () => {
      const result = await uiStateLoad();
      const notice = result.recoveredFromCorruption
        ? FILE_LIST_NOTICES.displaySettingsCorrupted // R-77-3
        : null;
      return { data: result.data, notice };
    },
    save: uiStateSave,
  });
}

export const uiStatePersistence = createUiStatePersistenceCoordinator();
