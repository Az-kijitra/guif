import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0011 R-15-3 (app clipboard first, then the OS; an OS failure keeps the app content),
//   R-16 (cut writes MOVE), R-19-2 .. R-19-6 (source order, record, M-5, post-move), R-17 (get never throws),
//   CB-11 / SPEC-0300-0018 R-1040-1 (hasItems asks the OS EVERY time, probeOnly), AC-06-2, AC-06-5, AC-06-6,
//   AC-06-11, AC-1052-1 (pure part);
//   SPEC-0200-0001 §3.10.8 (createOsClipboardPort), §3.10.17.5 (afterMove (2): ONE setFiles with expectedSequence).
// The IPC is a fake; the app-internal clipboard is a local fake with the same ClipboardPort shape so
// these tests do not depend on createInternalClipboard's own implementation.

import type { ClipboardContent, ClipboardPort } from "./clipboard-port";
import { resolvePasteMode } from "./clipboard-mode";
import { createOsClipboardPort, type OsClipboardIpc } from "./os-clipboard-port";

const A = "C:\\w\\a.txt";
const B = "C:\\w\\b.txt";
const EXT = "D:\\ext\\x.txt";

function fakeInternal(log: string[] = []) {
  let content: ClipboardContent | null = null;
  const port = {
    set: vi.fn(async (v: ClipboardContent) => {
      log.push("internal.set");
      content = { paths: [...v.paths], origin: v.origin };
      return { os: "not-applicable" as const };
    }),
    get: vi.fn(async () => (content === null ? null : { paths: [...content.paths], origin: content.origin })),
    clear: vi.fn(async () => {
      log.push("internal.clear");
      content = null;
    }),
    hasItems: vi.fn(async () => content !== null && content.paths.length > 0),
    afterMove: vi.fn(async (failed: readonly string[]) => {
      if (failed.length === 0) content = null;
      else content = { paths: [...failed], origin: "internal-cut" };
    }),
  };
  return { port: port as unknown as ClipboardPort & typeof port, peek: () => content };
}

type Read = { state: "files" | "none" | "unavailable"; paths: string[]; sequence: number };

function fakeIpc(log: string[] = []) {
  const ipc = {
    setFiles: vi.fn(async (_p: string[], _e: "copy" | "move", _o?: { expectedSequence?: number }) => {
      log.push("ipc.setFiles");
      return { ok: true, sequence: 5 } as { ok: boolean; sequence: number; error?: string | null };
    }),
    getFiles: vi.fn(async (_probe: boolean) => ({ state: "none", paths: [], sequence: 5 }) as Read),
    clearIfUnchanged: vi.fn(async (_s: number) => true),
  };
  return ipc satisfies OsClipboardIpc;
}

function make(opts: { log?: string[] } = {}) {
  const log = opts.log ?? [];
  const internal = fakeInternal(log);
  const ipc = fakeIpc(log);
  const port = createOsClipboardPort({ internal: internal.port, ipc });
  return { port, internal, ipc, log };
}

const os = (state: Read["state"], sequence: number, paths: string[] = []): Read => ({ state, paths, sequence });

