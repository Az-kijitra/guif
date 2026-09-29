// SPEC-0300-0010 R-45 (custom keymap overrides, applied at startup).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.2 (new
// feature-local state, same shape as features/search/search-state.svelte.ts).

export function createKeymapState() {
  let customOverrides = $state<Record<string, string>>({});

  // Replaces (does not merge with) any previously hydrated overrides.
  function hydrate(overrides: Record<string, string>): void {
    customOverrides = { ...overrides };
  }

  return {
    get customOverrides() {
      return customOverrides;
    },
    hydrate,
  };
}

export const keymapState = createKeymapState();
