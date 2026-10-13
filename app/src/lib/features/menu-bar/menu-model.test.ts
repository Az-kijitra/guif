import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0020 R-1301 (4 menus), R-1310 (the items and their order; separators fixed), R-1311 (items that must NOT exist),
//   R-1312 (an item is always shown; the layout never depends on the input), R-1313 (check mark on the 4 view toggles), R-1320 (enabling
//   rule and reason, first matching row wins), R-1330 / R-1331 (shortcut text; copy_path has none), R-1340 (n is the number of displayed
//   targets), AC-1301, AC-1310 (i)~(v), AC-1311, AC-1313, AC-1314 (the reasons are the SAME constants as the key operations),
//   AC-1320 / AC-1321 / AC-1322 (via the model).
// Architecture: SPEC-0200-0001 §3.14.1-1 (`features/menu-bar/menu-model.ts`: DOM-free; every value is INJECTED -- `buildMenuBar(input)`,
//   `evaluateBarItem(id, input)`), §3.14.12-1 (reasons live in `shared/messages.ts` `SHARED_SENTENCES`: noSelection / noTarget / notZipFile /
//   extractOneAtATime already, `renameOneAtATime` and `noPasteItems` MOVED there, the "フォルダーには使えません" sentence moved there too).
//
// Contract assumed (reported to the implementer):
//   type MenuId = "file" | "edit" | "view" | "go";
//   type ItemId = "open" | "os_open" | "new_file" | "new_folder" | "rename" | "delete" | "zip_create" | "zip_extract" | "exit"
//               | "cut" | "copy" | "paste" | "copy_path" | "select_all" | "clear_selection" | "search"
//               | "toggle_tree" | "toggle_hidden" | "toggle_size" | "toggle_time" | "sort_menu"
//               | "go_parent" | "focus_path" | "history" | "history_jump_list" | "jump_add";
//   type BarEntry = { type: "separator" }
//                 | { type: "item"; id: ItemId; label: string; enabled: boolean; reason?: string; shortcutText?: string; checked?: boolean };
//   interface BarTarget { entryType: "file" | "dir"; name: string }
//   interface BarInput {
//     targets: readonly BarTarget[];              // the displayed targets (selection, else the focused row): n = targets.length
//     focusRow: BarTarget | null;                 // the displayed focused row (the "open" family looks at it, NOT at the selection)
//     clipboardHasItems: boolean;
//     isZip: (name: string) => boolean;           // injected, like context-menu's MenuInput.isZip
//     checks: { tree: boolean; hidden: boolean; size: boolean; time: boolean };
//     shortcuts: Partial<Record<ItemId, string>>; // normalised binding strings ("Escape", "Ctrl+Insert,Ctrl+C", ""); formatted here via shortcut-format
//   }
//   interface BarMenu { id: MenuId; label: string /* "ファイル(F)" */; ariaLabel: string /* "ファイル" */; accessKey: "F"|"E"|"V"|"G"; entries: BarEntry[] }
//   buildMenuBar(input: BarInput): BarMenu[]                                         // exactly 4, in the order file, edit, view, go
//   evaluateBarItem(id: ItemId, input: BarInput): { enabled: boolean; reason?: string }
//
// Module under test (not yet implemented): ./menu-model.ts

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { buildMenuBar, evaluateBarItem, type BarInput } from "./menu-model";

const file = (name: string) => ({ entryType: "file" as const, name });
const dir = (name: string) => ({ entryType: "dir" as const, name });
const isZip = (name: string): boolean => name.toLowerCase().endsWith(".zip");

function input(over: Partial<BarInput> = {}): BarInput {
  return {
    targets: [],
    focusRow: null,
    clipboardHasItems: false,
    isZip,
    checks: { tree: false, hidden: false, size: false, time: false },
    shortcuts: {},
    ...over,
  } as BarInput;
}

type Flat = { menu: string; entry: ReturnType<typeof buildMenuBar>[number]["entries"][number] };
const flat = (i: BarInput): Flat[] => buildMenuBar(i).flatMap((m) => m.entries.map((entry) => ({ menu: m.id, entry })));
const items = (i: BarInput) => flat(i).flatMap((f) => (f.entry.type === "item" ? [f.entry] : []));
const itemOf = (i: BarInput, id: string) => {
  const it = items(i).find((x) => x.id === id);
  if (it === undefined) throw new Error(`no item ${id}`);
  return it;
};
const layout = (i: BarInput): string[] =>
  buildMenuBar(i).flatMap((m) => [`# ${m.id}`, ...m.entries.map((e) => (e.type === "separator" ? "---" : e.id))]);

