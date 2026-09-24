import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0012 (search) / SPEC-0300-0009 R-54/R-55/R-75
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.1.2, §3.1.3
//   (MUST-37), §3.1.4-2 (MUST-44), SHOULD-37(a)
//
// Module under test (not yet implemented / to be extended):
// ./list-state.svelte.ts
//
// This Phase 3 pass extends list-state.svelte.ts's wrapper functions to
// accept the caller-supplied "visible" (= routes' `filteredEntries`) array
// explicitly, instead of assuming `entries` (the full, unfiltered listing)
// is what's on screen. `focusedIndex` itself continues to be stored on the
// `entries` (real) basis at all times (§3.1.3); only the *movement
// calculation* temporarily switches into "visual index" space via
// toVisualIndex/toRealIndex (tested directly and in isolation in
// navigation.test.ts — this file only checks that the wrapper methods wire
// those conversions correctly end-to-end, plus the MUST-44 defensive
// no-op/no-overwrite regulations that only make sense at this wrapper
// level).
//
// Testability note (SHOULD-38 follow-up, ISS-0056/traceability.md
// SPEC-0300-0012 row): Phase 1 exports only the module-scope singleton
// `fileListState`. These tests require a `createFileListState()` factory
// export (the function already exists internally, just unexported) so each
// test can start from an independent instance — a bare singleton cannot be
// reset between tests.
//
// $lib/shared/ipc/fs is mocked so these tests never perform a real Tauri
// invoke() call (SPEC-0400-0001 §3, DOM/IPC-free unit testing).

vi.mock("$lib/shared/ipc/fs", () => ({
  fsListDir: vi.fn(),
}));

import { fsListDir, type FsEntry } from "$lib/shared/ipc/fs";
import { createFileListState } from "./list-state.svelte";

function makeEntry(path: string): FsEntry {
  return { name: path, path, entryType: "file", size: 0, modified: "", hidden: false, ext: "" };
}

// Seeds a fresh, isolated state instance with entries named a, b, c, ... via
// the mocked fsListDir, mirroring how routes/+page.svelte populates the
// list on directory load.
async function seededState(paths: string[] = ["a", "b", "c", "d", "e"]) {
  vi.mocked(fsListDir).mockResolvedValueOnce(paths.map(makeEntry));
  const state = createFileListState();
  await state.loadDirectory("root");
  return state;
}

afterEach(() => {
  vi.mocked(fsListDir).mockReset();
});

describe("moveRow / moveColumn accept an explicit `visible` array (§3.1.2, §3.1.3)", () => {
  it("moves within the visible (filtered) set and converts the result back to the real (entries-basis) focusedIndex", async () => {
    const state = await seededState(); // entries: a,b,c,d,e (real indices 0..4)
    const visible = state.entries.filter((e) => ["a", "c", "e"].includes(e.path)); // b,d hidden
    state.focusIndex(0); // focused = "a" (visible index 0)

    state.moveRow(visible, "down");

    // visual index 0 ("a") -> down -> visual index 1 ("c") -> real index 2
    expect(state.focusedIndex).toBe(2);
  });

  it("does not move past the last entry of the visible set (clamped in visual space, not real space)", async () => {
    const state = await seededState(); // a,b,c,d,e
    const visible = state.entries.filter((e) => ["a", "c", "e"].includes(e.path));
    state.focusIndex(4); // focused = "e", the last visible entry

    state.moveRow(visible, "down");

    // "e" is already visible[2] (the last visible row); must stay on "e"
    // (real index 4), not attempt to move into hidden "b"/"d" territory.
    expect(state.focusedIndex).toBe(4);
  });

  it("moveColumn uses visible.length (not entries.length) as the totalCount basis (SHOULD-47)", async () => {
    const state = await seededState(["a", "b", "c", "d", "e", "f"]); // 6 real entries
    // Only 4 are visible; with rowsPerColumn=2 the visible layout is
    // col0=[a,b], col1=[c,d] ("e","f" filtered out).
    const visible = state.entries.filter((e) => ["a", "b", "c", "d"].includes(e.path));
    state.focusIndex(0); // "a", visible index 0 (row 0, col 0)

    state.moveColumn(visible, "right", 2);

    // visual index 0 -> right, rowsPerColumn=2, totalCount=visible.length=4
    // -> visual index 2 ("c") -> real index of "c"
    expect(state.focusedIndex).toBe(state.entries.findIndex((e) => e.path === "c"));
  });
});

