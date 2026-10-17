/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 第3版 §4.8 W-90〜W-9D (exact wording, punctuation included), SPEC-0300-0021 §9 R-1570〜R-1577 (success without a
//   full stop like the other success status messages; every failure ends with `。` except W-97, whose tail is the OS text untouched),
//   R-1571 (`{program}` = the EXPANDED value), R-1573 / AC-1542 (the OS text goes after `詳細: ` as it is: not translated, not trimmed,
//   `(os error N)` kept), R-1574 (the start-up notice sentences), R-1510-1 (the four default names live HERE, not in the backend),
//   R-1560 (W-9D is the existing `SHARED_SENTENCES.noTarget`, reused, not copied), AC-1542.
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/messages.ts`: pure strings and templates; imports only
//   `$lib/shared/messages`), §3.13.2 (a feature's messages.ts is imported from inside that feature only), §3.16.9.
//
// Contract assumed (reported to the implementer):
//   export const DEFAULT_APP_NAMES: Readonly<Record<1 | 2 | 3 | 4, string>>      // W-90..W-93
//   export const EXTERNAL_APP_MESSAGES = {
//     launched(name): string;                       // W-94
//     programNotFound(name, program): string;       // W-95
//     targetMissing(name): string;                  // W-96
//     failed(name, message): string;                // W-97  (R-1573)
//     invalidPath(name): string;                    // W-98
//     outOfScope(name): string;                     // W-99
//     invalidRegistrations(n: number, list: string): string;   // W-9A
//     typeError: string;                            // W-9B
//     unusableKeys(n: number, list: string): string;           // W-9C
//     limitReason: string;                          // `上限を超えています`
//   }
//
// Module under test (not yet implemented): ./messages.ts

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { DEFAULT_APP_NAMES, EXTERNAL_APP_MESSAGES as M } from "./messages";

describe("W-90〜W-93: the names of the default four", () => {
  it("are the specified words, keyed by the default number 1..4", () => {
    expect(DEFAULT_APP_NAMES[1]).toBe("ターミナルで開く");
    expect(DEFAULT_APP_NAMES[2]).toBe("VS Codeで開く");
    expect(DEFAULT_APP_NAMES[3]).toBe("エクスプローラーで開く");
    expect(DEFAULT_APP_NAMES[4]).toBe("GitHub Desktopで開く");
    expect(Object.keys(DEFAULT_APP_NAMES).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("use the spelling rules of SPEC-0300-0019 (長音 `ー`, product names untranslated)", () => {
    expect(DEFAULT_APP_NAMES[3]).toContain("エクスプローラー");
    for (const n of Object.values(DEFAULT_APP_NAMES)) expect(n).not.toMatch(/フォルダ(?!ー)/);
  });
});

describe("W-94 .. W-99: the launch results (R-1570 .. R-1577)", () => {
  it("W-94 success has NO full stop", () => {
    expect(M.launched("ターミナルで開く")).toBe("「ターミナルで開く」を起動しました");
    expect(M.launched("My Tool")).toBe("「My Tool」を起動しました");
  });

  it("W-95 not found: the expanded program after the colon, then a full stop", () => {
    expect(M.programNotFound("GitHub Desktopで開く", String.raw`C:\Users\u\AppData\Local\GitHubDesktop\GitHubDesktop.exe`)).toBe(
      String.raw`「GitHub Desktopで開く」を起動できませんでした。実行ファイルが見つかりません: C:\Users\u\AppData\Local\GitHubDesktop\GitHubDesktop.exe。`,
    );
    expect(M.programNotFound("x", "tool")).toBe("「x」を起動できませんでした。実行ファイルが見つかりません: tool。");
  });

  it("W-96 target missing", () => {
    expect(M.targetMissing("エクスプローラーで開く")).toBe("「エクスプローラーで開く」を起動できませんでした。対象が見つかりません。");
  });

  it("W-97 other failures: one space, `詳細: `, the OS text exactly (no full stop added, nothing trimmed, nothing translated)", () => {
    expect(M.failed("X", "アクセスが拒否されました。 (os error 5)")).toBe("「X」を起動できませんでした。 詳細: アクセスが拒否されました。 (os error 5)");
    expect(M.failed("X", "The requested operation requires elevation. (os error 740)")).toBe(
      "「X」を起動できませんでした。 詳細: The requested operation requires elevation. (os error 740)",
    );
    const padded = "  spaced out (os error 1)  ";
    expect(M.failed("X", padded).endsWith(`詳細: ${padded}`)).toBe(true);
    expect(M.failed("X", "")).toBe("「X」を起動できませんでした。 詳細: ");
  });

  it("W-98 / W-99", () => {
    expect(M.invalidPath("X")).toBe("「X」を起動できませんでした。パスが正しくありません。");
    expect(M.outOfScope("X")).toBe("「X」を起動できませんでした。テスト用の範囲の外です。");
  });

  it("a name with brackets, quotes or a full stop is put between 「」 untouched", () => {
    expect(M.launched("a」b「c")).toBe("「a」b「c」を起動しました");
    expect(M.targetMissing("終わり。")).toBe("「終わり。」を起動できませんでした。対象が見つかりません。");
  });
});

describe("W-9A .. W-9C: the start-up notice sentences (R-1574, D-10)", () => {
  it("W-9A invalid registrations: the count and the list, then a full stop", () => {
    expect(M.invalidRegistrations(2, "2(bad), 3(VS Codeで開く)")).toBe("config.toml の外部アプリの登録 2 件を使いません: 2(bad), 3(VS Codeで開く)。");
    expect(M.invalidRegistrations(1, "21(上限を超えています)")).toBe("config.toml の外部アプリの登録 1 件を使いません: 21(上限を超えています)。");
  });

  it("W-9B type error (a fixed sentence)", () => {
    expect(M.typeError).toBe("config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。");
  });

  it("W-9C unusable keys", () => {
    expect(M.unusableKeys(1, "ターミナルで開く: Ctrl+Alt+C")).toBe(
      "外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): ターミナルで開く: Ctrl+Alt+C。",
    );
  });

  it("the limit reason (listed in the table of the specification)", () => {
    expect(M.limitReason).toBe("上限を超えています");
  });
});

describe("W-9D is the existing sentence, reused (R-1560)", () => {
  it("SHARED_SENTENCES.noTarget is `対象がありません`", () => {
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
  });

  it("messages.ts does not carry a second copy of it", () => {
    const source = readFileSync(resolve(__dirname, "messages.ts"), "utf-8");
    expect(source).not.toContain("対象がありません");
  });
});

describe("the module obeys SPEC-0300-0019 R-1201 (§3.13.2)", () => {
  const source = readFileSync(resolve(__dirname, "messages.ts"), "utf-8");

  it("imports nothing but $lib/shared/messages and is pure (no runes, no DOM)", () => {
    const specs = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const s of specs) expect(s).toBe("$lib/shared/messages");
    expect(source).not.toMatch(/\$state\b|\$derived\b|\$effect\b|\b(document|window|localStorage|navigator)\b/);
  });

  it("no English wording of the old style is left behind", () => {
    expect(source).not.toMatch(/Launched|Could not start|not found:/);
  });
});
