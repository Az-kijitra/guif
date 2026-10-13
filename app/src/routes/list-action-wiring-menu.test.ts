import { describe, expect, it, vi } from "vitest";
import type { NavigateResult } from "$lib/shared/navigation-result";
import { createListActionHandler } from "./list-action-wiring";

// [単体] Spec: SPEC-0300-0020 R-1340 / R-1340-1 (a)(b)(c) (確定 MUST-1: the menu runs the same handler on the FILE LIST's targets whatever
//   had the focus; the key-only suppressions -- SPEC-0300-0010 R-15-1 for the tree -- do not apply to the menu), AC-1335 / AC-1337,
//   SPEC-0300-0010 R-15-1 / R-14-14 + AC-94 (first half: with the tree focused the KEYS still do nothing), 第16版 R-14-5-4.
// Architecture: SPEC-0200-0001 §3.14.1-4 (`createListActionHandler` returns `onListAction(action, event, opts?)`; `opts.source` is
//   "key" | "menu", default "key"; `source === "menu"` skips the TREE_FOCUS_BLOCKED_ACTIONS guard), §3.14.12-13 SHOULD-204 ((a) the key
//   path passes no third argument -- static, see menu-source-static.test.ts; (b) tree focus + key = still nothing).
//
// Contract assumed (reported to the implementer):
//   onListAction(action: string | null, event: { shiftKey: boolean }, opts?: { source?: "key" | "menu" }): boolean
//   - opts omitted / { source: "key" }: exactly today's behaviour
//   - { source: "menu" }: the R-14-14 tree-focus guard is skipped; the action runs as if the list had the focus

interface Entry {
  name: string;
  path: string;
  entryType: "file" | "dir";
}

function makeDeps(over: Record<string, unknown> = {}) {
  const filtered: Entry[] = [{ name: "a", path: "C:\\d\\a", entryType: "file" }];
  const deps = {
    fileList: {
      moveRow: vi.fn(),
      moveColumn: vi.fn(),
      openFocused: vi.fn(async (): Promise<NavigateResult> => ({ status: "success", path: "C:\\d\\sub" })),
      goParent: vi.fn(async (): Promise<NavigateResult> => ({ status: "success", path: "C:\\" })),
      toggleFocused: vi.fn(),
      selectAll: vi.fn(),
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
    focusedEntry: () => filtered[0] ?? null,
    viewer: { openFile: vi.fn(), openWithOsAssociation: vi.fn() },
    isTreeFocused: () => true,
    tree: { clear: vi.fn(), followTo: vi.fn(async () => undefined), applyHiddenFilesChanged: vi.fn() },
    sortMenu: { toggle: vi.fn() },
    focus: { container: vi.fn() },
    pathBar: { open: vi.fn() },
    ...over,
  };
  return deps;
}

const FILE_OPS = ["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"];
const ZIPS = ["zip_create", "zip_extract"];
const call = (h: unknown, action: string, shiftKey = false, opts?: unknown): boolean =>
  (h as (a: string, e: { shiftKey: boolean }, o?: unknown) => boolean)(action, { shiftKey }, opts);

describe("the KEY path is unchanged (SPEC-0300-0010 R-15-1 / R-14-14, AC-94 first half, SHOULD-204 (b))", () => {
  it.each([...FILE_OPS, ...ZIPS])("tree focused + the key action %s: consumed and does nothing (no third argument)", (action) => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    expect(call(h, action)).toBe(true);
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
  });

  it.each([...FILE_OPS, ...ZIPS])("tree focused + %s with an explicit { source: 'key' } is the same as no third argument", (action) => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    expect(call(h, action, false, { source: "key" })).toBe(true);
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
  });

  it("an empty options object and an unknown source also behave as the key path (the default is 'key')", () => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    call(h, "delete", false, {});
    call(h, "delete", false, { source: "anything" });
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
  });

  it("list focused: the key path works as before", () => {
    const deps = makeDeps({ isTreeFocused: () => false });
    const h = createListActionHandler(deps as never);
    call(h, "delete");
    call(h, "zip_create");
    expect(deps.fileOps.handleAction).toHaveBeenCalledTimes(1);
    expect(deps.archive.handleAction).toHaveBeenCalledTimes(1);
  });
});

describe("source: 'menu' skips the tree-focus guard (R-1340-1 (a), AC-1335, AC-1337)", () => {
  it.each(FILE_OPS)("tree focused + menu %s: reaches fileOps.handleAction with the event it was given", (action) => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    expect(call(h, action, false, { source: "menu" })).toBe(true);
    expect(deps.fileOps.handleAction).toHaveBeenCalledTimes(1);
    expect(deps.fileOps.handleAction).toHaveBeenCalledWith(action, { shiftKey: false });
  });

  it.each(ZIPS)("tree focused + menu %s: reaches archive.handleAction", (action) => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    expect(call(h, action, false, { source: "menu" })).toBe(true);
    expect(deps.archive.handleAction).toHaveBeenCalledWith(action);
  });

  it("the guard being skipped does not change anything when the list has the focus (same calls)", () => {
    for (const treeFocused of [true, false]) {
      const deps = makeDeps({ isTreeFocused: () => treeFocused });
      const h = createListActionHandler(deps as never);
      call(h, "delete", false, { source: "menu" });
      call(h, "zip_extract", false, { source: "menu" });
      expect(deps.fileOps.handleAction).toHaveBeenCalledWith("delete", { shiftKey: false });
      expect(deps.archive.handleAction).toHaveBeenCalledWith("zip_extract");
    }
  });

  it("the return value is the controller's (consumed or not), as on the key path", () => {
    const deps = makeDeps({ fileOps: { handleAction: vi.fn(() => false) } });
    const h = createListActionHandler(deps as never);
    expect(call(h, "rename", false, { source: "menu" })).toBe(false);
  });

  it("actions that were never blocked work the same from the menu (search, history, jump list, toggles, sort menu, focus_path, go_parent)", () => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    for (const a of ["search", "history", "history_jump_list", "jump_add", "toggle_hidden", "toggle_size", "toggle_time", "sort_menu", "focus_path", "select_all", "clear_selection", "go_parent"]) {
      expect(call(h, a, false, { source: "menu" }), a).toBe(true);
    }
    expect(deps.activateSearch).toHaveBeenCalledTimes(1);
    expect(deps.openHistoryList).toHaveBeenCalledWith("history");
    expect(deps.openHistoryList).toHaveBeenCalledWith("jump");
    expect(deps.addJump).toHaveBeenCalledWith("C:\\d");
    expect(deps.sortMenu.toggle).toHaveBeenCalledTimes(1);
    expect(deps.pathBar.open).toHaveBeenCalledTimes(1);
    expect(deps.fileList.selectAll).toHaveBeenCalledTimes(1);
    expect(deps.fileList.clearSelection).toHaveBeenCalledTimes(1);
  });
});

describe("the open family from the menu (R-401-2 / R-402: 開く = focus row, Shift-less; OSの関連付けで開く = Shift)", () => {
  it("'open' with shiftKey false opens the focused file in the viewer, also with the tree focused", () => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    call(h, "open", false, { source: "menu" });
    expect(deps.viewer.openFile).toHaveBeenCalledWith("C:\\d\\a");
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
  });

  it("'open' with shiftKey true opens it with the OS association (the existing os-open branch of decideOpen)", () => {
    const deps = makeDeps();
    const h = createListActionHandler(deps as never);
    call(h, "open", true, { source: "menu" });
    expect(deps.viewer.openWithOsAssociation).toHaveBeenCalledWith("C:\\d\\a");
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
  });
});
