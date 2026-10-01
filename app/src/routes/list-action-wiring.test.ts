import { describe, expect, it, vi } from "vitest";
import type { NavigateResult } from "$lib/shared/navigation-result";

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
//     fileOps: { handleAction(action, event): boolean },
//     focusedEntry: () => { entryType: "file" | "dir"; path: string } | null,
//     viewer: { openFile(path): void; openWithOsAssociation(path): void } })
//     -> (action: string | null, event) => boolean
//   createFileOpsContext({ currentPath, entries, filteredEntries, selected,
//     focusedPath }) -> () => { currentPath, entries, selected: string[],
//     focusedPath: string | null }   (all inputs are getters)
//
// SPEC-0300-0015 R-401-2/R-401-3/R-402-2/R-404/R-407; SPEC-0200-0001 §3.5.3:
// `case "open"` no longer unconditionally calls `fileList.openFocused()` --
// it branches on `deps.focusedEntry()`'s `entryType` and `event.shiftKey`,
// using `open-decision.ts`'s judgment (navigate-dir/open-file/os-open/noop).
// This REPLACES the single pre-Phase-6 "open / go_parent" test below with the
// finer-grained cases the new branching requires (a deliberate, spec-driven
// test update, not a regression -- `go_parent`'s own case is unchanged and
// kept as its own test).

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
  const filtered = [{ name: "a", path: "C:\\d\\a", entryType: "file" as "file" | "dir" }];
  const deps = {
    fileList: {
      moveRow: vi.fn(),
      moveColumn: vi.fn(),
      openFocused: vi.fn(async (): Promise<NavigateResult> => ({ status: "success", path: "C:\\d\\sub" })),
      goParent: vi.fn(async (): Promise<NavigateResult> => ({ status: "success", path: "C:\\" })),
      toggleFocused: vi.fn(),
      selectAll: vi.fn(),
      // Phase 7 (SPEC-0200-0001 §3.6.6, §3.6.11.4/.5 MUST-87/94):
      toggleTree: vi.fn(),
      toggleHidden: vi.fn(),
      toggleSize: vi.fn(),
      toggleTime: vi.fn(),
      clearSelection: vi.fn(),
      pageUp: vi.fn(),
      pageDown: vi.fn(),
      showTree: vi.fn(() => true),
      showHidden: vi.fn(() => false),
      sortKey: vi.fn(() => "name" as const),
    },
    filteredEntries: () => filtered,
    rowsPerColumn: () => 10,
    afterUserNavigation: vi.fn(async (pr: Promise<NavigateResult>) => pr),
    activateSearch: vi.fn(),
    openHistoryList: vi.fn(),
    addJump: vi.fn(),
    currentPath: () => "C:\\d",
    fileOps: { handleAction: vi.fn(() => true) },
    archive: { handleAction: vi.fn(() => true) },
    // SPEC-0300-0015 §3.5.3: the "open" case's new dependencies.
    focusedEntry: () => filtered[0] ?? null,
    viewer: { openFile: vi.fn(), openWithOsAssociation: vi.fn() },
    // Phase 7 (SPEC-0200-0001 §3.6.6, §3.6.11.4(f)/MUST-94): tree composition
    // and the R-14-14  file-op guard, injected here (NOT imported) to keep
    // list-action-wiring.ts import-free of tree-state.svelte.ts (§4.1).
    isTreeFocused: () => false,
    tree: { clear: vi.fn(), followTo: vi.fn(async () => undefined), applyHiddenFilesChanged: vi.fn() },
    sortMenu: { toggle: vi.fn() },
    focus: { container: vi.fn() },
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
    // Test fix (code-generator, 2026-09-28, SPEC-0200-0001 §3.6.6): this
    // Phase 1-era assertion originally covered `toggle_hidden` alongside
    // `refresh` as "not yet implemented". Phase 7 implements `toggle_hidden`
    // (tested exhaustively below, "the 8 new Phase 7 actions"), so asserting
    // `false` for it here is now stale and directly contradicts that new,
    // more specific coverage against the SAME `makeDeps()` shape -- narrowed
    // to `refresh` (still unimplemented, R-26) to remove the contradiction
    // without weakening either test's actual intent.
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("refresh", ev())).toBe(false);
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

  it("go_parent => navigation goes through afterUserNavigation (R-208)", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("go_parent", ev())).toBe(true);
    expect(deps.fileList.goParent).toHaveBeenCalledTimes(1);
    expect(deps.afterUserNavigation).toHaveBeenCalledTimes(1);
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

