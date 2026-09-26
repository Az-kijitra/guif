import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0011 R-10/R-10-1/R-11/R-12 (targets; MUST-61: only what is
//   displayed), R-19/R-19-1 (only an internal cut moves), R-25, R-30~R-35
//   (conflict dialog: overwrite/skip/cancel, default = cancel, apply-to-all
//   default ON), R-36, R-40~R-45 (progress only for copy/move; cancel by
//   operation id), R-48, R-53~R-56-4 (delete confirm; Shift = permanent),
//   R-60~R-64 (rename), R-70~R-78 (create), R-80/R-81/R-82 (failures),
//   R-84 (translated inline errors), AC-02/AC-02-1/AC-03, AC-13~AC-15,
//   AC-20~AC-29, AC-30, AC-32, AC-35, AC-40, AC-42/AC-43, AC-46-x, AC-48-x,
//   AC-52~AC-56, AC-61.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.4
//   (controller flows), §3.3.6 (reload/focus/selection defaults; file
//   operations never go through afterUserNavigation), §3.3.13-5
//   (MUST-63/SHOULD-83: try/catch/finally around the WHOLE async flow, busy
//   released in finally, unlisten/handle tolerate being uninitialised),
//   §3.3.13-1 (subscribe BEFORE invoke), §3.3.13-3 (targets = displayed
//   entries), §3.3.13-7 SHOULD-80 (fsOpsRename returns the new full path),
//   MUST-60 (reload accepts { focusPath, clearSelection }), §3.3.14-1
//   (承認B見送り: internal clipboard only).
// Module under test (not yet implemented): ./file-ops-controller.ts
//   `createFileOpsController(deps)` -> { handleAction(action, event): boolean }
//
// All dependencies are injected fakes (no DOM, no Tauri, no other feature).
// Assumptions beyond the design text are documented in the handback report:
//   - failure list = modal.confirm with exactly ONE button (+ lines/note),
//     since §3.3.13-4 folded the list dialog into confirm;
//   - ClipboardPort methods are async (set/get/clear);
//   - ipc.detectConflicts resolves [{ path: <source path>, name }];
//   - ipc.rename rejects with the bare backend error code string
//     (fs_ops/commands.rs::mutate_error_code), resolves with the new path;
//   - forms are located by field type (text/select); values are keyed by the
//     field ids found on the spec.

import { createFileOpsController } from "./file-ops-controller";
import { translateErrorCode } from "./error-format";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const DIR = "C:\\dir";
const p = (n: string) => `${DIR}\\${n}`;
const ENTRIES = ["a.txt", "b.txt", "c.txt", "d.txt", "report.txt", "sub"].map((name) => ({ name, path: p(name) }));

type Summary = { ok: number; failed: number; total: number; skipped: number; failures: { path: string; code: string; message: string }[] };
const okSummary = (n: number, extra: Partial<Summary> = {}): Summary => ({ ok: n, failed: 0, total: n, skipped: 0, failures: [], ...extra });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface HarnessOptions {
  selected?: string[];
  focusedPath?: string | null;
  clipboard?: { paths: string[]; origin: "internal-copy" | "internal-cut" | "external" } | null;
  conflicts?: { path: string; name: string }[];
  confirmAnswers?: { buttonId: string; checked: boolean }[];
}

function makeHarness(opts: HarnessOptions = {}) {
  const log: string[] = [];
  let progressHandler: ((e: unknown) => void) | undefined;
  const unlisten = vi.fn(() => {
    log.push("unlisten");
  });
  const handle = {
    update: vi.fn(),
    close: vi.fn(() => {
      log.push("close");
    }),
  };
  const confirmAnswers = [...(opts.confirmAnswers ?? [])];
  let clipboardState = opts.clipboard ?? null;
  let formResolve: ((v: "submitted" | "cancelled") => void) | undefined;

  const ipc = {
    detectConflicts: vi.fn(async (..._a: unknown[]) => {
      log.push("detect");
      return opts.conflicts ?? [];
    }),
    copy: vi.fn(async (_id: string, items: string[], ..._rest: unknown[]) => {
      log.push("copy");
      return okSummary(items.length);
    }),
    move: vi.fn(async (_id: string, items: string[], ..._rest: unknown[]) => {
      log.push("move");
      return okSummary(items.length);
    }),
    cancel: vi.fn(async (_id: string) => {}),
    deleteTrash: vi.fn(async (paths: string[]) => okSummary(paths.length)),
    deletePermanently: vi.fn(async (paths: string[]) => okSummary(paths.length)),
    rename: vi.fn(async (path: string, newName: string) => `${path.slice(0, path.lastIndexOf("\\"))}\\${newName}`),
    create: vi.fn(async (..._a: unknown[]) => {}),
    listenProgress: vi.fn(async (_id: string, onEvent: (e: unknown) => void) => {
      log.push("listen");
      progressHandler = onEvent;
      return unlisten;
    }),
    newOperationId: vi.fn(() => "op-1"),
  };

  const modal = {
    confirm: vi.fn(async (_spec: Record<string, any>) => {
      log.push("confirm");
      return confirmAnswers.shift() ?? { buttonId: "cancel", checked: false };
    }),
    form: vi.fn((_spec: Record<string, any>) => {
      log.push("form");
      return new Promise<"submitted" | "cancelled">((res) => {
        formResolve = res;
      });
    }),
    showProgress: vi.fn((_spec: Record<string, any>) => {
      log.push("showProgress");
      return handle;
    }),
  };

  const status = { show: vi.fn() };
  const clipboard = {
    set: vi.fn(async (v: { paths: string[]; origin: "internal-copy" | "internal-cut" }) => {
      clipboardState = { paths: [...v.paths], origin: v.origin };
    }),
    get: vi.fn(async () => clipboardState),
    clear: vi.fn(async () => {
      clipboardState = null;
    }),
  };
  const reload = vi.fn(async (_o?: { focusPath?: string; clearSelection?: boolean }) => null as string | null);

  const ctxState = {
    currentPath: DIR,
    entries: ENTRIES,
    selected: opts.selected ?? [],
    focusedPath: opts.focusedPath ?? null,
  };

  const controller = createFileOpsController({
    ipc,
    modal,
    status,
    clipboard,
    context: () => ({ ...ctxState }),
    reload,
  } as never);

  async function run(action: string, event = { shiftKey: false }) {
    const r = (controller.handleAction as (a: string, e: { shiftKey: boolean }) => boolean)(action, event);
    await flush();
    return r;
  }

  return {
    log,
    ipc,
    modal,
    status,
    clipboard,
    reload,
    unlisten,
    handle,
    controller,
    ctxState,
    run,
    emit: (e: unknown) => progressHandler?.(e),
    resolveForm: (v: "submitted" | "cancelled") => formResolve?.(v),
    formSpec: () => modal.form.mock.calls[modal.form.mock.calls.length - 1][0] as Record<string, any>,
    confirmSpec: (i = 0) => modal.confirm.mock.calls[i][0] as Record<string, any>,
  };
}

// ---------------------------------------------------------------------------
describe("handleAction contract", () => {
  it.each(["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"])(
    "%s is consumed (returns true) so the key event is preventDefault-ed",
    async (action) => {
      const h = makeHarness({ selected: [p("a.txt")], clipboard: { paths: [p("a.txt")], origin: "internal-copy" } });
      expect(await h.run(action)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
describe("copy / cut (R-10, R-15-1, R-17; AC-01~AC-03)", () => {
  it("AC-01: copy with a multi-selection stores every selected path as internal-copy", async () => {
    const h = makeHarness({ selected: [p("a.txt"), p("b.txt")] });
    await h.run("copy");
    expect(h.clipboard.set).toHaveBeenCalledWith({ paths: [p("a.txt"), p("b.txt")], origin: "internal-copy" });
  });

  it("AC-02: with no selection, the focused entry is the single target", async () => {
    const h = makeHarness({ focusedPath: p("c.txt") });
    await h.run("copy");
    expect(h.clipboard.set).toHaveBeenCalledWith({ paths: [p("c.txt")], origin: "internal-copy" });
  });

  it("cut stores origin internal-cut", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("cut");
    expect(h.clipboard.set).toHaveBeenCalledWith({ paths: [p("a.txt")], origin: "internal-cut" });
  });

  it("AC-03: nothing selected and nothing focused => status only, no dialog, no clipboard write", async () => {
    const h = makeHarness();
    await h.run("copy");
    await h.run("cut");
    expect(h.status.show).toHaveBeenCalledWith("選択がありません");
    expect(h.clipboard.set).not.toHaveBeenCalled();
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.modal.form).not.toHaveBeenCalled();
  });

  it("copy/cut do not change the listing, so they do not reload", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("copy");
    await h.run("cut");
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("a clipboard write failure is reported (not swallowed) and does not wedge later actions", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    h.clipboard.set.mockRejectedValueOnce(new Error("clipboard busy"));
    await h.run("copy");
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("clipboard busy"));
    h.status.show.mockClear();
    await h.run("copy");
    expect(h.clipboard.set).toHaveBeenCalledTimes(2);
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });
});

// ---------------------------------------------------------------------------
describe("paste: no conflicts (R-13, R-19, R-32; AC-01, AC-13)", () => {
  const src = [p("a.txt"), p("b.txt")];

  it("an empty clipboard shows a status and calls no IPC", async () => {
    const h = makeHarness({ clipboard: null });
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalled();
    expect(h.ipc.detectConflicts).not.toHaveBeenCalled();
    expect(h.ipc.copy).not.toHaveBeenCalled();
  });

  it("copy origin: detects conflicts against the current directory first, then copies with resolution 'reject' and an empty itemResolutions", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    await h.run("paste");
    expect(h.ipc.detectConflicts).toHaveBeenCalledWith(src, DIR);
    expect(h.modal.confirm).not.toHaveBeenCalled(); // no conflict => no dialog
    expect(h.ipc.copy).toHaveBeenCalledTimes(1);
    const [id, items, dest, resolution, itemRes] = h.ipc.copy.mock.calls[0] as unknown as [string, string[], string, string, unknown];
    expect([id, items, dest, resolution]).toEqual(["op-1", src, DIR, "reject"]);
    expect(itemRes ?? {}).toEqual({});
    expect(h.ipc.move).not.toHaveBeenCalled();
  });

  it("detectConflicts runs before anything else (before the operation id, subscription and progress dialog)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    await h.run("paste");
    expect(h.log.indexOf("detect")).toBeLessThan(h.log.indexOf("listen"));
    expect(h.log.indexOf("detect")).toBeLessThan(h.log.indexOf("showProgress"));
  });

  it("R-19: internal-cut origin moves (ipc.move), not copies", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-cut" } });
    await h.run("paste");
    expect(h.ipc.move).toHaveBeenCalledTimes(1);
    expect(h.ipc.copy).not.toHaveBeenCalled();
    expect(h.ipc.move.mock.calls[0].slice(0, 4)).toEqual(["op-1", src, DIR, "reject"]);
  });

  it("R-19-1: an external origin is ALWAYS a copy", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "external" } });
    await h.run("paste");
    expect(h.ipc.copy).toHaveBeenCalledTimes(1);
    expect(h.ipc.move).not.toHaveBeenCalled();
  });

  it("MUST-60: after the batch the listing is reloaded with clearSelection: true (selection is cleared after paste)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    await h.run("paste");
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
  });

  it("§3.3.4 step 6: a successful move clears the internal cut clipboard; a copy keeps the clipboard", async () => {
    const moved = makeHarness({ clipboard: { paths: src, origin: "internal-cut" } });
    await moved.run("paste");
    expect(moved.clipboard.clear).toHaveBeenCalledTimes(1);

    const copied = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    await copied.run("paste");
    expect(copied.clipboard.clear).not.toHaveBeenCalled();
  });

  it("a move in which nothing succeeded (ok = 0) does not clear the clipboard", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-cut" } });
    h.ipc.move.mockResolvedValueOnce({
      ok: 0,
      failed: 2,
      total: 2,
      skipped: 0,
      failures: [
        { path: src[0], code: "io_error", message: "x" },
        { path: src[1], code: "io_error", message: "y" },
      ],
    });
    await h.run("paste");
    expect(h.clipboard.clear).not.toHaveBeenCalled();
  });

  it("minor 6: a partially failed cut keeps only the failed items on the clipboard (all-success clears)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-cut" } });
    h.ipc.move.mockResolvedValueOnce({
      ok: 1,
      failed: 1,
      total: 2,
      skipped: 0,
      failures: [{ path: src[1], code: "io_error", message: "y" }],
    });
    await h.run("paste");
    expect(h.clipboard.clear).not.toHaveBeenCalled();
    expect(h.clipboard.set).toHaveBeenCalledWith({ paths: [src[1]], origin: "internal-cut" });
  });

  it("minor 5: a rejected paste invoke still reloads the listing", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockRejectedValueOnce(new Error("backend blew up"));
    await h.run("paste");
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("backend blew up"));
  });

  it("success status mentions the count (AC-14 style) and file operations never record a visit (reload only)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("2"));
    // reload is the only navigation-like effect; its argument carries no path change.
    expect(h.reload.mock.calls[0][0]).not.toHaveProperty("path");
  });
});