const EXPECTED_LAYOUT = [
  "# file", "open", "os_open", "---", "new_file", "new_folder", "---", "rename", "delete", "---", "zip_create", "zip_extract", "---", "exit",
  "# edit", "cut", "copy", "paste", "copy_path", "---", "select_all", "clear_selection", "---", "search",
  "# view", "toggle_tree", "toggle_hidden", "toggle_size", "toggle_time", "---", "sort_menu",
  "# go", "go_parent", "focus_path", "---", "history", "history_jump_list", "jump_add",
];

describe("R-1301 / R-1310 / R-1312: structure (AC-1301)", () => {
  it("four menus, left to right: ファイル / 編集 / 表示 / 移動; no ヘルプ (T-01)", () => {
    const bar = buildMenuBar(input());
    expect(bar.map((m) => m.id)).toEqual(["file", "edit", "view", "go"]);
    expect(bar.map((m) => m.ariaLabel)).toEqual(["ファイル", "編集", "表示", "移動"]);
    expect(bar.map((m) => m.label)).toEqual(["ファイル(F)", "編集(E)", "表示(V)", "移動(G)"]);
    expect(bar.map((m) => m.accessKey)).toEqual(["F", "E", "V", "G"]);
    expect(JSON.stringify(bar)).not.toContain("ヘルプ");
  });

  it("the items and the separators are exactly the table of R-1310, in order", () => {
    expect(layout(input())).toEqual(EXPECTED_LAYOUT);
  });

  it("R-1312: the layout never depends on the input (an item is shown even when disabled; no leading / trailing / double separator)", () => {
    const variants: BarInput[] = [
      input(),
      input({ targets: [file("a.txt")], focusRow: file("a.txt"), clipboardHasItems: true }),
      input({ targets: [file("a.txt"), file("c.zip")], focusRow: file("c.zip") }),
      input({ targets: [dir("d")], focusRow: dir("d"), checks: { tree: true, hidden: true, size: true, time: true } }),
    ];
    for (const v of variants) expect(layout(v)).toEqual(EXPECTED_LAYOUT);
    for (const m of buildMenuBar(input())) {
      expect(m.entries[0].type).toBe("item");
      expect(m.entries[m.entries.length - 1].type).toBe("item");
      m.entries.forEach((e, i) => {
        if (e.type === "separator") expect(m.entries[i - 1].type).toBe("item");
      });
    }
  });

  it("the item labels are the W-65~W-88 wording", () => {
    const labels = items(input()).map((i) => i.label);
    expect(labels).toEqual([
      "開く", "OSの関連付けで開く", "新規作成…", "新しいフォルダー…", "名前の変更", "削除", "ZIPに圧縮", "ZIPを展開", "終了",
      "切り取り", "コピー", "貼り付け", "パスのコピー", "すべて選択", "選択の解除", "検索",
      "ツリー", "隠しファイル", "サイズの列", "更新日時の列", "並び替え…",
      "親フォルダーへ", "パス欄へ移動", "履歴", "ジャンプリスト", "ジャンプリストに追加",
    ]);
  });
});

describe("R-1311 / AC-1302: items that must not exist", () => {
  it("none of the excluded action ids is an item id, and there are exactly 26 items", () => {
    const ids = new Set(items(input()).map((i) => i.id as string));
    for (const forbidden of [
      "undo", "redo", "duplicate", "prefix_date", "properties", "open_explorer", "open_vscode", "jump_add_url", "refresh", "settings",
      "help_keymap", "select_toggle", "delete_permanent", "theme", "about",
    ]) {
      expect(ids.has(forbidden), forbidden).toBe(false);
    }
    expect(ids.size).toBe(26);
  });
});

describe("R-1313 / AC-1313: the check mark on the four view toggles, from the state given when the menu is built", () => {
  it("checked is a boolean on tree / hidden / size / time, mirrors input.checks, and is absent on every other item", () => {
    const i = input({ checks: { tree: true, hidden: false, size: true, time: false } });
    expect(itemOf(i, "toggle_tree").checked).toBe(true);
    expect(itemOf(i, "toggle_hidden").checked).toBe(false);
    expect(itemOf(i, "toggle_size").checked).toBe(true);
    expect(itemOf(i, "toggle_time").checked).toBe(false);
    const toggles = new Set(["toggle_tree", "toggle_hidden", "toggle_size", "toggle_time"]);
    for (const it of items(i)) if (!toggles.has(it.id)) expect(it.checked, it.id).toBeUndefined();
  });

  it("a new build with the changed state shows the new mark (the previous snapshot is not shared)", () => {
    const before = buildMenuBar(input({ checks: { tree: true, hidden: false, size: false, time: false } }));
    const after = buildMenuBar(input({ checks: { tree: false, hidden: false, size: false, time: false } }));
    const tree = (b: typeof before) => b[2].entries.find((e) => e.type === "item" && e.id === "toggle_tree");
    expect((tree(before) as { checked?: boolean }).checked).toBe(true);
    expect((tree(after) as { checked?: boolean }).checked).toBe(false);
  });

  it("the toggles are always enabled", () => {
    for (const id of ["toggle_tree", "toggle_hidden", "toggle_size", "toggle_time"] as const) {
      expect(evaluateBarItem(id, input()).enabled).toBe(true);
    }
  });
});

