import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0010 R-45 (custom keymap overrides, applied at startup).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.2 (new
//   featureRocal state, same shape as features/search/search-state.svelte.ts):
//   `customOverrides: $state<Record<string,string>>({})` + `hydrate(overrides)`.
//   `+page.svelte`'s `DispatchContext.customOverrides` reads
//   `keymapState.customOverrides` instead of the current hardcoded `{}`.
//
// Module under test (not yet implemented): ./keymap-state.svelte.ts

import { createKeymapState } from "./keymap-state.svelte";

describe("createKeymapState (SPEC-0200-0001 §3.6.2)", () => {
  it("starts with empty custom overrides (R-45-1: no config.toml yet)", () => {
    const state = createKeymapState();
    expect(state.customOverrides).toEqual({});
  });

  it("hydrate(overrides) replaces customOverrides with the given map", () => {
    const state = createKeymapState();
    state.hydrate({ toggle_hidden: "Ctrl+Alt+H" });
    expect(state.customOverrides).toEqual({ toggle_hidden: "Ctrl+Alt+H" });
  });

  it("a second hydrate() call replaces (does not merge with) the previous overrides", () => {
    const state = createKeymapState();
    state.hydrate({ toggle_hidden: "Ctrl+Alt+H" });
    state.hydrate({ sort_menu: "D" });
    expect(state.customOverrides).toEqual({ sort_menu: "D" });
  });

  it("hydrate({}) clears any previously hydrated overrides", () => {
    const state = createKeymapState();
    state.hydrate({ toggle_hidden: "Ctrl+Alt+H" });
    state.hydrate({});
    expect(state.customOverrides).toEqual({});
  });

  it("two instances are independent (factory, not a shared singleton)", () => {
    const a = createKeymapState();
    const b = createKeymapState();
    a.hydrate({ toggle_hidden: "Ctrl+Alt+H" });
    expect(b.customOverrides).toEqual({});
  });
});
