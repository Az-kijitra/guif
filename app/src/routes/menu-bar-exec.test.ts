import { describe, expect, it, vi } from "vitest";
import type { NavigateResult } from "$lib/shared/navigation-result";
import { createListActionHandler } from "./list-action-wiring";
import { createMenuExecutor } from "./menu-bar-exec";

// [単体] Spec: SPEC-0300-0020 R-1340 (a menu item calls the SAME handler as the key, on the file list's targets), R-1340-1 (the key-only
//   suppressions do not apply), "削除" is the trash move even with Shift (R-1340 3rd bullet, AC-1331), 「OSの関連付けで開く」 = open with
//   Shift, 「開く」 = open without, 「終了」 = onExitAction, 「パスのコピー」 = the R-1060 process on the displayed targets,
//   AC-1332 (the handler is swapped for a recorder; the call and its arguments are checked), AC-1335 / AC-1337 (the same call for the three
//   original focuses), SPEC-0300-0010 R-14-5-4 (the menu does not go through the key dispatch).
// Architecture: SPEC-0200-0001 §3.14.1-4 (`routes/menu-bar-wiring.svelte.ts` holds the "item id -> existing handler call" table; §3.14.1-6 allows
//   splitting it into `menu-bar-exec.ts` -- the TESTS ASSUME THAT SPLIT so the table can be tested without runes), §3.14.12-13 SHOULD-204 (c)
//   (the table calls `delete` with `shiftKey: false` ALWAYS).
//
// Contract assumed (reported to the implementer):
//   createMenuExecutor(deps: {
//     onListAction: (action: string | null, event: { shiftKey: boolean }, opts?: { source?: "key" | "menu" }) => boolean;
//     onExitAction: (action: string) => boolean;
//     copyPath: () => void | Promise<unknown>;
//   }): (id: ItemId, ...ignored: unknown[]) => void
//   - every item except exit / copy_path calls deps.onListAction(<action>, { shiftKey }, { source: "menu" }) EXACTLY ONCE;
//     <action> = the item id, except os_open -> "open" (shiftKey: true); open -> "open" (shiftKey: false); every other shiftKey is false
//   - exit -> deps.onExitAction("exit") once, onListAction not called;  copy_path -> deps.copyPath() once, onListAction not called
//   - extra arguments (e.g. a mouse event) are ignored: the Shift state of a click never reaches the handler
//
// Module under test (not yet implemented): ./menu-bar-exec.ts

const ACTION_ITEMS = [
  "new_file", "new_folder", "rename", "delete", "zip_create", "zip_extract", "cut", "copy", "paste", "select_all", "clear_selection", "search",
  "toggle_tree", "toggle_hidden", "toggle_size", "toggle_time", "sort_menu", "go_parent", "focus_path", "history", "history_jump_list", "jump_add",
] as const;

function recorder() {
  const onListAction = vi.fn(() => true);
  const onExitAction = vi.fn(() => true);
  const copyPath = vi.fn();
  const execute = createMenuExecutor({ onListAction, onExitAction, copyPath } as never) as (id: string, ...rest: unknown[]) => void;
  return { execute, onListAction, onExitAction, copyPath };
}

describe("AC-1332: every item calls the key-operation handler with the same action id and { source: 'menu' }", () => {
  it.each(ACTION_ITEMS)("%s -> onListAction(%s, { shiftKey: false }, { source: 'menu' }) once", (id) => {
    const r = recorder();
    r.execute(id);
    expect(r.onListAction).toHaveBeenCalledTimes(1);
    expect(r.onListAction).toHaveBeenCalledWith(id, { shiftKey: false }, { source: "menu" });
    expect(r.onExitAction).not.toHaveBeenCalled();
    expect(r.copyPath).not.toHaveBeenCalled();
  });

  it("開く -> action 'open' without Shift", () => {
    const r = recorder();
    r.execute("open");
    expect(r.onListAction).toHaveBeenCalledTimes(1);
    expect(r.onListAction).toHaveBeenCalledWith("open", { shiftKey: false }, { source: "menu" });
  });

  it("OSの関連付けで開く -> action 'open' WITH Shift (the existing os-open branch)", () => {
    const r = recorder();
    r.execute("os_open");
    expect(r.onListAction).toHaveBeenCalledTimes(1);
    expect(r.onListAction).toHaveBeenCalledWith("open", { shiftKey: true }, { source: "menu" });
  });

  it("終了 -> onExitAction('exit'); the list handler is not involved", () => {
    const r = recorder();
    r.execute("exit");
    expect(r.onExitAction).toHaveBeenCalledTimes(1);
    expect(r.onExitAction).toHaveBeenCalledWith("exit");
    expect(r.onListAction).not.toHaveBeenCalled();
  });

  it("パスのコピー -> the copy-path process once (SPEC-0300-0018 R-1060 on the displayed targets); the list handler is not involved", () => {
    const r = recorder();
    r.execute("copy_path");
    expect(r.copyPath).toHaveBeenCalledTimes(1);
    expect(r.onListAction).not.toHaveBeenCalled();
    expect(r.onExitAction).not.toHaveBeenCalled();
  });

  it("the table covers all 26 items: each id produces exactly one call to exactly one of the three handlers", () => {
    const ids = [...ACTION_ITEMS, "open", "os_open", "exit", "copy_path"];
    expect(new Set(ids).size).toBe(26);
    for (const id of ids) {
      const r = recorder();
      r.execute(id);
      expect(r.onListAction.mock.calls.length + r.onExitAction.mock.calls.length + r.copyPath.mock.calls.length, id).toBe(1);
    }
  });

  it("an unknown id calls nothing and does not throw (no placeholder items, SPEC-0100-0005 R-08)", () => {
    const r = recorder();
    expect(() => r.execute("undo")).not.toThrow();
    expect(r.onListAction).not.toHaveBeenCalled();
    expect(r.onExitAction).not.toHaveBeenCalled();
    expect(r.copyPath).not.toHaveBeenCalled();
  });
});

