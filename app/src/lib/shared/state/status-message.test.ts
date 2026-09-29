import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0013 R-218/R-218-1 (no_items), R-242 item 3 (corruption
//   notice)
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.9-2
//   (MUST-46: sole owner of the transient status-line message)
//
// Module under test (not yet implemented): ./status-message.svelte.ts
//
// A small shared/state/ owner module (§5.2, registered in
// docs/architecture/traceability.md's shared-state table): any feature may
// call show() to post a transient, auto-dismissing message; only this module
// mutates its own `text`. This test exercises the `createStatusMessageState`
// factory in isolation (mirrors the createSearchState/createFileListState
// factory pattern) so each test starts from a fresh instance — the exported
// singleton `statusMessage` is not touched here.
//
// Exact message wording (English "No items"/Japanese "項目なし" for R-218,
// and the R-242 item 3 corruption notice) is left to i18n/translation-key
// design (R-242-2) and is NOT asserted verbatim by this test file — only the
// show/auto-dismiss/clear *mechanism* is a normative contract at this layer.

import { createStatusMessageState } from "./status-message.svelte";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("initial state", () => {
  it("starts with no message", () => {
    const s = createStatusMessageState();
    expect(s.text).toBeNull();
  });
});

describe("show (R-218, R-242 item 3)", () => {
  it("sets the message text", () => {
    const s = createStatusMessageState();
    s.show("No items");
    expect(s.text).toBe("No items");
  });

  it("defaults to auto-dismissing after 2500ms", () => {
    const s = createStatusMessageState();
    s.show("No items");
    vi.advanceTimersByTime(2499);
    expect(s.text).toBe("No items");
    vi.advanceTimersByTime(1);
    expect(s.text).toBeNull();
  });

  it("accepts a custom duration override", () => {
    const s = createStatusMessageState();
    s.show("Custom", 1000);
    vi.advanceTimersByTime(999);
    expect(s.text).toBe("Custom");
    vi.advanceTimersByTime(1);
    expect(s.text).toBeNull();
  });

  it("calling show() again before the previous message dismissed replaces the text and resets the dismiss timer", () => {
    const s = createStatusMessageState();
    s.show("first");
    vi.advanceTimersByTime(2000);
    s.show("second"); // replaces "first" — a fresh 2500ms window starts now
    vi.advanceTimersByTime(2000);
    expect(s.text).toBe("second"); // the old timer (which would have fired at 2500 from "first") must not fire
    vi.advanceTimersByTime(500);
    expect(s.text).toBeNull();
  });
});

describe("clear", () => {
  it("immediately nulls the message and cancels the pending auto-dismiss timer", () => {
    const s = createStatusMessageState();
    s.show("No items");
    s.clear();
    expect(s.text).toBeNull();
    // Advancing time past the original dismiss deadline must not throw or
    // otherwise misbehave now that the timer has been canceled.
    vi.advanceTimersByTime(3000);
    expect(s.text).toBeNull();
  });

  it("clear() when no message is showing is a harmless no-op", () => {
    const s = createStatusMessageState();
    expect(() => s.clear()).not.toThrow();
    expect(s.text).toBeNull();
  });
});

// code-reviewer minor item (SHOULD-119, 2026-09-29): the combined startup
// notice (routes/startup-wiring.ts, shown for 6s) must not be silently
// clobbered by an ordinary, short-lived `show()` call (e.g. R-40-3's tree
// load-failure notice) that happens to fire while it is still on screen.
describe("showPriority (SHOULD-119)", () => {
  it("behaves like show() for its own duration", () => {
    const s = createStatusMessageState();
    s.showPriority("startup notice", 6000);
    expect(s.text).toBe("startup notice");
    vi.advanceTimersByTime(5999);
    expect(s.text).toBe("startup notice");
    vi.advanceTimersByTime(1);
    expect(s.text).toBeNull();
  });

  it("a later show() call WHILE the priority message is still active appends instead of overwriting it", () => {
    const s = createStatusMessageState();
    s.showPriority("startup notice", 6000);
    vi.advanceTimersByTime(1000);
    s.show("tree load failed");
    expect(s.text).toBe("startup notice / tree load failed");
    // The priority message's own timer (armed at t=0 for 6000ms) is
    // unaffected by the later show() call.
    vi.advanceTimersByTime(4999);
    expect(s.text).toBe("startup notice / tree load failed");
    vi.advanceTimersByTime(1);
    expect(s.text).toBeNull();
  });

  it("multiple show() calls during the priority window all append in order", () => {
    const s = createStatusMessageState();
    s.showPriority("A", 6000);
    s.show("B");
    s.show("C");
    expect(s.text).toBe("A / B / C");
  });

  it("after the priority window elapses, a normal show() call overwrites as usual", () => {
    const s = createStatusMessageState();
    s.showPriority("startup notice", 1000);
    vi.advanceTimersByTime(1000);
    expect(s.text).toBeNull();
    s.show("later message");
    expect(s.text).toBe("later message");
  });

  it("clear() ends the priority window too -- a later show() overwrites normally", () => {
    const s = createStatusMessageState();
    s.showPriority("startup notice", 6000);
    s.clear();
    s.show("later message");
    expect(s.text).toBe("later message");
  });
});

describe("independent instances (factory isolation)", () => {
  it("two instances do not share state", () => {
    const a = createStatusMessageState();
    const b = createStatusMessageState();
    a.show("only on a");
    expect(a.text).toBe("only on a");
    expect(b.text).toBeNull();
  });
});
