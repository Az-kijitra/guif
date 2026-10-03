import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 R-305, R-307-1 / MUST-61 (both controllers see the SAME
//   displayed-only context), R-308-2, R-341-1 / R-322-1 (relative paths are
//   resolved against the displayed directory: the current path is the
//   `baseDir` sent to the backend), R-397 / R-398 (reload with focus /
//   clear-selection only after a success), R-387-1, R-386 (event
//   `archive://progress`), SPEC-0300-0011 R-14 (the 7 file operations keep
//   working after the extraction of the assembly), AC-304 (c), AC-385.
//   MUST-67: an end-to-end check that the entry type reaches the archive
//   controller (a DIRECTORY named x.zip is not extractable).
// Architecture: SPEC-0200-0001 §3.4.7 (`routes/operations-wiring.ts`:
//   `createOperationControllers(deps)` assembles the file-ops controller
//   (moved out of +page.svelte together with its ~18-line assembly) and the
//   archive controller from ONE `createFileOpsContext(...)`; it holds no
//   state and no business logic; `+page.svelte` calls it once and gets
//   `{ fileOps, archive }`), §3.4.6 (`routes/archive-ipc.ts` binds the real
//   shared/ipc/archive wrappers), §4.1 (routes may import several features).
// Module under test (not yet implemented): ./operations-wiring.ts
//
// Contract assumed (documented in the handback report):
//   createOperationControllers({ modal, status, currentPath: () => string,
//     entries: () => readonly {name,path,entryType}[], filteredEntries: () => ...,
//     selected: () => ReadonlySet<string>, focusedPath: () => string | null,
//     reload: (opts?) => Promise<unknown> }) -> { fileOps, archive }
//   fileOps.handleAction(action, event): boolean   (unchanged Phase 2 API)
//   archive.handleAction(action): boolean
// The real ipc wrappers are used: only the Tauri boundary (`invoke`, `listen`)
// is mocked, so the command names / camelCase arguments are verified too.

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createOperationControllers } from "./operations-wiring";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const DIR = "C:\\d";
type Ent = { name: string; path: string; entryType: "file" | "dir" };
const ent = (name: string, entryType: "file" | "dir" = "file"): Ent => ({ name, path: `${DIR}\\${name}`, entryType });
const A = ent("a.txt");
const Z = ent("a.zip");
const XD = ent("x.zip", "dir"); // a DIRECTORY that merely looks like a ZIP
const HIDDEN = ent("hidden.zip");

function wire(over: Record<string, unknown> = {}) {
  const forms: Record<string, any>[] = [];
  const modal = {
    confirm: vi.fn(async (_s: Record<string, any>) => ({ buttonId: "cancel", checked: false })),
    form: vi.fn((spec: Record<string, any>) => {
      forms.push(spec);
      return new Promise<"submitted" | "cancelled">(() => {});
    }),
    showProgress: vi.fn(() => ({ update: vi.fn(), close: vi.fn() })),
  };
  const status = { show: vi.fn() };
  const reload = vi.fn(async (_o?: { focusPath?: string; clearSelection?: boolean }) => null as string | null);
  const state = {
    entries: [A, Z, XD, HIDDEN] as Ent[],
    filtered: [A, Z, XD] as Ent[],
    selected: new Set<string>(),
    focused: null as string | null,
    ...over,
  };
  const ctrls = createOperationControllers({
    modal,
    status,
    currentPath: () => DIR,
    entries: () => state.entries,
    filteredEntries: () => state.filtered,
    selected: () => state.selected,
    focusedPath: () => state.focused,
    reload,
  } as never);
  return { ...ctrls, modal, status, reload, state, forms };
}

afterEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
});