describe("AC-1331 / SHOULD-204 (c): 削除 is ALWAYS the trash move", () => {
  it("delete is called with shiftKey false even when the click carried Shift (a mouse event passed along is ignored)", () => {
    const r = recorder();
    r.execute("delete", { shiftKey: true, ctrlKey: true, type: "click" });
    expect(r.onListAction).toHaveBeenCalledWith("delete", { shiftKey: false }, { source: "menu" });
  });

  it("no item other than os_open ever passes shiftKey true, whatever extra argument arrives", () => {
    for (const id of [...ACTION_ITEMS, "open"]) {
      const r = recorder();
      r.execute(id, { shiftKey: true });
      for (const c of r.onListAction.mock.calls as unknown as [string, { shiftKey: boolean }][]) expect(c[1].shiftKey, id).toBe(false);
    }
  });
});

// ---- AC-1335 / AC-1337: through the REAL handler, the focus the menu was opened from does not change the calls -----------------

function realHandler(isTreeFocused: boolean) {
  const filtered = [{ name: "a", path: "C:\\d\\a", entryType: "file" as const }];
  const deps = {
    fileList: {
      moveRow: vi.fn(), moveColumn: vi.fn(),
      openFocused: vi.fn(async (): Promise<NavigateResult> => ({ status: "success", path: "C:\\d\\s" })),
      goParent: vi.fn(async (): Promise<NavigateResult> => ({ status: "success", path: "C:\\" })),
      toggleFocused: vi.fn(), selectAll: vi.fn(), toggleTree: vi.fn(), toggleHidden: vi.fn(), toggleSize: vi.fn(), toggleTime: vi.fn(),
      clearSelection: vi.fn(), pageUp: vi.fn(), pageDown: vi.fn(),
      showTree: vi.fn(() => true), showHidden: vi.fn(() => false), sortKey: vi.fn(() => "name" as const),
    },
    filteredEntries: () => filtered,
    rowsPerColumn: () => 10,
    afterUserNavigation: vi.fn(async (p: Promise<NavigateResult>) => p),
    activateSearch: vi.fn(), openHistoryList: vi.fn(), addJump: vi.fn(),
    currentPath: () => "C:\\d",
    fileOps: { handleAction: vi.fn(() => true) },
    archive: { handleAction: vi.fn(() => true) },
    focusedEntry: () => filtered[0],
    viewer: { openFile: vi.fn(), openWithOsAssociation: vi.fn() },
    isTreeFocused: () => isTreeFocused,
    tree: { clear: vi.fn(), followTo: vi.fn(async () => undefined), applyHiddenFilesChanged: vi.fn() },
    sortMenu: { toggle: vi.fn() }, focus: { container: vi.fn() }, pathBar: { open: vi.fn() },
  };
  const onListAction = createListActionHandler(deps as never);
  const execute = createMenuExecutor({ onListAction, onExitAction: vi.fn(() => true), copyPath: vi.fn() } as never) as (id: string) => void;
  return { deps, execute, onListAction };
}

describe("AC-1335 / AC-1337: the same handler calls whether the tree or the list had the focus", () => {
  it("ツリーにフォーカスがあるときの 削除 / コピー / ZIPに圧縮 / 名前の変更 reach the controllers with the list's targets", () => {
    const r = realHandler(true);
    r.execute("delete");
    r.execute("copy");
    r.execute("zip_create");
    r.execute("rename");
    expect(r.deps.fileOps.handleAction.mock.calls).toEqual([
      ["delete", { shiftKey: false }],
      ["copy", { shiftKey: false }],
      ["rename", { shiftKey: false }],
    ]);
    expect(r.deps.archive.handleAction.mock.calls).toEqual([["zip_create"]]);
  });

  it("the calls are identical with the list focused", () => {
    const tree = realHandler(true);
    const list = realHandler(false);
    for (const id of ["delete", "copy", "zip_create", "rename", "cut", "paste", "new_file", "new_folder", "zip_extract"]) {
      tree.execute(id);
      list.execute(id);
    }
    expect(tree.deps.fileOps.handleAction.mock.calls).toEqual(list.deps.fileOps.handleAction.mock.calls);
    expect(tree.deps.archive.handleAction.mock.calls).toEqual(list.deps.archive.handleAction.mock.calls);
  });

  it("while the KEYS on the same tree focus still do nothing (AC-94 first half)", () => {
    const r = realHandler(true);
    r.onListAction("delete", { shiftKey: false });
    r.onListAction("copy", { shiftKey: false });
    expect(r.deps.fileOps.handleAction).not.toHaveBeenCalled();
  });

  it("os_open with the tree focused opens the focused file with the OS association; open opens it in the viewer", () => {
    const r = realHandler(true);
    r.execute("os_open");
    r.execute("open");
    expect(r.deps.viewer.openWithOsAssociation).toHaveBeenCalledWith("C:\\d\\a");
    expect(r.deps.viewer.openFile).toHaveBeenCalledWith("C:\\d\\a");
  });
});
