import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMenu,
  evaluateItem,
  planExecution,
  REASON_CLIPBOARD_EMPTY,
  REASON_FOLDER,
  REASON_NOT_ZIP,
  REASON_ONE_ONLY,
  type MenuEntry,
  type MenuInput,
  type MenuItemId,
  type MenuSnapshot,
  type MenuTarget,
} from "./menu-model";

// Spec: SPEC-0300-0018 R-1030/R-1031 (items, order, separators), R-1032 (always
//   shown), R-1033, R-1040 (enable table + reasons in judgment order), R-1043
//   (D1: n = displayed targets), R-1056/R-1056-1 (execution-time re-check),
//   R-1110 (no extra items), AC-1020, AC-1021, AC-1023, AC-1024, AC-1025,
//   AC-1026, AC-1040, AC-1063 (separator count).
// Architecture: SPEC-0200-0001 §3.9.2, §3.9.7, §3.9.17.2/.3 (ZIP judgment is
//   injected as `isZip`; `isZipName` is removed).
// Module under test (stub): ./menu-model.ts

const isZip = (name: string) => /\.zip$/i.test(name);
const file = (name: string): MenuTarget => ({ path: `C:\\w\\${name}`, name, entryType: "file" });
const dir = (name: string): MenuTarget => ({ path: `C:\\w\\${name}`, name, entryType: "dir" });

function input(over: Partial<MenuInput> & { targets?: MenuTarget[] } = {}): MenuInput {
  return { kind: "row", targets: [file("a.txt")], clipboardHasItems: true, isZip, ...over };
}

function item(entries: MenuEntry[], id: MenuItemId) {
  const found = entries.find((e) => e.type === "item" && e.id === id);
  if (found === undefined || found.type !== "item") throw new Error(`missing ${id}`);
  return found;
}

describe("buildMenu: row menu layout (R-1030, AC-1020, AC-1063)", () => {
  let entries: MenuEntry[] = [];
  beforeEach(() => {
    entries = buildMenu(input());
  });

  it("has 13 entries: 10 items + 3 separators, in the R-1030 order with the exact labels", () => {
    const shape = entries.map((e) => (e.type === "separator" ? "---" : e.label));
    expect(shape).toEqual([
      "開く",
      "OSの関連付けで開く",
      "---",
      "コピー",
      "カット",
      "ペースト",
      "パスのコピー",
      "---",
      "削除",
      "名前の変更",
      "---",
      "ZIPに圧縮",
      "ZIPを解凍",
    ]);
  });

  it("item ids follow the same order", () => {
    const ids = entries.filter((e) => e.type === "item").map((e) => (e.type === "item" ? e.id : ""));
    expect(ids).toEqual([
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
    ]);
  });

  it("never starts or ends with a separator and never has two in a row (R-1032)", () => {
    expect(entries[0].type).toBe("item");
    expect(entries[entries.length - 1].type).toBe("item");
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].type === "separator" && entries[i - 1].type === "separator").toBe(false);
    }
  });

  it("carries no shortcut-key text in labels (R-1033)", () => {
    for (const e of entries) {
      if (e.type === "item") expect(e.label).not.toMatch(/Ctrl|Shift|Alt|Del|F\d|⌘/);
    }
  });

  it("the item set is fixed regardless of the input: same shape for 0/1/2/3 targets (R-1032)", () => {
    const shapeOf = (ts: MenuTarget[]) =>
      buildMenu(input({ targets: ts })).map((e) => (e.type === "separator" ? "---" : e.id));
    const base = shapeOf([file("a.txt")]);
    expect(shapeOf([file("a.txt"), file("b.txt")])).toEqual(base);
    expect(shapeOf([dir("d")])).toEqual(base);
    expect(shapeOf([file("a.txt"), file("b.txt"), file("c.zip")])).toEqual(base);
  });
});

