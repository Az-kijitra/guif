import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0013 R-210/R-211 (record only on success), SPEC-0200-0001
//   §3.2.4 (SHOULD-62/68: loadDirectory returns the loaded path or null, and
//   a stale (outrun) response must not touch state).
// REVISED 2026-10-01 (unit-test-writer, Phase 8): loadDirectory/openFocused/
//   goParent now return NavigateResult (SPEC-0200-0001 §3.7.10.1 MUST-96,
//   SHOULD-133/134) instead of `string | null`. Assertions migrated
//   mechanically; new behavior lives in list-state-navigate.test.ts.
// $lib/shared/ipc/fs is mocked (no real Tauri invoke).

vi.mock("$lib/shared/ipc/fs", () => ({
  fsListDir: vi.fn(),
}));

import { fsListDir, type FsEntry } from "$lib/shared/ipc/fs";
import { createFileListState } from "./list-state.svelte";

function entry(path: string, entryType: "file" | "dir" = "file"): FsEntry {
  return { name: path, path, entryType, size: 0, modified: "", hidden: false, ext: "" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.mocked(fsListDir).mockReset();
});

describe("loadDirectory return value", () => {
  it("returns the loaded path on success", async () => {
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("a")]);
    const state = createFileListState();
    expect(await state.loadDirectory("C:\\x")).toEqual({ status: "success", path: "C:\\x" });
    expect(state.currentPath).toBe("C:\\x");
  });

  it("returns null and sets error on failure, leaving currentPath untouched", async () => {
    vi.mocked(fsListDir).mockRejectedValueOnce(new Error("boom"));
    const state = createFileListState();
    expect(await state.loadDirectory("C:\\bad")).toMatchObject({ status: "failed" });
    expect(state.error).toBe("boom");
    expect(state.currentPath).toBe(".");
  });
});

describe("outrun guard (SHOULD-68)", () => {
  it("a slow earlier request resolving after a newer one returns null and does not overwrite state", async () => {
    const slow = deferred<FsEntry[]>();
    vi.mocked(fsListDir).mockReturnValueOnce(slow.promise);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("new")]);
    const state = createFileListState();

    const first = state.loadDirectory("C:\\slow");
    const second = state.loadDirectory("C:\\fast");
    expect(await second).toEqual({ status: "success", path: "C:\\fast" });

    slow.resolve([entry("old")]);
    expect(await first).toEqual({ status: "stale" });

    expect(state.currentPath).toBe("C:\\fast");
    expect(state.entries.map((e) => e.path)).toEqual(["new"]);
    expect(state.loading).toBe(false);
  });

  it("a stale failure does not set error over a newer success", async () => {
    const slow = deferred<FsEntry[]>();
    vi.mocked(fsListDir).mockReturnValueOnce(slow.promise);
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("ok")]);
    const state = createFileListState();

    const first = state.loadDirectory("C:\\slow");
    await state.loadDirectory("C:\\fast");
    slow.reject(new Error("stale failure"));
    await first;

    expect(state.error).toBeNull();
  });
});

describe("openFocused / goParent propagate the result", () => {
  it("openFocused returns the directory path on success and null for a file", async () => {
    vi.mocked(fsListDir).mockResolvedValueOnce([entry("C:\\d", "dir"), entry("C:\\f", "file")]);
    const state = createFileListState();
    await state.loadDirectory("C:\\");

    vi.mocked(fsListDir).mockResolvedValueOnce([]);
    expect(await state.openFocused()).toEqual({ status: "success", path: "C:\\d" });

    // now empty listing: nothing focused
    expect(await state.openFocused()).toEqual({ status: "noop" });
  });

  it("goParent returns the parent path, and null when already at a root", async () => {
    vi.mocked(fsListDir).mockResolvedValueOnce([]);
    const state = createFileListState();
    await state.loadDirectory("C:\\a\\b");

    vi.mocked(fsListDir).mockResolvedValueOnce([]);
    const parent = await state.goParent();
    expect(parent.status).toBe("success");
    expect(state.currentPath).toBe((parent as { path: string }).path);

    vi.mocked(fsListDir).mockResolvedValueOnce([]);
    await state.loadDirectory("C:\\");
    expect(await state.goParent()).toEqual({ status: "noop" });
  });
});
