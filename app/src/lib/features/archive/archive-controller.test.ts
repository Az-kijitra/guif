import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 (第3版)
//   Targets/start: R-305 (actions zip_create / zip_extract), R-307 / R-307-1,
//     R-308 / R-308-1 / R-308-2 / R-309 (status reasons, never silence),
//     R-321, R-342.
//   Create: R-320~R-323, R-324-1 (via check), R-325 (pre-validation errors come
//     from the backend), R-326 / R-326-1 / R-326-2 / R-326-2-1 (overwrite
//     confirm, default = cancel, "cancel" returns to the form KEEPING the input;
//     sequential loop), R-326-3 (overwrite is an explicit boolean), R-329,
//     R-383, R-395-1 (inline pre-validation errors; the form stays open).
//   Extract: R-340~R-345 (form -> validation+conflict detection -> conflict
//     confirm -> run), R-341, R-343-1, R-345 (a rejected archive never reaches
//     the conflict dialog), R-370~R-375, R-374 / R-374-1 / R-374-2 (all
//     confirmations happen BEFORE the run), R-351 / R-351-1 (partial notice:
//     error = dialog, cancel = status; nothing extracted = plain), R-384.
//   Progress/cancel: R-380~R-382, R-386 (busy; no second operation), R-387-1
//     (operation id minted by the caller; subscribe before invoke), R-387-2
//     (a cancel before the backend registers is not lost), R-387-3, R-388
//     (the pre-validation phase shows submitting on the form; the progress
//     dialog shows "準備中…" first).
//   After: R-396 (status), R-397 (reload after success / failure / cancel; never
//     records a visit), R-398 (focus + clear selection only on success and only
//     when the result is DIRECTLY under the displayed directory).
//   AC-300~AC-307, AC-310, AC-312, AC-313, AC-340~AC-346-1, AC-350~AC-358-1,
//   AC-377, AC-383~AC-386.
// Architecture: SPEC-0200-0001 §3.4.6 (controller flows), §3.4.5 (progress
//   ordering), §3.4.13-4 MUST-68 (showProgress (sync) -> await listen ->
//   invoke; finally: unlisten?.() then handle.close()), §3.3.13-5 MUST-63 /
//   SHOULD-83 (try/catch/finally around the WHOLE flow; busy released in
//   finally; unlisten may be uninitialised), §3.4.1 (busy per controller; the
//   exclusion BETWEEN controllers relies on modal-host's single slot: the
//   thrown error is shown as a status), §3.4.13-3 MUST-67 (directory `x.zip`).
// Module under test (not yet implemented): ./archive-controller.ts
//   `createArchiveController(deps)` -> { handleAction(action: string): boolean }
//
// Injected dependencies (documented in the handback report):
//   ipc: { checkCreate(items, outputPath, baseDir),
//          create(operationId, items, outputPath, baseDir, overwrite),
//          detectConflicts(zipPath, destination, baseDir),
//          extract(operationId, zipPath, destination, baseDir, resolutions),
//          cancel(operationId), listenProgress(operationId, onEvent) -> unlisten,
//          newOperationId() }
//   modal: { confirm, form, showProgress }   (shared/state/modal-host shape)
//   status: { show(message) }
//   context: () => { currentPath, entries: { name, path, entryType }[], selected, focusedPath }
//   reload: (opts?: { focusPath?, clearSelection? }) => Promise<unknown>
// There is no navigation dependency: a reload can never record a visit (R-397).

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { ArchiveError } from "$lib/shared/ipc/archive";
import { createModalHost } from "$lib/shared/state/modal-host.svelte";
import { createArchiveController } from "./archive-controller";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DIR = "C:\\work";
const p = (n: string) => `${DIR}\\${n}`;
type Ent = { name: string; path: string; entryType: "file" | "dir" };
const file = (name: string): Ent => ({ name, path: p(name), entryType: "file" });
const dir = (name: string): Ent => ({ name, path: p(name), entryType: "dir" });
const ENTRIES: Ent[] = [file("a.txt"), file("b.txt"), dir("docs"), file("a.zip"), file("B.ZIP"), dir("x.zip"), file("notes.txt")];

const arcErr = (code: string, message = "m", entryPath?: string) => new ArchiveError(code, message, entryPath);

type CreateResult = { outputPath: string; entries: number; skippedLinks: number };
type ExtractResult = {
  extracted: number;
  skipped: number;
  total: number;
  destination: string;
  outcome: "completed" | "failed" | "canceled";
  error?: { code: string; message: string; entryPath?: string };
};

interface HarnessOptions {
  entries?: Ent[];
  selected?: string[];
  focusedPath?: string | null;
  checkCreate?: (items: string[], outputPath: string, baseDir: string) => unknown;
  create?: (...a: unknown[]) => unknown;
  detect?: (zipPath: string, destination: string, baseDir: string) => unknown;
  extract?: (...a: unknown[]) => unknown;
  listen?: () => Promise<() => void>;
  conflicts?: { entryPath: string }[];
  confirmAnswers?: { buttonId: string; checked: boolean }[];
  formScripts?: ((spec: Record<string, any>) => Promise<"submitted" | "cancelled">)[];
}

// A form script that plays the user: submits the given values in turn until one
// is accepted (onSubmit -> null). Results of each onSubmit go to `sink`.
const submitSeq =
  (valuesList: Record<string, string>[], sink: (string | null)[] = []) =>
  async (spec: Record<string, any>) => {
    for (const v of valuesList) {
      const r = await spec.onSubmit(v);
      sink.push(r);
      if (r === null) return "submitted" as const;
    }
    return "cancelled" as const;
  };
const cancelForm = async () => "cancelled" as const;

