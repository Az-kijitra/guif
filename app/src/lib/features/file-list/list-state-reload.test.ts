import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-72 (a *directory change* resets selection/focus; a
//   reload must NOT), R-76-2, SPEC-0300-0011 R-76 (reload after create),
//   SPEC-0300-0013 R-209 (reload is not navigation: it never goes through
//   afterUserNavigation; here: reload never changes currentPath).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.6:
//   `reload(opts?: { focusPath?: string; clearSelection?: boolean }):
//   Promise<string | null>` on list-state.svelte.ts; reuses loadSequence's
//   outrun guard; keeps selection/focus (via reconcileAfterReload) unlike
//   loadDirectory; MUST-60 clearSelection.
// Module under test: createFileListState().reload (not yet implemented).
// $lib/shared/ipc/fs is mocked (no real Tauri invoke).

vi.mock("$lib/shared/ipc/fs", () => ({
  fsListDir: vi.fn(),
}));

import { fsListDir, type FsEntry } from "$lib/shared/ipc/fs";
import { createFileListState } from "./list-state.svelte";

function entry(name: string): FsEntry {
  return { name, path: `C:\\x\\${name}`, entryType: "file", size: 0, modified: "", hidden: false, ext: "" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.mocked(fsListDir).mockReset();
});

async function loaded(names: string[]) {
  vi.mocked(fsListDir).mockResolvedValueOnce(names.map(entry));
  const state = createFileListState();
  await state.loadDirectory("C:\\x");
  return state;
}

describe("reload", () => {
  it("re-lists the CURRENT path (same sort/hidden parameters) and returns that path", async () => {
    const state = await loaded(["a", "b"]);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("a"), entry("b"), entry("c")]);
    const result = await state.reload();
    expect(result).toBe("C:\\x");
    expect(fsListDir).toHaveBeenLastCalledWith(expect.objectContaining({ path: "C:\\x" }));
    expect(state.entries.map((e) => e.name)).toEqual(["a", "b", "c"]);
    expect(state.currentPath).toBe("C:\\x");
  });

  it("R-76-2: keeps the selection (limited to entries that still exist) and the focused entry", async () => {
    const state = await loaded(["a", "b", "c"]);
    state.selectAll(state.entries);
    state.focusIndex(1);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("b"), entry("c")]);
    await state.reload();
    expect([...state.selected].sort()).toEqual(["C:\\x\\b", "C:\\x\\c"]);
    expect(state.entries[state.focusedIndex].name).toBe("b");
  });

  it("MUST-60: { clearSelection: true } empties the selection", async () => {
    const state = await loaded(["a", "b"]);
    state.selectAll(state.entries);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("a"), entry("b")]);
    await state.reload({ clearSelection: true });
    expect(state.selected.size).toBe(0);
  });

  it("{ focusPath } moves focus to that entry (rename follows the new name)", async () => {
    const state = await loaded(["a", "b"]);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("b"), entry("z")]);
    await state.reload({ focusPath: "C:\\x\\z" });
    expect(state.entries[state.focusedIndex].name).toBe("z");
  });

  it("the previously focused entry vanishing clamps focus into range (delete of the last entry)", async () => {
    const state = await loaded(["a", "b", "c"]);
    state.focusIndex(2);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("a"), entry("b")]);
    await state.reload();
    expect(state.focusedIndex).toBe(1);
  });

  it("on failure returns null, records the error and leaves the previous listing/selection untouched", async () => {
    const state = await loaded(["a", "b"]);
    state.selectAll(state.entries);
    vi.mocked(fsListDir).mockRejectedValueOnce(new Error("io"));
    expect(await state.reload()).toBeNull();
    expect(state.error).toBe("io");
    expect(state.entries.map((e) => e.name)).toEqual(["a", "b"]);
    expect(state.selected.size).toBe(2);
    expect(state.loading).toBe(false);
  });

  it("outrun guard: a slow reload overtaken by a newer loadDirectory returns null and does not touch state", async () => {
    const state = await loaded(["a"]);
    const slow = deferred<FsEntry[]>();
    vi.mocked(fsListDir).mockReturnValueOnce(slow.promise);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("other")]);
    const reloading = state.reload();
    await state.loadDirectory("C:\\y");
    slow.resolve([entry("stale")]);
    expect(await reloading).toBeNull();
    expect(state.entries.map((e) => e.name)).toEqual(["other"]);
    expect(state.currentPath).toBe("C:\\y");
  });

  it("outrun guard: two overlapping reloads — only the newest one applies", async () => {
    const state = await loaded(["a"]);
    const slow = deferred<FsEntry[]>();
    vi.mocked(fsListDir).mockReturnValueOnce(slow.promise);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("fresh")]);
    const first = state.reload();
    const second = state.reload();
    expect(await second).toBe("C:\\x");
    slow.resolve([entry("stale")]);
    expect(await first).toBeNull();
    expect(state.entries.map((e) => e.name)).toEqual(["fresh"]);
  });

  it("is not navigation: currentPath is unchanged even after repeated reloads (R-209)", async () => {
    const state = await loaded(["a"]);
    vi.mocked(fsListDir).mockResolvedValue([entry("a")]);
    await state.reload();
    await state.reload({ clearSelection: true });
    expect(state.currentPath).toBe("C:\\x");
  });
});
