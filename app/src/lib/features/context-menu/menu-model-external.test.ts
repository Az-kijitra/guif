import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1553 (the registered apps are items of the right-click menu: ROW menu -- after 「OSの関連付けで開く」 a separator, the items in
//   config.toml order, a separator, then 「コピー」; BLANK menu -- after 「貼り付け」 a separator and the items; no shortcut text; no registration -> neither the
//   items nor their separator), R-1532 (the row menu's target is the right-clicked row -- the number of selected rows is irrelevant; the blank menu's target is
//   the current folder), R-1560 / R-1561 (enabled unless no target can be decided: the blank menu with no current folder -> disabled, `対象がありません`;
//   fixed when the menu opens), SPEC-0300-0018 第5版 R-1030 / R-1031 / R-1032 (the count of items is fixed at start-up; a separator is never first, last or doubled),
//   R-1033 (no shortcut text), R-1110 / AC-1026 (the OLD "no external items" rule now holds only for 0 registrations), AC-1531 (unit part).
// Architecture: SPEC-0200-0001 §3.16.8 (`MenuInput.externalApps`; `ROW_LAYOUT` / `BLANK_LAYOUT` get an `"@ext"` slot; 0 items drop the slot and the separator that
//   is adjacent to it; the row menu is always enabled; the blank menu is disabled while the current folder is empty), §3.16.15 MINOR-36.
//
// Contract assumed (reported to the implementer):
//   MenuInput gains (all optional; absent = no registered apps):
//     externalApps?: readonly { index: number; label: string }[];     // usable registrations in order
//     directory?: string;                                              // the current folder: the blank menu's target ("" = none decided)
//   MenuEntry item: id may be `ext:${index}`; such an entry has NO `shortcutText` / no key text.
//   buildMenu: row  -> open, os_open, ---, ext:*, ---, copy, cut, paste, copy_path, ---, delete, rename, ---, zip_create, zip_extract
//              blank-> new_file, ---, paste, ---, ext:*                    (without externalApps: exactly as before)
//
// Module under test: ./menu-model.ts

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { buildMenu, type MenuEntry, type MenuInput, type MenuTarget } from "./menu-model";

const isZip = (name: string) => /\.zip$/i.test(name);
const file = (name: string): MenuTarget => ({ path: `C:\\w\\${name}`, name, entryType: "file" });
const dir = (name: string): MenuTarget => ({ path: `C:\\w\\${name}`, name, entryType: "dir" });

function input(over: Record<string, unknown> = {}): MenuInput {
  return { kind: "row", targets: [file("a.txt")], clipboardHasItems: true, isZip, ...over } as MenuInput;
}

const shape = (entries: readonly MenuEntry[]): string[] => entries.map((e) => (e.type === "separator" ? "---" : String(e.id)));
const items = (entries: readonly MenuEntry[]) => entries.flatMap((e) => (e.type === "item" ? [e] : []));
const ext = (entries: readonly MenuEntry[]) => items(entries).filter((e) => String(e.id).startsWith("ext:"));

const FOUR = [
  { index: 0, label: "ターミナルで開く" },
  { index: 1, label: "VS Codeで開く" },
  { index: 2, label: "エクスプローラーで開く" },
  { index: 3, label: "GitHub Desktopで開く" },
];

const OLD_ROW = ["open", "os_open", "---", "copy", "cut", "paste", "copy_path", "---", "delete", "rename", "---", "zip_create", "zip_extract"];
const OLD_BLANK = ["new_file", "---", "paste"];

describe("AC-1531: the row menu", () => {
  const entries = buildMenu(input({ externalApps: FOUR }));

  it("open, os_open, separator, the four, separator, copy ...", () => {
    expect(shape(entries)).toEqual([
      "open", "os_open", "---", "ext:0", "ext:1", "ext:2", "ext:3", "---", "copy", "cut", "paste", "copy_path", "---", "delete", "rename", "---", "zip_create", "zip_extract",
    ]);
  });

  it("the labels are the registered names; there is no shortcut text (R-1033)", () => {
    expect(ext(entries).map((e) => e.label)).toEqual(FOUR.map((a) => a.label));
    for (const e of ext(entries)) {
      expect("shortcutText" in e, String(e.id)).toBe(false);
      expect(e.label).not.toMatch(/Ctrl|Shift|Alt/);
    }
  });

  it("they are enabled with no reason", () => {
    for (const e of ext(entries)) {
      expect(e.enabled).toBe(true);
      expect(e.reason).toBeUndefined();
    }
  });
});

describe("AC-1531: the blank menu", () => {
  const entries = buildMenu(input({ kind: "blank", targets: [], externalApps: FOUR, directory: "C:\\w" }));

  it("new_file, separator, paste, separator, the four", () => {
    expect(shape(entries)).toEqual(["new_file", "---", "paste", "---", "ext:0", "ext:1", "ext:2", "ext:3"]);
  });

  it("the labels are the registered names without shortcut text; enabled while a current folder exists", () => {
    expect(ext(entries).map((e) => e.label)).toEqual(FOUR.map((a) => a.label));
    for (const e of ext(entries)) {
      expect(e.enabled).toBe(true);
      expect("shortcutText" in e).toBe(false);
    }
  });

  it("R-1560: with no current folder every registered item is disabled with `対象がありません`", () => {
    const none = buildMenu(input({ kind: "blank", targets: [], externalApps: FOUR, directory: "" }));
    expect(shape(none)).toEqual(shape(entries)); // the layout is fixed (R-1032)
    for (const e of ext(none)) {
      expect(e.enabled).toBe(false);
      expect(e.reason).toBe(SHARED_SENTENCES.noTarget);
    }
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
  });

  it("the paste item keeps its own rule next to them", () => {
    const empty = buildMenu(input({ kind: "blank", targets: [], clipboardHasItems: false, externalApps: FOUR, directory: "C:\\w" }));
    expect(items(empty).find((e) => e.id === "paste")).toMatchObject({ enabled: false });
    expect(ext(empty).every((e) => e.enabled)).toBe(true);
  });
});

describe("no registration: the old menus, exactly (AC-1501 / AC-1026 for 0 registrations)", () => {
  it("omitted and empty", () => {
    for (const externalApps of [undefined, []]) {
      expect(shape(buildMenu(input({ externalApps })))).toEqual(OLD_ROW);
      expect(shape(buildMenu(input({ kind: "blank", targets: [], externalApps, directory: "C:\\w" })))).toEqual(OLD_BLANK);
    }
  });

  it("the input without any of the new members behaves as before", () => {
    expect(shape(buildMenu(input()))).toEqual(OLD_ROW);
    expect(shape(buildMenu(input({ kind: "blank", targets: [] })))).toEqual(OLD_BLANK);
  });
});

describe("the number of registrations (R-1553 / R-1032)", () => {
  it("one and twenty", () => {
    expect(shape(buildMenu(input({ externalApps: [FOUR[0]] })))).toEqual([
      "open", "os_open", "---", "ext:0", "---", "copy", "cut", "paste", "copy_path", "---", "delete", "rename", "---", "zip_create", "zip_extract",
    ]);
    const twenty = Array.from({ length: 20 }, (_, i) => ({ index: i, label: `app${i + 1}` }));
    const row = buildMenu(input({ externalApps: twenty }));
    expect(ext(row)).toHaveLength(20);
    expect(items(row)).toHaveLength(10 + 20);
    const blank = buildMenu(input({ kind: "blank", targets: [], externalApps: twenty, directory: "C:\\w" }));
    expect(ext(blank)).toHaveLength(20);
  });

  it("the id carries the registration's own index", () => {
    const row = buildMenu(input({ externalApps: [{ index: 4, label: "a" }, { index: 11, label: "b" }] }));
    expect(ext(row).map((e) => e.id)).toEqual(["ext:4", "ext:11"]);
  });

  it("a separator is never first, last or doubled (all menus, 0 / 1 / 4 / 20 items)", () => {
    for (const n of [0, 1, 4, 20]) {
      const apps = Array.from({ length: n }, (_, i) => ({ index: i, label: `a${i}` }));
      for (const entries of [
        buildMenu(input({ externalApps: apps })),
        buildMenu(input({ kind: "blank", targets: [], externalApps: apps, directory: "C:\\w" })),
      ]) {
        const s = shape(entries);
        expect(s[0], `n=${n}`).not.toBe("---");
        expect(s[s.length - 1], `n=${n}`).not.toBe("---");
        s.forEach((x, i) => {
          if (x === "---") expect(s[i - 1], `n=${n}`).not.toBe("---");
        });
      }
    }
  });
});

describe("R-1532 / R-1560: the row menu does not depend on the selection", () => {
  it("one, three and mixed targets all give enabled registered items and the same layout", () => {
    const base = shape(buildMenu(input({ externalApps: FOUR })));
    for (const targets of [[file("a.txt")], [dir("d")], [file("a.txt"), file("b.txt"), file("c.zip")], [file("a.txt"), dir("d")]]) {
      const entries = buildMenu(input({ targets, externalApps: FOUR }));
      expect(shape(entries)).toEqual(base);
      for (const e of ext(entries)) expect(e.enabled).toBe(true);
    }
  });

  it("a .zip target is an ordinary target (R-1534)", () => {
    const entries = buildMenu(input({ targets: [file("c.zip")], externalApps: FOUR }));
    for (const e of ext(entries)) expect(e.enabled).toBe(true);
  });

  it("the row menu with no target at all still gives nothing (the caller never opens it)", () => {
    expect(buildMenu(input({ targets: [], externalApps: FOUR }))).toEqual([]);
  });
});

describe("the fixed part is untouched", () => {
  it("every non-registered item keeps its enabled state and reason", () => {
    const strip = (es: readonly MenuEntry[]) => items(es).filter((e) => !String(e.id).startsWith("ext:"));
    for (const targets of [[file("a.txt")], [dir("d")], [file("a.txt"), file("b.txt")]]) {
      expect(strip(buildMenu(input({ targets, externalApps: FOUR })))).toEqual(strip(buildMenu(input({ targets }))));
    }
  });
});