describe('createListActionHandler: "open" branches on entryType x shiftKey (SPEC-0300-0015 R-401-2/R-401-3/R-402-2/R-404/R-407, §3.5.3)', () => {
  it("AC-400/R-404: a FILE focused, no Shift => viewer.openFile(path); no afterUserNavigation, no fileList.openFocused", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev())).toBe(true);
    expect(deps.viewer.openFile).toHaveBeenCalledWith("C:\\d\\a");
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
    expect(deps.fileList.openFocused).not.toHaveBeenCalled();
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
  });

  it("AC-401/R-403: a DIRECTORY focused, no Shift => unchanged behavior (fileList.openFocused via afterUserNavigation); no viewer call", () => {
    const dirEntry = { name: "sub", path: "C:\\d\\sub", entryType: "dir" as const };
    const { deps } = makeDeps({ filteredEntries: () => [dirEntry], focusedEntry: () => dirEntry });
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev())).toBe(true);
    expect(deps.fileList.openFocused).toHaveBeenCalledTimes(1);
    expect(deps.afterUserNavigation).toHaveBeenCalledTimes(1);
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
  });

  it("AC-407/R-402-1: no focused entry, no Shift => the existing openFocused/afterUserNavigation fallback runs (its own no-op behavior applies), no viewer call", () => {
    const { deps } = makeDeps({ focusedEntry: () => null });
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev())).toBe(true);
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
  });

  it("AC-405/R-401-2: a FILE focused, Shift+Enter => viewer.openWithOsAssociation(path); no viewer.openFile, no fileList.openFocused", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev({ shiftKey: true }))).toBe(true);
    expect(deps.viewer.openWithOsAssociation).toHaveBeenCalledWith("C:\\d\\a");
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
    expect(deps.fileList.openFocused).not.toHaveBeenCalled();
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
  });

  it("AC-405-1/R-401-3: a DIRECTORY focused, Shift+Enter => nothing happens (no folder move, no OS launch)", () => {
    const dirEntry = { name: "sub", path: "C:\\d\\sub", entryType: "dir" as const };
    const { deps } = makeDeps({ filteredEntries: () => [dirEntry], focusedEntry: () => dirEntry });
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev({ shiftKey: true }))).toBe(true);
    expect(deps.fileList.openFocused).not.toHaveBeenCalled();
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
  });

  it("R-401-4/R-402-1: no focused entry, Shift+Enter => nothing happens at all (no folder move either)", () => {
    const { deps } = makeDeps({ focusedEntry: () => null });
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev({ shiftKey: true }))).toBe(true);
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
    expect(deps.fileList.openFocused).not.toHaveBeenCalled();
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
  });

  it("R-408: the viewer call is fire-and-forget (the handler returns synchronously, not awaiting the viewer promise)", () => {
    const { deps } = makeDeps({ viewer: { openFile: vi.fn(() => new Promise(() => {})), openWithOsAssociation: vi.fn() } });
    const handler = createListActionHandler(deps as never);
    // Must not hang / must return true synchronously even though openFile's
    // promise never resolves.
    expect(handler("open", ev())).toBe(true);
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
    const afterUserNavigation = createAfterUserNavigation({ recordVisit, notifyFailure: vi.fn() });
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

// ---------------------------------------------------------------------
// Phase 7 (SPEC-0300-0009 R-59/R-54-1/R-74-1/R-14-14/R-15-1; SPEC-0200-0001
// §3.6.6, §3.6.11.4 MUST-87, §3.6.11.4(f)/MUST-94). 8 new list actions +
// the tree-focus file-op guard.
// ---------------------------------------------------------------------

describe("createListActionHandler: the 8 new Phase 7 actions (§3.6.6)", () => {
  it("toggle_hidden flips fileList.toggleHidden() and applies it to the tree (R-40-4)", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("toggle_hidden", ev())).toBe(true);
    expect(deps.fileList.toggleHidden).toHaveBeenCalledTimes(1);
    expect(deps.tree.applyHiddenFilesChanged).toHaveBeenCalledWith(false);
  });

  it("toggle_size / toggle_time simply forward to fileList", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("toggle_size", ev())).toBe(true);
    expect(handler("toggle_time", ev())).toBe(true);
    expect(deps.fileList.toggleSize).toHaveBeenCalledTimes(1);
    expect(deps.fileList.toggleTime).toHaveBeenCalledTimes(1);
  });

  it("clear_selection (R-54-1) forwards to fileList.clearSelection", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("clear_selection", ev())).toBe(true);
    expect(deps.fileList.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("page_up / page_down (R-59-1) pass the FILTERED entries to fileList", () => {
    const { deps, filtered } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("page_up", ev())).toBe(true);
    expect(handler("page_down", ev())).toBe(true);
    expect(deps.fileList.pageUp).toHaveBeenCalledWith(filtered);
    expect(deps.fileList.pageDown).toHaveBeenCalledWith(filtered);
  });

  it("sort_menu (R-34-14) delegates entirely to the injected sortMenu.toggle()", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("sort_menu", ev())).toBe(true);
    expect(deps.sortMenu.toggle).toHaveBeenCalledTimes(1);
  });

  describe("toggle_tree (MUST-94: composed HERE, not inside list-state.svelte.ts, to avoid a list-state<->tree-state cycle)", () => {
    it("when toggling the tree TO VISIBLE, follows the tree to the current path", () => {
      const { deps } = makeDeps({ fileList: { ...makeDeps().deps.fileList, showTree: vi.fn(() => true) } });
      const handler = createListActionHandler(deps as never);
      expect(handler("toggle_tree", ev())).toBe(true);
      expect(deps.fileList.toggleTree).toHaveBeenCalledTimes(1);
      expect(deps.tree.followTo).toHaveBeenCalledWith("C:\\d");
      expect(deps.tree.clear).not.toHaveBeenCalled();
    });

    it("when toggling the tree TO HIDDEN, clears the tree state (does not fetch)", () => {
      const { deps } = makeDeps({ fileList: { ...makeDeps().deps.fileList, showTree: vi.fn(() => false) } });
      const handler = createListActionHandler(deps as never);
      expect(handler("toggle_tree", ev())).toBe(true);
      expect(deps.tree.clear).toHaveBeenCalledTimes(1);
      expect(deps.tree.followTo).not.toHaveBeenCalled();
    });

    it("R-14/AC-09: hiding the tree while it had focus reassigns focus to the file list container", () => {
      const { deps } = makeDeps({
        isTreeFocused: () => true,
        fileList: { ...makeDeps().deps.fileList, showTree: vi.fn(() => false) },
      });
      const handler = createListActionHandler(deps as never);
      handler("toggle_tree", ev());
      expect(deps.focus.container).toHaveBeenCalledTimes(1);
    });

    it("hiding the tree while focus was already on the list does not (redundantly) refocus the container", () => {
      const { deps } = makeDeps({
        isTreeFocused: () => false,
        fileList: { ...makeDeps().deps.fileList, showTree: vi.fn(() => false) },
      });
      const handler = createListActionHandler(deps as never);
      handler("toggle_tree", ev());
      expect(deps.focus.container).not.toHaveBeenCalled();
    });
  });
});

