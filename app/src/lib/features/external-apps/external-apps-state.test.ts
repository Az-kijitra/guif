import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1501 (read ONCE at start-up; nothing changes while running), R-1552 (the menu items are fixed at start-up),
//   R-1506 (order). Same shape as `features/keyboard/keymap-state.svelte.ts` (SPEC-0300-0010 R-45).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/external-apps-state.svelte.ts`: `hydrate(registry)` + read-only getters; the ONLY
//   writer is `routes/startup-wiring.ts`; not a shared state of several features, so no §5.2 registration).
//
// Contract assumed (reported to the implementer):
//   createExternalAppsState(): { readonly entries: readonly ExternalAppEntry[]; hydrate(registry: Registry): void }   // initially entries = []
//   export const externalAppsState = createExternalAppsState();                                                      // the singleton the page reads
//   hydrate REPLACES (does not merge with) the previous registry.
//
// Module under test (not yet implemented): ./external-apps-state.svelte.ts

import { createExternalAppsState, externalAppsState } from "./external-apps-state.svelte";
import type { Registry } from "./registry";

const registry = (labels: string[]): Registry => ({
  entries: labels.map((label, index) => ({ index, label, keys: [] })),
  invalid: [],
  typeError: false,
  rejectedKeys: [],
});

describe("createExternalAppsState", () => {
  it("starts empty: no registration is offered before the start-up load finished", () => {
    expect(createExternalAppsState().entries).toEqual([]);
  });

  it("hydrate(registry) exposes the entries in order", () => {
    const s = createExternalAppsState();
    s.hydrate(registry(["a", "b", "c"]));
    expect(s.entries.map((e) => e.label)).toEqual(["a", "b", "c"]);
    expect(s.entries.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("a second hydrate replaces the first", () => {
    const s = createExternalAppsState();
    s.hydrate(registry(["a", "b"]));
    s.hydrate(registry(["z"]));
    expect(s.entries.map((e) => e.label)).toEqual(["z"]);
  });

  it("hydrating an empty registry clears everything (external_apps = [])", () => {
    const s = createExternalAppsState();
    s.hydrate(registry(["a"]));
    s.hydrate(registry([]));
    expect(s.entries).toEqual([]);
  });

  it("two instances are independent (a factory, not a shared singleton)", () => {
    const one = createExternalAppsState();
    const two = createExternalAppsState();
    one.hydrate(registry(["a"]));
    expect(two.entries).toEqual([]);
  });

  it("the state is not changed by mutating the registry object it was given afterwards", () => {
    const s = createExternalAppsState();
    const r = registry(["a", "b"]);
    s.hydrate(r);
    r.entries.pop();
    expect(s.entries).toHaveLength(2);
  });
});

describe("the singleton", () => {
  it("exists and has the same interface", () => {
    expect(Array.isArray(externalAppsState.entries)).toBe(true);
    expect(typeof externalAppsState.hydrate).toBe("function");
  });
});
