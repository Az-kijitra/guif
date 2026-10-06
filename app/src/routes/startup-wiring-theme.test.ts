import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0017 R-917-4 (the invalid-`ui_theme` notice is a SEPARATE sentence from R-45-2's),
//   R-917-5 (3 cases of an unreadable / mis-typed config.toml), AC-958 (the keymap notice and the theme notice
//   are joined into the config.toml part of ONE status message), AC-959 (ii)(iii);
//   SPEC-0300-0010 R-45-6 (notice order config.toml -> ui-state.toml -> navigation.toml).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.4: `loadKeymapForStartup` builds
//   `[buildKeymapLoadNotice(parseError, invalidActions, { alsoDefaultsTheme: parseError?.wholeFile === true }),
//    buildThemeNotice(uiThemeInvalid)]`, drops the nulls and joins them with " " (empty -> null).
//   `runStartupHydrate`, its deps and the " / " join stay unchanged. `+page.svelte` is not touched.
//
// Module under test: ./startup-wiring.ts (`loadKeymapForStartup`, existing; the combination is new in Phase 12).
// The IPC wrapper is mocked (it is the thin invoke() layer); the keymap state, the validator, the notice
// builders and the status message are the real ones.

vi.mock("$lib/shared/ipc/config", () => ({ configLoadKeymap: vi.fn() }));

import { configLoadKeymap } from "$lib/shared/ipc/config";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { loadKeymapForStartup, runStartupHydrate } from "./startup-wiring";

type Dto = Awaited<ReturnType<typeof configLoadKeymap>>;

function dto(over: Partial<Dto> = {}): Dto {
  return { entries: [], parseError: null, uiTheme: "system", uiThemeInvalid: false, ...over } as Dto;
}

const THEME_NOTICE =
  'Could not understand ui_theme in config.toml (use "light", "dark" or "system"); following the OS theme.';

beforeEach(() => {
  vi.mocked(configLoadKeymap).mockReset();
});

afterEach(() => {
  statusMessage.clear();
});

describe("loadKeymapForStartup: notice combination (SPEC-0200-0001 §3.11.4)", () => {
  it("AC-959 (i) / R-917-5 case 1: a valid file (or no file) gives no notice", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto());
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
  });

  it("a valid `ui_theme = \"dark\"` (uiThemeInvalid false) gives no notice either", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ uiTheme: "dark" }));
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: null });
  });

  it("AC-958 (i)-(iii): an invalid ui_theme alone gives exactly the theme notice", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ uiThemeInvalid: true }));
    await expect(loadKeymapForStartup()).resolves.toEqual({ notice: THEME_NOTICE });
  });

  it("AC-958 tail: an invalid ui_theme + an unknown action id join the keymap notice and the theme notice with one space, keymap first (R-917-4: separate sentences)", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      dto({ entries: [{ actionId: "no_such_action", value: "Ctrl+X" }], uiThemeInvalid: true }),
    );
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(`Ignored 1 invalid keymap override(s) in config.toml: no_such_action. ${THEME_NOTICE}`);
  });

  it("R-917-5 case 2 (AC-959 (ii)): the whole file is unreadable -> ONE notice that also says the default theme; NO separate theme notice", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      dto({ parseError: { message: "bad toml", line: 2, wholeFile: true }, uiThemeInvalid: false }),
    );
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(
      "config.toml could not be read (line 2): bad toml. Using the default keymap and the default theme (following the OS).",
    );
    expect(notice).not.toContain("Could not understand ui_theme");
  });

  it("R-917-5 case 3 (AC-959 (iii)): input_keymap_custom of the wrong type with a valid ui_theme -> the R-45-2 notice WITHOUT any theme wording", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      dto({
        parseError: { message: "input_keymap_custom must be a table", line: null, wholeFile: false },
        uiTheme: "dark",
        uiThemeInvalid: false,
      }),
    );
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe("config.toml could not be read: input_keymap_custom must be a table. Using the default keymap.");
    expect(notice).not.toMatch(/theme/i);
  });

  it("R-917-5 case 3 + `ui_theme = 1` (確定 #16): both notices, the keymap one without theme wording, then the theme one", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      dto({
        parseError: { message: "input_keymap_custom must be a table", line: null, wholeFile: false },
        uiThemeInvalid: true,
      }),
    );
    const { notice } = await loadKeymapForStartup();
    expect(notice).toBe(
      `config.toml could not be read: input_keymap_custom must be a table. Using the default keymap. ${THEME_NOTICE}`,
    );
  });

  it("the keymap part and the theme part are separate sentences (the theme notice is not folded into R-45-2's text)", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      dto({ parseError: { message: "x", line: null, wholeFile: false }, uiThemeInvalid: true }),
    );
    const { notice } = (await loadKeymapForStartup()) as { notice: string };
    expect(notice.indexOf("Using the default keymap.")).toBeGreaterThan(-1);
    expect(notice.indexOf(THEME_NOTICE)).toBeGreaterThan(notice.indexOf("Using the default keymap."));
  });
});

describe("runStartupHydrate with the real keymap loader: config part, then ui-state, then navigation (R-45-6 / AC-958 tail)", () => {
  it("the combined config.toml notice stays in front of the ui-state and navigation notices, joined with ' / '", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(
      dto({ entries: [{ actionId: "no_such_action", value: "Ctrl+X" }], uiThemeInvalid: true }),
    );

    await runStartupHydrate({
      loadUiState: async () => ({ notice: "UI-STATE-NOTICE" }),
      loadKeymap: loadKeymapForStartup,
      loadNavigation: async () => "NAVIGATION-NOTICE",
    });

    expect(statusMessage.text).toBe(
      `Ignored 1 invalid keymap override(s) in config.toml: no_such_action. ${THEME_NOTICE} / UI-STATE-NOTICE / NAVIGATION-NOTICE`,
    );
  });

  it("AC-958 (i)-(iii): the theme notice alone is shown once, as the whole status message", async () => {
    vi.mocked(configLoadKeymap).mockResolvedValueOnce(dto({ uiThemeInvalid: true }));

    await runStartupHydrate({
      loadUiState: async () => ({ notice: null }),
      loadKeymap: loadKeymapForStartup,
      loadNavigation: async () => null,
    });

    expect(statusMessage.text).toBe(THEME_NOTICE);
  });
});