// ---------------------------------------------------------------------------
describe("set (R-15-3, R-16, CB-06)", () => {
  it("updates the app clipboard FIRST, then writes the OS (cut => move, copy => copy)", async () => {
    const t = make();
    await t.port.set({ paths: [A, B], origin: "internal-cut" });
    expect(t.log).toEqual(["internal.set", "ipc.setFiles"]);
    expect(t.ipc.setFiles.mock.calls[0].slice(0, 2)).toEqual([[A, B], "move"]);
    await t.port.set({ paths: [A], origin: "internal-copy" });
    expect(t.ipc.setFiles.mock.calls[1].slice(0, 2)).toEqual([[A], "copy"]);
  });

  it("a successful OS write => { os: 'written' }", async () => {
    const t = make();
    expect(await t.port.set({ paths: [A], origin: "internal-copy" })).toEqual({ os: "written" });
  });

  it("ok:false => { os: 'failed' } and the app content is kept (AC-06-6 first half)", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: false, sequence: 0, error: "cannot_open" });
    expect(await t.port.set({ paths: [A], origin: "internal-cut" })).toEqual({ os: "failed" });
    expect(t.internal.peek()).toEqual({ paths: [A], origin: "internal-cut" });
  });

  it("an IPC throw => { os: 'failed' }, never rejects, app content kept", async () => {
    const t = make();
    t.ipc.setFiles.mockRejectedValueOnce(new Error("ipc down"));
    await expect(t.port.set({ paths: [A], origin: "internal-copy" })).resolves.toEqual({ os: "failed" });
    expect(t.internal.peek()).toEqual({ paths: [A], origin: "internal-copy" });
  });

  it("a successful write records the (non-zero) sequence: a cut then pastes as a MOVE when the OS is unchanged (AC-06-5)", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 11 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("files", 11, [A]));
    const got = await t.port.get();
    expect(got).toEqual({ paths: [A], origin: "internal-cut" });
    expect(resolvePasteMode({ origin: got!.origin, paths: got!.paths })).toBe("move");
  });

  it("a FAILED write discards the previous record too (R-19-3): the next cut is copied with cut-write-failed", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 5 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.setFiles.mockResolvedValueOnce({ ok: false, sequence: 0, error: "rejected" });
    await t.port.set({ paths: [B], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("none", 5)); // would have matched the OLD record
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-copy", notice: "cut-write-failed" });
  });

  // SPEC-0300-0011 第9版 R-15-4 注記 / R-89-1 #20 / T-07 / AC-86 (unit-test-writer, 2026-10-07): the backend refuses to
  // write a list with a path that is not absolute (`error: "invalid_path"`). The front end treats it like every other
  // OS write failure (R-15-3 / CB-06): the app clipboard is kept, the caller is told the OS write failed.
  it("T-07: error 'invalid_path' => { os: 'failed' } and the app content is kept", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: false, sequence: 0, error: "invalid_path" });
    expect(await t.port.set({ paths: [A], origin: "internal-cut" })).toEqual({ os: "failed" });
    expect(t.internal.peek()).toEqual({ paths: [A], origin: "internal-cut" });
  });

  it("T-07: after an invalid_path write the next cut is pasted as a copy with cut-write-failed (like 'rejected')", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 5 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.setFiles.mockResolvedValueOnce({ ok: false, sequence: 0, error: "invalid_path" });
    await t.port.set({ paths: [B], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("none", 5));
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-copy", notice: "cut-write-failed" });
  });

  it("a record with sequence 0 (written, unknown) never matches: cut => copy + cut-changed", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 0 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("none", 0));
    expect(await t.port.get()).toEqual({ paths: [A], origin: "internal-copy", notice: "cut-changed" });
  });
});

