import { afterEach, describe, expect, it } from "vitest";

// Spec: SPEC-0300-0013 §3 (R-203~R-207), §4 (R-208~R-211), §5 (R-212~R-214),
//   §6 (R-215~R-221), §7.1 (R-222~R-223), §8 (R-227~R-231), §9 (R-234)
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.3
//   (navigation-history-state.svelte.ts public surface), §3.2.9-2 (R-218's
//   no_items delegated to shared/state/status-message.svelte.ts, MUST-46)
//
// Module under test (not yet implemented): ./navigation-history-state.svelte.ts
//
// This is feature-local UI state (SPEC-0200-0001 §5.1): visitHistory /
// jumpList / isOpen / mode / selectedIndex. It composes the pure functions in
// ./list-ops.ts (tested independently in list-ops.test.ts) and calls out to
// two shared/state/ owner modules: shared/state/status-message.svelte.ts
// (R-218's no_items notice, used un-mocked here — it is itself
// dependency-free) and shared/state/navigation-persistence.svelte.ts
// (requestSave() on every mutation, R-243). The persistence coordinator is
// deliberately left un-mocked too: its requestSave()/flush() are no-ops
// until hydrateAll() has resolved (MUST-48(b)), and this test file never
// calls hydrateAll() on it, so calling recordVisit()/addJump()/
// removeSelected() here never reaches a real Tauri invoke() call
// (SPEC-0400-0001 §3).
//
// DOM focus control (R-225) is explicitly OUT of scope for this module
// (§3.2.9-1: "navigation-history-state.svelte.ts はDOM APIを一切呼ばない");
// it is routes/+page.svelte's responsibility and is not exercised here.
//
// Testability note: `createNavigationHistoryState()` is a factory (mirrors
// createSearchState/createFileListState) so each test starts from an
// independent instance.

import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { createNavigationHistoryState } from "./navigation-history-state.svelte";

afterEach(() => {
  statusMessage.clear();
});

// SPEC-0300-0013 第6版 R-242-3 / R-238-4 / T-06 and the post-approval note of SPEC-0200-0001 §3.12.7 (SHOULD-189 / H-1),
// AC-256 / AC-257 (unit-test-writer, 2026-10-07). Items that are not absolute paths are neither removed nor rewritten
// when a snapshot is loaded; the EXISTING normalisation (SHOULD-129) stays, and of its effects only a bare `C:` -> `C:\`
// changes whether a path is absolute. No production change is needed (owner decision 2026-10-07).
describe("hydrate keeps items that are not absolute paths (R-242-3, T-06, AC-256 / AC-257)", () => {
  const NOT_ABSOLUTE = ["C:src", "src", "\\foo", ".\\src", "C:src\\sub"];

  it("none of C:src / src / \\foo / .\\src is removed or rewritten, in either list, and the order is kept", () => {
    const s = createNavigationHistoryState();
    s.hydrate(["C:\\Users\\a", ...NOT_ABSOLUTE, "D:\\b"], [...NOT_ABSOLUTE].reverse());
    expect(s.visitHistory).toEqual(["C:\\Users\\a", ...NOT_ABSOLUTE, "D:\\b"]);
    expect(s.jumpList).toEqual([...NOT_ABSOLUTE].reverse());
  });

  it("the existing normalisation stays: `/` -> `\\`, a trailing `\\` is dropped, a bare `C:` becomes `C:\\` (only that one changes absoluteness)", () => {
    const s = createNavigationHistoryState();
    s.hydrate(["src/", "C:src\\", "/foo", "C:"], []);
    expect(s.visitHistory).toEqual(["src", "C:src", "\\foo", "C:\\"]);
  });
});

describe("initial state (R-215-1, R-219, R-226)", () => {
  it("starts with empty lists, closed, and selection at 0", () => {
    const s = createNavigationHistoryState();
    expect(s.visitHistory).toEqual([]);
    expect(s.jumpList).toEqual([]);
    expect(s.isOpen).toBe(false);
    expect(s.selectedIndex).toBe(0);
  });
});