describe("R-1320: enabling rules and reasons (AC-1314) -- the reasons are the SAME constants the key operations use", () => {
  it("the constants exist with the spec wording (so that a test cannot pass on two equal typos)", () => {
    expect(SHARED_SENTENCES.noSelection).toBe("選択がありません");
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
    expect(SHARED_SENTENCES.notZipFile).toBe("ZIPファイルではありません");
    expect(SHARED_SENTENCES.extractOneAtATime).toBe("展開は1件ずつ指定してください");
    expect((SHARED_SENTENCES as Record<string, string>).renameOneAtATime).toBe("名前の変更は1件ずつ行えます");
    expect((SHARED_SENTENCES as Record<string, string>).noPasteItems).toBe("貼り付ける項目がありません");
    expect(Object.values(SHARED_SENTENCES)).toContain("フォルダーには使えません");
  });

  const FOLDER = "フォルダーには使えません";

  describe("開く (focus row)", () => {
    it("no focus row -> disabled with 選択がありません", () => {
      expect(evaluateBarItem("open", input())).toEqual({ enabled: false, reason: SHARED_SENTENCES.noSelection });
    });
    it("a focus row (file or folder) -> enabled, also with several selected (AC-1310 iii)", () => {
      expect(evaluateBarItem("open", input({ focusRow: file("a.txt"), targets: [file("a.txt")] })).enabled).toBe(true);
      expect(evaluateBarItem("open", input({ focusRow: dir("d"), targets: [dir("d")] })).enabled).toBe(true);
      expect(evaluateBarItem("open", input({ focusRow: file("c.zip"), targets: [file("a.txt"), file("c.zip")] })).enabled).toBe(true);
    });
    it("enabled items carry no reason", () => {
      expect(evaluateBarItem("open", input({ focusRow: file("a"), targets: [file("a")] })).reason).toBeUndefined();
    });
  });

  describe("OSの関連付けで開く (focus row that is a file)", () => {
    it("none -> 選択がありません; folder -> フォルダーには使えません (AC-1310 ii); file -> enabled", () => {
      expect(evaluateBarItem("os_open", input())).toEqual({ enabled: false, reason: SHARED_SENTENCES.noSelection });
      const folder = evaluateBarItem("os_open", input({ focusRow: dir("d"), targets: [dir("d")] }));
      expect(folder.enabled).toBe(false);
      expect(folder.reason).toBe(FOLDER);
      expect(Object.values(SHARED_SENTENCES)).toContain(folder.reason);
      expect(evaluateBarItem("os_open", input({ focusRow: file("a.txt"), targets: [file("a.txt")] })).enabled).toBe(true);
    });
  });

  describe("always enabled", () => {
    it.each([
      "new_file", "new_folder", "exit", "select_all", "clear_selection", "search", "toggle_tree", "toggle_hidden", "toggle_size", "toggle_time",
      "sort_menu", "go_parent", "focus_path", "history", "history_jump_list", "jump_add",
    ] as const)("%s is enabled with nothing selected and nothing focused (AC-1310 v)", (id) => {
      expect(evaluateBarItem(id, input())).toEqual({ enabled: true });
    });
  });

  describe("名前の変更 (exactly one target)", () => {
    it("0 -> 選択がありません; 1 -> enabled; 2 or more -> 名前の変更は1件ずつ行えます", () => {
      expect(evaluateBarItem("rename", input())).toEqual({ enabled: false, reason: SHARED_SENTENCES.noSelection });
      expect(evaluateBarItem("rename", input({ targets: [file("c.zip")], focusRow: file("c.zip") })).enabled).toBe(true);
      const two = evaluateBarItem("rename", input({ targets: [file("a.txt"), file("c.zip")], focusRow: file("c.zip") }));
      expect(two.enabled).toBe(false);
      expect(two.reason).toBe((SHARED_SENTENCES as Record<string, string>).renameOneAtATime);
      expect(two.reason).toBe("名前の変更は1件ずつ行えます");
    });
  });

  describe("削除 / 切り取り / コピー / パスのコピー (n >= 1)", () => {
    it.each(["delete", "cut", "copy", "copy_path"] as const)("%s: n = 0 -> 選択がありません; n = 1, 2 -> enabled", (id) => {
      expect(evaluateBarItem(id, input())).toEqual({ enabled: false, reason: SHARED_SENTENCES.noSelection });
      expect(evaluateBarItem(id, input({ targets: [file("a")], focusRow: file("a") })).enabled).toBe(true);
      expect(evaluateBarItem(id, input({ targets: [file("a"), dir("d")], focusRow: dir("d") })).enabled).toBe(true);
    });
  });

  describe("ZIPに圧縮 (n >= 1, its reason is 対象がありません)", () => {
    it("n = 0 -> 対象がありません (NOT 選択がありません); n >= 1 -> enabled", () => {
      expect(evaluateBarItem("zip_create", input())).toEqual({ enabled: false, reason: SHARED_SENTENCES.noTarget });
      expect(evaluateBarItem("zip_create", input({ targets: [dir("d")], focusRow: dir("d") })).enabled).toBe(true);
    });
  });

  describe("ZIPを展開 (one .zip file)", () => {
    it("n = 1, file, .zip -> enabled; .ZIP (any case) -> enabled (AC-1314)", () => {
      expect(evaluateBarItem("zip_extract", input({ targets: [file("c.zip")], focusRow: file("c.zip") })).enabled).toBe(true);
      expect(evaluateBarItem("zip_extract", input({ targets: [file("C.ZIP")], focusRow: file("C.ZIP") })).enabled).toBe(true);
      expect(evaluateBarItem("zip_extract", input({ targets: [file("c.Zip")], focusRow: file("c.Zip") })).enabled).toBe(true);
    });
    it("n = 0 -> 対象がありません; n >= 2 -> 展開は1件ずつ指定してください", () => {
      expect(evaluateBarItem("zip_extract", input())).toEqual({ enabled: false, reason: SHARED_SENTENCES.noTarget });
      expect(evaluateBarItem("zip_extract", input({ targets: [file("a.zip"), file("b.zip")], focusRow: file("a.zip") }))).toEqual({
        enabled: false,
        reason: SHARED_SENTENCES.extractOneAtATime,
      });
    });
    it("n = 1 but not a .zip file -> ZIPファイルではありません (a file, a folder named x.zip, a .zip-looking suffix)", () => {
      for (const t of [file("a.txt"), dir("x.zip"), file("c.zip.txt"), file("zip")]) {
        expect(evaluateBarItem("zip_extract", input({ targets: [t], focusRow: t })), t.name).toEqual({
          enabled: false,
          reason: SHARED_SENTENCES.notZipFile,
        });
      }
    });
    it("the order of the rows: n >= 2 is judged before the file-type row", () => {
      expect(evaluateBarItem("zip_extract", input({ targets: [file("a.txt"), file("b.txt")], focusRow: file("a.txt") })).reason).toBe(
        SHARED_SENTENCES.extractOneAtATime,
      );
    });
  });

  describe("貼り付け (clipboard)", () => {
    it("clipboard has items -> enabled; empty -> 貼り付ける項目がありません (AC-1311)", () => {
      expect(evaluateBarItem("paste", input({ clipboardHasItems: true })).enabled).toBe(true);
      const empty = evaluateBarItem("paste", input({ clipboardHasItems: false }));
      expect(empty).toEqual({ enabled: false, reason: (SHARED_SENTENCES as Record<string, string>).noPasteItems });
      expect(empty.reason).toBe("貼り付ける項目がありません");
    });
    it("paste does not depend on the selection", () => {
      expect(evaluateBarItem("paste", input({ clipboardHasItems: true, targets: [] })).enabled).toBe(true);
    });
  });

  describe("AC-1310 scenarios (i)~(v) through the built menus", () => {
    const a = file("a.txt");
    const d = dir("d");
    const c = file("c.zip");
    const state = (i: BarInput, id: string) => {
      const it = itemOf(i, id);
      return { enabled: it.enabled, reason: it.reason };
    };

    it("(i) nothing selected, focus on a.txt (targets = the focus row)", () => {
      const i = input({ targets: [a], focusRow: a });
      expect(state(i, "open").enabled).toBe(true);
      expect(state(i, "os_open").enabled).toBe(true);
      expect(state(i, "rename").enabled).toBe(true);
      expect(state(i, "zip_extract").reason).toBe(SHARED_SENTENCES.notZipFile);
    });

    it("(ii) focus on the folder d", () => {
      const i = input({ targets: [d], focusRow: d });
      expect(state(i, "os_open")).toEqual({ enabled: false, reason: "フォルダーには使えません" });
      expect(state(i, "open").enabled).toBe(true);
    });

    it("(iii) a.txt and c.zip selected, focus on c.zip", () => {
      const i = input({ targets: [a, c], focusRow: c });
      expect(state(i, "zip_extract")).toEqual({ enabled: false, reason: "展開は1件ずつ指定してください" });
      expect(state(i, "rename")).toEqual({ enabled: false, reason: "名前の変更は1件ずつ行えます" });
      expect(state(i, "open").enabled).toBe(true);
    });

    it("(iv) only c.zip selected", () => {
      const i = input({ targets: [c], focusRow: c });
      expect(state(i, "zip_extract").enabled).toBe(true);
      expect(state(i, "rename").enabled).toBe(true);
    });

    it("(v) an empty folder", () => {
      const i = input();
      for (const id of ["open", "rename", "delete", "copy"]) expect(state(i, id), id).toEqual({ enabled: false, reason: "選択がありません" });
      for (const id of ["zip_create", "zip_extract"]) expect(state(i, id), id).toEqual({ enabled: false, reason: "対象がありません" });
      expect(state(i, "new_file").enabled).toBe(true);
    });
  });

  it("buildMenuBar and evaluateBarItem agree for every item and several inputs (one rule table)", () => {
    const inputs = [
      input(),
      input({ targets: [file("a.txt")], focusRow: file("a.txt"), clipboardHasItems: true }),
      input({ targets: [file("a.zip"), file("b.zip")], focusRow: file("b.zip") }),
      input({ targets: [dir("d")], focusRow: dir("d") }),
    ];
    for (const i of inputs) {
      for (const it of items(i)) {
        const ev = evaluateBarItem(it.id, i);
        expect({ id: it.id, enabled: it.enabled, reason: it.reason }).toEqual({ id: it.id, enabled: ev.enabled, reason: ev.reason });
      }
    }
  });

  it("a disabled item always has a reason; an enabled item never has one (R-1321)", () => {
    for (const i of [input(), input({ targets: [file("a")], focusRow: file("a") })]) {
      for (const it of items(i)) {
        if (it.enabled) expect(it.reason, it.id).toBeUndefined();
        else expect(typeof it.reason, it.id).toBe("string");
      }
    }
  });
});

