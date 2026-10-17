import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0021 §9 (R-1570 success, R-1571 not found, R-1572 target gone, R-1573 other failures with the OS text untouched,
//   R-1576 `invalid_path`, R-1577 out of the E2E scope), R-1575 (a failure is a status message, never a dialog, never an exception),
//   R-1581 (what is sent: the registration number, the target path and kind -- nothing else), R-1570 (the label of the registration is the
//   `{name}`), AC-1542 (unit part), AC-1524 (the Japanese for `invalid_path`).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/launch-flow.ts`: `launchExternalApp({ entry, target, ipc, status })` -> calls the
//   IPC, success -> W-94, failure -> the table of §3.16.9; "exceptions do not leave the function"; the caller shows W-9D when there is no target),
//   §3.16.9 (`unknown_app` -> W-97 with `unknown app` as the message: a defence, no wording of its own).
//
// Contract assumed (reported to the implementer):
//   launchExternalApp(input: {
//     entry: { index: number; label: string };
//     target: { path: string; kind: "file" | "dir" };
//     ipc: { externalAppLaunch(index: number, path: string, kind: "file" | "dir"): Promise<void> };
//     status: { show(message: string): void };
//   }): Promise<void>                    // always resolves; shows exactly ONE status message
//
// Module under test (not yet implemented): ./launch-flow.ts

import { ExternalAppError } from "$lib/shared/ipc/external-apps";
import { launchExternalApp } from "./launch-flow";

const ENTRY = { index: 2, label: "エクスプローラーで開く" };
const TARGET = { path: "C:\\w\\a b.txt", kind: "file" as const };

function setup(launch: (index: number, path: string, kind: "file" | "dir") => Promise<void>) {
  const ipc = { externalAppLaunch: vi.fn(launch) };
  const status = { show: vi.fn() };
  return { ipc, status, run: () => launchExternalApp({ entry: ENTRY, target: TARGET, ipc, status }) };
}

describe("success (R-1570)", () => {
  it("calls the backend with the number, the path and the kind, then shows W-94", async () => {
    const s = setup(async () => {});
    await s.run();
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledTimes(1);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(2, "C:\\w\\a b.txt", "file");
    expect(s.status.show).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledWith("「エクスプローラーで開く」を起動しました");
  });

  it("a folder target is sent as kind 'dir'", async () => {
    const ipc = { externalAppLaunch: vi.fn(async () => {}) };
    await launchExternalApp({ entry: ENTRY, target: { path: "C:\\w", kind: "dir" }, ipc, status: { show: vi.fn() } });
    expect(ipc.externalAppLaunch).toHaveBeenCalledWith(2, "C:\\w", "dir");
  });

  it("the message is shown only AFTER the backend answered", async () => {
    let release: () => void = () => {};
    const s = setup(() => new Promise<void>((r) => (release = r)));
    const p = s.run();
    await Promise.resolve();
    expect(s.status.show).not.toHaveBeenCalled();
    release();
    await p;
    expect(s.status.show).toHaveBeenCalledTimes(1);
  });
});

describe("failures (§3.16.9)", () => {
  const cases: [string, ExternalAppError, string][] = [
    [
      "program_not_found -> W-95 with the expanded program",
      new ExternalAppError("program_not_found", "", "C:\\Users\\u\\AppData\\Local\\GitHubDesktop\\GitHubDesktop.exe"),
      "「エクスプローラーで開く」を起動できませんでした。実行ファイルが見つかりません: C:\\Users\\u\\AppData\\Local\\GitHubDesktop\\GitHubDesktop.exe。",
    ],
    ["target_missing -> W-96", new ExternalAppError("target_missing", ""), "「エクスプローラーで開く」を起動できませんでした。対象が見つかりません。"],
    [
      "os_error -> W-97 with the OS text as it is",
      new ExternalAppError("os_error", "アクセスが拒否されました。 (os error 5)"),
      "「エクスプローラーで開く」を起動できませんでした。 詳細: アクセスが拒否されました。 (os error 5)",
    ],
    ["invalid_path -> W-98", new ExternalAppError("invalid_path", ""), "「エクスプローラーで開く」を起動できませんでした。パスが正しくありません。"],
    ["e2e_scope_violation -> W-99", new ExternalAppError("e2e_scope_violation", ""), "「エクスプローラーで開く」を起動できませんでした。テスト用の範囲の外です。"],
    ["unknown_app -> W-97 with `unknown app`", new ExternalAppError("unknown_app", ""), "「エクスプローラーで開く」を起動できませんでした。 詳細: unknown app"],
  ];

  it.each(cases)("%s", async (_title, error, expected) => {
    const s = setup(async () => {
      throw error;
    });
    await expect(s.run()).resolves.toBeUndefined();
    expect(s.status.show).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledWith(expected);
  });

  it("a rejection that is a plain { code, message } object (not yet an ExternalAppError) is handled the same way", async () => {
    const s = setup(() => Promise.reject({ code: "os_error", message: "boom (os error 740)" }));
    await s.run();
    expect(s.status.show).toHaveBeenCalledWith("「エクスプローラーで開く」を起動できませんでした。 詳細: boom (os error 740)");
  });

  it("an unknown code, a string and an Error all become W-97 with their text; nothing is thrown", async () => {
    for (const rejection of [{ code: "something_new", message: "new thing" }, "plain failure", new Error("native failure")]) {
      const s = setup(() => Promise.reject(rejection));
      await expect(s.run()).resolves.toBeUndefined();
      const text = typeof rejection === "string" ? rejection : (rejection as { message: string }).message;
      expect(s.status.show).toHaveBeenCalledTimes(1);
      expect(s.status.show).toHaveBeenCalledWith(`「エクスプローラーで開く」を起動できませんでした。 詳細: ${text}`);
    }
  });

  it("the OS text is neither translated nor trimmed", async () => {
    const text = "  The requested operation requires elevation. (os error 740)  ";
    const s = setup(() => Promise.reject(new ExternalAppError("os_error", text)));
    await s.run();
    expect(s.status.show).toHaveBeenCalledWith(`「エクスプローラーで開く」を起動できませんでした。 詳細: ${text}`);
  });

  it("a failure never shows the success message (and shows exactly one message)", async () => {
    const s = setup(() => Promise.reject(new ExternalAppError("target_missing", "")));
    await s.run();
    expect(s.status.show).toHaveBeenCalledTimes(1);
    expect(s.status.show.mock.calls[0][0]).not.toContain("を起動しました");
  });
});

describe("robustness (R-1575)", () => {
  it("a synchronous throw inside the ipc is caught too", async () => {
    const ipc = {
      externalAppLaunch: vi.fn(() => {
        throw new Error("sync boom");
      }),
    };
    const status = { show: vi.fn() };
    await expect(launchExternalApp({ entry: ENTRY, target: TARGET, ipc: ipc as never, status })).resolves.toBeUndefined();
    expect(status.show).toHaveBeenCalledWith("「エクスプローラーで開く」を起動できませんでした。 詳細: sync boom");
  });

  it("the label is the registration's own (a user name with odd characters is put between 「」 as it is)", async () => {
    const ipc = { externalAppLaunch: vi.fn(async () => {}) };
    const status = { show: vi.fn() };
    await launchExternalApp({ entry: { index: 0, label: "ツール (v2) & co." }, target: TARGET, ipc, status });
    expect(status.show).toHaveBeenCalledWith("「ツール (v2) & co.」を起動しました");
  });
});