function makeHarness(opts: HarnessOptions = {}) {
  const log: string[] = [];
  const violations: string[] = [];
  let progressOpen = false;
  let progressHandler: ((e: unknown) => void) | undefined;
  const unlisten = vi.fn(() => {
    log.push("unlisten");
  });
  const handle = {
    update: vi.fn(),
    close: vi.fn(() => {
      log.push("close");
      progressOpen = false;
    }),
  };
  const confirmAnswers = [...(opts.confirmAnswers ?? [])];
  const formScripts = [...(opts.formScripts ?? [])];

  const ipc = {
    checkCreate: vi.fn(async (items: string[], outputPath: string, baseDir: string) => {
      log.push("checkCreate");
      if (opts.checkCreate) return opts.checkCreate(items, outputPath, baseDir);
      return { outputPath: /\.zip$/i.test(outputPath) ? outputPath : `${outputPath}.zip`, overwriteRequired: false };
    }),
    create: vi.fn(async (...a: unknown[]) => {
      log.push("create");
      if (opts.create) return opts.create(...a);
      const [, items, outputPath] = a as [string, string[], string];
      return { outputPath, entries: items.length, skippedLinks: 0 } as CreateResult;
    }),
    detectConflicts: vi.fn(async (zipPath: string, destination: string, baseDir: string) => {
      log.push("detect");
      if (opts.detect) return opts.detect(zipPath, destination, baseDir);
      return { destination, totalEntries: 3, conflicts: opts.conflicts ?? [] };
    }),
    extract: vi.fn(async (...a: unknown[]) => {
      log.push("extract");
      if (opts.extract) return opts.extract(...a);
      const destination = a[2] as string;
      return { extracted: 3, skipped: 0, total: 3, destination, outcome: "completed" } as ExtractResult;
    }),
    cancel: vi.fn(async (_id: string) => {
      log.push("cancel");
    }),
    listenProgress: vi.fn(async (_id: string, onEvent: (e: unknown) => void) => {
      log.push("listen");
      progressHandler = onEvent;
      if (opts.listen) return opts.listen();
      return unlisten;
    }),
    newOperationId: vi.fn(() => "op-1"),
  };

  const modal = {
    confirm: vi.fn(async (_spec: Record<string, any>) => {
      log.push("confirm");
      if (progressOpen) violations.push("confirm while progress is open");
      return confirmAnswers.shift() ?? { buttonId: "cancel", checked: false };
    }),
    form: vi.fn((spec: Record<string, any>) => {
      log.push("form");
      if (progressOpen) violations.push("form while progress is open");
      const script = formScripts.shift();
      if (script === undefined) return new Promise<"submitted" | "cancelled">(() => {});
      return script(spec);
    }),
    showProgress: vi.fn((_spec: Record<string, any>) => {
      log.push("showProgress");
      progressOpen = true;
      return handle;
    }),
  };

  const status = { show: vi.fn() };
  const reload = vi.fn(async (_o?: { focusPath?: string; clearSelection?: boolean }) => null as string | null);
  const ctxState = {
    currentPath: DIR,
    entries: opts.entries ?? ENTRIES,
    selected: opts.selected ?? [],
    focusedPath: opts.focusedPath ?? null,
  };

  const controller = createArchiveController({
    ipc,
    modal,
    status,
    context: () => ({ ...ctxState }),
    reload,
  } as never);

  async function run(action: string) {
    const r = (controller.handleAction as (a: string) => boolean)(action);
    await flush();
    return r;
  }

  return {
    log,
    violations,
    ipc,
    modal,
    status,
    reload,
    unlisten,
    handle,
    controller,
    ctxState,
    run,
    emit: (e: unknown) => progressHandler?.(e),
    formSpec: (i = 0) => modal.form.mock.calls[i][0] as Record<string, any>,
    confirmSpec: (i = 0) => modal.confirm.mock.calls[i][0] as Record<string, any>,
    progressSpec: () => modal.showProgress.mock.calls[0][0] as Record<string, any>,
    statusTexts: () => status.show.mock.calls.map((c) => String(c[0])),
  };
}

const idx = (log: string[], name: string) => log.indexOf(name);

// ---------------------------------------------------------------------------
describe("handleAction contract (R-305)", () => {
  it("zip_create and zip_extract are consumed (true); other actions are not (false) and start nothing", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [cancelForm, cancelForm] });
    expect(await h.run("zip_create")).toBe(true);
    expect(await h.run("zip_extract")).toBe(true);
    const h2 = makeHarness({ focusedPath: p("a.txt") });
    for (const a of ["copy", "paste", "delete", "move_up", "open", "zip", ""]) expect(await h2.run(a)).toBe(false);
    expect(h2.modal.form).not.toHaveBeenCalled();
    expect(h2.modal.confirm).not.toHaveBeenCalled();
    expect(h2.status.show).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("create: targets and the form (R-307, R-320, R-321; AC-300~AC-302, AC-307, AC-308)", () => {
  it("AC-302: nothing selected and nothing focused => status 'no target', no dialog, no IPC, no reload", async () => {
    const h = makeHarness();
    await h.run("zip_create");
    expect(h.statusTexts()).toContain("対象がありません");
    expect(h.modal.form).not.toHaveBeenCalled();
    expect(h.ipc.checkCreate).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("AC-301 / AC-307: one focused file => form with '1件' and the default output `<dir>\\a.txt.zip`", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [cancelForm] });
    await h.run("zip_create");
    const spec = h.formSpec();
    expect((spec.lines as string[]).join("\n")).toContain("1件");
    expect(spec.fields[0].id).toBe("outputPath");
    expect(spec.fields[0].value).toBe("C:\\work\\a.txt.zip");
  });

  it("AC-307: one folder => `docs.zip`; AC-300: several => `archive.zip` and the count is shown", async () => {
    const h1 = makeHarness({ focusedPath: p("docs"), formScripts: [cancelForm] });
    await h1.run("zip_create");
    expect(h1.formSpec().fields[0].value).toBe("C:\\work\\docs.zip");
    const h2 = makeHarness({ selected: [p("a.txt"), p("docs"), p("b.txt")], formScripts: [cancelForm] });
    await h2.run("zip_create");
    expect(h2.formSpec().fields[0].value).toBe("C:\\work\\archive.zip");
    expect((h2.formSpec().lines as string[]).join("\n")).toContain("3件");
  });

  it("AC-308: the form has no password field", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [cancelForm] });
    await h.run("zip_create");
    expect(h.formSpec().fields).toHaveLength(1);
    expect(JSON.stringify(h.formSpec().fields).toLowerCase()).not.toMatch(/pass|パスワード/);
  });

  it("cancelling the form (Escape) does nothing else: no IPC, no progress, no reload, no status", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [cancelForm] });
    await h.run("zip_create");
    expect(h.ipc.checkCreate).not.toHaveBeenCalled();
    expect(h.ipc.create).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("R-307-1: the targets come only from what context() reports (a hidden selection is never archived)", async () => {
    const h = makeHarness({ entries: [file("b.txt")], selected: [p("b.txt")], formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }])] });
    await h.run("zip_create");
    expect(h.ipc.checkCreate.mock.calls[0][0]).toEqual([p("b.txt")]);
  });
});

// ---------------------------------------------------------------------------
describe("create: pre-validation is inline and keeps the dialog open (R-322, R-395-1; AC-310, AC-377)", () => {
  it("a blank output path is refused inside the form (a message string), the backend is not called (R-322)", async () => {
    const sink: (string | null)[] = [];
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [submitSeq([{ outputPath: "   " }, { outputPath: "C:\\work\\o.zip" }], sink)] });
    await h.run("zip_create");
    expect(typeof sink[0]).toBe("string");
    expect((sink[0] as string).length).toBeGreaterThan(0);
    expect(h.ipc.checkCreate).toHaveBeenCalledTimes(1);
    expect(sink[1]).toBeNull();
  });

  it("checkCreate receives (items, the typed output path, current directory as the base for relative paths; R-322-1)", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [submitSeq([{ outputPath: "out" }])] });
    await h.run("zip_create");
    expect(h.ipc.checkCreate).toHaveBeenCalledWith([p("a.txt")], "out", DIR);
  });

  it("AC-310: a rejection (invalid_name) is RETURNED from onSubmit as a translated string (form stays open) and the user can re-enter", async () => {
    const sink: (string | null)[] = [];
    let n = 0;
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => {
        if (n++ === 0) throw arcErr("invalid_name", "bad char", "");
        return { outputPath: out, overwriteRequired: false };
      },
      formScripts: [submitSeq([{ outputPath: "a?.zip" }, { outputPath: "C:\\work\\ok.zip" }], sink)],
    });
    await h.run("zip_create");
    expect(typeof sink[0]).toBe("string");
    expect(sink[1]).toBeNull();
    expect(h.modal.form).toHaveBeenCalledTimes(1); // never re-opened: the SAME dialog took both submissions
    expect(h.ipc.create).toHaveBeenCalledTimes(1);
  });

  it("R-395-1: the inline text carries the translated cause, the entry path (if any) and says nothing was written", async () => {
    const sink: (string | null)[] = [];
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: () => {
        throw arcErr("destination_inside_source", "inside", "C:\\work\\docs");
      },
      formScripts: [submitSeq([{ outputPath: "C:\\work\\docs\\x.zip" }], sink)],
    });
    await h.run("zip_create");
    const text = sink[0] as string;
    expect(text).toContain("C:\\work\\docs");
    expect(text).toContain("何も書き込まれていません");
    expect(h.ipc.create).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
  });

  it("a NON-Archive rejection (plain Error) is also turned into an inline string, never thrown out of onSubmit", async () => {
    const sink: (string | null)[] = [];
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: () => {
        throw new Error("ipc down");
      },
      formScripts: [submitSeq([{ outputPath: "o.zip" }], sink)],
    });
    await h.run("zip_create");
    expect(String(sink[0])).toContain("ipc down");
  });
});

