import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1600 / R-1606 / AC-1612 (a second run opens again; a key repeat does not run; the call does not block), R-1650 / R-1651 /
//   R-1654 (the check reads, evaluates and shows W-A9 + the config.toml part), R-1663-1 (the check result REPLACES the shown text: showPriority, 15 s with a
//   problem / unreadable, 2.5 s when fine or the file is missing), R-1663-2 (the open result is an ordinary `show`), R-1664 (a failure is a status message),
//   R-1665 (the sentences), R-1671 / R-1671-1 (`Ctrl+,` pre-emption: close the menus first, repeat swallowed, `exit` is exitOnly), R-1672, AC-1601, AC-1604,
//   AC-1607, AC-1650, AC-1653, AC-1655/1656 (the calls), AC-1657 (the check does not change the start-up registrations).
// Architecture: SPEC-0200-0001 §3.17.8: `routes/settings-file-wiring.ts`:
//   createSettingsFileWiring({ status: { show(msg); showPriority(msg, ms) }, closeMenus: () => void,
//                              ipc?: { settingsFileOpen(): Promise<dto>; settingsFileCheck(): Promise<{ keymap; externalApps }> } })
//     -> { open(): Promise<void>; check(): Promise<void>; onHardcoded(action: "exit" | "settings", event: { repeat?: boolean }): boolean }
//   `ipc` defaults to shared/ipc/settings-file. open(): ipc -> buildOpenResult -> status.show. check(): ipc -> evaluateConfig -> buildCheckNotice ->
//   status.showPriority(text, durationMs). A rejection becomes W-A5 (`config.toml を開けませんでした。 詳細: {message}`) through status (open: show).
//   onHardcoded("settings", e): e.repeat -> true without anything; else closeMenus() THEN open() -> true. onHardcoded("exit", _) = exitOnly.
//
// Module under test (not yet implemented): ./settings-file-wiring.ts

import { createSettingsFileWiring } from "./settings-file-wiring";

const W_A9 = "設定ファイルのチェック(次の起動での扱い): ";
const keymap = (over: Record<string, unknown> = {}) =>
  ({ entries: [], parseError: null, uiTheme: "system", uiThemeInvalid: false, uiThemeLine: null, present: true, unknownSettings: [], ...over }) as never;
const ext = (over: Record<string, unknown> = {}) => ({ apps: [], invalid: [], typeError: false, typeErrorLine: null, ...over }) as never;

function setup(over: { open?: () => Promise<unknown>; check?: () => Promise<unknown> } = {}) {
  const calls: string[] = [];
  const status = {
    show: vi.fn((m: string) => void calls.push(`show:${m}`)),
    showPriority: vi.fn((m: string, ms: number) => void calls.push(`priority:${ms}:${m}`)),
  };
  const closeMenus = vi.fn(() => void calls.push("closeMenus"));
  const ipc = {
    settingsFileOpen: vi.fn(over.open ?? (async () => ({ templateCreated: false, sampleError: null, result: { kind: "vscode" } }))),
    settingsFileCheck: vi.fn(over.check ?? (async () => ({ keymap: keymap(), externalApps: ext() }))),
  };
  const wiring = createSettingsFileWiring({ status, closeMenus, ipc } as never);
  return { wiring, status, closeMenus, ipc, calls };
}

describe("open(): the result is an ordinary status message (R-1663-2)", () => {
  it("W-A2 through status.show once; showPriority is not used", async () => {
    const s = setup();
    await s.wiring.open();
    expect(s.ipc.settingsFileOpen).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledWith("config.toml を VS Code で開きました");
    expect(s.status.showPriority).not.toHaveBeenCalled();
  });

  it("AC-1601 / R-1665: a created template: W-A4 first", async () => {
    const s = setup({ open: async () => ({ templateCreated: true, sampleError: null, result: { kind: "association" } }) });
    await s.wiring.open();
    expect(s.status.show).toHaveBeenCalledWith("config.toml を作成しました。VS Code が見つからないため、Windows の関連付けで config.toml を開きます");
  });

  it("AC-1607: template_failed -> W-A6", async () => {
    const s = setup({ open: async () => ({ templateCreated: false, sampleError: null, result: { kind: "template_failed", message: "denied" } }) });
    await s.wiring.open();
    expect(s.status.show).toHaveBeenCalledWith("config.toml を作成できませんでした。 詳細: denied");
  });

  it("R-1664: the IPC rejecting is shown as W-A5 with the exception's message (no dialog, no throw)", async () => {
    const s = setup({ open: async () => Promise.reject(new Error("backend down")) });
    await expect(s.wiring.open()).resolves.toBeUndefined();
    expect(s.status.show).toHaveBeenCalledWith("config.toml を開けませんでした。 詳細: backend down");
  });

  it("AC-1612: two runs call the IPC twice", async () => {
    const s = setup();
    await s.wiring.open();
    await s.wiring.open();
    expect(s.ipc.settingsFileOpen).toHaveBeenCalledTimes(2);
  });
});