describe("MUST-44 defensive regulations (§3.1.4-2)", () => {
  it("(1) an empty `visible` array makes moveRow / moveColumn / toggleFocused / selectFocused all no-ops", async () => {
    const state = await seededState();
    state.focusIndex(2); // "c"
    const beforeFocus = state.focusedIndex;
    const beforeSelected = new Set(state.selected);

    state.moveRow([], "down");
    state.moveColumn([], "right", 2);
    state.toggleFocused([]);
    state.selectFocused([]);

    expect(state.focusedIndex).toBe(beforeFocus);
    expect(state.selected).toEqual(beforeSelected);
  });

  it("(2) toggleFocused no-ops when the focused real entry is absent from a non-empty `visible` array (prevents selecting a hidden entry, R-123)", async () => {
    const state = await seededState(); // a,b,c,d,e
    state.focusIndex(0); // focused = "a"
    const visible = state.entries.filter((e) => e.path !== "a"); // "a" filtered out, visible non-empty
    const beforeSelected = new Set(state.selected);

    state.toggleFocused(visible);

    expect(state.selected).toEqual(beforeSelected);
  });

  it("(2) selectFocused no-ops when the focused real entry is absent from a non-empty `visible` array (prevents selecting a hidden entry, R-123)", async () => {
    const state = await seededState();
    state.focusIndex(0); // focused = "a"
    const visible = state.entries.filter((e) => e.path !== "a");
    const beforeSelected = new Set(state.selected);

    state.selectFocused(visible);

    expect(state.selected).toEqual(beforeSelected);
  });

  it("(3) when toRealIndex cannot resolve a valid real index, the wrapper leaves focusedIndex unchanged rather than writing -1", async () => {
    const state = await seededState(["a", "b", "c"]);
    state.focusIndex(1); // focused = "b"
    // A `visible` array that is internally inconsistent with `entries`
    // (none of its paths exist in `entries` at all) forces toRealIndex to
    // resolve to -1 even after the toVisualIndex(-1) -> visual-index-0
    // fallback defined in §3.1.3 is applied. This is the final defensive
    // line MUST-44(3) describes; focusedIndex must not become -1.
    const inconsistentVisible = [makeEntry("ghost")];

    state.moveRow(inconsistentVisible, "down");

    expect(state.focusedIndex).toBe(1);
    expect(state.focusedIndex).not.toBe(-1);
  });
});

describe("selectAll / invertSelection (new wrappers, SHOULD-37(a), SPEC-0300-0009 R-54/R-55, SPEC-0300-0012 R-123)", () => {
  it("selectAll selects only the currently visible (filtered) entries, not every entry", async () => {
    const state = await seededState();
    const visible = state.entries.filter((e) => ["a", "c", "e"].includes(e.path));

    state.selectAll(visible);

    expect(state.selected).toEqual(new Set(["a", "c", "e"]));
  });

  it("invertSelection flips selection only within the visible entries, leaving hidden (filtered-out) selections untouched", async () => {
    const state = await seededState();
    const preselect = state.entries.filter((e) => ["a", "d"].includes(e.path));
    state.selectAll(preselect); // selected = {a, d}
    const visible = state.entries.filter((e) => ["a", "b"].includes(e.path)); // "d" is hidden

    state.invertSelection(visible);

    // "a" (visible, was selected) -> unselected; "b" (visible, wasn't) ->
    // selected; "d" (hidden, was selected) untouched.
    expect(state.selected).toEqual(new Set(["b", "d"]));
  });
});

describe("focusIndex (new public update function, §3.1.3, MUST-39)", () => {
  it("sets focusedIndex directly to the given real (entries-basis) index", async () => {
    const state = await seededState();

    state.focusIndex(3);

    expect(state.focusedIndex).toBe(3);
  });
});
