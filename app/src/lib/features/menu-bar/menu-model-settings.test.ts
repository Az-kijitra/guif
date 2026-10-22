import { describe, expect, it } from "vitest";
import { buildMenuBar, evaluateBarItem, type BarInput } from "./menu-model";
import { ITEM_LABELS } from "./messages";
import { formatSettingsShortcut } from "./shortcut-format";

// [単体] Spec: SPEC-0300-0022 R-1670 (「ファイル」: ... ZIPを展開 / ─ / 設定ファイルを開く / 設定ファイルのチェック / ─ / 終了; both always enabled;
//   「設定ファイルを開く」 shows the current assignment of `settings` (default `Ctrl+,`), `settings = ""` still shows `Ctrl+,` (【確定 T-28】),
//   「設定ファイルのチェック」 shows no shortcut), R-1673 (the other menus are unchanged), AC-1660; SPEC-0300-0020 第3版 R-1310 / R-1330-1;
//   SPEC-0300-0019 第5版 W-A0 / W-A1, AC-1215 (the two names).
// Architecture: SPEC-0200-0001 §3.17.9: `ItemId` gains `config_open` / `config_check`; `LAYOUT.file` gains them before `exit`;
//   `ITEM_LABELS` holds W-A0 / W-A1; `shortcut-format.ts` gains `formatSettingsShortcut(binding)` (= `formatShortcut(binding) || "Ctrl+,"`).
//
// Module under test: ./menu-model.ts, ./messages.ts, ./shortcut-format.ts

function input(over: Partial<BarInput> = {}): BarInput {
  return {
    targets: [],
    focusRow: null,
    clipboardHasItems: false,
    isZip: () => false,
    checks: { tree: false, hidden: false, size: false, time: false },
    shortcuts: {},
    ...over,
  } as BarInput;
}
type Entry = ReturnType<typeof buildMenuBar>[number]["entries"][number];
const fileMenu = (i: BarInput): Entry[] => buildMenuBar(i).find((m) => m.id === "file")!.entries;
const shape = (entries: readonly Entry[]): string[] => entries.map((e) => (e.type === "separator" ? "---" : String(e.id)));
const item = (i: BarInput, id: string) => {
  const found = fileMenu(i).find((e) => e.type === "item" && e.id === id);
  if (found === undefined || found.type !== "item") throw new Error(`no item ${id}`);
  return found;
};

describe("R-1670 / AC-1660: the two items in 「ファイル」", () => {
  it("sit after 「ZIPを展開」 and a separator, in this order, then a separator and 「終了」", () => {
    const s = shape(fileMenu(input()));
    expect(s.slice(s.indexOf("zip_extract"))).toEqual(["zip_extract", "---", "config_open", "config_check", "---", "exit"]);
  });

  it("the whole 「ファイル」 layout is as in SPEC-0300-0020 第3版 R-1310 (no registered external app)", () => {
    expect(shape(fileMenu(input()))).toEqual([
      "open", "os_open", "---", "new_file", "new_folder", "---", "rename", "delete", "---", "zip_create", "zip_extract", "---",
      "config_open", "config_check", "---", "exit",
    ]);
  });

  it("with the default four external apps the group sits between the open items and 「新規作成…」 and the new items stay before 「終了」", () => {
    const apps = [0, 1, 2, 3].map((index) => ({ index, label: `app${index}` }));
    expect(shape(fileMenu(input({ externalApps: apps, externalTargetAvailable: true })))).toEqual([
      "open", "os_open", "---", "ext:0", "ext:1", "ext:2", "ext:3", "---", "new_file", "new_folder", "---", "rename", "delete", "---",
      "zip_create", "zip_extract", "---", "config_open", "config_check", "---", "exit",
    ]);
  });

  it("W-A0 / W-A1: the labels (config.toml-free wording from SPEC-0300-0019 第5版)", () => {
    expect(item(input(), "config_open").label).toBe("設定ファイルを開く");
    expect(item(input(), "config_check").label).toBe("設定ファイルのチェック");
    expect(ITEM_LABELS.config_open).toBe("設定ファイルを開く");
    expect(ITEM_LABELS.config_check).toBe("設定ファイルのチェック");
  });

  it("both are always enabled, with no reason, whatever the input (they have no target)", () => {
    for (const over of [{}, { targets: [{ entryType: "file" as const, name: "a.txt" }], focusRow: { entryType: "dir" as const, name: "d" } }]) {
      for (const id of ["config_open", "config_check"] as const) {
        expect(evaluateBarItem(id, input(over))).toEqual({ enabled: true });
        const it2 = item(input(over), id);
        expect(it2.enabled).toBe(true);
        expect(it2.reason).toBeUndefined();
      }
    }
  });

  it("they are not check items", () => {
    expect(item(input(), "config_open").checked).toBeUndefined();
    expect(item(input(), "config_check").checked).toBeUndefined();
  });

  it("the other three menus are unchanged (the items are not in the context of 編集 / 表示 / 移動)", () => {
    const bar = buildMenuBar(input());
    for (const id of ["edit", "view", "go"]) {
      const text = JSON.stringify(bar.find((m) => m.id === id));
      expect(text).not.toContain("config_");
    }
  });
});

describe("R-1670 / T-28: the shortcut text", () => {
  it("「設定ファイルを開く」 shows the current `settings` assignment (the first key)", () => {
    expect(item(input({ shortcuts: { config_open: "Ctrl+Comma" } }), "config_open").shortcutText).toBe("Ctrl+,");
    expect(item(input({ shortcuts: { config_open: "Ctrl+Shift+O" } }), "config_open").shortcutText).toBe("Ctrl+Shift+O");
    expect(item(input({ shortcuts: { config_open: "Ctrl+Shift+O,Ctrl+Comma" } }), "config_open").shortcutText).toBe("Ctrl+Shift+O");
  });

  it("【確定 T-28】 `settings = \"\"` (an empty binding) and no entry both still show Ctrl+, (the pre-emption keeps working)", () => {
    expect(item(input({ shortcuts: { config_open: "" } }), "config_open").shortcutText).toBe("Ctrl+,");
    expect(item(input({ shortcuts: {} }), "config_open").shortcutText).toBe("Ctrl+,");
  });

  it("「設定ファイルのチェック」 never shows a shortcut, even if one is (wrongly) supplied", () => {
    expect(item(input(), "config_check").shortcutText).toBeUndefined();
    expect(item(input({ shortcuts: { config_check: "Ctrl+K" } as never }), "config_check").shortcutText).toBeUndefined();
  });
});

describe("formatSettingsShortcut (same shape as formatExitShortcut)", () => {
  it("an empty or missing binding shows Ctrl+,; anything else is formatted like formatShortcut", () => {
    expect(formatSettingsShortcut(undefined)).toBe("Ctrl+,");
    expect(formatSettingsShortcut("")).toBe("Ctrl+,");
    expect(formatSettingsShortcut("Ctrl+Comma")).toBe("Ctrl+,");
    expect(formatSettingsShortcut("Ctrl+Shift+O")).toBe("Ctrl+Shift+O");
    expect(formatSettingsShortcut("Ctrl+Shift+O,Ctrl+Comma")).toBe("Ctrl+Shift+O");
  });
});