describe("createOperationControllers: assembly (SPEC-0200-0001 §3.4.7)", () => {
  it("returns { fileOps, archive }, each with a handleAction function", () => {
    const w = wire();
    expect(typeof w.fileOps.handleAction).toBe("function");
    expect(typeof w.archive.handleAction).toBe("function");
  });

  it("the file-ops controller is assembled as before: copy reports the count (SPEC-0300-0011 R-14); Phase 11: the OS port writes the OS clipboard through clipboard_set_files", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: true, sequence: 5 });
    const w = wire({ selected: new Set([A.path]) });
    expect(w.fileOps.handleAction("copy", { shiftKey: false })).toBe(true);
    await flush();
    expect(w.status.show).toHaveBeenCalledWith("1件をコピーしました");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("clipboard_set_files", expect.objectContaining({ paths: [A.path], effect: "copy" }));
  });

  it("the file-ops controller does not react to zip actions and the archive controller does not react to file-op actions", () => {
    const w = wire({ focused: A.path });
    expect(w.fileOps.handleAction("zip_create", { shiftKey: false })).toBe(false);
    expect(w.archive.handleAction("copy")).toBe(false);
    expect(w.archive.handleAction("delete")).toBe(false);
  });
});

describe("shared displayed-only context (MUST-61, R-307-1, MUST-67)", () => {
  it("MUST-67 end to end: a directory named x.zip is 'not a ZIP file' - no dialog, no IPC", async () => {
    const w = wire({ focused: XD.path });
    expect(w.archive.handleAction("zip_extract")).toBe(true);
    await flush();
    expect(w.status.show).toHaveBeenCalledWith("ZIPファイルではありません");
    expect(w.modal.form).not.toHaveBeenCalled();
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });

  it("R-307-1 / AC-304 (d): a focused ZIP that is filtered out (not displayed) => 'no target'", async () => {
    const w = wire({ focused: HIDDEN.path });
    w.archive.handleAction("zip_extract");
    await flush();
    expect(w.status.show).toHaveBeenCalledWith("対象がありません");
    expect(w.modal.form).not.toHaveBeenCalled();
  });

  it("R-307-1: a selection that is only partly displayed archives ONLY the displayed entries (create form shows 1件)", async () => {
    const w = wire({ selected: new Set([A.path, HIDDEN.path]) });
    w.archive.handleAction("zip_create");
    await flush();
    expect(((w.forms[0].lines as string[]) ?? []).join("\n")).toContain("1件");
  });

  it("the file-ops controller shares the same restriction (delete of a hidden focus opens no confirm)", async () => {
    const w = wire({ focused: HIDDEN.path });
    w.fileOps.handleAction("delete", { shiftKey: false });
    await flush();
    expect(w.modal.confirm).not.toHaveBeenCalled();
  });

  it("the getters are re-evaluated on every action (a later focus change is honoured)", async () => {
    const w = wire({ focused: null });
    w.archive.handleAction("zip_extract");
    await flush();
    expect(w.status.show).toHaveBeenLastCalledWith("対象がありません");
    w.state.focused = Z.path;
    w.archive.handleAction("zip_extract");
    await flush();
    expect(w.modal.form).toHaveBeenCalledTimes(1);
  });
});

