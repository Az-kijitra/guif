import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1501 (the registrations are read ONCE at start-up), R-1574 (the notice: invalid registrations, type error, unusable keys; part
//   of the `config.toml` part of the start-up message, AFTER the keymap and theme notices, joined by one half-width space; not erased by the later notices),
//   AC-1508 (keymap -> theme -> external (registrations -> keys), ONE message, kept in front of the `ui-state.toml` / `navigation.toml` notices),
//   AC-1532 (a default key that the user's keymap took is dropped and reported), AC-1535 (a plain install: no notice), R-1510-1 (default names from the screen's
//   wording), R-1551 (the effective keymap, i.e. with `input_keymap_custom` applied, is what collides), R-1504 / SPEC-0300-0019 W-31 (the unreadable file case).
// Architecture: SPEC-0200-0001 §3.16.6 (`loadKeymapForStartup` calls `externalAppsLoad()`, then `buildRegistry(dto, keyRules(validated.effective))`,
//   `externalAppsState.hydrate(registry)`, and appends `buildExternalAppsNotice(registry)` to the config.toml part; "if `externalAppsLoad()` itself fails the
//   start continues with 0 registrations and NO notice"), §3.16.15 MINOR-33 (the failure goes to `console.error` once; no new screen wording).
//
// Contract assumed (reported to the implementer):
//   routes/startup-wiring.ts::loadKeymapForStartup(): Promise<{ notice: string | null }>   (unchanged signature)
//     parts = [keymapNotice, themeNotice, externalNotice].filter(non-null).join(" ")      // externalNotice = buildExternalAppsNotice(registry)
//
// Module under test: ./startup-wiring.ts

vi.mock("$lib/shared/ipc/config", () => ({ configLoadKeymap: vi.fn() }));
vi.mock("$lib/shared/ipc/external-apps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/shared/ipc/external-apps")>()),
  externalAppsLoad: vi.fn(),
}));

import { configLoadKeymap } from "$lib/shared/ipc/config";
import { externalAppsLoad, type ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import { externalAppsState } from "$lib/features/external-apps/external-apps-state.svelte";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { loadKeymapForStartup, runStartupHydrate } from "./startup-wiring";

type KeymapDto = Awaited<ReturnType<typeof configLoadKeymap>>;
const keymap = (over: Partial<KeymapDto> = {}): KeymapDto => ({ entries: [], parseError: null, uiTheme: "system", uiThemeInvalid: false, ...over }) as KeymapDto;

const DEFAULT_FOUR: ExternalAppsDto["apps"] = [
  { index: 0, defaultNo: 1, name: null, key: "Ctrl+Alt+C", keyInvalid: false },
  { index: 1, defaultNo: 2, name: null, key: "Ctrl+Alt+V", keyInvalid: false },
  { index: 2, defaultNo: 3, name: null, key: "Ctrl+Alt+E", keyInvalid: false },
  { index: 3, defaultNo: 4, name: null, key: "Ctrl+Alt+Shift+G", keyInvalid: false },
];
const ext = (over: Partial<ExternalAppsDto> = {}): ExternalAppsDto => ({ apps: DEFAULT_FOUR, invalid: [], typeError: false, ...over });

const THEME_NOTICE = 'config.toml の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。';
const W32 = "config.toml の不正なキー割り当て 1 件を無視しました: no_such_action。";
const W9A_2 = "config.toml の外部アプリの登録 1 件を使いません: 2(bad)。";
const W9B = "config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。";
const W9C_TERMINAL = "外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): ターミナルで開く: Ctrl+Alt+C。";

beforeEach(() => {
  vi.mocked(configLoadKeymap).mockReset();
  vi.mocked(externalAppsLoad).mockReset();
  externalAppsState.hydrate({ entries: [], invalid: [], typeError: false, rejectedKeys: [] }); // the singleton is shared by the tests of this file
});

afterEach(() => {
  statusMessage.clear();
  vi.restoreAllMocks();
});

describe("a plain install (AC-1500 / AC-1535)", () => {
  it("the default four, nothing in the keymap, nothing invalid: no notice at all, and the registrations are hydrated", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext());
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
    expect(externalAppsLoad).toHaveBeenCalledTimes(1);
    expect(externalAppsState.entries.map((e) => e.label)).toEqual(["ターミナルで開く", "VS Codeで開く", "エクスプローラーで開く", "GitHub Desktopで開く"]);
    expect(externalAppsState.entries.map((e) => e.keys)).toEqual([["Ctrl+Alt+C"], ["Ctrl+Alt+V"], ["Ctrl+Alt+E"], ["Ctrl+Alt+Shift+G"]]);
  });

  it("external_apps = []: zero registrations, no notice", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ apps: [] }));
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
    expect(externalAppsState.entries).toEqual([]);
  });

  it("user registrations arrive with their own names", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ apps: [{ index: 0, defaultNo: null, name: "My Tool", key: "Ctrl+Alt+T", keyInvalid: false }] }));
    await loadKeymapForStartup();
    expect(externalAppsState.entries.map((e) => e.label)).toEqual(["My Tool"]);
  });
});