// ---------------------------------------------------------------------------
describe("paste: conflict dialog (R-31, R-33, R-34, R-34-1, R-35; AC-20~AC-28, AC-22, AC-30)", () => {
  const src = [p("a.txt"), p("b.txt"), p("c.txt")];
  const conflicts = [
    { path: src[0], name: "a.txt" },
    { path: src[1], name: "b.txt" },
  ];

  it("the dialog offers overwrite / skip / cancel in that order, defaults to cancel (AC-30), and starts with apply-to-all checked (R-34-1)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts, confirmAnswers: [{ buttonId: "cancel", checked: true }] });
    await h.run("paste");
    const spec = h.confirmSpec(0);
    expect(spec.buttons.map((b: { id: string }) => b.id)).toEqual(["overwrite", "skip", "cancel"]);
    expect(spec.defaultButtonId).toBe("cancel");
    expect(spec.cancelButtonId).toBe("cancel");
    expect(spec.checkbox?.checked).toBe(true);
    expect(spec.lines.join("\n")).toContain("a.txt");
  });

  it("apply-to-all ON + overwrite: ONE dialog, every conflict resolved 'overwrite', passed as itemResolutions keyed by source path", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts, confirmAnswers: [{ buttonId: "overwrite", checked: true }] });
    await h.run("paste");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    const call = h.ipc.copy.mock.calls[0] as unknown as unknown[];
    expect(call[3]).toBe("reject");
    expect(call[4]).toEqual({ [src[0]]: "overwrite", [src[1]]: "overwrite" });
  });

  it("apply-to-all OFF: one dialog per conflicting item (R-34), each answer recorded separately (AC-27)", async () => {
    const h = makeHarness({
      clipboard: { paths: src, origin: "internal-copy" },
      conflicts,
      confirmAnswers: [
        { buttonId: "skip", checked: false },
        { buttonId: "overwrite", checked: false },
      ],
    });
    await h.run("paste");
    expect(h.modal.confirm).toHaveBeenCalledTimes(2);
    expect(h.confirmSpec(0).lines.join("\n")).toContain("a.txt");
    expect(h.confirmSpec(1).lines.join("\n")).toContain("b.txt");
    expect((h.ipc.copy.mock.calls[0] as unknown as unknown[])[4]).toEqual({ [src[0]]: "skip", [src[1]]: "overwrite" });
  });

  it("apply-to-all ON + skip: all conflicts resolved 'skip'", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts, confirmAnswers: [{ buttonId: "skip", checked: true }] });
    await h.run("paste");
    expect((h.ipc.copy.mock.calls[0] as unknown as unknown[])[4]).toEqual({ [src[0]]: "skip", [src[1]]: "skip" });
  });

  it("AC-22: cancel on the dialog aborts the whole batch — no operation id, no subscription, no progress dialog, no copy/move IPC", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts, confirmAnswers: [{ buttonId: "cancel", checked: true }] });
    await h.run("paste");
    expect(h.ipc.copy).not.toHaveBeenCalled();
    expect(h.ipc.move).not.toHaveBeenCalled();
    expect(h.ipc.listenProgress).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.clipboard.clear).not.toHaveBeenCalled();
  });

  it("cancel on a LATER per-item dialog also aborts everything (earlier answers are discarded)", async () => {
    const h = makeHarness({
      clipboard: { paths: src, origin: "internal-cut" },
      conflicts,
      confirmAnswers: [
        { buttonId: "overwrite", checked: false },
        { buttonId: "cancel", checked: false },
      ],
    });
    await h.run("paste");
    expect(h.ipc.move).not.toHaveBeenCalled();
    expect(h.clipboard.clear).not.toHaveBeenCalled();
  });

  it("after a canceled paste the controller is not stuck busy", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts, confirmAnswers: [{ buttonId: "cancel", checked: true }] });
    await h.run("paste");
    h.status.show.mockClear();
    await h.run("paste"); // second attempt: dialog (default answer cancel) opens again, no busy message
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
    expect(h.modal.confirm).toHaveBeenCalledTimes(2);
  });

  it("only the top-level conflicting items are asked about; non-conflicting sources are not (R-32, §3.3.14-2)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts: [conflicts[0]], confirmAnswers: [{ buttonId: "overwrite", checked: true }] });
    await h.run("paste");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    expect((h.ipc.copy.mock.calls[0] as unknown as unknown[])[4]).toEqual({ [src[0]]: "overwrite" });
  });
});