describe("hydrate (R-245-1, R-206, AC-240 — reconciles a loaded snapshot via the same dedupe+limit rules as list-ops)", () => {
  it("applies order-preserving dedupe and the 50/20 limits to the loaded lists", () => {
    const s = createNavigationHistoryState();
    const visits = ["C:\\a", "c:\\a", "C:\\b"]; // "c:\a" is a case-variant dup of "C:\a"
    const jumps = ["C:\\j1", "C:\\j2"];

    s.hydrate(visits, jumps);

    expect(s.visitHistory).toEqual(["C:\\a", "C:\\b"]);
    expect(s.jumpList).toEqual(["C:\\j1", "C:\\j2"]);
  });

  it("truncates an over-limit loaded visit history to 50 and jump list to 20", () => {
    const s = createNavigationHistoryState();
    const visits = Array.from({ length: 51 }, (_, i) => `C:\\v${i}`);
    const jumps = Array.from({ length: 21 }, (_, i) => `C:\\j${i}`);

    s.hydrate(visits, jumps);

    expect(s.visitHistory).toHaveLength(50);
    expect(s.jumpList).toHaveLength(20);
  });
});

describe("recordVisit (R-203, R-206, R-208, R-211, AC-200, AC-205)", () => {
  it("adds a path to the front of visitHistory", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    expect(s.visitHistory).toEqual(["C:\\a"]);
  });

  it("re-recording an already-present path moves it to the front without duplicating it (R-206)", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.recordVisit("C:\\b");
    s.recordVisit("C:\\a");
    expect(s.visitHistory).toEqual(["C:\\a", "C:\\b"]);
  });

  it("AC-213-1: recording a visit does not change the jump list", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\j");
    s.recordVisit("C:\\a");
    expect(s.jumpList).toEqual(["C:\\j"]);
  });
});

describe("addJump (R-204, R-206, R-212, R-214, R-214-1, AC-208, AC-209)", () => {
  it("adds a path to the front of the jump list", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\a");
    expect(s.jumpList).toEqual(["C:\\a"]);
  });

  it("R-214-1: re-registering an already-present path moves it to the front without duplicating it", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\a");
    s.addJump("C:\\b");
    s.addJump("C:\\a");
    expect(s.jumpList).toEqual(["C:\\a", "C:\\b"]);
  });

  it("AC-213-1: adding a jump entry does not change the visit history", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.addJump("C:\\j");
    expect(s.visitHistory).toEqual(["C:\\a"]);
  });
});

describe("openHistory / openJump (R-215, R-219, R-222, AC-214, AC-219)", () => {
  it("opens in history mode with the selection reset to the first item", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.recordVisit("C:\\b");

    s.openHistory();

    expect(s.isOpen).toBe(true);
    expect(s.mode).toBe("history");
    expect(s.selectedIndex).toBe(0);
  });

  it("opens in jump mode with the selection reset to the first item", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\a");

    s.openJump();

    expect(s.isOpen).toBe(true);
    expect(s.mode).toBe("jump");
    expect(s.selectedIndex).toBe(0);
  });

  it("re-opening after a previous selection move resets the selection to the first item (R-219: not the previous position)", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.recordVisit("C:\\b");
    s.recordVisit("C:\\c");
    s.openHistory();
    s.moveSelection("down"); // selectedIndex -> 1
    s.close();

    s.openHistory();

    expect(s.selectedIndex).toBe(0);
  });

  it("R-218: opening an empty list does not open the overlay", () => {
    const s = createNavigationHistoryState();
    s.openHistory();
    expect(s.isOpen).toBe(false);
  });

  it("R-218: opening an empty list posts a status-message notice", () => {
    const s = createNavigationHistoryState();
    s.openJump();
    expect(statusMessage.text).not.toBeNull();
  });
});