// ---------------------------------------------------------------------------
describe("create: overwrite confirmation is a sequential loop (R-326, R-326-1, R-326-2, R-326-2-1; AC-311~AC-313)", () => {
  const needOverwrite = (out: string) => ({ outputPath: out, overwriteRequired: true });

  it("overwriteRequired=false => no confirm dialog; create runs with overwrite=false (R-326-3: explicit)", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }])] });
    await h.run("zip_create");
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.ipc.create).toHaveBeenCalledTimes(1);
    expect(h.ipc.create.mock.calls[0][4]).toBe(false);
  });

  it("AC-311/AC-312: overwriteRequired => a 2-choice confirm (overwrite / cancel), default = cancel", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => needOverwrite(out),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }]), cancelForm],
      confirmAnswers: [{ buttonId: "cancel", checked: false }],
    });
    await h.run("zip_create");
    const spec = h.confirmSpec();
    expect(spec.buttons.map((b: { id: string }) => b.id)).toEqual(["overwrite", "cancel"]);
    expect(spec.defaultButtonId).toBe("cancel");
    expect(spec.cancelButtonId).toBe("cancel");
  });

  it("AC-313: 'overwrite' => create runs with overwrite=true and the path the BACKEND normalised (e.g. `.zip` appended, R-323)", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: () => needOverwrite("C:\\work\\out.zip"),
      formScripts: [submitSeq([{ outputPath: "out" }])],
      confirmAnswers: [{ buttonId: "overwrite", checked: false }],
    });
    await h.run("zip_create");
    const a = h.ipc.create.mock.calls[0];
    expect(a[2]).toBe("C:\\work\\out.zip");
    expect(a[4]).toBe(true);
  });

  it("R-326-2 / AC-312: 'cancel' does NOT create and RETURNS to the form with the previous INPUT kept (not the normalised path)", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: () => needOverwrite("C:\\work\\out.zip"),
      formScripts: [submitSeq([{ outputPath: "out" }]), cancelForm],
      confirmAnswers: [{ buttonId: "cancel", checked: false }],
    });
    await h.run("zip_create");
    expect(h.ipc.create).not.toHaveBeenCalled();
    expect(h.modal.form).toHaveBeenCalledTimes(2);
    expect(h.formSpec(1).fields[0].value).toBe("out");
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.log.slice(0, 4)).toEqual(["form", "checkCreate", "confirm", "form"]);
  });

  it("R-326-2: after 'cancel' the user may edit the path, submit again and this time go through (loop)", async () => {
    let n = 0;
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => (n++ === 0 ? needOverwrite(out) : { outputPath: out, overwriteRequired: false }),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\a.txt.zip" }]), submitSeq([{ outputPath: "C:\\work\\other.zip" }])],
      confirmAnswers: [{ buttonId: "cancel", checked: false }],
    });
    await h.run("zip_create");
    expect(h.ipc.checkCreate).toHaveBeenCalledTimes(2);
    expect(h.ipc.create).toHaveBeenCalledTimes(1);
    expect(h.ipc.create.mock.calls[0][2]).toBe("C:\\work\\other.zip");
    expect(h.ipc.create.mock.calls[0][4]).toBe(false);
  });

  it("R-326-2: cancel the overwrite, then cancel the re-opened form => the whole operation ends without create / progress / reload", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => needOverwrite(out),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }]), cancelForm],
      confirmAnswers: [{ buttonId: "cancel", checked: false }],
    });
    await h.run("zip_create");
    expect(h.ipc.create).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("the confirm is finished BEFORE any progress dialog (single slot, R-326-2-1)", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => needOverwrite(out),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }])],
      confirmAnswers: [{ buttonId: "overwrite", checked: false }],
    });
    await h.run("zip_create");
    expect(idx(h.log, "confirm")).toBeLessThan(idx(h.log, "showProgress"));
    expect(h.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("create: progress ordering, cancel and finally (R-380~R-382, R-387-1/-2; MUST-68; AC-350, AC-352, AC-358-1)", () => {
  const go = (extra: HarnessOptions = {}) =>
    makeHarness({ focusedPath: p("a.txt"), formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }])], ...extra });

  it("MUST-68: order is form -> checkCreate -> showProgress -> listen -> create", async () => {
    const h = go();
    await h.run("zip_create");
    expect(h.log.filter((l) => ["form", "checkCreate", "showProgress", "listen", "create"].includes(l))).toEqual([
      "form",
      "checkCreate",
      "showProgress",
      "listen",
      "create",
    ]);
  });

  it("R-387-1: ONE operation id is minted by the caller and used for both the subscription and the run", async () => {
    const h = go();
    await h.run("zip_create");
    expect(h.ipc.newOperationId).toHaveBeenCalledTimes(1);
    expect(h.ipc.listenProgress.mock.calls[0][0]).toBe("op-1");
    expect(h.ipc.create.mock.calls[0][0]).toBe("op-1");
  });

  it("create receives (opId, items, outputPath, baseDir, overwrite)", async () => {
    const h = makeHarness({ selected: [p("a.txt"), p("docs")], formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }])] });
    await h.run("zip_create");
    expect(h.ipc.create).toHaveBeenCalledWith("op-1", [p("a.txt"), p("docs")], "C:\\work\\o.zip", DIR, false);
  });

  it("MUST-68: showProgress is shown SYNCHRONOUSLY (before listen resolves), so there is no blank moment; 'preparing' is the first label (R-388)", async () => {
    const d = deferred<() => void>();
    const h = go({ listen: () => d.promise });
    await h.run("zip_create");
    expect(h.log).toContain("showProgress");
    expect(h.log).toContain("listen");
    expect(h.log).not.toContain("create"); // waiting for the subscription
    expect(h.handle.update).toHaveBeenCalledWith({ label: "準備中…", index: 0, total: 0 });
    d.resolve(h.unlisten);
    await flush();
    expect(h.log).toContain("create");
  });

  it("R-387-2: a cancel pressed while the subscription is still pending reaches the backend (archive_cancel) and create is still invoked", async () => {
    const d = deferred<() => void>();
    const h = go({ listen: () => d.promise });
    await h.run("zip_create");
    h.progressSpec().onCancel();
    await flush();
    expect(h.ipc.cancel).toHaveBeenCalledWith("op-1");
    expect(h.ipc.create).not.toHaveBeenCalled();
    d.resolve(h.unlisten);
    await flush();
    expect(h.ipc.create).toHaveBeenCalledTimes(1);
  });

  it("the progress spec has a cancel button label and an onCancel that calls ipc.cancel(operationId)", async () => {
    const h = go();
    await h.run("zip_create");
    expect(typeof h.progressSpec().cancelLabel).toBe("string");
    h.progressSpec().onCancel();
    await flush();
    expect(h.ipc.cancel).toHaveBeenCalledWith("op-1");
  });

  it("a rejected ipc.cancel is swallowed (no unhandled rejection; the run continues)", async () => {
    const h = go();
    h.ipc.cancel.mockRejectedValueOnce(new Error("cancel failed"));
    await h.run("zip_create");
    h.progressSpec().onCancel();
    await flush();
    expect(h.ipc.cancel).toHaveBeenCalledTimes(1);
  });

  it("AC-350: progress events update the dialog with `作成中 <name> (<index>/<total>)`", async () => {
    let release!: (v: CreateResult) => void;
    const gate = new Promise<CreateResult>((r) => (release = r));
    const h = go({ create: () => gate });
    await h.run("zip_create");
    h.emit({ operationId: "op-1", name: "docs/a.txt", index: 2, total: 5 });
    expect(h.handle.update).toHaveBeenLastCalledWith({ label: "作成中 docs/a.txt (2/5)", index: 2, total: 5 });
    release({ outputPath: "C:\\work\\o.zip", entries: 5, skippedLinks: 0 });
    await flush();
  });

  it("finally: unlisten is called and THEN the progress dialog is closed (§3.4.5)", async () => {
    const h = go();
    await h.run("zip_create");
    expect(idx(h.log, "unlisten")).toBeGreaterThan(-1);
    expect(idx(h.log, "unlisten")).toBeLessThan(idx(h.log, "close"));
    expect(idx(h.log, "create")).toBeLessThan(idx(h.log, "unlisten"));
  });

  it("finally also runs when create REJECTS (an ArchiveError): unlisten + close, once each", async () => {
    const h = go({
      create: () => {
        throw arcErr("io_error", "disk");
      },
    });
    await h.run("zip_create");
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    expect(h.handle.close).toHaveBeenCalledTimes(1);
  });

  it("when listen() itself rejects: the progress dialog is closed, create is NOT invoked, unlisten is not called, the error is surfaced, busy is released", async () => {
    const h = go({
      listen: () => Promise.reject(new Error("no event system")),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }]), cancelForm],
    });
    await h.run("zip_create");
    expect(h.handle.close).toHaveBeenCalledTimes(1);
    expect(h.ipc.create).not.toHaveBeenCalled();
    expect(h.unlisten).not.toHaveBeenCalled();
    expect(h.status.show.mock.calls.length + h.modal.confirm.mock.calls.length).toBeGreaterThan(0);
    // busy released: a following action is not refused
    h.status.show.mockClear();
    await h.run("zip_create");
    expect(h.modal.form).toHaveBeenCalledTimes(2);
  });

  it("when create rejects with a non-Archive error the listing is reloaded (the backend may have written) and the error is shown", async () => {
    const h = go({
      create: () => {
        throw new Error("webview crashed");
      },
    });
    await h.run("zip_create");
    expect(h.reload).toHaveBeenCalledTimes(1);
    const shown = [...h.statusTexts(), ...h.modal.confirm.mock.calls.map((c) => JSON.stringify(c[0]))].join("\n");
    expect(shown).toContain("webview crashed");
  });
});