// ---------------------------------------------------------------------------
describe("paste: progress subscription order and cleanup (§3.3.4 step 4, §3.3.13-5; R-40~R-43, AC-31~AC-34)", () => {
  const src = [p("a.txt"), p("b.txt")];

  it("subscribes to progress BEFORE showing the dialog and BEFORE invoking, then unlisten -> close in the finally", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    await h.run("paste");
    expect(h.ipc.listenProgress).toHaveBeenCalledWith("op-1", expect.any(Function));
    const order = h.log.filter((e) => ["listen", "showProgress", "copy", "unlisten", "close"].includes(e));
    expect(order).toEqual(["listen", "showProgress", "copy", "unlisten", "close"]);
  });

  it("the move path has the same order", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-cut" } });
    await h.run("paste");
    const order = h.log.filter((e) => ["listen", "showProgress", "move", "unlisten", "close"].includes(e));
    expect(order).toEqual(["listen", "showProgress", "move", "unlisten", "close"]);
  });

  it("progress events are folded into handle.update({ label, index, total }) (R-40/R-41)", async () => {
    const gate = deferred<Summary>();
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockImplementationOnce(async () => gate.promise);
    await h.run("paste");
    h.emit({ operationId: "op-1", type: "start", name: "a.txt", index: 1, total: 2 });
    expect(h.handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1, total: 2, label: expect.stringContaining("a.txt") }));
    h.emit({ operationId: "op-1", type: "done", name: "a.txt", index: 1, total: 2 });
    h.emit({ operationId: "op-1", type: "start", name: "b.txt", index: 2, total: 2 });
    expect(h.handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ index: 2, total: 2, label: expect.stringContaining("b.txt") }));
    gate.resolve(okSummary(2));
    await flush();
  });

  it("the progress dialog's onCancel sends ipc.cancel(operationId) (R-43)", async () => {
    const gate = deferred<Summary>();
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockImplementationOnce(async () => gate.promise);
    await h.run("paste");
    const spec = h.modal.showProgress.mock.calls[0][0];
    expect(typeof spec.title).toBe("string");
    expect(typeof spec.cancelLabel).toBe("string");
    spec.onCancel();
    expect(h.ipc.cancel).toHaveBeenCalledTimes(1);
    expect(h.ipc.cancel).toHaveBeenCalledWith("op-1");
    gate.resolve(okSummary(0));
    await flush();
  });

  it("a rejected invoke after the dialog is shown: unlisten and close still run (in that order), the error is reported, busy is released", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockRejectedValueOnce(new Error("backend blew up"));
    await h.run("paste");
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    expect(h.handle.close).toHaveBeenCalledTimes(1);
    const order = h.log.filter((e) => e === "unlisten" || e === "close");
    expect(order).toEqual(["unlisten", "close"]);
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("backend blew up"));
    h.status.show.mockClear();
    await h.run("copy"); // not busy any more
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });

  it("listenProgress itself failing (e.g. ACL): no dialog, no invoke, error reported, nothing dangling, busy released", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.listenProgress.mockRejectedValueOnce(new Error("not allowed by ACL"));
    await h.run("paste");
    expect(h.ipc.copy).not.toHaveBeenCalled();
    expect(h.unlisten).not.toHaveBeenCalled();
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("not allowed by ACL"));
    h.status.show.mockClear();
    await h.run("paste");
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
    expect(h.ipc.listenProgress).toHaveBeenCalledTimes(2);
  });

  it("detectConflicts rejecting is reported and releases busy (the whole async flow is wrapped)", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.detectConflicts.mockRejectedValueOnce("destination_not_found");
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalled();
    expect(h.ipc.copy).not.toHaveBeenCalled();
    h.status.show.mockClear();
    await h.run("paste");
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });

  it("a throwing conflict dialog (modal failure) is also caught and releases busy", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, conflicts: [{ path: src[0], name: "a.txt" }] });
    h.modal.confirm.mockRejectedValueOnce(new Error("modal exploded"));
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("modal exploded"));
    h.status.show.mockClear();
    await h.run("copy");
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });
});

