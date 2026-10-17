import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1552 (the registered apps are items of 「ファイル」: after 「OSの関連付けで開く」 and its separator, one per usable
//   registration in config.toml order, then a separator, then 「新規作成…」; the item name is the registration's name as it is; the shortcut text is
//   the registration's FIRST usable key; no usable registration -> neither the items nor their separator; the count is fixed at start-up),
//   R-1560 / R-1561 (enabled unless no target can be decided: then disabled with `対象がありません`; many selected files never disable it),
//   AC-1530 (unit part: the default four in order with their keys), AC-1501 (unit part: 0 registrations = the old menu),
//   SPEC-0300-0020 第2版 R-1310 / R-1312 (a separator is never first, last or doubled; the layout does not depend on the input otherwise),
//   R-1330 (the shortcut text), R-1393 (names of the registered items come from the registration, not from the W-60..W-89 table).
// Architecture: SPEC-0200-0001 §3.16.8 (`BarInput.externalApps` / `externalTargetAvailable`; `LAYOUT.file` has an `"@ext"` slot expanded to `ext:<index>`
//   items; 0 items drop the slot AND the separator after it; `ItemId` and `ITEM_LABELS` are NOT touched; the reason is `SHARED_SENTENCES.noTarget`),
//   §3.16.15 MINOR-36 (`formatShortcut` is called by `routes/external-apps-wiring.ts`; this model receives the FINISHED text and passes it through).
//
// Contract assumed (reported to the implementer):
//   BarInput gains (both optional; absent = no registered apps):
//     externalApps?: readonly { index: number; label: string; shortcutText?: string }[];     // usable registrations in order; shortcutText already formatted
//     externalTargetAvailable?: boolean;                                                      // false => every external item is disabled (reason = noTarget)
//   BarEntry item gains: id may be `ext:${index}`  (the string `ext:` + the registration's `index`)
//   buildMenuBar(...) "file" entries: open, os_open, ---, ext:*, ---, new_file, new_folder, ... (without externalApps: exactly as before)
//
// Module under test: ./menu-model.ts

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { buildMenuBar, type BarInput } from "./menu-model";

const file = (name: string) => ({ entryType: "file" as const, name });
const isZip = (name: string): boolean => name.toLowerCase().endsWith(".zip");

function input(over: Record<string, unknown> = {}): BarInput {
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

type Entry = ReturnType<typeof buildMenuBar>[number]["entries"][number];
const fileMenu = (i: BarInput): Entry[] => buildMenuBar(i).find((m) => m.id === "file")!.entries;
const shape = (entries: readonly Entry[]): string[] => entries.map((e) => (e.type === "separator" ? "---" : String(e.id)));
const items = (entries: readonly Entry[]) => entries.flatMap((e) => (e.type === "item" ? [e] : []));
const ext = (entries: readonly Entry[]) => items(entries).filter((e) => String(e.id).startsWith("ext:"));

const DEFAULT_FOUR = [
  { index: 0, label: "ターミナルで開く", shortcutText: "Ctrl+Alt+C" },
  { index: 1, label: "VS Codeで開く", shortcutText: "Ctrl+Alt+V" },
  { index: 2, label: "エクスプローラーで開く", shortcutText: "Ctrl+Alt+E" },
  { index: 3, label: "GitHub Desktopで開く", shortcutText: "Ctrl+Alt+Shift+G" },
];

const OLD_FILE = ["open", "os_open", "---", "new_file", "new_folder", "---", "rename", "delete", "---", "zip_create", "zip_extract", "---", "exit"];

describe("AC-1530: the default four in 「ファイル」", () => {
  const entries = fileMenu(input({ externalApps: DEFAULT_FOUR, externalTargetAvailable: true }));

  it("sit after 「OSの関連付けで開く」 and its separator, in order, then a separator, then 「新規作成…」", () => {
    expect(shape(entries)).toEqual([
      "open", "os_open", "---", "ext:0", "ext:1", "ext:2", "ext:3", "---", "new_file", "new_folder", "---", "rename", "delete", "---",
      "zip_create", "zip_extract", "---", "exit",
    ]);
  });

  it("have the registered names as labels and the first usable key as the shortcut text", () => {
    expect(ext(entries).map((e) => [e.label, e.shortcutText])).toEqual([
      ["ターミナルで開く", "Ctrl+Alt+C"],
      ["VS Codeで開く", "Ctrl+Alt+V"],
      ["エクスプローラーで開く", "Ctrl+Alt+E"],
      ["GitHub Desktopで開く", "Ctrl+Alt+Shift+G"],
    ]);
  });

  it("are enabled without a reason", () => {
    for (const e of ext(entries)) {
      expect(e.enabled, String(e.id)).toBe(true);
      expect(e.reason, String(e.id)).toBeUndefined();
    }
  });
});

describe("AC-1501: no usable registration means the old menu, byte for byte", () => {
  it("omitted and empty give exactly the old layout (neither the items nor a doubled separator)", () => {
    expect(shape(fileMenu(input()))).toEqual(OLD_FILE);
    expect(shape(fileMenu(input({ externalApps: [], externalTargetAvailable: true })))).toEqual(OLD_FILE);
  });

  it("the other three menus never change", () => {
    const withExt = buildMenuBar(input({ externalApps: DEFAULT_FOUR, externalTargetAvailable: true }));
    const without = buildMenuBar(input());
    for (const id of ["edit", "view", "go"]) {
      expect(withExt.find((m) => m.id === id)).toEqual(without.find((m) => m.id === id));
    }
  });
});

describe("the number of registrations (R-1552: 1 .. 20)", () => {
  it("one registration: one item between the two separators", () => {
    expect(shape(fileMenu(input({ externalApps: [DEFAULT_FOUR[0]], externalTargetAvailable: true })))).toEqual([
      "open", "os_open", "---", "ext:0", "---", "new_file", "new_folder", "---", "rename", "delete", "---", "zip_create", "zip_extract", "---", "exit",
    ]);
  });

  it("twenty registrations: all are listed in the given order, no separator inside the group", () => {
    const apps = Array.from({ length: 20 }, (_, i) => ({ index: i, label: `app${i + 1}` }));
    const entries = fileMenu(input({ externalApps: apps, externalTargetAvailable: true }));
    expect(ext(entries).map((e) => e.label)).toEqual(apps.map((a) => a.label));
    const at = shape(entries).indexOf("ext:0");
    expect(shape(entries).slice(at, at + 20)).toEqual(apps.map((a) => `ext:${a.index}`));
    expect(items(entries)).toHaveLength(9 + 20); // the nine fixed items of 「ファイル」 + the twenty registered ones
  });

  it("the id carries the registration's own index (not the position) -- the list may skip numbers", () => {
    const entries = fileMenu(input({ externalApps: [{ index: 5, label: "a" }, { index: 9, label: "b" }], externalTargetAvailable: true }));
    expect(ext(entries).map((e) => e.id)).toEqual(["ext:5", "ext:9"]);
  });

  it("R-1310: no separator is ever first, last or doubled, whatever the number", () => {
    for (const n of [0, 1, 2, 4, 20]) {
      const apps = Array.from({ length: n }, (_, i) => ({ index: i, label: `a${i}` }));
      const s = shape(fileMenu(input({ externalApps: apps, externalTargetAvailable: true })));
      expect(s[0]).not.toBe("---");
      expect(s[s.length - 1]).not.toBe("---");
      s.forEach((x, i) => {
        if (x === "---") expect(s[i - 1]).not.toBe("---");
      });
    }
  });

  it("the layout does not depend on the target or the selection (R-1312 / R-1552: fixed at start-up)", () => {
    const apps = DEFAULT_FOUR;
    const a = shape(fileMenu(input({ externalApps: apps, externalTargetAvailable: true })));
    const b = shape(fileMenu(input({ externalApps: apps, externalTargetAvailable: false })));
    const c = shape(fileMenu(input({ externalApps: apps, externalTargetAvailable: true, targets: [file("a.txt"), file("b.txt")], focusRow: file("a.txt") })));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe("R-1560: enabled unless no target can be decided", () => {
  it("externalTargetAvailable false disables every registered item with the shared W-9D sentence", () => {
    const entries = fileMenu(input({ externalApps: DEFAULT_FOUR, externalTargetAvailable: false }));
    for (const e of ext(entries)) {
      expect(e.enabled, String(e.id)).toBe(false);
      expect(e.reason, String(e.id)).toBe(SHARED_SENTENCES.noTarget);
    }
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
  });

  it("AC-1540: many selected files never disable them", () => {
    const entries = fileMenu(
      input({ externalApps: DEFAULT_FOUR, externalTargetAvailable: true, targets: [file("a"), file("b"), file("c")], focusRow: file("a") }),
    );
    for (const e of ext(entries)) expect(e.enabled).toBe(true);
  });

  it("the other file items keep their own rules while the external ones are disabled (no cross talk)", () => {
    const entries = fileMenu(input({ externalApps: DEFAULT_FOUR, externalTargetAvailable: false }));
    const os = items(entries).find((e) => e.id === "os_open")!;
    expect(os.enabled).toBe(false);
    expect(os.reason).toBe(SHARED_SENTENCES.noSelection);
    expect(items(entries).find((e) => e.id === "new_file")!.enabled).toBe(true);
  });
});

describe("labels and shortcut text (R-1330, R-1393)", () => {
  it("a registration's name is used as it is: spaces, ampersands and brackets are not interpreted", () => {
    const names = ["  padded  ", "A & B", "x(F)", "日本語 (v2)", "a」b「"];
    const entries = fileMenu(input({ externalApps: names.map((label, index) => ({ index, label })), externalTargetAvailable: true }));
    expect(ext(entries).map((e) => e.label)).toEqual(names);
  });

  it("no usable key: no shortcut text at all (the property is absent)", () => {
    const entries = fileMenu(
      input({ externalApps: [{ index: 0, label: "k0" }, { index: 1, label: "k1", shortcutText: "" }], externalTargetAvailable: true }),
    );
    for (const e of ext(entries)) expect("shortcutText" in e && e.shortcutText !== undefined, String(e.id)).toBe(false);
  });

  it("the finished text is passed through untouched (formatting happens in routes)", () => {
    const entries = fileMenu(input({ externalApps: [{ index: 0, label: "a", shortcutText: "Ctrl+Alt+Shift+G" }], externalTargetAvailable: true }));
    expect(ext(entries)[0].shortcutText).toBe("Ctrl+Alt+Shift+G");
  });

  it("registered items never take the shortcut table of the keymap (shortcuts input is for the fixed items)", () => {
    const entries = fileMenu(
      input({ externalApps: [{ index: 0, label: "a" }], externalTargetAvailable: true, shortcuts: { open: "Enter", zip_create: "Ctrl+Alt+Z" } }),
    );
    expect(ext(entries)[0].shortcutText).toBeUndefined();
    expect(items(entries).find((e) => e.id === "zip_create")!.shortcutText).toBe("Ctrl+Alt+Z");
  });
});

describe("the fixed part is untouched", () => {
  it("every non-external file item is exactly what it was without registrations", () => {
    const withExt = fileMenu(input({ externalApps: DEFAULT_FOUR, externalTargetAvailable: true }));
    const without = fileMenu(input());
    const strip = (es: readonly Entry[]) => es.filter((e) => e.type === "separator" || !String(e.id).startsWith("ext:"));
    // compare the items only (the separator count differs by design)
    expect(items(strip(withExt))).toEqual(items(strip(without)));
  });
});
