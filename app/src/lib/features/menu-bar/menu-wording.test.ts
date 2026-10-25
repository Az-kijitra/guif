/// <reference types="node" />
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [単体 / 静的] Spec: SPEC-0300-0019 第2版 §4.7 W-60~W-89 (the menu bar's wording), AC-1214 (unit part: aria-label, heading text, item names;
//   the status-bar part is [CDP]), SPEC-0300-0020 R-1391 (aria-labels), R-1393 / T-04 (the heading shows the access key in brackets, the letter
//   underlined; the aria-label has no brackets), R-1372 / T-11 (W-89 `メニュー`).
// Architecture: SPEC-0200-0001 §3.14.1-1 (`features/menu-bar/messages.ts` holds W-60~W-89 and the menu-bar-only sentences; the underline is
//   `<span class="accel">` with CSS `text-decoration`, NOT `<u>`), §3.14.12-1 (W-89 goes to `REGION_NAMES` in shared; the shared reasons in
//   `SHARED_SENTENCES`; `ac1212-wording.test.ts` scans `features/menu-bar/messages.ts`; NO Japanese literal may sit outside a messages.ts
//   -- R-CJK-outside), §3.14.9 / §3.14.12-6 (AC-1214 = this file + `menubar.mjs` for the CDP part).
//

import { REGION_NAMES } from "$lib/shared/messages";
import { buildMenuBar } from "./menu-model";

const DIR = __dirname;
const NO_INPUT = {
  targets: [],
  focusRow: null,
  clipboardHasItems: false,
  isZip: () => false,
  checks: { tree: false, hidden: false, size: false, time: false },
  shortcuts: {},
};

describe("W-60 / W-61~W-64: the bar and the headings (AC-1214)", () => {
  it("the aria-label of the bar is メニューバー (W-60): the literal lives in features/menu-bar/messages.ts", () => {
    expect(existsSync(resolve(DIR, "messages.ts")), "features/menu-bar/messages.ts must exist").toBe(true);
    expect(readFileSync(resolve(DIR, "messages.ts"), "utf-8")).toContain("メニューバー");
  });

  it("the visible heading text has the access key in brackets; the dropdown / heading aria-label has no brackets", () => {
    const bar = buildMenuBar(NO_INPUT as never);
    expect(bar.map((m) => m.label)).toEqual(["ファイル(F)", "編集(E)", "表示(V)", "移動(G)"]);
    expect(bar.map((m) => m.ariaLabel)).toEqual(["ファイル", "編集", "表示", "移動"]);
  });
});

describe("W-65~W-88: the item names, per menu, in order (AC-1214)", () => {
  const names = (idx: number): string[] =>
    buildMenuBar(NO_INPUT as never)[idx].entries.flatMap((e) => (e.type === "item" ? [e.label] : []));

  it("ファイル: W-65~W-73 with W-A0 / W-A1 before 終了 (SPEC-0300-0022)", () => {
    expect(names(0)).toEqual(["開く", "OSの関連付けで開く", "新規作成…", "新しいフォルダー…", "名前の変更", "削除", "ZIPに圧縮", "ZIPを展開", "設定ファイルを開く", "設定ファイルのチェック", "終了"]);
  });

  it("編集: W-74~W-80", () => {
    expect(names(1)).toEqual(["切り取り", "コピー", "貼り付け", "パスのコピー", "すべて選択", "選択の解除", "検索"]);
  });

  it("表示: W-81~W-85", () => {
    expect(names(2)).toEqual(["ツリー", "隠しファイル", "サイズの列", "更新日時の列", "並び替え…"]);
  });

  it("移動: W-86~W-88", () => {
    expect(names(3)).toEqual(["親フォルダーへ", "パス欄へ移動", "ファイル検索…", "履歴", "ジャンプリスト", "ジャンプリストに追加"]);
  });

  it("the ellipsis is the single character … (U+2026), never three dots (SPEC-0300-0019 R-1206 / AC-1206)", () => {
    const all = buildMenuBar(NO_INPUT as never).flatMap((m) => m.entries.flatMap((e) => (e.type === "item" ? [e.label] : [])));
    for (const l of all) expect(l).not.toContain("...");
    expect(all.filter((l) => l.endsWith("…"))).toEqual(["新規作成…", "新しいフォルダー…", "並び替え…", "ファイル検索…"]);
  });

  it("the shared terms are used as is: 名前の変更 / 削除 / ZIPに圧縮 / ZIPを展開 / 切り取り / コピー / 貼り付け match the R-1220 term table", async () => {
    const { OPERATION_NAMES } = await import("$lib/shared/messages");
    const all = buildMenuBar(NO_INPUT as never).flatMap((m) => m.entries.flatMap((e) => (e.type === "item" ? [e.label] : [])));
    for (const term of Object.values(OPERATION_NAMES)) expect(all).toContain(term);
  });
});

describe("W-89: the status-bar focus name while the menu bar is active", () => {
  it("shared REGION_NAMES carries `メニュー` (status-bar-model.ts reads the names from there; routes may not import a feature's messages)", () => {
    expect(Object.values(REGION_NAMES)).toContain("メニュー");
  });
});

describe("no Japanese literal in the menu-bar feature outside messages.ts (AC-1212 R-CJK-outside; the scan itself is ac1212-wording.test.ts)", () => {
  it("menu-model.ts / menu-bar-keys.ts / shortcut-format.ts carry no CJK character in code (comments excluded)", () => {
    const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const f of ["menu-model.ts", "menu-bar-keys.ts", "shortcut-format.ts"]) {
      const p = resolve(DIR, f);
      expect(existsSync(p), f).toBe(true);
      expect(strip(readFileSync(p, "utf-8")), f).not.toMatch(/[　-ヿ㐀-鿿＀-￯]/);
    }
  });
});