// ---------------------------------------------------------------------------
describe("paste: result reporting (R-25, R-44, R-80, R-81; AC-14, AC-33, AC-36~AC-39)", () => {
  const src = [p("a.txt"), p("b.txt"), p("c.txt")];

  it("only-canceled failures => a 'canceled' status (with the completed count) and NO failure list", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockResolvedValueOnce({
      ok: 1,
      failed: 2,
      total: 3,
      skipped: 0,
      failures: [
        { path: src[1], code: "canceled", message: "canceled" },
        { path: src[2], code: "canceled", message: "canceled" },
      ],
    });
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("キャンセル"));
    expect(h.modal.confirm).not.toHaveBeenCalled(); // no failure list
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
  });

  it("real failures => a failure list dialog (a confirm with one button) with each file name; the listing is still reloaded", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockResolvedValueOnce({
      ok: 2,
      failed: 1,
      total: 3,
      skipped: 0,
      failures: [{ path: src[2], code: "permission_denied", message: "denied" }],
    });
    await h.run("paste");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    const spec = h.confirmSpec(0);
    expect(spec.buttons).toHaveLength(1);
    expect(spec.lines.join("\n")).toContain("c.txt");
    expect(spec.lines.join("\n")).toContain(translateErrorCode("permission_denied")!);
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
  });

  it("R-81: more than 5 failures show 5 lines plus an ellipsis note", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    const failures = ["a", "b", "c", "d", "e", "f", "g"].map((n) => ({ path: p(`${n}.txt`), code: "io_error", message: n }));
    h.ipc.copy.mockResolvedValueOnce({ ok: 0, failed: 7, total: 7, skipped: 0, failures });
    await h.run("paste");
    const spec = h.confirmSpec(0);
    expect(spec.lines).toHaveLength(5);
    expect(spec.note).toBeDefined();
  });

  it("R-25/AC-14: skipped items are reflected in the success status", async () => {
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" } });
    h.ipc.copy.mockResolvedValueOnce(okSummary(1, { total: 3, skipped: 2 }));
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("スキップ"));
  });
});