describe("archive controller wired to the real ipc wrappers (command names, camelCase arguments)", () => {
  it("create: the form's onSubmit calls archive_check_create with { items, outputPath, baseDir = the displayed directory }", async () => {
    vi.mocked(invoke).mockResolvedValue({ outputPath: "C:\\d\\out.zip", overwriteRequired: false });
    const w = wire({ focused: A.path });
    w.archive.handleAction("zip_create");
    await flush();
    const result = await w.forms[0].onSubmit({ outputPath: "out" });
    expect(result).toBeNull();
    expect(invoke).toHaveBeenCalledWith("archive_check_create", { items: [A.path], outputPath: "out", baseDir: DIR });
  });

  it("extract, whole chain: form -> archive_detect_conflicts -> progress (listen archive://progress BEFORE archive_extract) -> success => reload({ focusPath, clearSelection: true })", async () => {
    const order: string[] = [];
    vi.mocked(listen).mockImplementation(async (name: string) => {
      order.push(`listen:${name}`);
      return () => {};
    });
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      order.push(`invoke:${cmd}`);
      const a = args as Record<string, string>;
      if (cmd === "archive_detect_conflicts") return { destination: a.destination, totalEntries: 2, conflicts: [] };
      if (cmd === "archive_extract") return { extracted: 2, skipped: 0, total: 2, destination: a.destination, outcome: "completed" };
      return undefined;
    });
    const w = wire({ focused: Z.path });
    // The form promise of the fake never settles by itself: play the user.
    w.modal.form.mockImplementationOnce((spec: Record<string, any>) =>
      spec.onSubmit({ destination: "C:\\d\\a" }).then(() => "submitted" as const),
    );
    w.archive.handleAction("zip_extract");
    await flush();
    expect(order).toEqual(["invoke:archive_detect_conflicts", "listen:archive://progress", "invoke:archive_extract"]);
    expect(invoke).toHaveBeenCalledWith(
      "archive_extract",
      expect.objectContaining({ operationId: expect.any(String), zipPath: Z.path, destination: "C:\\d\\a", baseDir: DIR }),
    );
    expect(w.reload).toHaveBeenCalledWith({ focusPath: "C:\\d\\a", clearSelection: true });
  });

  it("the operation id used for the subscription filter is the one sent to archive_extract (R-387-1)", async () => {
    let handler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (_n: string, h: unknown) => {
      handler = h as (e: { payload: unknown }) => void;
      return () => {};
    });
    let sentId = "";
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      const a = args as Record<string, string>;
      if (cmd === "archive_detect_conflicts") return { destination: a.destination, totalEntries: 1, conflicts: [] };
      if (cmd === "archive_extract") {
        sentId = a.operationId;
        handler?.({ payload: { operationId: "someone-else", name: "ignored", index: 1, total: 1 } });
        handler?.({ payload: { operationId: sentId, name: "mine.txt", index: 1, total: 1 } });
        return { extracted: 1, skipped: 0, total: 1, destination: a.destination, outcome: "completed" };
      }
      return undefined;
    });
    const w = wire({ focused: Z.path });
    w.modal.form.mockImplementationOnce((spec: Record<string, any>) =>
      spec.onSubmit({ destination: "C:\\d\\a" }).then(() => "submitted" as const),
    );
    w.archive.handleAction("zip_extract");
    await flush();
    expect(sentId).not.toBe("");
    // Asserted AFTER the run: an expect thrown inside the invoke mock would be
    // swallowed by the controller's own error handling.
    const update = w.modal.showProgress.mock.results[0].value.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledWith({ label: "展開中 mine.txt (1/1)", index: 1, total: 1 });
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ label: expect.stringContaining("ignored") }));
  });
});