describe("createListActionHandler: R-14-14 tree-focus file-operation guard (AC-615)", () => {
  const TREE_FOCUS_BLOCKED = ["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder", "zip_create", "zip_extract"];

  it.each(TREE_FOCUS_BLOCKED)("%s does nothing (consumed, no fileOps/archive call) while the tree has focus", (action) => {
    const { deps } = makeDeps({ isTreeFocused: () => true });
    const handler = createListActionHandler(deps as never);
    expect(handler(action, ev())).toBe(true);
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
  });

  it.each(TREE_FOCUS_BLOCKED)("%s still runs normally when the tree does NOT have focus", (action) => {
    const { deps } = makeDeps({ isTreeFocused: () => false });
    const handler = createListActionHandler(deps as never);
    handler(action, ev());
    const spy = action.startsWith("zip_") ? deps.archive.handleAction : deps.fileOps.handleAction;
    expect(spy).toHaveBeenCalled();
  });

  it("R-14-14 explicitly does NOT block toggle_*/sort_menu/clear_selection/search/history/go_parent while the tree has focus", () => {
    const { deps } = makeDeps({ isTreeFocused: () => true });
    const handler = createListActionHandler(deps as never);
    for (const action of ["toggle_hidden", "toggle_size", "toggle_time", "toggle_tree", "sort_menu", "clear_selection", "search", "history", "go_parent"]) {
      handler(action, ev());
    }
    expect(deps.fileList.toggleHidden).toHaveBeenCalled();
    expect(deps.fileList.clearSelection).toHaveBeenCalled();
    expect(deps.sortMenu.toggle).toHaveBeenCalled();
    expect(deps.activateSearch).toHaveBeenCalled();
  });
});
