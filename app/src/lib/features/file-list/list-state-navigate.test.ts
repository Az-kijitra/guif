import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0016 R-726, R-730, R-731, R-731-1; SPEC-0300-0009 R-72-11
//   (第9版), R-72; SPEC-0300-0013 R-238; AC-707, AC-712, AC-749, AC-751.
// Architecture: SPEC-0200-0001 §3.7.2, §3.7.10.1, §3.7.10.2(c), §3.7.10.11
//   (MUST-105 loadIfNoNewerRequest/currentSequence), §3.7.10.12 (MUST-106
//   pendingNavigateSeq), §3.7.10.14 (SHOULD-145, SHOULD-133 noop).
// Module under test: createFileListState().navigate/loadDirectory/reload/
//   openFocused/goParent/loadIfNoNewerRequest/currentSequence (not yet
//   implemented -> RED).

vi.mock("$lib/shared/ipc/fs", async () => {
  class FsListDirError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fsListDir: vi.fn(),
    FsListDirError,
    normalizeFsListDirError: (e: unknown) =>
      e instanceof FsListDirError ? e : new FsListDirError("other", e instanceof Error ? e.message : String(e)),
  };
});

import { fsListDir, FsListDirError, type FsEntry } from "$lib/shared/ipc/fs";
import { createFileListState } from "./list-state.svelte";

const mocked = () => vi.mocked(fsListDir);

