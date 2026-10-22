import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1670 / R-1671 / R-1672 (the entrances for the settings file: menu items, `Ctrl+,`), SPEC-0300-0021 R-1550 (the external-app
//   entrances stay as they are); SPEC-0200-0001 §3.17.8 / §3.17.13 (`+page.svelte` gets ONE call instead of two).
// Architecture: `routes/entry-wiring.ts`: createEntryWiring(deps: ExternalAppsWiringDeps & { closeMenus: () => void; settingsFileIpc?: { settingsFileOpen; settingsFileCheck } })
//   -> { externalApps: ReturnType<typeof createExternalAppsWiring>; settingsFile: ReturnType<typeof createSettingsFileWiring> }
//   (assumed names, reported to the implementer: the key names `externalApps` / `settingsFile` match the deps names the page already passes on, and the
//   extra IPC dep is injected so that the test needs no module mock). It composes only; it adds no logic.
//
// Module under test (not yet implemented): ./entry-wiring.ts

import { createEntryWiring } from "./entry-wiring";

function setup() {
  const status = { show: vi.fn(), showPriority: vi.fn() };
  const closeMenus = vi.fn();
  const ipc = { externalAppLaunch: vi.fn(async () => {}) };
  const settingsFileIpc = {
    settingsFileOpen: vi.fn(async () => ({ templateCreated: false, sampleError: null, result: { kind: "vscode" } })),
    settingsFileCheck: vi.fn(async () => ({
      keymap: { entries: [], parseError: null, uiTheme: "system", uiThemeInvalid: false, uiThemeLine: null, present: true, unknownSettings: [] },
      externalApps: { apps: [], invalid: [], typeError: false, typeErrorLine: null },
    })),
  };
  const row = { path: "C:\\w\\a.txt", name: "a.txt", entryType: "file" as const };
  const entry = createEntryWiring({
    entries: () => [{ index: 0, label: "ターミナルで開く", keys: ["Ctrl+Alt+C"] }],
    filteredEntries: () => [row],
    focusedPath: () => row.path,
    currentPath: () => "C:\\w",
    status,
    ipc,
    closeMenus,
    settingsFileIpc,
  } as never) as unknown as {
    externalApps: { onKey(e: unknown): boolean; launchByIndex(i: number): void };
    settingsFile: { open(): Promise<void>; check(): Promise<void>; onHardcoded(a: string, e: unknown): boolean };
  };
  return { entry, status, closeMenus, ipc, settingsFileIpc };
}

describe("createEntryWiring composes both wirings once", () => {
  it("exposes the external-apps wiring (a registration key launches the focused row)", () => {
    const s = setup();
    expect(s.entry.externalApps.onKey({ key: "c", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBe(true);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(0, "C:\\w\\a.txt", "file");
  });

  it("exposes the settings-file wiring: open() / check() use the injected IPC and the shared status", async () => {
    const s = setup();
    await s.entry.settingsFile.open();
    expect(s.settingsFileIpc.settingsFileOpen).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledWith("config.toml を VS Code で開きました");
    await s.entry.settingsFile.check();
    expect(s.settingsFileIpc.settingsFileCheck).toHaveBeenCalledTimes(1);
    expect(s.status.showPriority).toHaveBeenCalledWith("設定ファイルのチェック(次の起動での扱い): 問題はありません。変更は再起動で反映されます", 2500);
  });

  it("the settings-file wiring gets closeMenus (Ctrl+, closes the menus first)", async () => {
    const s = setup();
    expect(s.entry.settingsFile.onHardcoded("settings", { repeat: false })).toBe(true);
    expect(s.closeMenus).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(s.settingsFileIpc.settingsFileOpen).toHaveBeenCalledTimes(1));
  });

  it("the two wirings are independent objects", () => {
    const s = setup();
    expect(s.entry.externalApps).not.toBe(s.entry.settingsFile);
  });
});
