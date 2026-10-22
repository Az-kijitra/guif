// SPEC-0300-0020 R-1340 / R-1340-1 / SPEC-0300-0010 R-14-5-4 / SPEC-0200-0001 §3.14.1-4, §3.14.12-13: the table "item id -> the existing
// handler call". A menu item does NOT go through the key dispatch; it calls the same handler a key would, with { source: "menu" } so
// that the key-only suppressions (R-15-1 for the tree) do not apply. No logic of its own.

import type { ItemId } from "$lib/features/menu-bar/menu-model";

export interface MenuExecutorDeps {
  onListAction: (action: string | null, event: { shiftKey: boolean }, opts?: { source?: "key" | "menu" }) => boolean;
  onExitAction: (action: string) => boolean;
  // SPEC-0300-0018 R-1060 on the displayed targets.
  copyPath: () => void | Promise<unknown>;
  // SPEC-0300-0021 R-1552 / R-1554: a registered app's item (`ext:<registration index>`). The target is decided by the caller at launch time.
  launchExternal?: (index: number) => void;
  // SPEC-0300-0022 R-1672: 設定ファイルを開く / 設定ファイルのチェック (no target, no operation id).
  settingsFile?: { open(): unknown; check(): unknown };
}

// Items whose list action is NOT their own id.
const ACTION_OF: Partial<Record<ItemId, string>> = { os_open: "open" };

const LIST_ITEMS: ReadonlySet<string> = new Set<ItemId>([
  "open", "os_open", "new_file", "new_folder", "rename", "delete", "zip_create", "zip_extract",
  "cut", "copy", "paste", "select_all", "clear_selection", "search",
  "toggle_tree", "toggle_hidden", "toggle_size", "toggle_time", "sort_menu",
  "go_parent", "focus_path", "history", "history_jump_list", "jump_add",
]);

// Extra arguments (e.g. the click event) are ignored on purpose: the Shift state of a click never reaches the handler (AC-1331).
export function createMenuExecutor(deps: MenuExecutorDeps): (id: ItemId | string, ...ignored: unknown[]) => void {
  return function execute(id: ItemId | string): void {
    const external = /^ext:(\d+)$/.exec(id);
    if (external !== null) {
      deps.launchExternal?.(Number(external[1]));
      return;
    }
    if (id === "config_open") {
      void deps.settingsFile?.open();
      return;
    }
    if (id === "config_check") {
      void deps.settingsFile?.check();
      return;
    }
    if (id === "exit") {
      deps.onExitAction("exit");
      return;
    }
    if (id === "copy_path") {
      void deps.copyPath();
      return;
    }
    if (!LIST_ITEMS.has(id)) return;
    // Only the OS-association item is a Shift+Enter; "delete" is ALWAYS the trash move (shiftKey false).
    deps.onListAction(ACTION_OF[id as ItemId] ?? id, { shiftKey: id === "os_open" }, { source: "menu" });
  };
}