describe("buildMenu: blank menu and degenerate input (R-1031, AC-1002)", () => {
  it("blank: 新規作成... / separator / ペースト (3 entries, 1 separator)", () => {
    const entries = buildMenu(input({ kind: "blank", targets: [] }));
    expect(entries.map((e) => (e.type === "separator" ? "---" : e.label))).toEqual(["新規作成...", "---", "ペースト"]);
    expect(entries.filter((e) => e.type === "separator")).toHaveLength(1);
  });

  it("row menu with 0 targets returns an empty array (the caller must not open it)", () => {
    expect(buildMenu(input({ targets: [] }))).toEqual([]);
  });
});

describe("evaluateItem / buildMenu: enable table R-1040 (AC-1021)", () => {
  const cases: Array<{ name: string; targets: MenuTarget[] }> = [
    { name: "1 file", targets: [file("a.txt")] },
    { name: "1 dir", targets: [dir("d")] },
    { name: "1 zip", targets: [file("c.zip")] },
    { name: "1 upper-case ZIP", targets: [file("C.ZIP")] },
    { name: "1 file named like a zip dir", targets: [dir("x.zip")] },
    { name: "2 files", targets: [file("a.txt"), file("b.txt")] },
    { name: "3 mixed", targets: [file("a.txt"), dir("d"), file("c.zip")] },
  ];

  for (const c of cases) {
    const n = c.targets.length;
    const t = c.targets[0];
    it(`${c.name}: open / os_open / rename / zip_extract`, () => {
      const i = input({ targets: c.targets });
      expect(evaluateItem("open", i)).toEqual(n === 1 ? { enabled: true } : { enabled: false, reason: REASON_ONE_ONLY });

      let osOpen: { enabled: boolean; reason?: string };
      if (n >= 2) osOpen = { enabled: false, reason: REASON_ONE_ONLY };
      else if (t.entryType === "dir") osOpen = { enabled: false, reason: REASON_FOLDER };
      else osOpen = { enabled: true };
      expect(evaluateItem("os_open", i)).toEqual(osOpen);

      expect(evaluateItem("rename", i)).toEqual(n === 1 ? { enabled: true } : { enabled: false, reason: REASON_ONE_ONLY });

      let zx: { enabled: boolean; reason?: string };
      if (n >= 2) zx = { enabled: false, reason: REASON_ONE_ONLY };
      else if (t.entryType === "file" && /\.zip$/i.test(t.name)) zx = { enabled: true };
      else zx = { enabled: false, reason: REASON_NOT_ZIP };
      expect(evaluateItem("zip_extract", i)).toEqual(zx);
    });

    it(`${c.name}: copy / cut / copy_path / delete / zip_create are always enabled (no reason)`, () => {
      const i = input({ targets: c.targets });
      for (const id of ["copy", "cut", "copy_path", "delete", "zip_create"] as const) {
        expect(evaluateItem(id, i).enabled).toBe(true);
        expect(evaluateItem(id, i).reason).toBeUndefined();
      }
    });
  }

  it("the multi-target reason beats the folder / not-zip reason (judgment order)", () => {
    const i = input({ targets: [dir("d"), dir("e")] });
    expect(evaluateItem("os_open", i).reason).toBe(REASON_ONE_ONLY);
    expect(evaluateItem("zip_extract", i).reason).toBe(REASON_ONE_ONLY);
  });

  it("paste: disabled with クリップボードが空です only when the app clipboard is empty (row and blank)", () => {
    for (const kind of ["row", "blank"] as const) {
      const targets = kind === "row" ? [file("a.txt")] : [];
      expect(evaluateItem("paste", input({ kind, targets, clipboardHasItems: false }))).toEqual({
        enabled: false,
        reason: REASON_CLIPBOARD_EMPTY,
      });
      expect(evaluateItem("paste", input({ kind, targets, clipboardHasItems: true }))).toEqual({ enabled: true });
    }
  });

  it("new_file is always enabled, also with an empty clipboard", () => {
    expect(evaluateItem("new_file", input({ kind: "blank", targets: [], clipboardHasItems: false }))).toEqual({
      enabled: true,
    });
  });

  it("reason strings are the exact wording (G-2: no space in ZIPファイル)", () => {
    expect(REASON_ONE_ONLY).toBe("1件だけ選択してください");
    expect(REASON_FOLDER).toBe("フォルダには使えません");
    expect(REASON_NOT_ZIP).toBe("ZIPファイルではありません");
    expect(REASON_NOT_ZIP).not.toContain(" ");
    expect(REASON_CLIPBOARD_EMPTY).toBe("クリップボードが空です");
  });

  it("zip judgment goes through the injected isZip (no built-in extension rule)", () => {
    const i = input({ targets: [file("a.txt")], isZip: () => true });
    expect(evaluateItem("zip_extract", i)).toEqual({ enabled: true });
    const j = input({ targets: [file("c.zip")], isZip: () => false });
    expect(evaluateItem("zip_extract", j)).toEqual({ enabled: false, reason: REASON_NOT_ZIP });
  });

  it("buildMenu embeds the same enabled / reason as evaluateItem (AC-1022 / AC-1023 / AC-1024)", () => {
    const i = input({ targets: [dir("d")], clipboardHasItems: false });
    const entries = buildMenu(i);
    expect(item(entries, "os_open")).toMatchObject({ enabled: false, reason: REASON_FOLDER });
    expect(item(entries, "zip_extract")).toMatchObject({ enabled: false, reason: REASON_NOT_ZIP });
    expect(item(entries, "open")).toMatchObject({ enabled: true });
    expect(item(entries, "paste")).toMatchObject({ enabled: false, reason: REASON_CLIPBOARD_EMPTY });
    expect(item(entries, "open").reason).toBeUndefined();
  });

  it("two selected: 開く / OSの関連付けで開く / 名前の変更 / ZIPを解凍 disabled with 1件だけ…, all others enabled (AC-1022)", () => {
    const entries = buildMenu(input({ targets: [file("a.txt"), file("b.txt")] }));
    for (const id of ["open", "os_open", "rename", "zip_extract"] as const) {
      expect(item(entries, id)).toMatchObject({ enabled: false, reason: REASON_ONE_ONLY });
    }
    for (const id of ["copy", "cut", "paste", "copy_path", "delete", "zip_create"] as const) {
      expect(item(entries, id).enabled).toBe(true);
    }
  });

  it("D1 / AC-1025: n is the DISPLAYED target count -- 1 displayed target (selection hidden by a filter) enables rename", () => {
    // The caller passes selection ∩ displayed; buildMenu knows nothing else.
    expect(evaluateItem("rename", input({ targets: [file("a.txt")] })).enabled).toBe(true);
  });
});

