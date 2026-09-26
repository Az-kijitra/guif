import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0010 R-17 (each feature implements its own actions; the
//   keyboard layer only resolves ids), §4.2 (action set), SPEC-0300-0011 R-14
//   (7 file-operation actions reachable from the keyboard), R-10-1 / AC-02-1 /
//   AC-02-2 (MUST-61: operate on displayed entries only), R-208/R-209
//   (file operations are not navigation: afterUserNavigation is not used),
//   SPEC-0300-0009 R-60~R-63 (existing movement/selection cases).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.5
//   (routes/list-action-wiring.ts: createListActionHandler(deps), the thin
//   switch extracted from +page.svelte; `onListAction: (action, event)` now
//   forwards `event`), §3.3.13-3 (the injected context() reports focusedPath
//   only if it is in filteredEntries, and selected ∩ filteredEntries).
// Module under test (not yet implemented): ./list-action-wiring.ts (routes
//   wiring: every dependency injected; imports no feature module).
//
// Contract assumed (documented in the handback report):
//   createListActionHandler({ fileList, filteredEntries: () => [...],
//     rowsPerColumn: () => number, afterUserNavigation, activateSearch,
//     openHistoryList(mode), addJump(path), currentPath: () => string,
//     fileOps: { handleAction(action, event): boolean } })
//     -> (action: string | null, event) => boolean
//   createFileOpsContext({ currentPath, entries, filteredEntries, selected,
//     focusedPath }) -> () => { currentPath, entries, selected: string[],
//     focusedPath: string | null }   (all inputs are getters)

import { createFileOpsController } from "$lib/features/file-ops/file-ops-controller";
import { createAfterUserNavigation } from "./navigation-wiring";
import { createFileOpsContext, createListActionHandler } from "./list-action-wiring";

const ev = (over: Partial<{ shiftKey: boolean }> = {}) => ({
  key: "x",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
});

function makeDeps(over: Record<string, unknown> = {}) {
  const filtered = [{ name: "a", path: "C:\\d\\a" }];
  const deps = {
    fileList: {
      moveRow: vi.fn(),
      moveColumn: vi.fn(),
      openFocused: vi.fn(async () => "C:\\d\\sub" as string | null),
      goParent: vi.fn(async () => "C:\\" as string | null),
      toggleFocused: vi.fn(),
      selectAll: vi.fn(),
    },
    filteredEntries: () => filtered,
    rowsPerColumn: () => 10,
    afterUserNavigation: vi.fn(async (pr: Promise<string | null>) => pr),
    activateSearch: vi.fn(),
    openHistoryList: vi.fn(),
    addJump: vi.fn(),
    currentPath: () => "C:\\d",
    fileOps: { handleAction: vi.fn(() => true) },
    ...over,
  };
  return { deps, filtered };
}

describe("createListActionHandler: the 7 file-operation actions (§3.3.5)", () => {
  it.each(["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"])(
    "%s is forwarded to fileOps.handleAction(action, event) with the SAME event object",
    (action) => {
      const { deps } = makeDeps();
      const handler = createListActionHandler(deps as never);
      const event = ev({ shiftKey: true });
      expect(handler(action, event)).toBe(true);
      expect(deps.fileOps.handleAction).toHaveBeenCalledTimes(1);
      expect(deps.fileOps.handleAction).toHaveBeenCalledWith(action, event);
    },
  );

  it("R-56-4: the second argument (event.shiftKey for Shift+Delete) reaches the controller unchanged", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    handler("delete", ev({ shiftKey: true }));
    expect((deps.fileOps.handleAction.mock.calls[0] as unknown as [string, { shiftKey: boolean }])[1].shiftKey).toBe(true);
  });

  it("the return value of handleAction is the handler's return value (consumed/not consumed)", () => {
    const { deps } = makeDeps({ fileOps: { handleAction: vi.fn(() => false) } });
    const handler = createListActionHandler(deps as never);
    expect(handler("copy", ev())).toBe(false);
  });

  it("R-208/R-209: file operations never call afterUserNavigation (no visit is recorded)", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    for (const a of ["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"]) handler(a, ev());
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
  });
});

