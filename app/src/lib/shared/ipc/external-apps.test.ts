/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// [単体 / 静的] Spec: SPEC-0300-0021 R-1581 / AC-1524 (the screen sends ONLY the registration number, the target path and its kind;
//   there is no parameter that could carry a program or arguments), R-1501 (the registrations are a start-up snapshot read through a
//   read-only command), R-1576 (a rejected command becomes an error object with a machine-readable code), R-1573 (the OS text is carried
//   untouched), R-1571 (`program` of "not found" is the expanded value).
// Architecture: SPEC-0200-0001 §3.16.3 (IPC table: `external_apps_load` -> ExternalAppsDto, `external_app_launch { index, path, kind }`
//   -> void; camelCase wire), §3.16.6 (`shared/ipc/external-apps.ts`: thin invoke wrappers, no business logic; the rejection is
//   normalised like `shared/ipc/viewer.ts::normalizeViewerError`).
//
// Contract assumed (reported to the implementer):
//   interface ExternalAppDto { index: number; defaultNo: number | null; name: string | null; key: string | null; keyInvalid: boolean }
//   interface InvalidRegistrationDto { position: number; name: string | null; reason: "invalid" | "limit" }
//   interface ExternalAppsDto { apps: ExternalAppDto[]; invalid: InvalidRegistrationDto[]; typeError: boolean }
//   class ExternalAppError extends Error { code: string; program?: string; constructor(code: string, message: string, program?: string) }
//                                                                                    // Error.message = the backend's `message` ("" when none)
//   normalizeExternalAppError(raw: unknown): ExternalAppError                       // never throws; "unknown" when no code can be recovered
//   externalAppsLoad(): Promise<ExternalAppsDto>                                    // invoke("external_apps_load")  (no arguments)
//   externalAppLaunch(index: number, path: string, kind: "file" | "dir"): Promise<void>   // invoke("external_app_launch", { index, path, kind })
//
// Module under test (not yet implemented): ./external-apps.ts

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  ExternalAppError,
  externalAppLaunch,
  externalAppsLoad,
  normalizeExternalAppError,
  type ExternalAppsDto,
} from "./external-apps";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("externalAppsLoad (R-1501)", () => {
  it("invokes external_apps_load with no arguments and returns the snapshot as it is", async () => {
    const dto: ExternalAppsDto = {
      apps: [
        { index: 0, defaultNo: 1, name: null, key: "Ctrl+Alt+C", keyInvalid: false },
        { index: 1, defaultNo: null, name: "Mine", key: null, keyInvalid: true },
      ],
      invalid: [{ position: 3, name: "VS Codeで開く", reason: "invalid" }],
      typeError: false,
    };
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    await expect(externalAppsLoad()).resolves.toEqual(dto);
    expect(invoke).toHaveBeenCalledWith("external_apps_load");
    expect(vi.mocked(invoke).mock.calls[0]).toHaveLength(1);
  });
});

describe("externalAppLaunch (R-1581, AC-1524)", () => {
  it("sends exactly { index, path, kind } and nothing else", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await externalAppLaunch(2, "C:\\w\\a b.txt", "file");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("external_app_launch", { index: 2, path: "C:\\w\\a b.txt", kind: "file" });
    const sent = vi.mocked(invoke).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["index", "kind", "path"]);
  });

  it("passes a folder kind through", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await externalAppLaunch(0, "C:\\w", "dir");
    expect(invoke).toHaveBeenCalledWith("external_app_launch", { index: 0, path: "C:\\w", kind: "dir" });
  });

  it("the function takes three parameters: there is no way to pass a program or arguments", () => {
    expect(externalAppLaunch.length).toBe(3);
  });

  it("resolves with nothing on success", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await expect(externalAppLaunch(0, "C:\\w", "dir")).resolves.toBeUndefined();
  });
});

describe("the rejection becomes an ExternalAppError (R-1573, R-1576)", () => {
  it("keeps the code, the program of a not-found and the OS text untouched", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: "program_not_found", program: "C:\\a\\GitHubDesktop.exe" });
    const e1 = await externalAppLaunch(3, "C:\\w", "dir").catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ExternalAppError);
    expect((e1 as ExternalAppError).code).toBe("program_not_found");
    expect((e1 as ExternalAppError).program).toBe("C:\\a\\GitHubDesktop.exe");

    const text = "アクセスが拒否されました。 (os error 5)";
    vi.mocked(invoke).mockRejectedValueOnce({ code: "os_error", message: text });
    const e2 = (await externalAppLaunch(0, "C:\\w", "dir").catch((e: unknown) => e)) as ExternalAppError;
    expect(e2.code).toBe("os_error");
    expect(e2.message).toBe(text);
  });

  it.each(["invalid_path", "target_missing", "e2e_scope_violation", "unknown_app"])("code %s is kept", async (code) => {
    vi.mocked(invoke).mockRejectedValueOnce({ code });
    const e = (await externalAppLaunch(0, "C:\\w", "dir").catch((x: unknown) => x)) as ExternalAppError;
    expect(e).toBeInstanceOf(ExternalAppError);
    expect(e.code).toBe(code);
  });

  it("externalAppsLoad rejections are normalised too", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("boom");
    const e = (await externalAppsLoad().catch((x: unknown) => x)) as ExternalAppError;
    expect(e).toBeInstanceOf(ExternalAppError);
  });
});

describe("normalizeExternalAppError never throws", () => {
  it("an ExternalAppError passes through", () => {
    const e = new ExternalAppError("os_error", "x");
    expect(normalizeExternalAppError(e)).toBe(e);
  });

  it("a string, an Error, null and an object without a code become code 'unknown' with the text kept", () => {
    expect(normalizeExternalAppError("plain text")).toMatchObject({ code: "unknown", message: "plain text" });
    expect(normalizeExternalAppError(new Error("native"))).toMatchObject({ code: "unknown", message: "native" });
    expect(normalizeExternalAppError(null).code).toBe("unknown");
    expect(normalizeExternalAppError(undefined).code).toBe("unknown");
    expect(normalizeExternalAppError({ message: "no code" })).toMatchObject({ code: "unknown" });
    expect(normalizeExternalAppError(42).code).toBe("unknown");
  });

  it("a non-string message / program is dropped, not thrown on", () => {
    const e = normalizeExternalAppError({ code: "os_error", message: 5, program: 7 });
    expect(e.code).toBe("os_error");
    expect(e.message).toBe("");
    expect(e.program).toBeUndefined();
  });
});

describe("the module is a thin wrapper (SPEC-0200-0001 §3.16.6)", () => {
  const source = readFileSync(resolve(__dirname, "external-apps.ts"), "utf-8");

  it("imports only the Tauri invoke (no feature, no routes, no shell plugin)", () => {
    const specs = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs).toEqual(["@tauri-apps/api/core"]);
  });

  it("names only the two commands", () => {
    const commands = [...source.matchAll(/["'](external_app[a-z_]*)["']/g)].map((m) => m[1]);
    expect([...new Set(commands)].sort()).toEqual(["external_app_launch", "external_apps_load"]);
  });

  it("has no parameter named program / args / exe / command", () => {
    const sigs = source.split("\n").filter((l) => /export (async )?function externalAppLaunch|export const externalAppLaunch/.test(l));
    expect(sigs.length).toBeGreaterThan(0);
    for (const l of sigs) expect(l).not.toMatch(/\b(program|args|argv|exe|command|cmd)\b\s*[:?,)]/);
  });
});