function entry(path: string, entryType: "file" | "dir" = "file"): FsEntry {
  return { name: path, path, entryType, size: 0, modified: "", hidden: false, ext: "" };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (r?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => mocked().mockReset());

describe("navigate: result values (SPEC-0200-0001 §3.7.2, SHOULD-133)", () => {
  it("success returns {status:'success', path} and updates path/entries", async () => {
    mocked().mockResolvedValueOnce([entry("a")]);
    const s = createFileListState();
    expect(await s.navigate("C:\\x")).toEqual({ status: "success", path: "C:\\x" });
    expect(s.currentPath).toBe("C:\\x");
  });

  it("failure returns failed with code/message and leaves path, entries AND the `error` banner untouched (R-730, R-238)", async () => {
    mocked().mockResolvedValueOnce([entry("a")]);
    const s = createFileListState();
    await s.navigate("C:\\x");
    mocked().mockRejectedValueOnce(new FsListDirError("not_found", "gone"));
    const r = await s.navigate("C:\\bad");
    expect(r.status).toBe("failed");
    expect(r).toMatchObject({ code: "not_found" });
    expect(s.currentPath).toBe("C:\\x");
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it.each([
    ["access_denied", "権限がないため操作を実行できませんでした。"],
    ["not_found", "対象が見つかりません。"],
    ["not_a_directory", "フォルダーではありません。"],
  ] as const)("R-731/R-731-1: code %s -> translated message", async (code, text) => {
    mocked().mockRejectedValueOnce(new FsListDirError(code, "raw"));
    const r = await createFileListState().navigate("C:\\f");
    expect(r).toEqual({ status: "failed", code, message: text });
  });

  it("R-731: 'other' shows the OS message as-is", async () => {
    mocked().mockRejectedValueOnce(new FsListDirError("other", "OS says no"));
    const r = await createFileListState().navigate("C:\\f");
    expect(r).toMatchObject({ status: "failed", message: "OS says no" });
  });

  it("MUST-96 2nd: a successful navigate clears an `error` left by a failed initial load", async () => {
    const s = createFileListState();
    mocked().mockRejectedValueOnce(new Error("initial boom"));
    await s.loadDirectory("C:\\bad");
    expect(s.error).not.toBeNull();
    mocked().mockResolvedValueOnce([]);
    await s.navigate("C:\\ok");
    expect(s.error).toBeNull();
  });
});

describe("loadDirectory (initial load): NavigateResult + error banner kept for failures", () => {
  it("success / failed(sets error) / stale", async () => {
    const s = createFileListState();
    mocked().mockResolvedValueOnce([]);
    expect(await s.loadDirectory("C:\\a")).toEqual({ status: "success", path: "C:\\a" });
    mocked().mockRejectedValueOnce(new FsListDirError("other", "boom"));
    expect((await s.loadDirectory("C:\\b")).status).toBe("failed");
    expect(s.error).toBe("boom");
  });
});

describe("openFocused / goParent: noop (SHOULD-133)", () => {
  it("openFocused on a file or empty list -> noop; on a dir -> navigates", async () => {
    const s = createFileListState();
    mocked().mockResolvedValueOnce([entry("C:\\d", "dir"), entry("C:\\f")]);
    await s.navigate("C:\\");
    mocked().mockResolvedValueOnce([]);
    expect(await s.openFocused()).toEqual({ status: "success", path: "C:\\d" });
    expect(await s.openFocused()).toEqual({ status: "noop" });
  });

  it("goParent at a root -> noop (R-791); otherwise navigates to the parent", async () => {
    const s = createFileListState();
    mocked().mockResolvedValue([]);
    await s.navigate("C:\\a\\b");
    expect((await s.goParent()).status).toBe("success");
    await s.navigate("C:\\");
    expect(await s.goParent()).toEqual({ status: "noop" });
  });
});

describe("R-726 / AC-712 / AC-749: only the last request wins, across paths", () => {
  it("slow navigate overtaken by a later navigate -> stale; no failure surfaced even if it fails", async () => {
    const slow = deferred<FsEntry[]>();
    mocked().mockReturnValueOnce(slow.promise).mockResolvedValueOnce([entry("fast")]);
    const s = createFileListState();
    const first = s.navigate("C:\\Slow");
    expect(await s.navigate("C:\\Fast")).toEqual({ status: "success", path: "C:\\Fast" });
    slow.reject(new FsListDirError("not_found", "x"));
    expect(await first).toEqual({ status: "stale" });
    expect(s.currentPath).toBe("C:\\Fast");
  });

  it("MUST-96: an initial loadDirectory overtaken by navigate returns stale and does not overwrite", async () => {
    const slow = deferred<FsEntry[]>();
    mocked().mockReturnValueOnce(slow.promise).mockResolvedValueOnce([entry("user")]);
    const s = createFileListState();
    const init = s.loadDirectory("C:\\Last");
    await s.navigate("C:\\User");
    slow.resolve([entry("old")]);
    expect(await init).toEqual({ status: "stale" });
    expect(s.currentPath).toBe("C:\\User");
  });
});

describe("MUST-97 / MUST-106 / SHOULD-145: reload vs pending navigation", () => {
  it("MUST-97: reload during the latest pending navigate is deferred, then re-issued against the new path with new settings", async () => {
    const slow = deferred<FsEntry[]>();
    const s = createFileListState();
    mocked().mockResolvedValueOnce([entry("a")]);
    await s.navigate("C:\\old");
    mocked().mockReturnValueOnce(slow.promise);
    const nav = s.navigate("C:\\Slow");
    mocked().mockClear();
    expect(await s.reload()).toBeNull(); // deferred, no fsListDir call
    expect(mocked()).not.toHaveBeenCalled();
    mocked().mockResolvedValueOnce([entry("hidden-incl")]);
    slow.resolve([entry("slow")]);
    expect(await nav).toEqual({ status: "success", path: "C:\\Slow" });
    await tick();
    expect(mocked()).toHaveBeenCalledWith(expect.objectContaining({ path: "C:\\Slow" }));
    expect(s.currentPath).toBe("C:\\Slow");
  });

  it("MUST-106 (race table #8): a stale slow navigate does NOT defer reload once the latest navigate settled", async () => {
    const slowA = deferred<FsEntry[]>();
    const s = createFileListState();
    mocked().mockReturnValueOnce(slowA.promise).mockResolvedValueOnce([entry("b")]);
    const a = s.navigate("C:\\A");
    await s.navigate("C:\\B");
    mocked().mockResolvedValueOnce([entry("b2")]);
    expect(await s.reload()).toBe("C:\\B"); // immediate, A still pending
    slowA.resolve([entry("a")]);
    expect(await a).toEqual({ status: "stale" });
    expect(s.currentPath).toBe("C:\\B");
  });

  it("SHOULD-145: after a successful move, the deferred reload does not carry focusPath/clearSelection", async () => {
    const slow = deferred<FsEntry[]>();
    const s = createFileListState();
    mocked().mockReturnValueOnce(slow.promise);
    const nav = s.navigate("C:\\New");
    await s.reload({ focusPath: "C:\\Old\\x", clearSelection: true });
    mocked().mockResolvedValueOnce([entry("C:\\New\\n1"), entry("C:\\New\\n2")]);
    slow.resolve([entry("C:\\New\\n1"), entry("C:\\New\\n2")]);
    await nav;
    await tick();
    expect(s.entries[s.focusedIndex].path).toBe("C:\\New\\n1");
  });

  it("deferred reload after a FAILED navigate runs against the old path", async () => {
    const slow = deferred<FsEntry[]>();
    const s = createFileListState();
    mocked().mockResolvedValueOnce([entry("a")]);
    await s.navigate("C:\\old");
    mocked().mockReturnValueOnce(slow.promise);
    const nav = s.navigate("C:\\Bad");
    await s.reload();
    mocked().mockClear();
    mocked().mockResolvedValueOnce([entry("a")]);
    slow.reject(new FsListDirError("not_found", "x"));
    expect((await nav).status).toBe("failed");
    await tick();
    expect(mocked()).toHaveBeenCalledWith(expect.objectContaining({ path: "C:\\old" }));
  });
});

describe("MUST-105: loadIfNoNewerRequest / currentSequence", () => {
  it("currentSequence increases with every navigation request", async () => {
    const s = createFileListState();
    mocked().mockResolvedValue([]);
    const before = s.currentSequence();
    await s.navigate("C:\\a");
    expect(s.currentSequence()).toBeGreaterThan(before);
  });

  it("loads when no newer request was issued since sinceSeq", async () => {
    const s = createFileListState();
    mocked().mockResolvedValueOnce([]);
    const r = await s.loadIfNoNewerRequest("C:\\Home", s.currentSequence());
    expect(r).toEqual({ status: "success", path: "C:\\Home" });
  });

  it("returns stale WITHOUT calling fsListDir when another request started after sinceSeq", async () => {
    const s = createFileListState();
    const since = s.currentSequence();
    mocked().mockResolvedValueOnce([entry("user")]);
    await s.navigate("C:\\User");
    mocked().mockClear();
    expect(await s.loadIfNoNewerRequest("C:\\Home", since)).toEqual({ status: "stale" });
    expect(mocked()).not.toHaveBeenCalled();
    expect(s.currentPath).toBe("C:\\User");
  });
});