// ---------------------------------------------------------------------------
describe("busy guard (§3.3.4, §3.3.13-5)", () => {
  const src = [p("a.txt")];

  it("a second file operation during an in-flight paste is refused with a status message and consumed (true)", async () => {
    const gate = deferred<Summary>();
    const h = makeHarness({ clipboard: { paths: src, origin: "internal-copy" }, selected: [p("b.txt")] });
    h.ipc.copy.mockImplementationOnce(async () => gate.promise);
    await h.run("paste");
    const consumed = await h.run("delete");
    expect(consumed).toBe(true);
    expect(h.status.show).toHaveBeenCalledWith("別のファイル操作を実行中です");
    expect(h.modal.confirm).not.toHaveBeenCalled(); // the delete confirm never opened
    gate.resolve(okSummary(1));
    await flush();
    h.status.show.mockClear();
    await h.run("copy");
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });

  it("busy also covers the wait for a dialog (a pending delete confirm blocks a new paste)", async () => {
    const gate = deferred<{ buttonId: string; checked: boolean }>();
    const h = makeHarness({ selected: [p("a.txt")], clipboard: { paths: src, origin: "internal-copy" } });
    h.modal.confirm.mockImplementationOnce(async () => gate.promise);
    await h.run("delete");
    await h.run("paste");
    expect(h.status.show).toHaveBeenCalledWith("別のファイル操作を実行中です");
    expect(h.ipc.detectConflicts).not.toHaveBeenCalled();
    gate.resolve({ buttonId: "cancel", checked: false });
    await flush();
  });

  it("a pending rename form blocks a new action too, and a cancelled form releases busy", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("rename");
    await h.run("delete");
    expect(h.status.show).toHaveBeenCalledWith("別のファイル操作を実行中です");
    h.resolveForm("cancelled");
    await flush();
    h.status.show.mockClear();
    await h.run("copy");
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });
});