// ---------------------------------------------------------------------------
describe("get (R-19-2, R-17, AC-06-2)", () => {
  it("asks the OS with probeOnly=false on every call", async () => {
    const t = make();
    await t.port.get();
    await t.port.get();
    expect(t.ipc.getFiles).toHaveBeenCalledTimes(2);
    expect(t.ipc.getFiles.mock.calls.every((c) => c[0] === false)).toBe(true);
  });

  it("OS files and an empty app clipboard => origin 'external' with exactly the OS paths", async () => {
    const t = make();
    t.ipc.getFiles.mockResolvedValue(os("files", 9, [EXT]));
    expect(await t.port.get()).toEqual({ paths: [EXT], origin: "external" });
  });

  it("an 'external' source resolves to a COPY through resolvePasteMode (R-19-1)", async () => {
    const t = make();
    t.ipc.getFiles.mockResolvedValue(os("files", 9, [EXT]));
    const got = (await t.port.get())!;
    expect(resolvePasteMode({ origin: got.origin, paths: got.paths })).toBe("copy");
  });

  it("neither OS nor app has anything => null", async () => {
    const t = make();
    expect(await t.port.get()).toBeNull();
  });

  it("OS has no files => the app clipboard (R-19-4 text-overwritten OS)", async () => {
    const t = make();
    await t.internal.port.set({ paths: [A], origin: "internal-copy" });
    t.ipc.getFiles.mockResolvedValue(os("none", 3));
    expect(await t.port.get()).toEqual({ paths: [A], origin: "internal-copy" });
  });

  it("an IPC throw degrades to 'unavailable, sequence 0': the app clipboard is used, never rejects (R-17)", async () => {
    const t = make();
    await t.internal.port.set({ paths: [A], origin: "internal-copy" });
    t.ipc.getFiles.mockRejectedValue(new Error("ipc down"));
    await expect(t.port.get()).resolves.toEqual({ paths: [A], origin: "internal-copy" });
  });

  it("an IPC throw with an app cut that has a record => copy + cut-changed (0 never matches)", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 5 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.getFiles.mockRejectedValue(new Error("ipc down"));
    expect(await t.port.get()).toEqual({ paths: [A], origin: "internal-copy", notice: "cut-changed" });
  });

  it("an IPC throw with nothing in the app => null", async () => {
    const t = make();
    t.ipc.getFiles.mockRejectedValue(new Error("x"));
    expect(await t.port.get()).toBeNull();
  });

  it("OS unavailable but the sequence equals the record => the app cut is still a move (G-11)", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 5 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("unavailable", 5));
    expect(await t.port.get()).toEqual({ paths: [A], origin: "internal-cut" });
  });

  it("pasting FROM the OS changes neither the app clipboard nor the record", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 5 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValueOnce(os("files", 6, [EXT]));
    expect((await t.port.get())!.origin).toBe("external");
    expect(t.internal.peek()).toEqual({ paths: [A], origin: "internal-cut" });
    expect(t.internal.port.set).toHaveBeenCalledTimes(1); // only the original set
    // the record is intact: when the OS is back at sequence 5 the cut is a move again
    t.ipc.getFiles.mockResolvedValueOnce(os("none", 5));
    expect(await t.port.get()).toEqual({ paths: [A], origin: "internal-cut" });
  });

  // AC-1052-1 (pure part): "パスのコピー" / viewer text copy / input Ctrl+C all change the OS sequence.
  it("AC-1052-1: after a cut, an OS change (text, new sequence) makes the paste a COPY with cut-changed", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 5 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("none", 9));
    const got = (await t.port.get())!;
    expect(got).toEqual({ paths: [A], origin: "internal-copy", notice: "cut-changed" });
    expect(resolvePasteMode({ origin: got.origin, paths: got.paths })).toBe("copy");
    // and the app clipboard is kept as it is (later pastes are copies too)
    expect(t.internal.peek()).toEqual({ paths: [A], origin: "internal-cut" });
  });
});