describe("the notice parts and their order (R-1574, AC-1508)", () => {
  it("registrations: the W-9A sentence alone", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ apps: [], invalid: [{ position: 2, name: "bad", reason: "invalid" }] }));
    expect((await loadKeymapForStartup()).notice).toBe(W9A_2);
  });

  it("type error: the W-9B sentence alone, the default four are in force", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ typeError: true }));
    expect((await loadKeymapForStartup()).notice).toBe(W9B);
    expect(externalAppsState.entries).toHaveLength(4);
  });

  it("AC-1532: a default key that the user's keymap took (`sort_menu = Ctrl+Alt+C`) is dropped and reported with the screen's name of the default", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ entries: [{ actionId: "sort_menu", value: "Ctrl+Alt+C" }] }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext());
    expect((await loadKeymapForStartup()).notice).toBe(W9C_TERMINAL);
    expect(externalAppsState.entries[0].keys).toEqual([]);
    expect(externalAppsState.entries[0].label).toBe("ターミナルで開く"); // the entry stays: it is still in the menus
    expect(externalAppsState.entries[1].keys).toEqual(["Ctrl+Alt+V"]);
  });

  it("the effective keymap is the VALIDATED one: an invalid override does not take the key", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ entries: [{ actionId: "sort_menu", value: "Bogus+Nonsense" }] }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext());
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe("config.toml の不正なキー割り当て 1 件を無視しました: sort_menu。"); // only the keymap notice; the registrations are all usable
    expect(externalAppsState.entries.every((e) => e.keys.length === 1)).toBe(true);
  });

  it("freeing a key by customising makes it usable (R-1551 note)", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ entries: [{ actionId: "zip_create", value: "Ctrl+Shift+Z" }] }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ apps: [{ index: 0, defaultNo: null, name: "Z", key: "Ctrl+Alt+Z", keyInvalid: false }] }));
    expect((await loadKeymapForStartup()).notice).toBeNull();
    expect(externalAppsState.entries[0].keys).toEqual(["Ctrl+Alt+Z"]);
  });

  it("AC-1508: keymap -> theme -> external registrations -> external keys, ONE message, one half-width space between the sentences", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      keymap({ entries: [{ actionId: "no_such_action", value: "Ctrl+X" }, { actionId: "sort_menu", value: "Ctrl+Alt+C" }], uiThemeInvalid: true }),
    );
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ invalid: [{ position: 2, name: "bad", reason: "invalid" }] }));
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(`${W32} ${THEME_NOTICE} ${W9A_2} ${W9C_TERMINAL}`);
  });

  it("the type error comes between the registrations and the keys", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ entries: [{ actionId: "sort_menu", value: "Ctrl+Alt+C" }] }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ typeError: true, invalid: [{ position: 2, name: "bad", reason: "invalid" }] }));
    expect((await loadKeymapForStartup()).notice).toBe(`${W9A_2} ${W9B} ${W9C_TERMINAL}`);
  });

  it("the keymap part is unchanged when there is nothing external to say", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ uiThemeInvalid: true }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext());
    expect((await loadKeymapForStartup()).notice).toBe(THEME_NOTICE);
  });
});

describe("when the whole config.toml is unreadable (R-1504, W-31)", () => {
  it("the single R-45-2 notice (which now also says the external apps fall back); the backend sends the default four and nothing is added", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ parseError: { message: "bad toml", line: 2, wholeFile: true } }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext());
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(
      "config.toml の 2 行目を読み込めなかったため、既定のキー割り当て、テーマ(OS の設定に従う)、外部アプリの既定の登録を使います。 詳細: bad toml",
    );
    expect(notice).not.toContain("外部アプリのキー");
    expect(externalAppsState.entries).toHaveLength(4);
  });
});

describe("a failure of the external-apps load itself (§3.16.6, MINOR-33)", () => {
  it("the start goes on: zero registrations, no notice of ours, the keymap notice stays, one console.error line", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ uiThemeInvalid: true }));
    vi.mocked(externalAppsLoad).mockRejectedValueOnce(new Error("ipc down"));
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: THEME_NOTICE });
    expect(externalAppsState.entries).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("a keymap load that works is not undone by it (the keymap is hydrated before the external part)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockRejectedValueOnce("boom");
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
  });
});

describe("runStartupHydrate: the config.toml part stays in front and is not erased (R-1574, AC-1508)", () => {
  it("the external sentences are in the config part, followed by ' / ' and the ui-state and navigation notices", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap({ entries: [{ actionId: "sort_menu", value: "Ctrl+Alt+C" }] }));
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ invalid: [{ position: 2, name: "bad", reason: "invalid" }] }));
    await runStartupHydrate({
      loadUiState: async () => ({ notice: "UI" }),
      loadKeymap: loadKeymapForStartup,
      loadNavigation: async () => "NAV",
    });
    expect(statusMessage.text).toBe(`${W9A_2} ${W9C_TERMINAL} / UI / NAV`);
  });

  it("a later short-lived status message does not erase it (the priority message appends)", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(keymap());
    vi.mocked(externalAppsLoad).mockResolvedValueOnce(ext({ typeError: true }));
    await runStartupHydrate({ loadUiState: async () => ({ notice: null }), loadKeymap: loadKeymapForStartup, loadNavigation: async () => null });
    statusMessage.show("later");
    expect(statusMessage.text).toBe(`${W9B} / later`);
  });
});
