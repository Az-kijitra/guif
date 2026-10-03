import { describe, expect, it } from "vitest";
import { moveMenuHighlight, resolveContextMenuKey, resolveEnterTarget, type MenuKeyEvent } from "./menu-keys";
import type { MenuEntry, MenuItemId } from "./menu-model";

// Spec: SPEC-0300-0018 R-1080 (only ArrowUp/Down/Enter/Escape), R-1081 (initial
//   no highlight; cyclic over ENABLED items; null: Down -> first, Up -> last),
//   R-1082 (Enter: highlighted, else first enabled, else nothing), R-1083,
//   R-1084 (everything else is trapped; Alt/Meta combos and bare modifier
//   keys are NOT stopped), AC-1070, AC-1071, AC-1073.
// Architecture: SPEC-0200-0001 §3.9.5. Module under test (stub): ./menu-keys.ts

const ev = (key: string, over: Partial<MenuKeyEvent> = {}): MenuKeyEvent => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
});

describe("resolveContextMenuKey (R-1080, R-1084, AC-1073)", () => {
  it("ArrowUp / ArrowDown / Enter / Escape without modifiers map to the intents", () => {
    expect(resolveContextMenuKey(ev("ArrowUp"))).toBe("move_up");
    expect(resolveContextMenuKey(ev("ArrowDown"))).toBe("move_down");
    expect(resolveContextMenuKey(ev("Enter"))).toBe("confirm");
    expect(resolveContextMenuKey(ev("Escape"))).toBe("cancel");
  });

  it("Tab, Shift+Tab, ArrowLeft/Right, Home/End, letters, Delete, Ctrl+C, Ctrl+A are trapped", () => {
    const trapped: MenuKeyEvent[] = [
      ev("Tab"),
      ev("Tab", { shiftKey: true }),
      ev("ArrowLeft"),
      ev("ArrowRight"),
      ev("Home"),
      ev("End"),
      ev("s"),
      ev("S", { shiftKey: true }),
      ev("Delete"),
      ev("c", { ctrlKey: true }),
      ev("a", { ctrlKey: true }),
      ev(" "),
      ev("F5"),
    ];
    for (const e of trapped) expect(resolveContextMenuKey(e), JSON.stringify(e)).toBe("trap");
  });

  it("the four known keys WITH Ctrl or Shift are trapped, not acted upon", () => {
    expect(resolveContextMenuKey(ev("Enter", { ctrlKey: true }))).toBe("trap");
    expect(resolveContextMenuKey(ev("ArrowDown", { shiftKey: true }))).toBe("trap");
    expect(resolveContextMenuKey(ev("Escape", { ctrlKey: true }))).toBe("trap");
  });

  it("Alt or Meta combinations pass through (Alt+F4, Alt+Tab, Windows key)", () => {
    expect(resolveContextMenuKey(ev("F4", { altKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("Tab", { altKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("Meta", { metaKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("d", { metaKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("ArrowDown", { altKey: true }))).toBe("pass");
  });

  it("bare modifier keydowns (Shift / Control / Alt / Meta) pass", () => {
    expect(resolveContextMenuKey(ev("Shift", { shiftKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("Control", { ctrlKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("Alt", { altKey: true }))).toBe("pass");
    expect(resolveContextMenuKey(ev("Meta", { metaKey: true }))).toBe("pass");
  });

  it("keys during IME composition are trapped, even the known ones", () => {
    expect(resolveContextMenuKey(ev("Enter", { isComposing: true }))).toBe("trap");
    expect(resolveContextMenuKey(ev("a", { isComposing: true }))).toBe("trap");
  });
});

// The R-1030 row menu with a configurable enabled set.
const ORDER: MenuItemId[] = [
  "open",
  "os_open",
  "copy",
  "cut",
  "paste",
  "copy_path",
  "delete",
  "rename",
  "zip_create",
  "zip_extract",
];
function menuOf(enabled: MenuItemId[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  ORDER.forEach((id, i) => {
    if (i === 2 || i === 6 || i === 8) out.push({ type: "separator" });
    out.push({ type: "item", id, label: id, enabled: enabled.includes(id) });
  });
  return out;
}
// AC-1070 state: a.txt + b.txt selected.
const TWO_SELECTED = menuOf(["copy", "cut", "paste", "copy_path", "delete", "zip_create"]);

describe("moveMenuHighlight (R-1081, AC-1070)", () => {
  it("Down from no highlight -> the first ENABLED item (skips disabled 開く / OSの関連付けで開く and separators)", () => {
    expect(moveMenuHighlight(TWO_SELECTED, null, "down")).toBe("copy");
  });

  it("Up from no highlight -> the LAST enabled item (ZIPに圧縮; disabled ZIPを解凍 is skipped)", () => {
    expect(moveMenuHighlight(TWO_SELECTED, null, "up")).toBe("zip_create");
  });

  it("Down walks only enabled items in order, skipping separators", () => {
    const seq: Array<MenuItemId | null> = [];
    let cur: MenuItemId | null = null;
    for (let i = 0; i < 6; i++) {
      cur = moveMenuHighlight(TWO_SELECTED, cur, "down");
      seq.push(cur);
    }
    expect(seq).toEqual(["copy", "cut", "paste", "copy_path", "delete", "zip_create"]);
  });

  it("Down from the last enabled item wraps to the first enabled item", () => {
    expect(moveMenuHighlight(TWO_SELECTED, "zip_create", "down")).toBe("copy");
  });

  it("Up from the first enabled item wraps to the last enabled item", () => {
    expect(moveMenuHighlight(TWO_SELECTED, "copy", "up")).toBe("zip_create");
  });

  it("Up walks backwards over enabled items (ZIPに圧縮 -> 削除 -> パスのコピー ...)", () => {
    expect(moveMenuHighlight(TWO_SELECTED, "zip_create", "up")).toBe("delete");
    expect(moveMenuHighlight(TWO_SELECTED, "delete", "up")).toBe("copy_path");
  });

  it("no enabled item at all -> null in both directions", () => {
    const none = menuOf([]);
    expect(moveMenuHighlight(none, null, "down")).toBeNull();
    expect(moveMenuHighlight(none, null, "up")).toBeNull();
  });

  it("a single enabled item stays highlighted (wraps onto itself)", () => {
    const one = menuOf(["delete"]);
    expect(moveMenuHighlight(one, null, "down")).toBe("delete");
    expect(moveMenuHighlight(one, "delete", "down")).toBe("delete");
    expect(moveMenuHighlight(one, "delete", "up")).toBe("delete");
  });

  it("blank menu: 新規作成... / ペースト (separator between) cycle", () => {
    const blank: MenuEntry[] = [
      { type: "item", id: "new_file", label: "新規作成...", enabled: true },
      { type: "separator" },
      { type: "item", id: "paste", label: "ペースト", enabled: true },
    ];
    expect(moveMenuHighlight(blank, "new_file", "down")).toBe("paste");
    expect(moveMenuHighlight(blank, "paste", "down")).toBe("new_file");
  });
});

describe("resolveEnterTarget (R-1082, AC-1071)", () => {
  const oneFile = menuOf(["open", "os_open", "copy", "cut", "paste", "copy_path", "delete", "rename", "zip_create"]);

  it("no highlight -> the first enabled item (開く)", () => {
    expect(resolveEnterTarget(oneFile, null)).toBe("open");
  });

  it("with two selected and no highlight -> コピー (開く is disabled)", () => {
    expect(resolveEnterTarget(TWO_SELECTED, null)).toBe("copy");
  });

  it("a highlighted enabled item wins", () => {
    expect(resolveEnterTarget(oneFile, "delete")).toBe("delete");
  });

  it("no enabled item -> null (Enter does nothing, the menu stays open)", () => {
    expect(resolveEnterTarget(menuOf([]), null)).toBeNull();
  });
});
