import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1640〜R-1643-1 (the config.toml part of the start-up notice with lines and unknown settings, in the order keymap -> theme ->
//   external apps -> W-AC), R-1661 (the join: a half-width space inside the config.toml part, ` / ` between files), R-1663 (the start-up notice is shown for
//   15 s when the config.toml part is not empty, otherwise 6 s; a later ordinary notice is appended while it is shown), R-1644 (no config.toml -> no notice),
//   AC-1640 / AC-1642 / AC-1643 / AC-1644 (unit part), AC-1647.
// Architecture: SPEC-0200-0001 §3.17.8 / §3.17.10: `loadKeymapForStartup` = IPC (config + external apps) -> `evaluateConfig` -> `keymapState.hydrate` /
//   `externalAppsState.hydrate` -> `{ notice }`; a failed `externalAppsLoad()` still means zero registrations, no notice, one console.error line, and
//   `evaluateConfig` gets an EMPTY ExternalAppsDto; `runStartupHydrate` shows `keymapResult.notice !== null` for NOTICE_MS.problem (15 s), else NOTICE_MS.startup (6 s).
//
// Module under test: ./startup-wiring.ts

vi.mock("$lib/shared/ipc/config", () => ({ configLoadKeymap: vi.fn() }));
vi.mock("$lib/shared/ipc/external-apps", () => ({ externalAppsLoad: vi.fn() }));
vi.mock("$lib/shared/state/appearance-state.svelte", () => ({ startAppearanceLoad: vi.fn() }));

import { configLoadKeymap } from "$lib/shared/ipc/config";
import { externalAppsLoad, type ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import { startAppearanceLoad } from "$lib/shared/state/appearance-state.svelte";
import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
import { externalAppsState } from "$lib/features/external-apps/external-apps-state.svelte";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { loadKeymapForStartup, runStartupHydrate } from "./startup-wiring";

type KeymapDto = Awaited<ReturnType<typeof configLoadKeymap>>;
const keymap = (over: Partial<KeymapDto> = {}): KeymapDto =>
  ({ entries: [], parseError: null, present: true, unknownSettings: [], ...over }) as KeymapDto;
// SPEC-0300-0023 R-1820: the appearance part comes from startAppearanceLoad() (mocked); W-33 is abolished.
const app = (problems: unknown[] = []) => ({ dark: true, bg: "#2e3440", uiVars: [], fontFamily: "monospace", fontSize: 16, rowHeight: 21, minColWidth: 24, treeWidthPercent: 24, problems }) as never;
const P_B0 = { kind: "presetUnusable", line: 3, value: "dracula", usable: ["default", "nord", "monokai", "catppuccin", "solarized", "light"] };
const WB0 = 'config.toml の 3 行目の配色 "dracula" は使えないため、nord を使います(使える値: default、nord、monokai、catppuccin、solarized、light)。';
const ext = (over: Partial<ExternalAppsDto> = {}): ExternalAppsDto =>
  ({ apps: [], invalid: [], typeError: false, typeErrorLine: null, ...over }) as ExternalAppsDto;

beforeEach(() => {
  vi.mocked(configLoadKeymap).mockReset();
  vi.mocked(externalAppsLoad).mockReset();
  vi.mocked(externalAppsLoad).mockResolvedValue(ext());
  vi.mocked(startAppearanceLoad).mockReset();
  vi.mocked(startAppearanceLoad).mockResolvedValue(app());
  statusMessage.clear();
});
afterEach(() => {
  statusMessage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC-1640: lines in the config.toml part, in the order keymap -> appearance -> external apps", () => {
  it("copy on line 12, an unusable preset on line 3, the 2nd registration invalid on line 22; toggle_time stays effective", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValue(
      keymap({
        entries: [
          { actionId: "copy", value: "Ctrl+", line: 12 },
          { actionId: "toggle_time", value: "Ctrl+Alt+T", line: 13 },
        ],
      }),
    );
    vi.mocked(startAppearanceLoad).mockResolvedValue(app([P_B0]));
    vi.mocked(externalAppsLoad).mockResolvedValue(
      ext({
        apps: [{ index: 0, defaultNo: null, name: "ok", key: null, keyInvalid: false, keyLine: null }],
        invalid: [{ position: 2, name: "bad", reason: "invalid", line: 22 }],
      } as never),
    );
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(
      "config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。" +
        ` ${WB0}` +
        " config.toml の外部アプリの登録 1 件を使いません: 2(bad、22 行目)。",
    );
    expect(keymapState.customOverrides["toggle_time"]).toBe("Ctrl+Alt+T");
    expect(externalAppsState.entries.map((e) => e.label)).toEqual(["ok"]);
  });
});

describe("AC-1642: W-AC comes last in the config.toml part", () => {
  it("unknown settings (given in the reading side's key order) are listed by line after the other sentences", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValue(
      keymap({
        unknownSettings: [
          { kind: "appField", name: "agrs", position: 2, line: 18 },
          { kind: "key", name: "ui_show_hidden", line: 3 },
          { kind: "key", name: "ui_them", line: 2 },
        ],
      } as never),
    );
    vi.mocked(startAppearanceLoad).mockResolvedValue(app([{ ...P_B0, line: 4 }]));
    const { notice } = await loadKeymapForStartup();
    expect(notice?.endsWith(" config.toml の不明な設定 3 件を無視しました: ui_them(2 行目), ui_show_hidden(3 行目), external_apps の 2 番目の agrs(18 行目)。")).toBe(true);
    expect(notice?.indexOf("の配色")).toBeLessThan(notice?.indexOf("不明な設定") ?? -1);
  });

  it("unknown settings alone are a notice (the behaviour is unchanged: nothing is applied)", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValue(keymap({ unknownSettings: [{ kind: "key", name: "ui_them", line: 2 }] } as never));
    expect((await loadKeymapForStartup()).notice).toBe("config.toml の不明な設定 1 件を無視しました: ui_them(2 行目)。");
  });
});