// ---------------------------------------------------------------------------
describe("delete (R-11, R-53~R-56-4, R-45, R-82; AC-35, AC-37, AC-40, AC-42, AC-43, AC-46-x)", () => {
  it("AC-02-1/R-10-1: no targets => status only, NO confirm dialog, no IPC", async () => {
    const h = makeHarness({ selected: [], focusedPath: null });
    await h.run("delete");
    expect(h.status.show).toHaveBeenCalled();
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.ipc.deleteTrash).not.toHaveBeenCalled();
    expect(h.ipc.deletePermanently).not.toHaveBeenCalled();
  });

  it("R-55/AC-40: trash confirm has delete/cancel buttons, default and Escape target = cancel, not 'danger'", async () => {
    const h = makeHarness({ selected: [p("a.txt")], confirmAnswers: [{ buttonId: "cancel", checked: false }] });
    await h.run("delete");
    const spec = h.confirmSpec(0);
    expect(spec.buttons.map((b: { id: string }) => b.id)).toEqual(["delete", "cancel"]);
    expect(spec.defaultButtonId).toBe("cancel");
    expect(spec.cancelButtonId).toBe("cancel");
    expect(spec.tone).not.toBe("danger");
  });

  it("R-54/AC-42: a single target shows its name", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("delete");
    expect(h.confirmSpec(0).lines.join("\n")).toContain("a.txt");
  });

  it("R-54/AC-43: 4 targets show the count and the first 3 names with an ellipsis, not the 4th name", async () => {
    const h = makeHarness({ selected: [p("a.txt"), p("b.txt"), p("c.txt"), p("d.txt")] });
    await h.run("delete");
    const text = h.confirmSpec(0).lines.join("\n");
    expect(text).toContain("a.txt");
    expect(text).toContain("b.txt");
    expect(text).toContain("c.txt");
    expect(text).not.toContain("d.txt");
    expect(text).toContain("4");
    expect(text).toMatch(/…|\.\.\./);
  });

  it("R-56/R-56-4 (plain Delete): 'delete' => ipc.deleteTrash(paths); never permanent; no progress dialog or subscription (R-45/AC-35)", async () => {
    const h = makeHarness({ selected: [p("a.txt"), p("b.txt")], confirmAnswers: [{ buttonId: "delete", checked: false }] });
    await h.run("delete", { shiftKey: false });
    expect(h.ipc.deleteTrash).toHaveBeenCalledWith([p("a.txt"), p("b.txt")]);
    expect(h.ipc.deletePermanently).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.ipc.listenProgress).not.toHaveBeenCalled();
  });

  it("R-56-4 (Shift+Delete): permanent confirm is marked danger and says it cannot be undone; 'delete' => ipc.deletePermanently", async () => {
    const h = makeHarness({ selected: [p("a.txt")], confirmAnswers: [{ buttonId: "delete", checked: false }] });
    await h.run("delete", { shiftKey: true });
    const spec = h.confirmSpec(0);
    expect(spec.tone).toBe("danger");
    expect(spec.lines.join("\n")).toContain("取り消せません");
    expect(spec.defaultButtonId).toBe("cancel"); // R-55 also for permanent delete
    expect(h.ipc.deletePermanently).toHaveBeenCalledWith([p("a.txt")]);
    expect(h.ipc.deleteTrash).not.toHaveBeenCalled();
  });

  it("R-56-1: trash and permanent confirms are distinguishable (different text)", async () => {
    const t = makeHarness({ selected: [p("a.txt")] });
    await t.run("delete", { shiftKey: false });
    const perm = makeHarness({ selected: [p("a.txt")] });
    await perm.run("delete", { shiftKey: true });
    expect(t.confirmSpec(0).lines.join("\n")).not.toBe(perm.confirmSpec(0).lines.join("\n"));
  });

  it("cancel (or Escape => cancelButtonId) performs no deletion and no reload", async () => {
    const h = makeHarness({ selected: [p("a.txt")], confirmAnswers: [{ buttonId: "cancel", checked: false }] });
    await h.run("delete");
    expect(h.ipc.deleteTrash).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("MUST-60: after deleting, reload({ clearSelection: true })", async () => {
    const h = makeHarness({ selected: [p("a.txt")], confirmAnswers: [{ buttonId: "delete", checked: false }] });
    await h.run("delete");
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
  });

  it("focused-only target: with no selection the focused entry is deleted", async () => {
    const h = makeHarness({ focusedPath: p("c.txt"), confirmAnswers: [{ buttonId: "delete", checked: false }] });
    await h.run("delete");
    expect(h.ipc.deleteTrash).toHaveBeenCalledWith([p("c.txt")]);
  });

  it("R-80/R-82: delete failures are shown as a failure list after the run, and the listing is still reloaded", async () => {
    const h = makeHarness({ selected: [p("a.txt"), p("b.txt")], confirmAnswers: [{ buttonId: "delete", checked: false }] });
    h.ipc.deleteTrash.mockResolvedValueOnce({
      ok: 1,
      failed: 1,
      total: 2,
      skipped: 0,
      failures: [{ path: p("b.txt"), code: "permission_denied", message: "denied" }],
    });
    await h.run("delete");
    expect(h.modal.confirm).toHaveBeenCalledTimes(2); // confirmation + failure list
    const list = h.confirmSpec(1);
    expect(list.buttons).toHaveLength(1);
    expect(list.lines.join("\n")).toContain("b.txt");
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ clearSelection: true }));
  });

  it("a rejected delete IPC is reported to the status line and does not wedge busy", async () => {
    const h = makeHarness({ selected: [p("a.txt")], confirmAnswers: [{ buttonId: "delete", checked: false }] });
    h.ipc.deleteTrash.mockRejectedValueOnce(new Error("trash unavailable"));
    await h.run("delete");
    expect(h.status.show).toHaveBeenCalledWith(expect.stringContaining("trash unavailable"));
    h.status.show.mockClear();
    await h.run("copy");
    expect(h.status.show).not.toHaveBeenCalledWith("別のファイル操作を実行中です");
  });
});

