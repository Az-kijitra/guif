import { describe, expect, it, vi } from "vitest";
import { buildMenuBar, type BarInput } from "$lib/features/menu-bar/menu-model";
import { createMenuExecutor } from "./menu-bar-exec";
import { buildShortcutTable } from "./menu-bar-shortcuts";

// [単体] Spec: SPEC-0300-0022 R-1670 (the shortcut text of 「設定ファイルを開く」 is the CURRENT assignment of `settings`; `settings = ""` still shows
//   `Ctrl+,`; 「設定ファイルのチェック」 has none), R-1671 (`config_check` has no operation id / key; `ACTION_IDS` stays 34), R-1672 / AC-1665 (a menu
//   item runs the same handler; the order close -> restore focus -> run is the existing runItem), AC-1660 (unit part), AC-1215.
// Architecture: SPEC-0200-0001 §3.17.9: `buildShortcutTable` gains `config_open` = the `settings` binding (normal form) and NO `config_check`;
//   `createMenuExecutor` deps gain `settingsFile?: { open(): unknown; check(): unknown }` and branch `config_open` / `config_check` BEFORE the
//   LIST_ITEMS test, calling neither `onListAction` nor `onExitAction`.
//
// Modules under test: ./menu-bar-shortcuts.ts, ./menu-bar-exec.ts

const EMPTY: BarInput = {
  targets: [],
  focusRow: null,
  clipboardHasItems: false,
  isZip: () => false,
  checks: { tree: false, hidden: false, size: false, time: false },
  shortcuts: {},
};
function shown(overrides: Record<string, string>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const m of buildMenuBar({ ...EMPTY, shortcuts: buildShortcutTable(overrides) })) {
    for (const e of m.entries) if (e.type === "item") out[e.id] = e.shortcutText;
  }
  return out;
}

describe("buildShortcutTable: config_open follows the `settings` assignment (R-1670)", () => {
  it("default: the table holds the normal form Ctrl+Comma; the bar shows Ctrl+,", () => {
    expect(buildShortcutTable({}).config_open).toBe("Ctrl+Comma");
    expect(shown({}).config_open).toBe("Ctrl+,");
  });

  it("`settings = \"Ctrl+Shift+O\"` shows that key; the first of a list; lower case is normalised", () => {
    expect(shown({ settings: "Ctrl+Shift+O" }).config_open).toBe("Ctrl+Shift+O");
    expect(shown({ settings: "ctrl+shift+o" }).config_open).toBe("Ctrl+Shift+O");
    expect(shown({ settings: "Ctrl+Shift+O,Ctrl+Comma" }).config_open).toBe("Ctrl+Shift+O");
  });

  it("【確定 T-28】 `settings = \"\"` still shows Ctrl+, (Ctrl+, keeps working as a pre-emption)", () => {
    expect(shown({ settings: "" }).config_open).toBe("Ctrl+,");
  });

  it("config_check has no entry in the table and no shortcut text (R-1671: no operation id)", () => {
    expect(Object.keys(buildShortcutTable({}))).not.toContain("config_check");
    expect(shown({}).config_check).toBeUndefined();
  });
});

function recorder() {
  const onListAction = vi.fn(() => true);
  const onExitAction = vi.fn(() => true);
  const copyPath = vi.fn();
  const settingsFile = { open: vi.fn(), check: vi.fn() };
  const execute = createMenuExecutor({ onListAction, onExitAction, copyPath, settingsFile } as never) as (id: string, ...rest: unknown[]) => void;
  return { execute, onListAction, onExitAction, copyPath, settingsFile };
}

describe("createMenuExecutor: config_open / config_check (R-1672, AC-1665)", () => {
  it("config_open -> settingsFile.open() once; nothing else is called", () => {
    const r = recorder();
    r.execute("config_open");
    expect(r.settingsFile.open).toHaveBeenCalledTimes(1);
    expect(r.settingsFile.check).not.toHaveBeenCalled();
    expect(r.onListAction).not.toHaveBeenCalled();
    expect(r.onExitAction).not.toHaveBeenCalled();
    expect(r.copyPath).not.toHaveBeenCalled();
  });

  it("config_check -> settingsFile.check() once; nothing else is called", () => {
    const r = recorder();
    r.execute("config_check");
    expect(r.settingsFile.check).toHaveBeenCalledTimes(1);
    expect(r.settingsFile.open).not.toHaveBeenCalled();
    expect(r.onListAction).not.toHaveBeenCalled();
    expect(r.onExitAction).not.toHaveBeenCalled();
  });

  it("extra arguments (a mouse event) are ignored", () => {
    const r = recorder();
    r.execute("config_open", { shiftKey: true });
    expect(r.settingsFile.open).toHaveBeenCalledWith();
  });

  it("without the dependency the items do nothing and do not throw (like the optional launchExternal)", () => {
    const execute = createMenuExecutor({ onListAction: vi.fn(), onExitAction: vi.fn(), copyPath: vi.fn() } as never);
    expect(() => execute("config_open")).not.toThrow();
    expect(() => execute("config_check")).not.toThrow();
  });
});