describe("AC-1643: eight invalid keymap entries", () => {
  it("W-32 shows 5 and `ほか 3 件`", async () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({ actionId: `bogus${i + 1}`, value: "Ctrl+X", line: i + 1 }));
    vi.mocked(configLoadKeymap).mockResolvedValue(keymap({ entries } as never));
    expect((await loadKeymapForStartup()).notice).toBe(
      "config.toml の不正なキー割り当て 8 件を無視しました: bogus1(1 行目), bogus2(2 行目), bogus3(3 行目), bogus4(4 行目), bogus5(5 行目), ほか 3 件。",
    );
  });
});

describe("R-1644 / a failed external-app load", () => {
  it("a missing config.toml (present false, nothing else) gives no notice", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValue(keymap({ present: false } as never));
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
  });

  it("externalAppsLoad rejecting still gives zero registrations and keeps the keymap notice; one console.error line", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(configLoadKeymap).mockResolvedValue(keymap({ entries: [{ actionId: "bogus", value: "x", line: 5 }] } as never));
    vi.mocked(externalAppsLoad).mockRejectedValue(new Error("boom"));
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe("config.toml の不正なキー割り当て 1 件を無視しました: bogus(5 行目)。");
    expect(externalAppsState.entries).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("R-1663 / AC-1644: the time of the start-up notice", () => {
  const deps = (keymapNotice: string | null, uiNotice: string | null = null) => ({
    loadUiState: vi.fn(async () => ({ notice: uiNotice })),
    loadKeymap: vi.fn(async () => ({ notice: keymapNotice })),
    loadNavigation: vi.fn(async () => null),
  });

  it("a non-empty config.toml part: shown for 15 s (still there at 14.9 s, gone at 15 s)", async () => {
    vi.useFakeTimers();
    await runStartupHydrate(deps("config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。"));
    await vi.advanceTimersByTimeAsync(14999);
    expect(statusMessage.text).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(statusMessage.text).toBeNull();
  });

  it("the config.toml part empty, only ui-state / navigation: 6 s (gone at 6 s)", async () => {
    vi.useFakeTimers();
    await runStartupHydrate(deps(null, "ui-state failed"));
    await vi.advanceTimersByTimeAsync(5999);
    expect(statusMessage.text).toBe("ui-state failed");
    await vi.advanceTimersByTimeAsync(1);
    expect(statusMessage.text).toBeNull();
  });

  it("a config.toml part with the other files: 15 s, joined with ` / ` in the order config.toml -> ui-state (R-1661)", async () => {
    vi.useFakeTimers();
    await runStartupHydrate(deps("CFG", "UI"));
    expect(statusMessage.text).toBe("CFG / UI");
    await vi.advanceTimersByTimeAsync(10000);
    expect(statusMessage.text).toBe("CFG / UI");
  });

  it("AC-1644: while the 15 s notice is shown a later ordinary notice is appended with ` / ` (the notice is not replaced)", async () => {
    vi.useFakeTimers();
    await runStartupHydrate(deps("CFG"));
    statusMessage.show("別の通知");
    expect(statusMessage.text).toBe("CFG / 別の通知");
    await vi.advanceTimersByTimeAsync(14999);
    expect(statusMessage.text).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(statusMessage.text).toBeNull();
  });

  it("nothing at all: no notice is shown", async () => {
    await runStartupHydrate(deps(null));
    expect(statusMessage.text).toBeNull();
  });
});
