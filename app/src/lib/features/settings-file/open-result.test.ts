import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1665 / 【確定 T-20】 (the order W-A4 -> the opening result -> W-A8; no separator after W-A4, one half-width space before
//   W-A8), R-1603 / R-1604 / R-1603-1 / R-1613 / R-1623 / R-1681, AC-1604 (W-A3 / W-A5), AC-1605 (W-A5 with the OS text), AC-1607 (W-A6),
//   AC-1608 (W-A4 + W-A7), AC-1611 (W-AD), AC-1621 (W-A8 after the result), SPEC-0300-0019 第5版 W-A2〜W-A8 / W-AD, R-1204 (the OS text is not translated).
// Architecture: SPEC-0200-0001 §3.17.6 / §3.17.8: `features/settings-file/open-result.ts`:
//   buildOpenResult(dto: { templateCreated: boolean; sampleError: string | null;
//     result: { kind: "vscode" | "association" | "not_a_file" | "out_of_scope" | "open_failed" | "template_failed"; message?: string } }): string
//   `template_failed` has no opening result (W-A6 only).
//
// Module under test (not yet implemented): ./open-result.ts

import { buildOpenResult } from "./open-result";

type Kind = "vscode" | "association" | "not_a_file" | "out_of_scope" | "open_failed" | "template_failed";
const dto = (kind: Kind, over: { templateCreated?: boolean; sampleError?: string | null; message?: string } = {}) => ({
  templateCreated: over.templateCreated ?? false,
  sampleError: over.sampleError ?? null,
  result: over.message === undefined ? { kind } : { kind, message: over.message },
});

const W_A4 = "config.toml を作成しました。";
const W_A2 = "config.toml を VS Code で開きました";
const W_A3 = "VS Code が見つからないため、Windows の関連付けで config.toml を開きます";
const W_A7 = "config.toml を開けませんでした。テスト用の範囲の外です。";
const W_AD = "config.toml を開けませんでした。ファイルではありません。";

describe("the opening result alone (templateCreated false, no sample error)", () => {
  it("W-A2: VS Code (no full stop, like the other success messages)", () => {
    expect(buildOpenResult(dto("vscode"))).toBe(W_A2);
  });

  it("W-A3: handed to the Windows association", () => {
    expect(buildOpenResult(dto("association"))).toBe(W_A3);
  });

  it("W-AD: not a regular file", () => {
    expect(buildOpenResult(dto("not_a_file"))).toBe(W_AD);
  });

  it("W-A7: outside the E2E scope", () => {
    expect(buildOpenResult(dto("out_of_scope"))).toBe(W_A7);
  });

  it("W-A5: could not open, with `詳細:` and the OS text untouched (AC-1605)", () => {
    expect(buildOpenResult(dto("open_failed", { message: "アクセスが拒否されました。 (os error 5)" }))).toBe(
      "config.toml を開けませんでした。 詳細: アクセスが拒否されました。 (os error 5)",
    );
  });

  it("W-A5: the OS text is not translated, trimmed or given a full stop", () => {
    expect(buildOpenResult(dto("open_failed", { message: "  The system cannot find the file  " }))).toBe(
      "config.toml を開けませんでした。 詳細:   The system cannot find the file  ",
    );
  });

  it("W-A6: the template could not be created, with the detail (AC-1607); no opening result follows", () => {
    expect(buildOpenResult(dto("template_failed", { message: "permission denied" }))).toBe("config.toml を作成できませんでした。 詳細: permission denied");
  });
});

describe("R-1665: W-A4 in front when the template was created (no separator)", () => {
  it("W-A4 + W-A2 -> `config.toml を作成しました。config.toml を VS Code で開きました`", () => {
    expect(buildOpenResult(dto("vscode", { templateCreated: true }))).toBe("config.toml を作成しました。config.toml を VS Code で開きました");
  });

  it("AC-1608: W-A4 + W-A7", () => {
    expect(buildOpenResult(dto("out_of_scope", { templateCreated: true }))).toBe(
      "config.toml を作成しました。config.toml を開けませんでした。テスト用の範囲の外です。",
    );
  });

  it("W-A4 in front of W-A3, W-A5 and W-AD", () => {
    expect(buildOpenResult(dto("association", { templateCreated: true }))).toBe(W_A4 + W_A3);
    expect(buildOpenResult(dto("open_failed", { templateCreated: true, message: "m" }))).toBe(W_A4 + "config.toml を開けませんでした。 詳細: m");
    expect(buildOpenResult(dto("not_a_file", { templateCreated: true }))).toBe(W_A4 + W_AD);
  });

  it("when the template is not created there is no W-A4", () => {
    expect(buildOpenResult(dto("vscode"))).not.toContain("作成しました");
  });
});

describe("R-1623 / R-1665: W-A8 after the result, one half-width space before it", () => {
  const W_A8 = (m: string): string => `config.sample.toml を書き出せませんでした。 詳細: ${m}`;

  it("AC-1621: W-A7 + ' ' + W-A8", () => {
    expect(buildOpenResult(dto("out_of_scope", { sampleError: "is a directory" }))).toBe(`${W_A7} ${W_A8("is a directory")}`);
  });

  it("W-A2 + ' ' + W-A8 (the success sentence has no full stop, the space still separates)", () => {
    expect(buildOpenResult(dto("vscode", { sampleError: "e" }))).toBe(`${W_A2} ${W_A8("e")}`);
  });

  it("all three: W-A4 + W-A2 + ' ' + W-A8", () => {
    expect(buildOpenResult(dto("vscode", { templateCreated: true, sampleError: "e" }))).toBe(`${W_A4}${W_A2} ${W_A8("e")}`);
  });

  it("a null sampleError adds nothing (no trailing space)", () => {
    const text = buildOpenResult(dto("vscode", { sampleError: null }));
    expect(text).toBe(W_A2);
    expect(text).toBe(text.trim());
  });
});