// ---------------------------------------------------------------------------
// Phase 11 (TDD, unit-test-writer 2026-10-03): the OS clipboard port replaces the internal one.
// SPEC-0300-0011 R-15-2 / R-15-3 / R-16 / R-19-2 / R-19-6 / CB-06 / CB-11;
// SPEC-0200-0001 §3.10.8 (one replacement point: operations-wiring) / §3.10.9.
// Only the Tauri boundary is mocked, so command names and camelCase argument names are verified too.
describe("OS clipboard port assembly (Phase 11)", () => {
  const EXT = "D:\\ext\\x.txt";

  function ipcMock(over: Record<string, unknown> = {}) {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd in over) {
        const v = over[cmd];
        if (typeof v === "function") return (v as (a: unknown) => unknown)(args);
        return v;
      }
      if (cmd === "clipboard_set_files") return { ok: true, sequence: 5 };
      if (cmd === "clipboard_get_files") return { state: "none", paths: [], sequence: 5 };
      if (cmd === "clipboard_clear_if_unchanged") return true;
      if (cmd === "fs_ops_detect_conflicts") return [];
      if (cmd === "fs_ops_copy" || cmd === "fs_ops_move") return { ok: 1, failed: 0, total: 1, skipped: 0, failures: [] };
      return undefined;
    });
    vi.mocked(listen).mockImplementation(async () => () => {});
  }

  it("the returned clipboard is the OS port: it has hasItems and afterMove", () => {
    ipcMock();
    const w = wire();
    expect(typeof w.clipboard.hasItems).toBe("function");
    expect(typeof w.clipboard.afterMove).toBe("function");
  });

  it("R-16: cut writes the OS clipboard with effect \"move\", copy with \"copy\"", async () => {
    ipcMock();
    const w = wire({ selected: new Set([A.path]) });
    w.fileOps.handleAction("cut", { shiftKey: false });
    await flush();
    expect(invoke).toHaveBeenCalledWith("clipboard_set_files", expect.objectContaining({ paths: [A.path], effect: "move" }));
    expect(w.status.show).toHaveBeenCalledWith("1件を切り取りました");
  });

  it("R-15-3 / CB-06: when the IPC rejects the status says the OS write failed (no dialog) and the app clipboard still pastes", async () => {
    ipcMock({ clipboard_set_files: () => Promise.reject(new Error("boom")) });
    const w = wire({ selected: new Set([A.path]) });
    w.fileOps.handleAction("copy", { shiftKey: false });
    await flush();
    expect(w.status.show).toHaveBeenCalledWith("1件をコピーしました(OSのクリップボードには書き込めませんでした)");
    expect(w.modal.confirm).not.toHaveBeenCalled();
    // OS has no files (get -> none): the app-internal copy is pasted (R-19-4)
    w.fileOps.handleAction("paste", { shiftKey: false });
    await flush();
    expect(invoke).toHaveBeenCalledWith("fs_ops_copy", expect.objectContaining({ items: [A.path], destination: DIR }));
  });

  it("R-19-2: paste reads the OS clipboard (probeOnly false); OS files are pasted as a COPY of exactly those paths", async () => {
    ipcMock({ clipboard_get_files: { state: "files", paths: [EXT], sequence: 9 } });
    const w = wire();
    w.fileOps.handleAction("paste", { shiftKey: false });
    await flush();
    expect(invoke).toHaveBeenCalledWith("clipboard_get_files", expect.objectContaining({ probeOnly: false }));
    expect(invoke).toHaveBeenCalledWith("fs_ops_copy", expect.objectContaining({ items: [EXT], destination: DIR }));
    expect(invoke).not.toHaveBeenCalledWith("fs_ops_move", expect.anything());
  });

  it("R-19-6: a cut whose OS content is unchanged is MOVED, and after full success the OS is cleared only if unchanged", async () => {
    ipcMock({
      clipboard_set_files: { ok: true, sequence: 5 },
      clipboard_get_files: { state: "files", paths: [A.path], sequence: 5 },
    });
    const w = wire({ selected: new Set([A.path]) });
    w.fileOps.handleAction("cut", { shiftKey: false });
    await flush();
    w.fileOps.handleAction("paste", { shiftKey: false });
    await flush();
    expect(invoke).toHaveBeenCalledWith("fs_ops_move", expect.objectContaining({ items: [A.path] }));
    expect(invoke).toHaveBeenCalledWith("clipboard_clear_if_unchanged", { sequence: 5 });
  });

  it("R-19-5: a cut followed by a changed OS clipboard (sequence differs) pastes as a COPY with the CB-13 notice", async () => {
    ipcMock({
      clipboard_set_files: { ok: true, sequence: 5 },
      clipboard_get_files: { state: "none", paths: [], sequence: 8 },
    });
    const w = wire({ selected: new Set([A.path]) });
    w.fileOps.handleAction("cut", { shiftKey: false });
    await flush();
    w.fileOps.handleAction("paste", { shiftKey: false });
    await flush();
    expect(invoke).toHaveBeenCalledWith("fs_ops_copy", expect.objectContaining({ items: [A.path] }));
    expect(invoke).not.toHaveBeenCalledWith("fs_ops_move", expect.anything());
    expect(w.status.show.mock.calls.some((c) => String(c[0]).endsWith("(切り取りの後にクリップボードが変わったため、コピーしました)"))).toBe(true);
  });

  it("CB-11: clipboard.hasItems() asks clipboard_get_files with probeOnly true", async () => {
    ipcMock({ clipboard_get_files: { state: "files", paths: [], sequence: 1 } });
    const w = wire();
    expect(await w.clipboard.hasItems()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("clipboard_get_files", expect.objectContaining({ probeOnly: true }));
  });
});