// ---------------------------------------------------------------------------
describe("rename (R-12, R-36, R-60~R-64; AC-48-1/-2, AC-50, AC-52~AC-56)", () => {
  it("R-12/AC-50: a multi-selection has no rename target => nothing opens, status shown", async () => {
    const h = makeHarness({ selected: [p("a.txt"), p("b.txt")] });
    await h.run("rename");
    expect(h.modal.form).not.toHaveBeenCalled();
    expect(h.status.show).toHaveBeenCalled();
  });

  it("nothing selected and nothing focused => nothing opens", async () => {
    const h = makeHarness();
    await h.run("rename");
    expect(h.modal.form).not.toHaveBeenCalled();
    expect(h.status.show).toHaveBeenCalled();
  });

  it("R-60-1/AC-48-1: the form has one text field preset with the current name and the stem selected", async () => {
    const h = makeHarness({ selected: [p("report.txt")] });
    await h.run("rename");
    const spec = h.formSpec();
    expect(spec.fields).toHaveLength(1);
    expect(spec.fields[0].type).toBe("text");
    expect(spec.fields[0].value).toBe("report.txt");
    expect(spec.fields[0].selection).toEqual([0, 6]);
    h.resolveForm("cancelled");
  });

  it("R-60-1/AC-48-2: a name without extension (a folder) is selected entirely", async () => {
    const h = makeHarness({ focusedPath: p("sub") });
    await h.run("rename");
    expect(h.formSpec().fields[0].selection).toEqual([0, 3]);
    h.resolveForm("cancelled");
  });

  it("R-62-1/AC-52: a blank name is rejected inline WITHOUT calling the backend", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("rename");
    const spec = h.formSpec();
    const id = spec.fields[0].id;
    const result = await spec.onSubmit({ [id]: "   " });
    expect(result).toBe("名前を入力してください");
    expect(h.ipc.rename).not.toHaveBeenCalled();
    h.resolveForm("cancelled");
  });

  it("R-62-1: forbidden characters are NOT checked on the frontend — the backend result decides (AC-53~AC-55)", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    h.ipc.rename.mockRejectedValueOnce("invalid_name");
    await h.run("rename");
    const spec = h.formSpec();
    const id = spec.fields[0].id;
    const result = await spec.onSubmit({ [id]: "a:b" });
    expect(h.ipc.rename).toHaveBeenCalledWith(p("a.txt"), "a:b");
    expect(result).toBe(translateErrorCode("invalid_name"));
    h.resolveForm("cancelled");
  });

  it("R-63/R-36/AC-56: already_exists is shown inline (translated); no overwrite prompt, no auto-rename", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    h.ipc.rename.mockRejectedValueOnce("already_exists");
    await h.run("rename");
    const spec = h.formSpec();
    const result = await spec.onSubmit({ [spec.fields[0].id]: "b.txt" });
    expect(result).toBe(translateErrorCode("already_exists"));
    expect(h.modal.confirm).not.toHaveBeenCalled();
    h.resolveForm("cancelled");
  });

  it("R-84: an untranslated backend code is shown as the original message", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    h.ipc.rename.mockRejectedValueOnce("brand_new_code");
    await h.run("rename");
    const spec = h.formSpec();
    const result = await spec.onSubmit({ [spec.fields[0].id]: "x.txt" });
    expect(result).toContain("brand_new_code");
    h.resolveForm("cancelled");
  });

  it("success: onSubmit resolves null; after the dialog closes, reload({ focusPath: <new full path returned by the backend> }) (SHOULD-80, §3.3.6)", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("rename");
    const spec = h.formSpec();
    const result = await spec.onSubmit({ [spec.fields[0].id]: "z.txt" });
    expect(result).toBeNull();
    expect(h.ipc.rename).toHaveBeenCalledWith(p("a.txt"), "z.txt");
    h.resolveForm("submitted");
    await flush();
    expect(h.reload).toHaveBeenCalledWith(expect.objectContaining({ focusPath: p("z.txt") }));
  });

  it("R-61: cancelling the dialog renames nothing and does not reload", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("rename");
    h.resolveForm("cancelled");
    await flush();
    expect(h.ipc.rename).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("no progress dialog / subscription for rename (R-45/AC-35)", async () => {
    const h = makeHarness({ selected: [p("a.txt")] });
    await h.run("rename");
    const spec = h.formSpec();
    await spec.onSubmit({ [spec.fields[0].id]: "z.txt" });
    h.resolveForm("submitted");
    await flush();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.ipc.listenProgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("new_file / new_folder (R-70~R-78, R-72-1, R-72-2; AC-58~AC-63)", () => {
  function fieldsOf(spec: Record<string, any>) {
    const kind = spec.fields.find((f: { type: string }) => f.type === "select");
    const name = spec.fields.find((f: { type: string }) => f.type === "text");
    return { kind, name };
  }

  it("R-70/R-71: the form has a kind select and an empty name field", async () => {
    const h = makeHarness();
    await h.run("new_file");
    const { kind, name } = fieldsOf(h.formSpec());
    expect(kind).toBeDefined();
    expect(name).toBeDefined();
    expect(name.value).toBe("");
    expect(kind.options.map((o: { value: string }) => o.value).sort()).toEqual(["file", "folder"]);
    h.resolveForm("cancelled");
  });

  it("R-72-2: new_file starts as kind=file", async () => {
    const h = makeHarness();
    await h.run("new_file");
    expect(fieldsOf(h.formSpec()).kind.value).toBe("file");
    h.resolveForm("cancelled");
  });

  it("R-72-1/AC-61: new_folder starts with kind=folder", async () => {
    const h = makeHarness();
    await h.run("new_folder");
    expect(fieldsOf(h.formSpec()).kind.value).toBe("folder");
    h.resolveForm("cancelled");
  });

  it("R-71: a blank name is rejected inline without calling the backend", async () => {
    const h = makeHarness();
    await h.run("new_file");
    const spec = h.formSpec();
    const { kind, name } = fieldsOf(spec);
    const result = await spec.onSubmit({ [kind.id]: "file", [name.id]: "" });
    expect(result).toBe("名前を入力してください");
    expect(h.ipc.create).not.toHaveBeenCalled();
    h.resolveForm("cancelled");
  });

  it("R-78: success calls ipc.create(currentPath, name, kind) and returns null", async () => {
    const h = makeHarness();
    await h.run("new_folder");
    const spec = h.formSpec();
    const { kind, name } = fieldsOf(spec);
    const result = await spec.onSubmit({ [kind.id]: "folder", [name.id]: "docs" });
    expect(result).toBeNull();
    expect(h.ipc.create).toHaveBeenCalledWith(DIR, "docs", "folder");
    h.resolveForm("submitted");
    await flush();
  });

  it("R-74: already_exists is shown inline (translated) and nothing else happens", async () => {
    const h = makeHarness();
    h.ipc.create.mockRejectedValueOnce("already_exists");
    await h.run("new_file");
    const spec = h.formSpec();
    const { kind, name } = fieldsOf(spec);
    const result = await spec.onSubmit({ [kind.id]: "file", [name.id]: "a.txt" });
    expect(result).toBe(translateErrorCode("already_exists"));
    expect(h.modal.confirm).not.toHaveBeenCalled();
    h.resolveForm("cancelled");
  });

  it("R-76/R-77 (provisional default): after success the listing reloads WITHOUT moving focus (no focusPath), and no rename-armed state", async () => {
    const h = makeHarness();
    await h.run("new_file");
    const spec = h.formSpec();
    const { kind, name } = fieldsOf(spec);
    await spec.onSubmit({ [kind.id]: "file", [name.id]: "n.txt" });
    h.resolveForm("submitted");
    await flush();
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload.mock.calls[0][0]?.focusPath).toBeUndefined();
    expect(h.modal.form).toHaveBeenCalledTimes(1); // no follow-up rename dialog
  });

  it("cancelling the dialog creates nothing and does not reload", async () => {
    const h = makeHarness();
    await h.run("new_file");
    h.resolveForm("cancelled");
    await flush();
    expect(h.ipc.create).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("R-45/AC-35: no progress dialog or subscription for create", async () => {
    const h = makeHarness();
    await h.run("new_folder");
    const spec = h.formSpec();
    const { kind, name } = fieldsOf(spec);
    await spec.onSubmit({ [kind.id]: "folder", [name.id]: "x" });
    h.resolveForm("submitted");
    await flush();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.ipc.listenProgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("MUST-61 at the controller boundary: targets come only from what context() reports", () => {
  it("the controller trusts context(): selected/focusedPath are the (already display-filtered) values; a null focusedPath and empty selection means zero targets", async () => {
    const h = makeHarness({ selected: [], focusedPath: null });
    await h.run("delete");
    await h.run("copy");
    await h.run("cut");
    await h.run("rename");
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.modal.form).not.toHaveBeenCalled();
    expect(h.clipboard.set).not.toHaveBeenCalled();
  });
});