describe("AC-1026 / R-1110: the item definitions are exactly the 11 ids", () => {
  it("row + blank menus together expose only the 11 allowed ids", () => {
    const ids = new Set<string>();
    for (const e of [
      ...buildMenu(input()),
      ...buildMenu(input({ kind: "blank", targets: [] })),
    ]) {
      if (e.type === "item") ids.add(e.id);
    }
    expect([...ids].sort()).toEqual(
      ["open", "os_open", "copy", "cut", "paste", "copy_path", "delete", "rename", "zip_create", "zip_extract", "new_file"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// planExecution (R-1056, R-1056-1, AC-1040)

function snapshot(targets: MenuTarget[], over: Partial<MenuSnapshot> = {}): MenuSnapshot {
  const kind = over.kind ?? "row";
  const clipboardHasItems = over.clipboardHasItems ?? true;
  return {
    kind,
    targets,
    clipboardHasItems,
    directory: "C:\\w",
    entries: buildMenu({ kind, targets, clipboardHasItems, isZip }),
    cursor: { x: 10, y: 10 },
    ...over,
  };
}

const plan = (id: MenuItemId, snap: MenuSnapshot, displayed: MenuTarget[]) =>
  planExecution({ snapshot: snap, id, displayed, isZip });

describe("planExecution: R-1056 execution-time re-check", () => {
  const a = file("a.txt");
  const b = file("b.txt");
  const z = file("c.zip");

  it("run: targets = snapshot ∩ displayed, in DISPLAYED order (R-1056, R-1060-2)", () => {
    const result = plan("copy", snapshot([b, a]), [z, a, b]);
    expect(result).toEqual({ kind: "run", id: "copy", targets: [a, b] });
  });

  it("drops targets that no longer exist; the rest still run (R-1056-1 'removed targets are excluded')", () => {
    const result = plan("delete", snapshot([a, b]), [a, z]);
    expect(result).toEqual({ kind: "run", id: "delete", targets: [a] });
  });

  it("items that are not displayed targets are never added (only snapshot paths count)", () => {
    const result = plan("copy", snapshot([a]), [a, b, z]);
    expect(result).toMatchObject({ kind: "run", targets: [a] });
  });

  it("0 targets left, copy / cut / delete / rename / copy_path -> notice 選択がありません (AC-1040)", () => {
    for (const id of ["copy", "cut", "delete", "rename", "copy_path"] as const) {
      expect(plan(id, snapshot([b]), [a, z])).toEqual({ kind: "notice", message: "選択がありません" });
    }
  });

  it("0 targets left, zip_create / zip_extract -> notice 対象がありません", () => {
    for (const id of ["zip_create", "zip_extract"] as const) {
      expect(plan(id, snapshot([b]), [a, z])).toEqual({ kind: "notice", message: "対象がありません" });
    }
  });

  it("0 targets left, open / os_open -> noop (SPEC-0300-0015 R-402-1)", () => {
    for (const id of ["open", "os_open"] as const) {
      expect(plan(id, snapshot([b]), [a])).toEqual({ kind: "noop" });
    }
  });

  it("an empty displayed list also yields 0 targets", () => {
    expect(plan("copy", snapshot([a]), [])).toEqual({ kind: "notice", message: "選択がありません" });
  });

  it("paste / new_file always run regardless of targets (blank menu, R-1056-1 does not apply)", () => {
    const blank = snapshot([], { kind: "blank" });
    expect(plan("paste", blank, [a])).toMatchObject({ kind: "run", id: "paste" });
    expect(plan("new_file", blank, [])).toMatchObject({ kind: "run", id: "new_file" });
    // also when a row menu's targets have all vanished
    expect(plan("paste", snapshot([b]), [a])).toMatchObject({ kind: "run", id: "paste" });
  });

  it("zip_extract on a file that is no longer a zip at execution time -> notice ZIPファイルではありません", () => {
    // Snapshot had two targets; one vanished and the remaining one is not a zip.
    const result = plan("zip_extract", snapshot([z, a]), [a]);
    expect(result).toEqual({ kind: "notice", message: REASON_NOT_ZIP });
  });

  it("zip_extract with 2+ remaining targets -> notice 展開は1件ずつ指定してください (unreachable defence, one case)", () => {
    const result = plan("zip_extract", snapshot([z, file("d.zip")]), [z, file("d.zip")]);
    expect(result).toEqual({ kind: "notice", message: "展開は1件ずつ指定してください" });
  });

  it("rename with 2+ remaining targets -> noop (the menu never calls the controller)", () => {
    expect(plan("rename", snapshot([a, b]), [a, b])).toEqual({ kind: "noop" });
  });

  it("os_open on a directory at execution time -> noop", () => {
    const d = dir("d");
    expect(plan("os_open", snapshot([d]), [d])).toEqual({ kind: "noop" });
  });

  it("open on 1 file / 1 dir runs with that single target", () => {
    expect(plan("open", snapshot([a]), [a])).toEqual({ kind: "run", id: "open", targets: [a] });
    const d = dir("d");
    expect(plan("open", snapshot([d]), [d])).toEqual({ kind: "run", id: "open", targets: [d] });
  });

  it("R-1042: the snapshot's menu entries are not re-evaluated by planExecution (the plan does not mutate them)", () => {
    const snap = snapshot([a]);
    const before = JSON.stringify(snap.entries);
    plan("copy", snap, [a, b]);
    expect(JSON.stringify(snap.entries)).toBe(before);
  });
});
