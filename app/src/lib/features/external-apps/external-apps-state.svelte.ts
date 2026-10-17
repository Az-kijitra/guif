// SPEC-0300-0021 R-1501 / R-1552 (the registrations are read ONCE at start-up; nothing changes while running).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.16.6 (same shape as features/keyboard/keymap-state.svelte.ts). The only
// writer is `routes/startup-wiring.ts`; the readers are `routes/` wirings, which hand values to the menu features.

import type { ExternalAppEntry, Registry } from "./registry";

export function createExternalAppsState() {
  let entries = $state<ExternalAppEntry[]>([]);

  // Replaces (does not merge with) any previously hydrated registry. The entries are copied.
  function hydrate(registry: Registry): void {
    entries = registry.entries.map((e) => ({ ...e, keys: [...e.keys] }));
  }

  return {
    get entries(): readonly ExternalAppEntry[] {
      return entries;
    },
    hydrate,
  };
}

export const externalAppsState = createExternalAppsState();