describe("check(): evaluate, then REPLACE the shown text (R-1663-1)", () => {
  it("AC-1653 (i): nothing wrong -> W-A9 + W-AA, showPriority 2.5 s", async () => {
    const s = setup();
    await s.wiring.check();
    expect(s.status.showPriority).toHaveBeenCalledTimes(1);
    expect(s.status.showPriority).toHaveBeenCalledWith(`${W_A9}問題はありません。変更は再起動で反映されます`, 2500);
    expect(s.status.show).not.toHaveBeenCalled();
  });

  it("AC-1653 (ii): no config.toml (present false) -> W-A9 + W-AB, 2.5 s", async () => {
    const s = setup({ check: async () => ({ keymap: keymap({ present: false }), externalApps: ext() }) });
    await s.wiring.check();
    expect(s.status.showPriority).toHaveBeenCalledWith(`${W_A9}config.toml がないため、既定の設定を使います。`, 2500);
  });

  it("AC-1653 (iii): a syntax error -> W-A9 + W-31 with the line, 15 s", async () => {
    const s = setup({
      check: async () => ({ keymap: keymap({ parseError: { message: "bad", line: 2, wholeFile: true } }), externalApps: ext() }),
    });
    await s.wiring.check();
    expect(s.status.showPriority).toHaveBeenCalledWith(
      `${W_A9}config.toml の 2 行目を読み込めなかったため、既定のキー割り当て、テーマ(OS の設定に従う)、外部アプリの既定の登録を使います。 詳細: bad`,
      15000,
    );
  });

  it("AC-1650: errors -> W-A9 + the same config.toml part as at start-up, 15 s", async () => {
    const s = setup({
      check: async () => ({
        keymap: keymap({ entries: [{ actionId: "copy", value: "Ctrl+", line: 12 }], uiThemeInvalid: true, uiThemeLine: 3 }),
        externalApps: ext({ invalid: [{ position: 2, name: "bad", reason: "invalid", line: 22 }] }),
      }),
    });
    await s.wiring.check();
    expect(s.status.showPriority).toHaveBeenCalledWith(
      `${W_A9}config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。` +
        ' config.toml の 3 行目の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。' +
        " config.toml の外部アプリの登録 1 件を使いません: 2(bad、22 行目)。",
      15000,
    );
  });

  it("unknown settings alone count as a problem: 15 s", async () => {
    const s = setup({ check: async () => ({ keymap: keymap({ unknownSettings: [{ kind: "key", name: "ui_them", line: 2 }] }), externalApps: ext() }) });
    await s.wiring.check();
    expect(s.status.showPriority.mock.calls[0][1]).toBe(15000);
  });

  it("a failing IPC is shown as W-A5 with the message (no throw)", async () => {
    const s = setup({ check: async () => Promise.reject(new Error("no backend")) });
    await expect(s.wiring.check()).resolves.toBeUndefined();
    const all = [...s.status.show.mock.calls, ...s.status.showPriority.mock.calls].map((c) => c[0]);
    expect(all).toEqual(["config.toml を開けませんでした。 詳細: no backend"]);
  });
});

describe("onHardcoded (the pre-empted keys)", () => {
  it("R-1671-1: Ctrl+, closes the menus FIRST, then opens; returns true (handled)", async () => {
    const s = setup();
    expect(s.wiring.onHardcoded("settings", { repeat: false } as never)).toBe(true);
    await vi.waitFor(() => expect(s.ipc.settingsFileOpen).toHaveBeenCalledTimes(1));
    expect(s.closeMenus).toHaveBeenCalledTimes(1);
    expect(s.calls[0]).toBe("closeMenus");
  });

  it("R-1606: an auto-repeat is swallowed (true) and runs nothing, not even closeMenus", () => {
    const s = setup();
    expect(s.wiring.onHardcoded("settings", { repeat: true } as never)).toBe(true);
    expect(s.closeMenus).not.toHaveBeenCalled();
    expect(s.ipc.settingsFileOpen).not.toHaveBeenCalled();
  });

  it("an event without `repeat` counts as a fresh press", async () => {
    const s = setup();
    expect(s.wiring.onHardcoded("settings", {} as never)).toBe(true);
    await vi.waitFor(() => expect(s.ipc.settingsFileOpen).toHaveBeenCalledTimes(1));
  });

  it("does not wait for the IPC (the key handler returns synchronously while the open is still pending)", () => {
    const s = setup({ open: () => new Promise(() => {}) });
    expect(s.wiring.onHardcoded("settings", { repeat: false } as never)).toBe(true);
  });

  it("'exit' is not handled here as settings: it never opens the settings file", () => {
    const s = setup();
    s.wiring.onHardcoded("exit", { repeat: false } as never);
    expect(s.ipc.settingsFileOpen).not.toHaveBeenCalled();
    expect(s.closeMenus).not.toHaveBeenCalled();
  });
});