// ---------------------------------------------------------------------------
describe("hasItems (R-1040-1, CB-11, AC-1024-1)", () => {
  it.each([
    ["files", false, true],
    ["files", true, true],
    ["none", false, false],
    ["none", true, true],
  ] as const)("OS %s / app non-empty=%s => %s", async (state, appHas, expected) => {
    const t = make();
    if (appHas) await t.internal.port.set({ paths: [A], origin: "internal-copy" });
    t.ipc.getFiles.mockResolvedValue(os(state, 1));
    expect(await t.port.hasItems()).toBe(expected);
  });

  it.each([
    [false, false],
    [true, true],
  ])("an IPC throw falls back to the app clipboard alone (app non-empty=%s => %s)", async (appHas, expected) => {
    const t = make();
    if (appHas) await t.internal.port.set({ paths: [A], origin: "internal-copy" });
    t.ipc.getFiles.mockRejectedValue(new Error("ipc down"));
    expect(await t.port.hasItems()).toBe(expected);
  });

  it("uses probeOnly=true (no clipboard open) and asks the OS EVERY time, even when the app clipboard is non-empty", async () => {
    const t = make();
    await t.internal.port.set({ paths: [A], origin: "internal-copy" });
    await t.port.hasItems();
    await t.port.hasItems();
    expect(t.ipc.getFiles).toHaveBeenCalledTimes(2);
    expect(t.ipc.getFiles.mock.calls.every((c) => c[0] === true)).toBe(true);
  });

  it("never writes anything", async () => {
    const t = make();
    await t.port.hasItems();
    expect(t.ipc.setFiles).not.toHaveBeenCalled();
    expect(t.ipc.clearIfUnchanged).not.toHaveBeenCalled();
    expect(t.internal.port.set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("clear (M-5)", () => {
  it("empties the app clipboard and conditionally clears the OS with the record's sequence", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 7 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    await t.port.clear();
    expect(t.internal.peek()).toBeNull();
    expect(t.ipc.clearIfUnchanged).toHaveBeenCalledTimes(1);
    expect(t.ipc.clearIfUnchanged).toHaveBeenCalledWith(7);
  });

  it("discards the record: afterwards a cut written behind the port's back is never a move", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 7 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    await t.port.clear();
    await t.internal.port.set({ paths: [B], origin: "internal-cut" }); // app content without a record
    t.ipc.getFiles.mockResolvedValue(os("none", 7));
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-copy", notice: "cut-write-failed" });
  });

  it("does not touch the OS when there is no record or the record is 0", async () => {
    const none = make();
    await none.port.clear();
    expect(none.ipc.clearIfUnchanged).not.toHaveBeenCalled();
    const zero = make();
    zero.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 0 });
    await zero.port.set({ paths: [A], origin: "internal-cut" });
    await zero.port.clear();
    expect(zero.ipc.clearIfUnchanged).not.toHaveBeenCalled();
  });

  it("swallows an IPC failure silently (no notification)", async () => {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 7 });
    await t.port.set({ paths: [A], origin: "internal-cut" });
    t.ipc.clearIfUnchanged.mockRejectedValue(new Error("x"));
    await expect(t.port.clear()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("afterMove (R-19-6, AC-06-5, AC-06-11, MUST-121)", () => {
  async function cutWithRecord(sequence: number) {
    const t = make();
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence });
    await t.port.set({ paths: [A, B], origin: "internal-cut" });
    t.ipc.setFiles.mockClear();
    return t;
  }

  it("(1) all succeeded: app cleared, clearIfUnchanged(record) once, no setFiles, record dropped", async () => {
    const t = await cutWithRecord(7);
    await t.port.afterMove([]);
    expect(t.internal.peek()).toBeNull();
    expect(t.ipc.clearIfUnchanged).toHaveBeenCalledTimes(1);
    expect(t.ipc.clearIfUnchanged).toHaveBeenCalledWith(7);
    expect(t.ipc.setFiles).not.toHaveBeenCalled();
    await t.internal.port.set({ paths: [A], origin: "internal-cut" }); // record gone (M-5)
    t.ipc.getFiles.mockResolvedValue(os("none", 7));
    expect((await t.port.get())!.notice).toBe("cut-write-failed");
  });

  it("(1) a clearIfUnchanged result of false or a throw is ignored (no notification)", async () => {
    const f = await cutWithRecord(7);
    f.ipc.clearIfUnchanged.mockResolvedValue(false);
    await expect(f.port.afterMove([])).resolves.toBeUndefined();
    const th = await cutWithRecord(7);
    th.ipc.clearIfUnchanged.mockRejectedValue(new Error("x"));
    await expect(th.port.afterMove([])).resolves.toBeUndefined();
  });

  it("(1) record 0 or no record => the OS is not touched at all", async () => {
    const zero = await cutWithRecord(0);
    await zero.port.afterMove([]);
    expect(zero.ipc.clearIfUnchanged).not.toHaveBeenCalled();
    expect(zero.ipc.setFiles).not.toHaveBeenCalled();
    const none = make();
    await none.internal.port.set({ paths: [A], origin: "internal-cut" });
    await none.port.afterMove([]);
    expect(none.ipc.clearIfUnchanged).not.toHaveBeenCalled();
    expect(none.ipc.setFiles).not.toHaveBeenCalled();
  });

  it("(2) partial failure: app clipboard = the failed items as a cut; ONE setFiles(failed, 'move', { expectedSequence: record })", async () => {
    const t = await cutWithRecord(7);
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 9 });
    await t.port.afterMove([B]);
    expect(t.internal.peek()).toEqual({ paths: [B], origin: "internal-cut" });
    expect(t.ipc.setFiles).toHaveBeenCalledTimes(1);
    expect(t.ipc.setFiles).toHaveBeenCalledWith([B], "move", { expectedSequence: 7 });
    expect(t.ipc.clearIfUnchanged).not.toHaveBeenCalled(); // the old 2-step flow is gone
  });

  it("(2) ok => the record becomes the NEW sequence: a paste at 9 moves, at 7 is a copy with cut-changed", async () => {
    const t = await cutWithRecord(7);
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 9 });
    await t.port.afterMove([B]);
    t.ipc.getFiles.mockResolvedValue(os("files", 9, [B]));
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-cut" });
    t.ipc.getFiles.mockResolvedValue(os("none", 7));
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-copy", notice: "cut-changed" });
  });

  it("(2) 'changed' (the OS changed meanwhile): the OS is not touched and the record is KEPT", async () => {
    const t = await cutWithRecord(7);
    t.ipc.setFiles.mockResolvedValueOnce({ ok: false, sequence: 0, error: "changed" });
    await t.port.afterMove([B]);
    expect(t.internal.peek()).toEqual({ paths: [B], origin: "internal-cut" });
    // the OS really did change (sequence 8): the paste is a copy + CB-13
    t.ipc.getFiles.mockResolvedValue(os("none", 8));
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-copy", notice: "cut-changed" });
    // and the record (7) still counts if the OS is back at 7
    t.ipc.getFiles.mockResolvedValue(os("none", 7));
    expect(await t.port.get()).toEqual({ paths: [B], origin: "internal-cut" });
  });

  it.each([
    ["ok:false rejected", async (t: Awaited<ReturnType<typeof cutWithRecord>>) => t.ipc.setFiles.mockResolvedValueOnce({ ok: false, sequence: 0, error: "rejected" })],
    ["a throw", async (t: Awaited<ReturnType<typeof cutWithRecord>>) => t.ipc.setFiles.mockRejectedValueOnce(new Error("x"))],
  ])("(2) any other failure (%s) => the record is dropped, nothing is thrown or reported", async (_n, arrange) => {
    const t = await cutWithRecord(7);
    await arrange(t);
    await expect(t.port.afterMove([B])).resolves.toBeUndefined();
    t.ipc.getFiles.mockResolvedValue(os("none", 7));
    expect((await t.port.get())!.notice).toBe("cut-write-failed");
  });

  it("(2) no record or record 0 => no IPC call at all, the app clipboard still shrinks", async () => {
    const none = make();
    await none.internal.port.set({ paths: [A, B], origin: "internal-cut" });
    await none.port.afterMove([B]);
    expect(none.internal.peek()).toEqual({ paths: [B], origin: "internal-cut" });
    expect(none.ipc.setFiles).not.toHaveBeenCalled();
    expect(none.ipc.clearIfUnchanged).not.toHaveBeenCalled();

    const zero = await cutWithRecord(0);
    await zero.port.afterMove([B]);
    expect(zero.ipc.setFiles).not.toHaveBeenCalled();
    expect(zero.ipc.clearIfUnchanged).not.toHaveBeenCalled();
  });

  it("makes exactly ONE IPC call per afterMove in every branch", async () => {
    const t = await cutWithRecord(7);
    t.ipc.setFiles.mockResolvedValueOnce({ ok: true, sequence: 9 });
    await t.port.afterMove([B]);
    expect(t.ipc.setFiles.mock.calls.length + t.ipc.clearIfUnchanged.mock.calls.length).toBe(1);
    const u = await cutWithRecord(7);
    await u.port.afterMove([]);
    expect(u.ipc.setFiles.mock.calls.length + u.ipc.clearIfUnchanged.mock.calls.length).toBe(1);
  });
});
