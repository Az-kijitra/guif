/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [単体 / 静的] Spec: SPEC-0300-0020 R-1320 (確定 S-3: the reason of a disabled item is the SAME sentence the key operation shows when it does not
//   run), AC-1314 ("理由の文言は同じ文言の定数と一致"), SPEC-0300-0019 R-1201 (wording lives in the messages modules), W-89 (`メニュー`).
// Architecture: SPEC-0200-0001 §3.14.12-1 (MUST-129 / SHOULD-197 / MINOR-20~22): `renameOneAtATime`, `noPasteItems` and the
//   `フォルダーには使えません` sentence MOVE from `features/file-ops/messages.ts` / `features/context-menu/messages.ts` into
//   `shared/messages.ts` `SHARED_SENTENCES` (next to noSelection / noTarget / notZipFile / extractOneAtATime), so file-ops, context-menu and
//   menu-bar read ONE constant; `REGION_NAMES` gets W-89.
//

import { REGION_NAMES, SHARED_SENTENCES } from "./messages";

const SRC = resolve(__dirname, "..", "..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) {
      if (n === "node_modules" || n === ".svelte-kit") continue;
      walk(f, out);
    } else if (/\.(ts|svelte)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(f);
  }
  return out;
};
const PROD = walk(SRC);
const rel = (f: string): string => relative(SRC, f).split(sep).join("/");
const filesContaining = (literal: string): string[] => PROD.filter((f) => readFileSync(f, "utf-8").includes(literal)).map(rel);

describe("SHARED_SENTENCES holds the sentences the menu bar shares with the key operations", () => {
  it("renameOneAtATime and noPasteItems (names fixed by the design) with the spec wording", () => {
    const s = SHARED_SENTENCES as Record<string, string>;
    expect(s.renameOneAtATime).toBe("名前の変更は1件ずつ行えます");
    expect(s.noPasteItems).toBe("貼り付ける項目がありません");
  });

  it("the folder sentence is there too (its key name is the implementer's choice; found by value)", () => {
    expect(Object.values(SHARED_SENTENCES)).toContain("フォルダーには使えません");
  });

  it("the earlier four are unchanged", () => {
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
    expect(SHARED_SENTENCES.noSelection).toBe("選択がありません");
    expect(SHARED_SENTENCES.notZipFile).toBe("ZIPファイルではありません");
    expect(SHARED_SENTENCES.extractOneAtATime).toBe("展開は1件ずつ指定してください");
  });
});

describe("one definition each (AC-1314: the SAME constant, no second copy that could drift)", () => {
  it.each([
    "名前の変更は1件ずつ行えます",
    "貼り付ける項目がありません",
    "フォルダーには使えません",
    "選択がありません",
    "対象がありません",
    "ZIPファイルではありません",
    "展開は1件ずつ指定してください",
  ])("the literal %s appears in exactly one production file: lib/shared/messages.ts", (literal) => {
    expect(filesContaining(literal)).toEqual(["lib/shared/messages.ts"]);
  });

  it("file-ops, context-menu and menu-bar read the shared constants (they import $lib/shared/messages)", () => {
    for (const f of ["lib/features/file-ops/messages.ts", "lib/features/context-menu/messages.ts", "lib/features/menu-bar/messages.ts"]) {
      expect(readFileSync(join(SRC, f), "utf-8"), f).toMatch(/from\s+["']\$lib\/shared\/messages["']/);
    }
  });
});

describe("W-89: REGION_NAMES", () => {
  it("has the name of the menu bar as the focus area: メニュー (status bar: フォーカス: メニュー)", () => {
    expect(Object.values(REGION_NAMES)).toContain("メニュー");
  });

  it("the existing names are unchanged", () => {
    expect(REGION_NAMES.contextMenu).toBe("右クリックメニュー");
    expect(REGION_NAMES.tree).toBe("ツリー");
    expect(REGION_NAMES.list).toBe("一覧");
  });
});
