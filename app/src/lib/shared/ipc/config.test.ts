import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0010 R-45; SPEC-0300-0009 R-77.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.2 (three
//   new thin invoke() wrappers, same shape as the existing
//   configLoadNavigation/configSaveNavigation), §3.6.11.11 SHOULD-116/117.
//
// Module under test:
// ./config.ts's new configLoadKeymap()/uiStateLoad()/uiStateSave(data)
// exports (the existing configLoadNavigation/configSaveNavigation, tested
// implicitly via their real callers elsewhere, are unaffected).

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  configLoadKeymap,
  uiStateLoad,
  uiStateSave,
  type KeymapRawLoadResultDto,
  type UiStateData,
} from "./config";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("configLoadKeymap (SPEC-0300-0010 R-45)", () => {
  it("invokes config_load_keymap with no arguments and returns its result", async () => {
    const result = { entries: [{ actionId: "toggle_hidden", value: "Ctrl+Alt+H" }], parseError: null };
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(configLoadKeymap()).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledWith("config_load_keymap");
  });
});

// SPEC-0300-0017 R-917-4 / R-917-5; SPEC-0200-0001 §3.11.4 (Phase 12): the DTO carries `wholeFile`
// on parseError and `uiTheme` / `uiThemeInvalid` next to it. The command name is unchanged.
describe("configLoadKeymap: Phase 12 theme fields (SPEC-0200-0001 §3.11.4)", () => {
  it("passes wholeFile / uiTheme / uiThemeInvalid through untouched, typed", async () => {
    const result: KeymapRawLoadResultDto = {
      entries: [],
      parseError: { message: "bad toml", line: 2, wholeFile: true },
      uiTheme: "system",
      uiThemeInvalid: false,
      uiThemeLine: null,
      present: true,
      unknownSettings: [],
    };
    vi.mocked(invoke).mockResolvedValueOnce(result);

    const got = await configLoadKeymap();
    expect(got).toEqual(result);
    expect(got.parseError?.wholeFile).toBe(true);
    expect(got.uiTheme).toBe("system");
    expect(got.uiThemeInvalid).toBe(false);
    expect(invoke).toHaveBeenCalledWith("config_load_keymap");
  });
});

describe("uiStateLoad (SPEC-0300-0009 R-77)", () => {
  it("invokes ui_state_load with no arguments and returns its result", async () => {
    const data: UiStateData = {
      uiShowHidden: false,
      uiShowSize: true,
      uiShowTime: false,
      uiShowTree: true,
      sortKey: "name",
      sortOrder: "asc",
    };
    vi.mocked(invoke).mockResolvedValueOnce({ data, recoveredFromCorruption: false });

    const result = await uiStateLoad();
    expect(result).toEqual({ data, recoveredFromCorruption: false });
    expect(invoke).toHaveBeenCalledWith("ui_state_load");
  });
});

describe("uiStateSave (SPEC-0300-0009 R-77-2)", () => {
  it("invokes ui_state_save with the data payload, camelCase field names preserved", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const data: UiStateData = {
      uiShowHidden: true,
      uiShowSize: false,
      uiShowTime: true,
      uiShowTree: false,
      sortKey: "size",
      sortOrder: "desc",
    };

    await uiStateSave(data);

    expect(invoke).toHaveBeenCalledWith("ui_state_save", { data });
  });
});
