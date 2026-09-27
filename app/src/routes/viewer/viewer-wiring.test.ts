import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0015 R-430 (MUST-75, code-reviewer finding, 2026-09-27):
// the pending-open-changed listener must be fully registered (awaited)
// BEFORE the first `viewer_take_pending` fetch, so no update that arrives
// while registration is still in flight is silently missed. Verified here
// with fakes only -- no real Tauri APIs.

import { initializeViewer } from "./viewer-wiring";

describe("initializeViewer (MUST-75: listen registration completes before the first load)", () => {
  it("does not call loadFromPending until listenPendingChanged's promise resolves", async () => {
    const order: string[] = [];
    let resolveListen!: (unlisten: () => void) => void;
    const listenPromise = new Promise<() => void>((resolve) => {
      resolveListen = resolve;
    });
    const listenPendingChanged = vi.fn(() => {
      order.push("listen-called");
      return listenPromise;
    });
    const loadFromPending = vi.fn(async () => {
      order.push("load-called");
    });

    const initPromise = initializeViewer({ listenPendingChanged, loadFromPending });

    // Flush a few microtask turns: loadFromPending must still not have run,
    // because listenPendingChanged has not resolved yet.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(loadFromPending).not.toHaveBeenCalled();

    resolveListen(() => {});
    await initPromise;

    expect(order).toEqual(["listen-called", "load-called"]);
  });

  it("returns the unlisten function listenPendingChanged resolved with", async () => {
    const unlisten = vi.fn();
    const result = await initializeViewer({
      listenPendingChanged: vi.fn(async () => unlisten),
      loadFromPending: vi.fn(async () => undefined),
    });
    expect(result).toBe(unlisten);
  });

  it("an event fired through the registered handler triggers loadFromPending again", async () => {
    let handler: (() => void) | undefined;
    const listenPendingChanged = vi.fn((h: () => void) => {
      handler = h;
      return Promise.resolve(() => {});
    });
    const loadFromPending = vi.fn(async () => undefined);

    await initializeViewer({ listenPendingChanged, loadFromPending });
    expect(loadFromPending).toHaveBeenCalledTimes(1);

    handler?.();
    expect(loadFromPending).toHaveBeenCalledTimes(2);
  });

  it("a loadFromPending failure still surfaces (not silently swallowed)", async () => {
    const listenPendingChanged = vi.fn(async () => () => {});
    const loadFromPending = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(initializeViewer({ listenPendingChanged, loadFromPending })).rejects.toThrow("boom");
  });
});