describe("R-1330 / R-1331 / AC-1320~1322: the shortcut text on the items", () => {
  it("Escape -> Esc; a comma list -> its first; an empty string -> no text (the item stays enabled)", () => {
    const i = input({
      targets: [file("a")],
      focusRow: file("a"),
      shortcuts: { clear_selection: "Escape", copy: "Ctrl+Insert,Ctrl+C", rename: "", search: "Ctrl+F", open: "Enter", os_open: "Shift+Enter" },
    });
    expect(itemOf(i, "clear_selection").shortcutText).toBe("Esc");
    expect(itemOf(i, "copy").shortcutText).toBe("Ctrl+Insert");
    expect(itemOf(i, "rename").shortcutText).toBeUndefined();
    expect(itemOf(i, "rename").enabled).toBe(true);
    expect(itemOf(i, "search").shortcutText).toBe("Ctrl+F");
    expect(itemOf(i, "open").shortcutText).toBe("Enter");
    expect(itemOf(i, "os_open").shortcutText).toBe("Shift+Enter");
  });

  it("R-1331: copy_path never has a shortcut text even if one is (wrongly) supplied", () => {
    expect(itemOf(input({ shortcuts: { copy_path: "Ctrl+Shift+C" } }), "copy_path").shortcutText).toBeUndefined();
    expect(itemOf(input(), "copy_path").shortcutText).toBeUndefined();
  });

  it("【レビュー m-3】exit: an empty binding still shows Ctrl+Q (the fixed priority-1 key always exits); another binding shows its first key", () => {
    expect(itemOf(input({ shortcuts: { exit: "" } }), "exit").shortcutText).toBe("Ctrl+Q");
    expect(itemOf(input({ shortcuts: { exit: "Ctrl+Q" } }), "exit").shortcutText).toBe("Ctrl+Q");
    expect(itemOf(input({ shortcuts: { exit: "Alt+F4,Ctrl+Q" } }), "exit").shortcutText).toBe("Alt+F4");
    expect(itemOf(input({ shortcuts: { exit: "Q" } }), "exit").shortcutText).toBe("Q");
  });

  it("an item with no entry in `shortcuts` has no text", () => {
    expect(itemOf(input({ shortcuts: {} }), "paste").shortcutText).toBeUndefined();
  });
});
