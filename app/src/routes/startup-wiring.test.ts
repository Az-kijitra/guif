import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-45-6/R-77-3-1/R-77-6; SPEC-0300-0010 R-45-2/R-45-5/
//   R-45-6; SPEC-0300-0013 R-242. AC-62-2.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.2
//   (new routes/startup-wiring.ts), §3.6.11.11 SHOULD-119/120.
//
// Module under test (not yet implemented): ./startup-wiring.ts
//
// Contract assumed (documented in the handback report -- §3.6.2's own sketch
// bundles an `applyUiState`/`applyCustomOverrides` callback INSIDE the
// resolved promise, which only makes sense if the caller's closure already
// invokes it before resolving; this file tests the simpler, equivalent
// surface where each `load*` dependency is a zero-argument closure that
// already performs its own "apply to feature state" side effect internally
// before resolving, and returns only `{ notice: string | null }`):
//
//   runStartupHydrate(deps: {
//     loadUiState: () => Promise<{ notice: string | null }>;
//     loadKeymap: () => Promise<{ notice: string | null }>;
//     loadNavigation: () => Promise<string | null>; // navigationPersistence.hydrateAll()'s new contract (MUST-88)
//   }): Promise<void>
//
// R-77-3-1: the APPLY order is ui-state -> config(keymap) -> (then
// navigation), all applied before the caller's first fs_list_dir. R-45-6/
// R-77-6: the NOTICE order is config -> ui-state -> navigation -- explicitly
// a DIFFERENT order from the apply order (this asymmetry is intentional,
// per the architecture doc's own comment).
//
// `statusMessage` is the real (un-mocked) shared/state singleton, matching
// the existing precedent in routes/navigation-wiring.test.ts.

import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { runStartupHydrate } from "./startup-wiring";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  statusMessage.clear();
});

describe("runStartupHydrate: apply order is ui-state -> config (SPEC-0300-0009 R-77-3-1)", () => {
  it("loadKeymap is not called until loadUiState has resolved", async () => {
    const order: string[] = [];
    const uiState = deferred<{ notice: string | null }>();
    const loadUiState = vi.fn(() => {
      order.push("ui-state:start");
      return uiState.promise.then((r) => {
        order.push("ui-state:done");
        return r;
      });
    });
    const loadKeymap = vi.fn(async () => {
      order.push("keymap:done");
      return { notice: null };
    });
    const loadNavigation = vi.fn(async () => null);

    const runPromise = runStartupHydrate({ loadUiState, loadKeymap, loadNavigation });
    await Promise.resolve(); // let loadUiState start
    expect(loadKeymap).not.toHaveBeenCalled();
    uiState.resolve({ notice: null });
    await runPromise;

    expect(order).toEqual(["ui-state:start", "ui-state:done", "keymap:done"]);
  });

  it("resolves only after all three loads have settled", async () => {
    const nav = deferred<string | null>();
    const loadUiState = vi.fn(async () => ({ notice: null }));
    const loadKeymap = vi.fn(async () => ({ notice: null }));
    const loadNavigation = vi.fn(() => nav.promise);

    let done = false;
    const runPromise = runStartupHydrate({ loadUiState, loadKeymap, loadNavigation }).then(() => {
      done = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    nav.resolve(null);
    await runPromise;
    expect(done).toBe(true);
  });
});

describe("runStartupHydrate: notice concatenation order is config -> ui-state -> navigation (R-45-6/R-77-6, AC-62-2)", () => {
  it("all three notices are joined in that order, regardless of the apply order", async () => {
    const loadUiState = vi.fn(async () => ({ notice: "ui-state failed" }));
    const loadKeymap = vi.fn(async () => ({ notice: "config failed" }));
    const loadNavigation = vi.fn(async () => "navigation failed");

    await runStartupHydrate({ loadUiState, loadKeymap, loadNavigation });

    expect(statusMessage.text).not.toBeNull();
    const text = statusMessage.text as string;
    const configAt = text.indexOf("config failed");
    const uiStateAt = text.indexOf("ui-state failed");
    const navAt = text.indexOf("navigation failed");
    expect(configAt).toBeGreaterThanOrEqual(0);
    expect(uiStateAt).toBeGreaterThan(configAt);
    expect(navAt).toBeGreaterThan(uiStateAt);
  });

  it("no notice at all when every load succeeds without a notice", async () => {
    const loadUiState = vi.fn(async () => ({ notice: null }));
    const loadKeymap = vi.fn(async () => ({ notice: null }));
    const loadNavigation = vi.fn(async () => null);

    await runStartupHydrate({ loadUiState, loadKeymap, loadNavigation });

    expect(statusMessage.text).toBeNull();
  });

  it("a single non-null notice is shown alone (no leading/trailing separator noise)", async () => {
    const loadUiState = vi.fn(async () => ({ notice: null }));
    const loadKeymap = vi.fn(async () => ({ notice: null }));
    const loadNavigation = vi.fn(async () => "navigation failed");

    await runStartupHydrate({ loadUiState, loadKeymap, loadNavigation });

    expect(statusMessage.text).toContain("navigation failed");
    expect((statusMessage.text as string).trim()).toBe(statusMessage.text);
  });

  it("SHOULD-119: the combined startup notice is shown for longer than the default 2.5s auto-dismiss", async () => {
    vi.useFakeTimers();
    try {
      const loadUiState = vi.fn(async () => ({ notice: "ui-state failed" }));
      const loadKeymap = vi.fn(async () => ({ notice: null }));
      const loadNavigation = vi.fn(async () => null);

      await runStartupHydrate({ loadUiState, loadKeymap, loadNavigation });
      expect(statusMessage.text).not.toBeNull();

      await vi.advanceTimersByTimeAsync(2600); // past the default 2.5s
      expect(statusMessage.text).not.toBeNull(); // still shown -- longer duration was requested
    } finally {
      vi.useRealTimers();
    }
  });
});
