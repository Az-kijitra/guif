import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1820 (the appearance notices sit between the keymap notice and the external-app notices, in ONE config.toml part joined by a
//   half-width space), R-1823 / SPEC-0300-0019 第6版 W-31 (an unreadable file: `配色(nord)`), AC-1748 (W-33 is gone), AC-1708, SPEC-0300-0010 R-45-6
//   (config.toml -> ui-state.toml -> navigation.toml, joined by ` / `), SPEC-0300-0022 R-1663 (15 s when the config.toml part has something).
//   Replaces startup-wiring-theme.test.ts (SPEC-0300-0017 R-917-4 / R-917-5 / AC-958 / AC-959 for `ui_theme`).
// Architecture: SPEC-0200-0001 §3.18.4 / §3.18.5: `loadKeymapForStartup` calls `startAppearanceLoad()` (the SAME Promise `+layout.ts` awaits; the IPC runs once),
//   hands `{ keymap, externalApps, appearance }` to `evaluateConfig` and returns its notice. If the appearance load FAILED, the appearance part is simply empty
//   (the failure was reported by +layout.ts's console.error; the start-up does not stop and shows no appearance sentence).
//
// Module under test: ./startup-wiring.ts (`loadKeymapForStartup`, `runStartupHydrate`)

vi.mock("$lib/shared/ipc/config", () => ({ configLoadKeymap: vi.fn() }));
vi.mock("$lib/shared/state/appearance-state.svelte", () => ({ startAppearanceLoad: vi.fn() }));

import { configLoadKeymap } from "$lib/shared/ipc/config";
import { startAppearanceLoad } from "$lib/shared/state/appearance-state.svelte";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { loadKeymapForStartup, runStartupHydrate } from "./startup-wiring";

type Dto = Awaited<ReturnType<typeof configLoadKeymap>>;
const dto = (over: Partial<Dto> = {}): Dto => ({ entries: [], parseError: null, present: true, unknownSettings: [], ...over }) as Dto;
const app = (problems: unknown[] = []) => ({ dark: true, bg: "#2e3440", uiVars: [], fontFamily: "monospace", fontSize: 16, rowHeight: 21, minColWidth: 24, treeWidthPercent: 24, problems });

const USABLE = ["default", "nord", "monokai", "catppuccin", "solarized", "light"];
const P_B0 = { kind: "presetUnusable", line: 3, value: "dracula", usable: USABLE };
const WB0 = 'config.toml の 3 行目の配色 "dracula" は使えないため、nord を使います(使える値: default、nord、monokai、catppuccin、solarized、light)。';
const W30_2 = "config.toml の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。";
const W32_NO_SUCH_ACTION = "config.toml の不正なキー割り当て 1 件を無視しました: no_such_action。";

beforeEach(() => {
  vi.mocked(configLoadKeymap).mockReset();
  vi.mocked(startAppearanceLoad).mockReset();
  vi.mocked(startAppearanceLoad).mockResolvedValue(app() as never);
});

afterEach(() => {
  statusMessage.clear();
});

describe("loadKeymapForStartup: the appearance part of the config.toml notice", () => {
  it("a clean file gives no notice, and the appearance load is requested through startAppearanceLoad (not a second IPC)", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto());
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
    expect(startAppearanceLoad).toHaveBeenCalled();
  });

  it("AC-1702 (i): an unusable preset alone gives exactly W-B0", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto());
    vi.mocked(startAppearanceLoad).mockResolvedValueOnce(app([P_B0]) as never);
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: WB0 });
  });

  it("keymap notice first, then the appearance notice, one half-width space", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ entries: [{ actionId: "no_such_action", value: "Ctrl+X", line: null }] }));
    vi.mocked(startAppearanceLoad).mockResolvedValueOnce(app([P_B0]) as never);
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(`${W32_NO_SUCH_ACTION} ${WB0}`);
  });

  it("AC-1748: a top-level ui_theme is only a W-AC unknown setting; no W-33 sentence", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ unknownSettings: [{ kind: "key", name: "ui_theme", line: 2 }] }));
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe("config.toml の不明な設定 1 件を無視しました: ui_theme(2 行目)。");
  });

  it("W-31 (whole file unreadable) names `配色(nord)` and adds no separate appearance sentence", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ parseError: { message: "bad toml", line: 2, wholeFile: true } }));
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe("config.toml の 2 行目を読み込めなかったため、既定のキー割り当て、配色(nord)、外部アプリの既定の登録を使います。 詳細: bad toml");
  });

  it("input_keymap_custom of the wrong type: the W-30-2 sentence has no appearance wording", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ parseError: { message: "x must be a table", line: null, wholeFile: false } }));
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(W30_2);
    expect(notice).not.toContain("配色");
  });

  it("a FAILED appearance load does not stop the start-up: the keymap is still applied and the notice has no appearance sentence", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ entries: [{ actionId: "no_such_action", value: "Ctrl+X", line: null }] }));
    vi.mocked(startAppearanceLoad).mockRejectedValueOnce(new Error("no command"));
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: W32_NO_SUCH_ACTION });
    spy.mockRestore();
  });
});

describe("runStartupHydrate: config part, then ui-state, then navigation (R-45-6)", () => {
  it("the appearance notice stays inside the config.toml part, in front of the ui-state and navigation notices, joined with ' / '", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ entries: [{ actionId: "no_such_action", value: "Ctrl+X", line: null }] }));
    vi.mocked(startAppearanceLoad).mockResolvedValueOnce(app([P_B0]) as never);
    await runStartupHydrate({
      loadUiState: async () => ({ notice: "UI-STATE-NOTICE" }),
      loadKeymap: loadKeymapForStartup,
      loadNavigation: async () => "NAVIGATION-NOTICE",
    });
    expect(statusMessage.text).toBe(`${W32_NO_SUCH_ACTION} ${WB0} / UI-STATE-NOTICE / NAVIGATION-NOTICE`);
  });

  it("an appearance notice alone is the whole status message", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto());
    vi.mocked(startAppearanceLoad).mockResolvedValueOnce(app([P_B0]) as never);
    await runStartupHydrate({ loadUiState: async () => ({ notice: null }), loadKeymap: loadKeymapForStartup, loadNavigation: async () => null });
    expect(statusMessage.text).toBe(WB0);
  });
});