describe("createListActionHandler: existing cases keep working (regression of the extracted switch)", () => {
  it("null action => false and nothing runs", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler(null, ev())).toBe(false);
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
  });

  it("an unknown / not-yet-implemented action => false and no file operation", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("refresh", ev())).toBe(false);
    expect(handler("toggle_hidden", ev())).toBe(false);
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
  });

  it("move_up / move_down => fileList.moveRow(filteredEntries, 'up'/'down')", () => {
    const { deps, filtered } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("move_up", ev())).toBe(true);
    expect(handler("move_down", ev())).toBe(true);
    expect(deps.fileList.moveRow).toHaveBeenNthCalledWith(1, filtered, "up");
    expect(deps.fileList.moveRow).toHaveBeenNthCalledWith(2, filtered, "down");
  });

  it("move_left / move_right => moveColumn(filteredEntries, dir, rowsPerColumn) with a floor of 1", () => {
    const { deps, filtered } = makeDeps({ rowsPerColumn: () => 0 });
    const handler = createListActionHandler(deps as never);
    handler("move_left", ev());
    handler("move_right", ev());
    expect(deps.fileList.moveColumn).toHaveBeenNthCalledWith(1, filtered, "left", 1);
    expect(deps.fileList.moveColumn).toHaveBeenNthCalledWith(2, filtered, "right", 1);
  });

  it("open / go_parent => navigation goes through afterUserNavigation (R-208)", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev())).toBe(true);
    expect(handler("go_parent", ev())).toBe(true);
    expect(deps.fileList.openFocused).toHaveBeenCalledTimes(1);
    expect(deps.fileList.goParent).toHaveBeenCalledTimes(1);
    expect(deps.afterUserNavigation).toHaveBeenCalledTimes(2);
  });

  it("select_toggle / select_all act on the FILTERED entries (R-123)", () => {
    const { deps, filtered } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("select_toggle", ev())).toBe(true);
    expect(handler("select_all", ev())).toBe(true);
    expect(deps.fileList.toggleFocused).toHaveBeenCalledWith(filtered);
    expect(deps.fileList.selectAll).toHaveBeenCalledWith(filtered);
  });

  it("search => activateSearch; history / history_jump_list => openHistoryList('history' / 'jump')", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("search", ev())).toBe(true);
    expect(handler("history", ev())).toBe(true);
    expect(handler("history_jump_list", ev())).toBe(true);
    expect(deps.activateSearch).toHaveBeenCalledTimes(1);
    expect(deps.openHistoryList).toHaveBeenNthCalledWith(1, "history");
    expect(deps.openHistoryList).toHaveBeenNthCalledWith(2, "jump");
  });

  it("jump_add => addJump(currentPath); with an undetermined (empty) current path nothing is registered (R-212-1) but the key is still consumed", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("jump_add", ev())).toBe(true);
    expect(deps.addJump).toHaveBeenCalledWith("C:\\d");

    const { deps: empty } = makeDeps({ currentPath: () => "" });
    const h2 = createListActionHandler(empty as never);
    expect(h2("jump_add", ev())).toBe(true);
    expect(empty.addJump).not.toHaveBeenCalled();
  });
});

describe("createFileOpsContext (MUST-61, §3.3.13-3)", () => {
  const A = { name: "a", path: "C:\\d\\a" };
  const B = { name: "b", path: "C:\\d\\b" };
  const C = { name: "c", path: "C:\\d\\c" };

  function ctx(over: Record<string, unknown> = {}) {
    return createFileOpsContext({
      currentPath: () => "C:\\d",
      entries: () => [A, B, C],
      filteredEntries: () => [C],
      selected: () => new Set([A.path, B.path, C.path]),
      focusedPath: () => A.path,
      ...over,
    } as never)();
  }

  it("passes the current path through", () => {
    expect(ctx().currentPath).toBe("C:\\d");
  });

  it("selected = the selection intersected with filteredEntries", () => {
    expect(ctx().selected).toEqual([C.path]);
  });

  it("focusedPath is null when the focused entry is NOT displayed (filtered out)", () => {
    expect(ctx({ focusedPath: () => A.path }).focusedPath).toBeNull();
  });

  it("focusedPath is reported when the focused entry IS displayed", () => {
    expect(ctx({ focusedPath: () => C.path }).focusedPath).toBe(C.path);
  });

  it("an empty / missing focused path => null", () => {
    expect(ctx({ focusedPath: () => "" }).focusedPath).toBeNull();
    expect(ctx({ focusedPath: () => null }).focusedPath).toBeNull();
  });

  it("with no search filter (everything displayed) nothing is dropped", () => {
    const all = ctx({ filteredEntries: () => [A, B, C], focusedPath: () => B.path });
    expect(all.selected.sort()).toEqual([A.path, B.path, C.path]);
    expect(all.focusedPath).toBe(B.path);
  });

  it("the entries handed to the controller include the displayed ones with name and path (rename/delete need names)", () => {
    const shown = ctx({ filteredEntries: () => [B, C] }).entries;
    expect(shown).toEqual(expect.arrayContaining([expect.objectContaining({ name: "b", path: B.path }), expect.objectContaining({ name: "c", path: C.path })]));
  });

  it("is re-evaluated on every call (getters, not a snapshot)", () => {
    let focused: string | null = A.path;
    const get = createFileOpsContext({
      currentPath: () => "C:\\d",
      entries: () => [A, B, C],
      filteredEntries: () => [A, B, C],
      selected: () => new Set<string>(),
      focusedPath: () => focused,
    } as never);
    expect(get().focusedPath).toBe(A.path);
    focused = B.path;
    expect(get().focusedPath).toBe(B.path);
  });
});