// ---------------------------------------------------------------------------
describe("create: results, reload and focus (R-329, R-383, R-396~R-398; AC-353, AC-383, AC-385, AC-386)", () => {
  const go = (extra: HarnessOptions = {}) =>
    makeHarness({ focusedPath: p("a.txt"), formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }])], ...extra });

  it("AC-383: success => a status containing the file name; no dialog", async () => {
    const h = go();
    await h.run("zip_create");
    expect(h.statusTexts().join("\n")).toContain("o.zip");
    expect(h.modal.confirm).not.toHaveBeenCalled();
  });

  it("R-327-8 / R-396: skipped links are reported in the success status", async () => {
    const h = go({ create: (...a) => ({ outputPath: a[2], entries: 4, skippedLinks: 2 }) });
    await h.run("zip_create");
    expect(h.statusTexts().join("\n")).toContain("スキップ");
  });

  it("AC-385 / R-398: success + result DIRECTLY under the displayed directory => reload({ focusPath: <result>, clearSelection: true })", async () => {
    const h = go();
    await h.run("zip_create");
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload).toHaveBeenCalledWith({ focusPath: "C:\\work\\o.zip", clearSelection: true });
  });

  it("SHOULD-97: the direct-child test ignores case/separators, and the focus path uses the DISPLAYED directory's spelling", async () => {
    const h = go({ create: () => ({ outputPath: "c:/WORK/o.zip", entries: 1, skippedLinks: 0 }) });
    await h.run("zip_create");
    expect(h.reload).toHaveBeenCalledWith({ focusPath: "C:\\work\\o.zip", clearSelection: true });
  });

  it("AC-385: the output is in ANOTHER directory => no focus move and the selection is NOT cleared; still one reload (R-397)", async () => {
    const h = go({ create: () => ({ outputPath: "D:\\elsewhere\\o.zip", entries: 1, skippedLinks: 0 }) });
    await h.run("zip_create");
    expect(h.reload).toHaveBeenCalledTimes(1);
    const opts = h.reload.mock.calls[0][0];
    expect(opts?.focusPath).toBeUndefined();
    expect(opts?.clearSelection).toBeFalsy();
  });

  it("a deeper directory (a child of a child) is not 'directly under' => no focus move", async () => {
    const h = go({ create: () => ({ outputPath: "C:\\work\\sub\\o.zip", entries: 1, skippedLinks: 0 }) });
    await h.run("zip_create");
    expect(h.reload.mock.calls[0][0]?.focusPath).toBeUndefined();
  });

  it("R-383 / AC-353: canceled => status 'ZIPの作成をキャンセルしました', NO dialog, reload once WITHOUT clearing the selection", async () => {
    const h = go({
      create: () => {
        throw arcErr("canceled", "canceled");
      },
    });
    await h.run("zip_create");
    expect(h.statusTexts()).toContain("ZIPの作成をキャンセルしました");
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.reload).toHaveBeenCalledTimes(1);
    const opts = h.reload.mock.calls[0][0];
    expect(opts?.clearSelection).toBeFalsy();
    expect(opts?.focusPath).toBeUndefined();
  });

  it("R-328-1 / R-397: an error => ONE error dialog (single 'close' button) after the run, reload once without clearing the selection", async () => {
    const h = go({
      create: () => {
        throw arcErr("permission_denied", "Access is denied", "C:\\work\\a.txt");
      },
    });
    await h.run("zip_create");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    const spec = h.confirmSpec();
    expect(spec.buttons).toHaveLength(1);
    expect(JSON.stringify(spec)).toContain("Access is denied");
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload.mock.calls[0][0]?.clearSelection).toBeFalsy();
    expect(h.violations).toEqual([]); // the error dialog opens only after the progress dialog closed
  });

  it("R-397: a visit is never recorded: the controller has no navigation dependency and only calls reload() with focus/selection options", async () => {
    const h = go();
    await h.run("zip_create");
    for (const c of h.reload.mock.calls) {
      expect(Object.keys((c[0] ?? {}) as object).every((k) => k === "focusPath" || k === "clearSelection")).toBe(true);
    }
  });

  it("two operations in a row both work (busy is released after a normal run)", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\1.zip" }]), submitSeq([{ outputPath: "C:\\work\\2.zip" }])],
    });
    await h.run("zip_create");
    await h.run("zip_create");
    expect(h.ipc.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
describe("extract: start conditions (R-308, R-308-1, R-308-2, R-309; AC-303~AC-305; MUST-67)", () => {
  it("AC-304 (a): no target => status 'no target', no dialog", async () => {
    const h = makeHarness();
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("対象がありません");
    expect(h.modal.form).not.toHaveBeenCalled();
  });

  it("AC-304 (b): two targets => status 'extract one at a time', no dialog", async () => {
    const h = makeHarness({ selected: [p("a.zip"), p("B.ZIP")] });
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("展開は1件ずつ指定してください");
    expect(h.modal.form).not.toHaveBeenCalled();
  });

  it("AC-304 (c): one non-zip file => status 'not a ZIP file', no dialog", async () => {
    const h = makeHarness({ focusedPath: p("notes.txt") });
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("ZIPファイルではありません");
    expect(h.modal.form).not.toHaveBeenCalled();
  });

  it("MUST-67: a DIRECTORY named x.zip => 'not a ZIP file', no dialog, no IPC", async () => {
    const h = makeHarness({ focusedPath: p("x.zip") });
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("ZIPファイルではありません");
    expect(h.modal.form).not.toHaveBeenCalled();
    expect(h.ipc.detectConflicts).not.toHaveBeenCalled();
  });

  it("AC-305: the focus is on a ZIP but a different non-zip file is the single selection => the selection is judged (not a ZIP), the focused ZIP is NOT extracted", async () => {
    const h = makeHarness({ selected: [p("notes.txt")], focusedPath: p("a.zip") });
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("ZIPファイルではありません");
    expect(h.modal.form).not.toHaveBeenCalled();
  });

  it("AC-304 (d): the ZIP is not displayed (context lists other entries only) => the same reason as 'no target'", async () => {
    const h = makeHarness({ entries: [file("notes.txt")], selected: [p("a.zip")] });
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("対象がありません");
    expect(h.modal.form).not.toHaveBeenCalled();
  });

  it("AC-303: a focused `.ZIP` (upper case) opens the form with the ZIP path and the sub-folder default (AC-322)", async () => {
    const h = makeHarness({ focusedPath: p("B.ZIP"), formScripts: [cancelForm] });
    await h.run("zip_extract");
    const spec = h.formSpec();
    expect((spec.lines as string[]).join("\n")).toContain(p("B.ZIP"));
    expect(spec.fields).toHaveLength(1);
    expect(spec.fields[0].id).toBe("destination");
    expect(spec.fields[0].value).toBe("C:\\work\\B");
  });

  it("AC-326: no checkbox / password field in the extract form", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), formScripts: [cancelForm] });
    await h.run("zip_extract");
    expect(JSON.stringify(h.formSpec().fields).toLowerCase()).not.toMatch(/pass|パスワード|checkbox/);
  });

  it("cancelling the form does nothing else (no IPC, no progress, no reload)", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), formScripts: [cancelForm] });
    await h.run("zip_extract");
    expect(h.ipc.detectConflicts).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("extract: validation + conflict detection happen in the form (R-341, R-345, R-395-1; AC-327, AC-346-1, AC-377)", () => {
  it("R-341 / AC-327: a blank destination is refused inline; detectConflicts is not called", async () => {
    const sink: (string | null)[] = [];
    const h = makeHarness({ focusedPath: p("a.zip"), formScripts: [submitSeq([{ destination: "" }, { destination: "C:\\work\\a" }], sink)] });
    await h.run("zip_extract");
    expect(typeof sink[0]).toBe("string");
    expect(h.ipc.detectConflicts).toHaveBeenCalledTimes(1);
  });

  it("detectConflicts(zipPath, typed destination, current directory as base for relative paths; R-341-1)", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), formScripts: [submitSeq([{ destination: "sub" }])] });
    await h.run("zip_extract");
    expect(h.ipc.detectConflicts).toHaveBeenCalledWith(p("a.zip"), "sub", DIR);
  });

  it("AC-377 / R-395-1: a rejected archive (zip_entry_rejected) is an INLINE string with the entry path and 'nothing written'; the form stays; re-entering works", async () => {
    const sink: (string | null)[] = [];
    let n = 0;
    const h = makeHarness({
      focusedPath: p("a.zip"),
      detect: (_z, d) => {
        if (n++ === 0) throw arcErr("zip_entry_rejected", "unsafe", "../evil.txt");
        return { destination: d, totalEntries: 2, conflicts: [] };
      },
      formScripts: [submitSeq([{ destination: "C:\\work\\a" }, { destination: "C:\\work\\b" }], sink)],
    });
    await h.run("zip_extract");
    const text = sink[0] as string;
    expect(text).toContain("../evil.txt");
    expect(text).toContain("何も書き込まれていません");
    expect(sink[1]).toBeNull();
    expect(h.modal.form).toHaveBeenCalledTimes(1);
    expect(h.ipc.extract).toHaveBeenCalledTimes(1);
  });

  it("AC-346-1 / R-345: a rejected archive never reaches the conflict dialog or the run", async () => {
    const h = makeHarness({
      focusedPath: p("a.zip"),
      detect: () => {
        throw arcErr("zip_entry_rejected", "unsafe", "../evil.txt");
      },
      formScripts: [submitSeq([{ destination: "C:\\work\\a" }])],
    });
    await h.run("zip_extract");
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.ipc.extract).not.toHaveBeenCalled();
  });

  it("AC-324: destination_not_dir is shown inline too (translated)", async () => {
    const sink: (string | null)[] = [];
    const h = makeHarness({
      focusedPath: p("a.zip"),
      detect: () => {
        throw arcErr("destination_not_dir", "not a dir");
      },
      formScripts: [submitSeq([{ destination: "C:\\work\\a.txt" }], sink)],
    });
    await h.run("zip_extract");
    expect(typeof sink[0]).toBe("string");
    expect((sink[0] as string).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe("extract: conflict confirmation before the run (R-373, R-374, R-374-1, R-374-2; AC-325, AC-340~AC-346)", () => {
  const form = () => submitSeq([{ destination: "C:\\work\\a" }]);
  const two = [{ entryPath: "a.txt" }, { entryPath: "docs/b.txt" }];

  it("AC-325 / R-373: no conflicts => no dialog; order form -> detect -> showProgress -> listen -> extract", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), formScripts: [form()] });
    await h.run("zip_extract");
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.log.filter((l) => ["form", "detect", "confirm", "showProgress", "listen", "extract"].includes(l))).toEqual([
      "form",
      "detect",
      "showProgress",
      "listen",
      "extract",
    ]);
  });

  it("extract receives (opId, zipPath, the BACKEND-normalised destination, base, resolutions = {})", async () => {
    const h = makeHarness({
      focusedPath: p("a.zip"),
      detect: () => ({ destination: "C:\\work\\a-normalized", totalEntries: 3, conflicts: [] }),
      formScripts: [form()],
    });
    await h.run("zip_extract");
    const a = h.ipc.extract.mock.calls[0];
    expect(a[0]).toBe("op-1");
    expect(a[1]).toBe(p("a.zip"));
    expect(a[2]).toBe("C:\\work\\a-normalized");
    expect(a[3]).toBe(DIR);
    expect(a[4] ?? {}).toEqual({});
  });

  it("AC-340 / AC-342: with conflicts a 3-choice dialog opens first: default = cancel, 'apply to all' starts checked, shows the first entry path and the total (AC-341)", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), conflicts: two, formScripts: [form()], confirmAnswers: [{ buttonId: "cancel", checked: true }] });
    await h.run("zip_extract");
    const spec = h.confirmSpec();
    expect(spec.buttons.map((b: { id: string }) => b.id)).toEqual(["overwrite", "skip", "cancel"]);
    expect(spec.defaultButtonId).toBe("cancel");
    expect(spec.cancelButtonId).toBe("cancel");
    expect(spec.checkbox).toEqual({ label: "すべてに適用", checked: true });
    const text = (spec.lines as string[]).join("\n");
    expect(text).toContain("a.txt");
    expect(text).toContain("2");
  });

  it("AC-346: 'cancel' => nothing is started: no progress, no extract, status 'canceled', the destination is untouched", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), conflicts: two, formScripts: [form()], confirmAnswers: [{ buttonId: "cancel", checked: true }] });
    await h.run("zip_extract");
    expect(h.modal.showProgress).not.toHaveBeenCalled();
    expect(h.ipc.extract).not.toHaveBeenCalled();
    expect(h.statusTexts()).toContain("展開をキャンセルしました");
  });

  it("AC-343: 'overwrite' with apply-to-all => every conflicting entry path is resolved 'overwrite' (keys = archive-internal paths exactly)", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), conflicts: two, formScripts: [form()], confirmAnswers: [{ buttonId: "overwrite", checked: true }] });
    await h.run("zip_extract");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    expect(h.ipc.extract.mock.calls[0][4]).toEqual({ "a.txt": "overwrite", "docs/b.txt": "overwrite" });
  });

  it("AC-344: 'skip' with apply-to-all => every conflicting entry is resolved 'skip'", async () => {
    const h = makeHarness({ focusedPath: p("a.zip"), conflicts: two, formScripts: [form()], confirmAnswers: [{ buttonId: "skip", checked: true }] });
    await h.run("zip_extract");
    expect(h.ipc.extract.mock.calls[0][4]).toEqual({ "a.txt": "skip", "docs/b.txt": "skip" });
  });

  it("AC-345 / R-374-2: apply-to-all OFF => one confirm per conflict, in order, ALL before the progress dialog; the mixed decisions are passed on", async () => {
    const h = makeHarness({
      focusedPath: p("a.zip"),
      conflicts: two,
      formScripts: [form()],
      confirmAnswers: [
        { buttonId: "overwrite", checked: false },
        { buttonId: "skip", checked: false },
      ],
    });
    await h.run("zip_extract");
    expect(h.modal.confirm).toHaveBeenCalledTimes(2);
    expect((h.confirmSpec(0).lines as string[]).join("\n")).toContain("a.txt");
    expect((h.confirmSpec(1).lines as string[]).join("\n")).toContain("docs/b.txt");
    expect(h.log.lastIndexOf("confirm")).toBeLessThan(idx(h.log, "showProgress"));
    expect(h.ipc.extract.mock.calls[0][4]).toEqual({ "a.txt": "overwrite", "docs/b.txt": "skip" });
    expect(h.violations).toEqual([]);
  });

  it("AC-345: cancelling at the SECOND confirmation aborts the whole extraction (nothing is written, resolutions are dropped)", async () => {
    const h = makeHarness({
      focusedPath: p("a.zip"),
      conflicts: two,
      formScripts: [form()],
      confirmAnswers: [
        { buttonId: "overwrite", checked: false },
        { buttonId: "cancel", checked: false },
      ],
    });
    await h.run("zip_extract");
    expect(h.ipc.extract).not.toHaveBeenCalled();
    expect(h.modal.showProgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("extract: progress, cancel and finally (R-380~R-382, R-387; MUST-68; AC-350~AC-352)", () => {
  const go = (extra: HarnessOptions = {}) =>
    makeHarness({ focusedPath: p("a.zip"), formScripts: [submitSeq([{ destination: "C:\\work\\a" }])], ...extra });

  it("progress events update the dialog with `展開中 <name> (<index>/<total>)`", async () => {
    let release!: (v: ExtractResult) => void;
    const gate = new Promise<ExtractResult>((r) => (release = r));
    const h = go({ extract: () => gate });
    await h.run("zip_extract");
    h.emit({ operationId: "op-1", name: "docs/b.txt", index: 7, total: 20 });
    expect(h.handle.update).toHaveBeenLastCalledWith({ label: "展開中 docs/b.txt (7/20)", index: 7, total: 20 });
    release({ extracted: 20, skipped: 0, total: 20, destination: "C:\\work\\a", outcome: "completed" });
    await flush();
  });

  it("the first label is 'preparing' (the pre-validation may still be running for a large archive; R-388)", async () => {
    const h = go();
    await h.run("zip_extract");
    expect(h.handle.update.mock.calls[0][0]).toEqual({ label: "準備中…", index: 0, total: 0 });
  });

  it("MUST-68: a slow subscription does not delay the dialog; a cancel pressed meanwhile is sent and extract still starts afterwards (R-387-2)", async () => {
    const d = deferred<() => void>();
    const h = go({ listen: () => d.promise });
    await h.run("zip_extract");
    expect(h.log).toContain("showProgress");
    expect(h.log).not.toContain("extract");
    h.progressSpec().onCancel();
    await flush();
    expect(h.ipc.cancel).toHaveBeenCalledWith("op-1");
    d.resolve(h.unlisten);
    await flush();
    expect(h.ipc.extract).toHaveBeenCalledTimes(1);
  });

  it("finally: unlisten then close, after extract", async () => {
    const h = go();
    await h.run("zip_extract");
    expect(idx(h.log, "extract")).toBeLessThan(idx(h.log, "unlisten"));
    expect(idx(h.log, "unlisten")).toBeLessThan(idx(h.log, "close"));
  });

  it("when listen() rejects: progress closed, extract NOT invoked, error surfaced, busy released", async () => {
    const h = go({
      listen: () => Promise.reject(new Error("no event system")),
      formScripts: [submitSeq([{ destination: "C:\\work\\a" }]), cancelForm],
    });
    await h.run("zip_extract");
    expect(h.handle.close).toHaveBeenCalledTimes(1);
    expect(h.ipc.extract).not.toHaveBeenCalled();
    expect(h.status.show.mock.calls.length + h.modal.confirm.mock.calls.length).toBeGreaterThan(0);
    await h.run("zip_extract");
    expect(h.modal.form).toHaveBeenCalledTimes(2);
  });

  it("when extract rejects with a plain Error: unlisten + close, the listing is reloaded (files may have been written), the error is shown, busy released", async () => {
    const h = go({
      extract: () => {
        throw new Error("webview crashed");
      },
    });
    await h.run("zip_extract");
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    expect(h.handle.close).toHaveBeenCalledTimes(1);
    expect(h.reload).toHaveBeenCalledTimes(1);
    const shown = [...h.statusTexts(), ...h.modal.confirm.mock.calls.map((c) => JSON.stringify(c[0]))].join("\n");
    expect(shown).toContain("webview crashed");
  });
});

// ---------------------------------------------------------------------------
describe("extract: results, reload and focus (R-350, R-351, R-351-1, R-384, R-396~R-398; AC-331, AC-331-1, AC-354, AC-384~AC-386)", () => {
  const go = (extra: HarnessOptions = {}) =>
    makeHarness({ focusedPath: p("a.zip"), formScripts: [submitSeq([{ destination: "C:\\work\\a" }])], ...extra });
  const result = (over: Partial<ExtractResult> = {}): ExtractResult => ({
    extracted: 5,
    skipped: 0,
    total: 5,
    destination: "C:\\work\\a",
    outcome: "completed",
    ...over,
  });

  it("AC-384: completed => status with the destination and count (+ the skipped count); no dialog", async () => {
    const h = go({ extract: () => result({ extracted: 4, skipped: 1, total: 5 }) });
    await h.run("zip_extract");
    const s = h.statusTexts().join("\n");
    expect(s).toContain("C:\\work\\a");
    expect(s).toContain("4");
    expect(s).toContain("スキップ");
    expect(h.modal.confirm).not.toHaveBeenCalled();
  });

  it("AC-385 / R-398: success + destination DIRECTLY under the displayed directory => reload({ focusPath: <destination>, clearSelection: true })", async () => {
    const h = go();
    await h.run("zip_extract");
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload).toHaveBeenCalledWith({ focusPath: "C:\\work\\a", clearSelection: true });
  });

  it("AC-385: the destination is in another directory => no focus move, selection kept, no directory change; one reload", async () => {
    const h = go({ extract: () => result({ destination: "D:\\out\\a" }) });
    await h.run("zip_extract");
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload.mock.calls[0][0]?.focusPath).toBeUndefined();
    expect(h.reload.mock.calls[0][0]?.clearSelection).toBeFalsy();
  });

  it("AC-354 / R-351-1: canceled midway (extracted > 0) => a STATUS with 'partway', N/M and the destination; NO dialog; reload keeps the selection (AC-386)", async () => {
    const h = go({ extract: () => result({ outcome: "canceled", extracted: 2, total: 5 }) });
    await h.run("zip_extract");
    const s = h.statusTexts().join("\n");
    expect(s).toContain("途中まで");
    expect(s).toContain("2/5");
    expect(s).toContain("C:\\work\\a");
    expect(h.modal.confirm).not.toHaveBeenCalled();
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload.mock.calls[0][0]?.clearSelection).toBeFalsy();
    expect(h.reload.mock.calls[0][0]?.focusPath).toBeUndefined();
  });

  it("R-351-1: canceled before anything was extracted => plain 'canceled' status without the 'partway' notice", async () => {
    const h = go({ extract: () => result({ outcome: "canceled", extracted: 0, total: 5 }) });
    await h.run("zip_extract");
    const s = h.statusTexts().join("\n");
    expect(s).toContain("キャンセル");
    expect(s).not.toContain("途中まで");
  });

  it("AC-331: failed midway (extracted > 0) => ERROR DIALOG with 'partway', N/M, destination, failed entry and cause; one reload without clearing the selection", async () => {
    const h = go({
      extract: () =>
        result({ outcome: "failed", extracted: 2, total: 5, error: { code: "zip_corrupt", message: "CRC mismatch", entryPath: "data/big.bin" } }),
    });
    await h.run("zip_extract");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    const spec = h.confirmSpec();
    expect(spec.buttons).toHaveLength(1);
    const text = JSON.stringify(spec);
    for (const part of ["途中まで", "2/5", "C:\\\\work\\\\a", "data/big.bin", "CRC mismatch"]) expect(text).toContain(part);
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload.mock.calls[0][0]?.clearSelection).toBeFalsy();
    expect(h.violations).toEqual([]);
  });

  it("AC-331-1: failed with extracted == 0 => the ordinary error dialog: no 'partway' notice", async () => {
    const h = go({
      extract: () => result({ outcome: "failed", extracted: 0, total: 5, error: { code: "zip_corrupt", message: "bad header", entryPath: "a.bin" } }),
    });
    await h.run("zip_extract");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(h.confirmSpec());
    expect(text).not.toContain("途中まで");
    expect(text).toContain("bad header");
  });

  it("an Err from extract (rejected before writing, e.g. conflict R-375/R-376 or insufficient_space) => error dialog; still ONE reload (R-397: every outcome)", async () => {
    const h = go({
      extract: () => {
        throw arcErr("insufficient_space", "need 5 GiB");
      },
    });
    await h.run("zip_extract");
    expect(h.modal.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.confirmSpec())).toContain("need 5 GiB");
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.reload.mock.calls[0][0]?.clearSelection).toBeFalsy();
  });

  it("R-387-2: an Err(canceled) (cancel arrived before the backend started) => the 'canceled' status, no dialog", async () => {
    const h = go({
      extract: () => {
        throw arcErr("canceled", "canceled");
      },
    });
    await h.run("zip_extract");
    expect(h.statusTexts()).toContain("展開をキャンセルしました");
    expect(h.modal.confirm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("busy guard and exceptions (R-386, MUST-63/SHOULD-83; AC-357)", () => {
  it("a second zip action while the first is still open is refused with a status and opens nothing; after the first ends the next works", async () => {
    const d = deferred<"submitted" | "cancelled">();
    const h = makeHarness({ focusedPath: p("a.zip"), formScripts: [() => d.promise, cancelForm] });
    await h.run("zip_extract");
    expect(h.modal.form).toHaveBeenCalledTimes(1);
    h.status.show.mockClear();
    expect(await h.run("zip_create")).toBe(true); // consumed, but refused
    expect(await h.run("zip_extract")).toBe(true);
    expect(h.modal.form).toHaveBeenCalledTimes(1);
    expect(h.status.show).toHaveBeenCalledTimes(2);
    d.resolve("cancelled");
    await flush();
    await h.run("zip_extract");
    expect(h.modal.form).toHaveBeenCalledTimes(2);
  });

  it("busy is refused while the progress dialog is open too (AC-357)", async () => {
    const gate = deferred<ExtractResult>();
    const h = makeHarness({
      focusedPath: p("a.zip"),
      formScripts: [submitSeq([{ destination: "C:\\work\\a" }])],
      extract: () => gate.promise,
    });
    await h.run("zip_extract");
    expect(h.modal.showProgress).toHaveBeenCalledTimes(1);
    await h.run("zip_create");
    expect(h.modal.form).toHaveBeenCalledTimes(1);
    gate.resolve({ extracted: 1, skipped: 0, total: 1, destination: "C:\\work\\a", outcome: "completed" });
    await flush();
  });

  it("modal.form THROWS synchronously (the shared single slot is taken by another controller) => the error is shown as a status, nothing else runs, busy is released", async () => {
    const h = makeHarness({ focusedPath: p("a.txt"), formScripts: [] });
    h.modal.form.mockImplementationOnce(() => {
      throw new Error("modal-host: a modal is already open (single slot)");
    });
    expect(await h.run("zip_create")).toBe(true);
    expect(h.statusTexts().join("\n")).toContain("already open");
    expect(h.ipc.checkCreate).not.toHaveBeenCalled();
    h.modal.form.mockImplementationOnce(() => Promise.resolve("cancelled" as const));
    await h.run("zip_create");
    expect(h.modal.form).toHaveBeenCalledTimes(2);
  });

  it("modal.confirm rejecting (dialog failure) is surfaced and does not wedge later actions", async () => {
    const h = makeHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => ({ outputPath: out, overwriteRequired: true }),
      formScripts: [submitSeq([{ outputPath: "C:\\work\\o.zip" }]), cancelForm],
    });
    h.modal.confirm.mockRejectedValueOnce(new Error("dialog exploded"));
    await h.run("zip_create");
    expect(h.statusTexts().join("\n")).toContain("dialog exploded");
    await h.run("zip_create");
    expect(h.modal.form).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Integration with the REAL shared modal-host (single slot, real form/submit
// semantics, real "cancel fires once"). Everything else is still injected.
describe("with the real modal-host (SPEC-0200-0001 §3.4.1: exclusion relies on the single slot)", () => {
  function realHarness(opts: HarnessOptions = {}) {
    const host = createModalHost();
    const base = makeHarness(opts);
    const status = { show: vi.fn() };
    const reload = vi.fn(async () => null as string | null);
    const controller = createArchiveController({
      ipc: base.ipc,
      modal: host,
      status,
      context: () => ({ currentPath: DIR, entries: ENTRIES, selected: opts.selected ?? [], focusedPath: opts.focusedPath ?? null }),
      reload,
    } as never);
    return { host, ipc: base.ipc, status, reload, unlisten: base.unlisten, controller, start: (a: string) => controller.handleAction(a) };
  }

  it("AC-312 end to end: form -> overwrite confirm (default cancel) -> Escape/cancel -> the form is back with the previous INPUT; then a good submit runs create", async () => {
    let n = 0;
    const r = realHarness({
      focusedPath: p("a.txt"),
      checkCreate: (_i, out) => (n++ === 0 ? { outputPath: "C:\\work\\out.zip", overwriteRequired: true } : { outputPath: out, overwriteRequired: false }),
    });
    r.start("zip_create");
    await flush();
    expect(r.host.top?.kind).toBe("form");
    r.host.setFieldValue("outputPath", "out");
    r.host.dispatch({ type: "submit" });
    await flush();
    expect(r.host.top?.kind).toBe("confirm");
    expect((r.host.top?.spec as { defaultButtonId: string }).defaultButtonId).toBe("cancel");
    r.host.dispatch({ type: "cancel" });
    await flush();
    expect(r.host.top?.kind).toBe("form");
    expect(r.host.top?.values?.outputPath).toBe("out");
    expect(r.ipc.create).not.toHaveBeenCalled();
    r.host.setFieldValue("outputPath", "C:\\work\\other.zip");
    r.host.dispatch({ type: "submit" });
    await flush();
    expect(r.ipc.create).toHaveBeenCalledTimes(1);
    expect(r.host.isOpen).toBe(false);
  });

  it("AC-352 / R-43-style: Escape twice on the progress dialog sends archive_cancel exactly ONCE; canceled result => status, dialog closed", async () => {
    const gate = deferred<CreateResult>();
    const r = realHarness({ focusedPath: p("a.txt"), create: () => gate.promise });
    r.start("zip_create");
    await flush();
    r.host.dispatch({ type: "submit" });
    await flush();
    expect(r.host.top?.kind).toBe("progress");
    r.host.dispatch({ type: "cancel" });
    r.host.dispatch({ type: "cancel" });
    await flush();
    expect(r.ipc.cancel).toHaveBeenCalledTimes(1);
    expect(r.ipc.cancel).toHaveBeenCalledWith("op-1");
    gate.reject(arcErr("canceled", "canceled"));
    await flush();
    expect(r.host.isOpen).toBe(false);
    expect(r.status.show).toHaveBeenCalledWith("ZIPの作成をキャンセルしました");
    expect(r.unlisten).toHaveBeenCalledTimes(1);
  });

  it("AC-340/AC-342 end to end: the conflict dialog opens with the checkbox CHECKED and default cancel; cancel => no extraction, status, slot free", async () => {
    const r = realHarness({ focusedPath: p("a.zip"), conflicts: [{ entryPath: "a.txt" }] });
    r.start("zip_extract");
    await flush();
    expect(r.host.top?.kind).toBe("form");
    r.host.dispatch({ type: "submit" });
    await flush();
    expect(r.host.top?.kind).toBe("confirm");
    expect(r.host.top?.checked).toBe(true);
    expect((r.host.top?.spec as { defaultButtonId: string }).defaultButtonId).toBe("cancel");
    r.host.dispatch({ type: "cancel" });
    await flush();
    expect(r.ipc.extract).not.toHaveBeenCalled();
    expect(r.host.isOpen).toBe(false);
    expect(r.status.show).toHaveBeenCalledWith("展開をキャンセルしました");
  });

  it("R-395-1 end to end: a pre-validation error keeps the form open with the error shown; a second submit succeeds", async () => {
    let n = 0;
    const r = realHarness({
      focusedPath: p("a.zip"),
      detect: (_z, d) => {
        if (n++ === 0) throw arcErr("zip_corrupt", "bad", "");
        return { destination: d, totalEntries: 1, conflicts: [] };
      },
    });
    r.start("zip_extract");
    await flush();
    r.host.dispatch({ type: "submit" });
    await flush();
    expect(r.host.top?.kind).toBe("form");
    expect(typeof r.host.top?.error).toBe("string");
    expect(r.host.top?.submitting).toBe(false);
    r.host.dispatch({ type: "submit" });
    await flush();
    expect(r.ipc.extract).toHaveBeenCalledTimes(1);
  });

  it("single slot: if ANOTHER feature's dialog is open, starting a zip action shows an error status, does not crash and does not disturb the open dialog", async () => {
    const r = realHarness({ focusedPath: p("a.txt") });
    const other = r.host.confirm({
      title: "他の操作",
      lines: [],
      buttons: [{ id: "ok", label: "OK" }],
      defaultButtonId: "ok",
      cancelButtonId: "ok",
    });
    expect(r.start("zip_create")).toBe(true);
    await flush();
    expect(r.status.show).toHaveBeenCalled();
    expect(r.host.top?.kind).toBe("confirm");
    expect(r.ipc.checkCreate).not.toHaveBeenCalled();
    r.host.dispatch({ type: "pressButton", id: "ok" });
    await other;
  });
});