describe("switchMode (R-227, R-219, R-218-1, AC-218)", () => {
  it("switches to the target mode and resets the selection to the first item", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.addJump("C:\\j1");
    s.addJump("C:\\j2");
    s.openHistory();
    s.moveSelection("down");

    s.switchMode("jump");

    expect(s.mode).toBe("jump");
    expect(s.selectedIndex).toBe(0);
    expect(s.isOpen).toBe(true);
  });

  it("R-218-1: switching to a mode whose list is empty keeps the overlay open on the PREVIOUS mode, without closing it", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a"); // visitHistory non-empty, jumpList empty
    s.openHistory();

    s.switchMode("jump");

    expect(s.isOpen).toBe(true);
    expect(s.mode).toBe("history"); // unchanged — stayed on the previous mode's display
  });

  it("R-218-1: switching to an empty mode posts a status-message notice", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.openHistory();

    s.switchMode("jump");

    expect(statusMessage.text).not.toBeNull();
  });
});

describe("close (R-226: state-only, no DOM)", () => {
  it("closes the overlay without clearing the underlying lists", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\a");
    s.openHistory();

    s.close();

    expect(s.isOpen).toBe(false);
    expect(s.visitHistory).toEqual(["C:\\a"]);
  });
});

describe("moveSelection (R-227, R-228 — delegates the arithmetic tested exhaustively in list-ops.test.ts)", () => {
  it("moves the selection within the currently-open mode's list", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\c");
    s.addJump("C:\\b");
    s.addJump("C:\\a"); // jumpList = [a, b, c]
    s.openJump();

    s.moveSelection("down");
    expect(s.selectedIndex).toBe(1);

    s.moveSelection("end");
    expect(s.selectedIndex).toBe(2);

    s.moveSelection("home");
    expect(s.selectedIndex).toBe(0);
  });
});

describe("selectedPath (R-234 — used by the confirm handler to resolve the target path)", () => {
  it("returns the path at the current selection in the open mode's list", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\b");
    s.addJump("C:\\a"); // jumpList = [a, b]
    s.openJump();
    s.moveSelection("down");

    expect(s.selectedPath()).toBe("C:\\b");
  });

  it("returns null when the overlay's list is empty", () => {
    const s = createNavigationHistoryState();
    expect(s.selectedPath()).toBeNull();
  });
});

describe("removeSelected (R-213, R-213-1, R-213-2, R-213-3, R-224 #3, R-230, AC-223, AC-224, AC-225, AC-226)", () => {
  it("removes the selected item from the currently-open mode's list only", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\b");
    s.addJump("C:\\a"); // jumpList = [a, b]
    s.recordVisit("C:\\v");
    s.openJump();

    s.removeSelected(); // removes "a" (selectedIndex 0)

    expect(s.jumpList).toEqual(["C:\\b"]);
    expect(s.visitHistory).toEqual(["C:\\v"]); // untouched — AC-213-1
  });

  it("removing the selected item in history mode leaves the jump list untouched", () => {
    const s = createNavigationHistoryState();
    s.recordVisit("C:\\b");
    s.recordVisit("C:\\a"); // visitHistory = [a, b]
    s.addJump("C:\\j");
    s.openHistory();

    s.removeSelected();

    expect(s.visitHistory).toEqual(["C:\\b"]);
    expect(s.jumpList).toEqual(["C:\\j"]);
  });

  it("R-213-3/AC-225: deleting the last row in the list clamps the selection to the new last row", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\c");
    s.addJump("C:\\b");
    s.addJump("C:\\a"); // jumpList = [a, b, c]
    s.openJump();
    s.moveSelection("end"); // selectedIndex -> 2 ("c")

    s.removeSelected(); // jumpList -> [a, b]; index 2 no longer valid

    expect(s.jumpList).toEqual(["C:\\a", "C:\\b"]);
    expect(s.selectedIndex).toBe(1); // clamped to the new last row
  });

  it("R-224 #3/AC-226: deleting the last remaining item closes the overlay", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\only");
    s.openJump();

    s.removeSelected();

    expect(s.jumpList).toEqual([]);
    expect(s.isOpen).toBe(false);
  });

  it("deleting a non-last item leaves the overlay open", () => {
    const s = createNavigationHistoryState();
    s.addJump("C:\\b");
    s.addJump("C:\\a");
    s.openJump();

    s.removeSelected();

    expect(s.isOpen).toBe(true);
  });
});