describe("MUST-61 end to end: routes context + real controller + handler (AC-02-1, AC-02-2)", () => {
  const A = { name: "alpha", path: "C:\\d\\alpha" };
  const B = { name: "bravo", path: "C:\\d\\bravo" };
  const C = { name: "gamma", path: "C:\\d\\gamma" };

  function wire(opts: { selected: string[]; focused: string | null; displayed: { name: string; path: string }[]; answers?: string[] }) {
    const answers = [...(opts.answers ?? [])];
    const ok = (n: number) => ({ ok: n, failed: 0, total: n, skipped: 0, failures: [] });
    const modal = {
      confirm: vi.fn(async () => ({ buttonId: answers.shift() ?? "cancel", checked: false })),
      form: vi.fn(() => new Promise<never>(() => {})),
      showProgress: vi.fn(() => ({ update: vi.fn(), close: vi.fn() })),
    };
    const status = { show: vi.fn() };
    const ipc = {
      detectConflicts: vi.fn(async () => []),
      copy: vi.fn(async (_i: string, items: string[]) => ok(items.length)),
      move: vi.fn(async (_i: string, items: string[]) => ok(items.length)),
      cancel: vi.fn(async () => {}),
      deleteTrash: vi.fn(async (paths: string[]) => ok(paths.length)),
      deletePermanently: vi.fn(async (paths: string[]) => ok(paths.length)),
      rename: vi.fn(async () => ""),
      create: vi.fn(async () => {}),
      listenProgress: vi.fn(async () => () => {}),
      newOperationId: vi.fn(() => "op"),
    };
    const clipboard = { set: vi.fn(async () => {}), get: vi.fn(async () => null), clear: vi.fn(async () => {}) };
    const reload = vi.fn(async () => null as string | null);
    const context = createFileOpsContext({
      currentPath: () => "C:\\d",
      entries: () => [A, B, C],
      filteredEntries: () => opts.displayed,
      selected: () => new Set(opts.selected),
      focusedPath: () => opts.focused,
    } as never);
    const fileOps = createFileOpsController({ ipc, modal, status, clipboard, context, reload } as never);
    const recordVisit = vi.fn();
    const afterUserNavigation = createAfterUserNavigation(recordVisit);
    const handler = createListActionHandler({
      fileList: {
        moveRow: vi.fn(),
        moveColumn: vi.fn(),
        openFocused: vi.fn(),
        goParent: vi.fn(),
        toggleFocused: vi.fn(),
        selectAll: vi.fn(),
      },
      filteredEntries: () => opts.displayed,
      rowsPerColumn: () => 5,
      afterUserNavigation,
      activateSearch: vi.fn(),
      openHistoryList: vi.fn(),
      addJump: vi.fn(),
      currentPath: () => "C:\\d",
      fileOps,
    } as never);
    return { handler, modal, status, ipc, clipboard, reload, recordVisit };
  }
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  it("AC-02-1: focus on a hidden entry + no visible selection + delete => only the zero-target status; no confirm; nothing deleted", async () => {
    const w = wire({ selected: [], focused: A.path, displayed: [C] });
    expect(w.handler("delete", ev())).toBe(true);
    await flush();
    expect(w.status.show).toHaveBeenCalled();
    expect(w.modal.confirm).not.toHaveBeenCalled();
    expect(w.ipc.deleteTrash).not.toHaveBeenCalled();
    expect(w.ipc.deletePermanently).not.toHaveBeenCalled();
  });

  it("AC-02-1 (selection hidden): selected entries are all filtered out => delete does nothing", async () => {
    const w = wire({ selected: [A.path, B.path], focused: A.path, displayed: [C] });
    w.handler("delete", ev({ shiftKey: true }));
    await flush();
    expect(w.modal.confirm).not.toHaveBeenCalled();
    expect(w.ipc.deletePermanently).not.toHaveBeenCalled();
  });

  it("AC-02-2: a partly hidden selection => only the displayed selected entry is confirmed and deleted", async () => {
    const w = wire({ selected: [A.path, C.path], focused: C.path, displayed: [C], answers: ["delete"] });
    w.handler("delete", ev());
    await flush();
    const spec = (w.modal.confirm.mock.calls[0] as unknown as [{ lines: string[] }])[0];
    expect(spec.lines.join("\n")).toContain("gamma");
    expect(spec.lines.join("\n")).not.toContain("alpha");
    expect(w.ipc.deleteTrash).toHaveBeenCalledWith([C.path]);
  });

  it("copy of a partly hidden selection stores only the displayed entries", async () => {
    const w = wire({ selected: [A.path, C.path], focused: null, displayed: [C] });
    w.handler("copy", ev());
    await flush();
    expect(w.clipboard.set).toHaveBeenCalledWith({ paths: [C.path], origin: "internal-copy" });
  });

  it("rename with the focus on a hidden entry has no target", async () => {
    const w = wire({ selected: [], focused: A.path, displayed: [C] });
    w.handler("rename", ev());
    await flush();
    expect(w.modal.form).not.toHaveBeenCalled();
  });

  it("R-208/R-209: running file operations never records a visit", async () => {
    const w = wire({ selected: [C.path], focused: C.path, displayed: [C], answers: ["delete"] });
    w.handler("delete", ev());
    await flush();
    expect(w.reload).toHaveBeenCalled();
    expect(w.recordVisit).not.toHaveBeenCalled();
  });
});
