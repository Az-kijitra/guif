import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0018 R-1020 / R-1021 / R-1022, R-1056-1, AC-1000, AC-1001,
//   AC-1042.
// Architecture: SPEC-0200-0001 §3.9.3 (contextClickRow: visible empty or path
//   not visible -> no-op; otherwise resolveContextClick; focusedIndex
//   converted to the real index; a following Shift+click ranges from the
//   right-clicked row), §3.9.17.2 + guardian 20th audit MUST-117
//   (restoreDisplayedSelection: selection back to the menu's targets; hidden
//   selection kept; anchor = current-if-target else first target; the FOCUS
//   ROW is not changed).
// Modules under test (stubs in ./list-state.svelte.ts): contextClickRow,
//   restoreDisplayedSelection. Same mocking approach as list-state.test.ts.

vi.mock("$lib/shared/ipc/fs", () => ({
  fsListDir: vi.fn(),
}));

import { fsListDir, type FsEntry } from "$lib/shared/ipc/fs";
import { createFileListState } from "./list-state.svelte";

function makeEntry(path: string): FsEntry {
  return { name: path, path, entryType: "file", size: 0, modified: "", hidden: false, ext: "" };
}

async function seededState(paths: string[] = ["a", "b", "c", "d", "e"]) {
  vi.mocked(fsListDir).mockResolvedValueOnce(paths.map(makeEntry));
  const state = createFileListState();
  await state.loadDirectory("root");
  return state;
}

afterEach(() => {
  vi.mocked(fsListDir).mockReset();
});

const plain = { shiftKey: false, ctrlKey: false };
const shift = { shiftKey: true, ctrlKey: false };

describe("contextClickRow (R-1020, AC-1000, AC-1001)", () => {
  it("unselected row: selection becomes that row, focus moves, a following Shift+click ranges from it (AC-1000)", async () => {
    const state = await seededState();
    const visible = [...state.entries];

    state.contextClickRow(visible, "b");

    expect(state.selected).toEqual(new Set(["b"]));
    expect(state.focusedIndex).toBe(1);
    state.clickRow(visible, "d", shift);
    expect(state.selected).toEqual(new Set(["b", "c", "d"]));
  });

  it("selected row: selection and anchor are kept, focus moves (AC-1001)", async () => {
    const state = await seededState();
    const visible = [...state.entries];
    state.clickRow(visible, "a", plain); // anchor a
    state.clickRow(visible, "c", shift); // a,b,c

    state.contextClickRow(visible, "c");

    expect(state.selected).toEqual(new Set(["a", "b", "c"]));
    expect(state.focusedIndex).toBe(2);
    state.clickRow(visible, "e", shift);
    expect(state.selected).toEqual(new Set(["a", "b", "c", "d", "e"])); // still ranged from anchor a
  });

  it("converts the visible index to the real (entries-basis) focusedIndex", async () => {
    const state = await seededState();
    const visible = state.entries.filter((e) => ["a", "c", "e"].includes(e.path));

    state.contextClickRow(visible, "e");

    expect(state.focusedIndex).toBe(4);
    expect(state.selected).toEqual(new Set(["e"]));
  });

  it("a selected row keeps a hidden (filtered-out) selection (R-1022)", async () => {
    const state = await seededState();
    state.selectAll([...state.entries]); // a..e
    const visible = state.entries.filter((e) => ["a", "b"].includes(e.path));

    state.contextClickRow(visible, "a");

    expect(state.selected).toEqual(new Set(["a", "b", "c", "d", "e"]));
  });

  it("replacing the selection drops a hidden selection (R-1020)", async () => {
    const state = await seededState();
    state.clickRow([...state.entries], "e", plain); // selection = {e}, which is hidden below
    const visible = state.entries.filter((e) => ["a", "b"].includes(e.path));

    state.contextClickRow(visible, "a");

    expect(state.selected).toEqual(new Set(["a"]));
  });

  it("empty visible -> nothing changes", async () => {
    const state = await seededState();
    state.focusIndex(2);

    state.contextClickRow([], "a");

    expect(state.selected).toEqual(new Set());
    expect(state.focusedIndex).toBe(2);
  });

  it("a path that is not in visible -> nothing changes", async () => {
    const state = await seededState();
    state.focusIndex(2);
    const visible = state.entries.filter((e) => ["a", "b"].includes(e.path));

    state.contextClickRow(visible, "d");

    expect(state.selected).toEqual(new Set());
    expect(state.focusedIndex).toBe(2);
  });
});

describe("restoreDisplayedSelection (R-1056-1, AC-1042)", () => {
  it("brings the selection back after it was cleared; focus row unchanged; anchor = first target", async () => {
    const state = await seededState();
    const visible = [...state.entries];
    state.focusIndex(3);
    state.clearSelection();

    state.restoreDisplayedSelection(visible, ["a", "b"]);

    expect(state.selected).toEqual(new Set(["a", "b"]));
    expect(state.focusedIndex).toBe(3);
    state.clickRow(visible, "d", shift);
    expect(state.selected).toEqual(new Set(["a", "b", "c", "d"])); // anchor was "a"
  });

  it("replaces a different visible selection", async () => {
    const state = await seededState();
    const visible = [...state.entries];
    state.clickRow(visible, "e", plain);

    state.restoreDisplayedSelection(visible, ["a", "b"]);

    expect(state.selected).toEqual(new Set(["a", "b"]));
  });

  it("keeps a selection that is hidden by the filter; a visible non-target is dropped", async () => {
    const state = await seededState();
    state.selectAll([...state.entries]);
    const visible = state.entries.filter((e) => ["a", "b"].includes(e.path));

    state.restoreDisplayedSelection(visible, ["a"]);

    expect(state.selected).toEqual(new Set(["a", "c", "d", "e"])); // b (visible, not a target) dropped
  });

  it("ignores paths that are not in visible (vanished entries)", async () => {
    const state = await seededState();
    const visible = state.entries.filter((e) => ["a", "b"].includes(e.path));

    state.restoreDisplayedSelection(visible, ["a", "gone"]);

    expect(state.selected).toEqual(new Set(["a"]));
  });
});
