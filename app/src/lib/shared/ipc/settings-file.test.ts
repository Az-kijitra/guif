/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// [単体 / 静的] Spec: SPEC-0300-0022 R-1605 / AC-1606 (the screen sends NO path, program or argument: both commands take no parameters), R-1650 (the check
//   is a read of the current file through a command), R-1665 (the open result is codes + the OS text; the sentence is built on the screen, R-1201 2).
// Architecture: SPEC-0200-0001 §3.17.6 / §3.17.8: `shared/ipc/settings-file.ts` (thin invoke wrappers, like `shared/ipc/external-apps.ts`):
//   settingsFileOpen(): Promise<SettingsFileOpenDto>        // invoke("settings_file_open")  -- no arguments
//   settingsFileCheck(): Promise<ConfigCheckDto>            // invoke("settings_file_check") -- no arguments; { keymap, externalApps }
//   class SettingsFileError extends Error { message }       // a rejection is normalised to this (string, Error, { message }, anything)
//
// Module under test (not yet implemented): ./settings-file.ts

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { SettingsFileError, settingsFileCheck, settingsFileOpen } from "./settings-file";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("settingsFileOpen", () => {
  it("invokes settings_file_open with NO arguments and returns the result as it is", async () => {
    const dto = { templateCreated: true, sampleError: null, result: { kind: "vscode" } };
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    await expect(settingsFileOpen()).resolves.toEqual(dto);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(vi.mocked(invoke).mock.calls[0]).toEqual(["settings_file_open"]);
  });

  it("a rejected value becomes a SettingsFileError carrying the message", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("denied");
    await expect(settingsFileOpen()).rejects.toBeInstanceOf(SettingsFileError);
    vi.mocked(invoke).mockRejectedValueOnce({ message: "from object" });
    await expect(settingsFileOpen()).rejects.toMatchObject({ message: "from object" });
    vi.mocked(invoke).mockRejectedValueOnce(new Error("from error"));
    await expect(settingsFileOpen()).rejects.toMatchObject({ message: "from error" });
  });

  it("never rejects with a non-Error (null / undefined / a number are stringified or empty, but still an Error)", async () => {
    for (const raw of [null, undefined, 42]) {
      vi.mocked(invoke).mockRejectedValueOnce(raw);
      const e = await settingsFileOpen().catch((x: unknown) => x);
      expect(e).toBeInstanceOf(Error);
    }
  });
});

describe("settingsFileCheck", () => {
  it("invokes settings_file_check with NO arguments and returns { keymap, externalApps } as it is", async () => {
    const dto = { keymap: { entries: [], present: true }, externalApps: { apps: [], invalid: [], typeError: false } };
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    await expect(settingsFileCheck()).resolves.toEqual(dto);
    expect(vi.mocked(invoke).mock.calls[0]).toEqual(["settings_file_check"]);
  });

  it("a rejection is a SettingsFileError", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("io");
    await expect(settingsFileCheck()).rejects.toMatchObject({ name: expect.any(String), message: "io" });
  });
});

describe("R-1605 / AC-1606 (static): no parameter can carry a path, a program or arguments", () => {
  const src = readFileSync(resolve(__dirname, "settings-file.ts"), "utf-8");
  it("both wrappers are declared without parameters and call invoke with the command name only", () => {
    expect(src).toMatch(/function\s+settingsFileOpen\s*\(\s*\)/);
    expect(src).toMatch(/function\s+settingsFileCheck\s*\(\s*\)/);
    expect(src).not.toMatch(/invoke(?:<[^>]*>)?\(\s*"settings_file_(?:open|check)"\s*,/);
  });
});
