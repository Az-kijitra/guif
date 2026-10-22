import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0017 R-917-4 (an invalid `ui_theme` is reported as ONE separate
//   sentence, apart from R-45-2's), AC-958 (the notice says that `ui_theme` could not be
//   understood); SPEC-0300-0010 R-45-6 (the config.toml part of the startup message).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.11 (new `shared/theme-notice.ts`, a pure
//   function); §3.13.7 / §3.13.11: the wording is JAPANESE since SPEC-0300-0019 R-1208 (W-33), which cancels the
//   2026-10-05 "English like the other startup notices" decision.
//
// Module under test: ./theme-notice.ts
//
// API:
//   buildThemeNotice(invalid: boolean): string | null
//   - false -> null (no notice: key missing / "system" / "light" / "dark" / file unreadable)
//   - true  -> W-33: `config.toml の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。`

import { buildThemeNotice } from "./theme-notice";

describe("buildThemeNotice (SPEC-0300-0017 R-917-4, AC-958)", () => {
  it("returns null when the value was valid or absent (no notice)", () => {
    expect(buildThemeNotice(false)).toBeNull();
  });

  it("W-33 (AC-1209 (iv)): returns the Japanese notice text when ui_theme could not be interpreted", () => {
    expect(buildThemeNotice(true)).toBe(
      'config.toml の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。',
    );
  });

  it("AC-958: the notice names `ui_theme` and `config.toml` and says the OS theme setting is followed", () => {
    const text = buildThemeNotice(true) ?? "";
    expect(text).toContain("ui_theme");
    expect(text).toContain("config.toml");
    expect(text).toContain("OS のテーマ設定に従います");
  });

  it("AC-1212: the old English sentence is gone", () => {
    const text = buildThemeNotice(true) ?? "";
    expect(text).not.toContain("Could not understand ui_theme");
    expect(text).not.toContain("following the OS theme");
  });

  it("the notice is a single sentence ending with a full stop (。) and holds no line break (it is joined into one status message)", () => {
    const text = buildThemeNotice(true) ?? "";
    expect(text.endsWith("。")).toBe(true);
    expect(text).not.toMatch(/[\r\n]/);
  });

  it("is deterministic (a pure function)", () => {
    expect(buildThemeNotice(true)).toBe(buildThemeNotice(true));
  });
});

// SPEC-0300-0022 R-1642 / 第5版 W-33: `config.toml の {N} 行目の ui_theme を解釈できないため、…` when the reading side returned the `ui_theme` line;
// a null / absent line keeps the sentence above (R-1660: "行番号が得られないときは現行の文のまま").
// API: buildThemeNotice(invalid: boolean, line?: number | null): string | null
describe("buildThemeNotice with the line of ui_theme (SPEC-0300-0022 W-33, AC-1640)", () => {
  const WITH_LINE = (n: number): string =>
    `config.toml の ${n} 行目の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。`;

  it("AC-1640: line 3 -> `config.toml の 3 行目の ui_theme を解釈できないため、…`", () => {
    expect(buildThemeNotice(true, 3)).toBe(WITH_LINE(3));
  });

  it("a null or undefined line keeps the current sentence", () => {
    const plain = 'config.toml の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。';
    expect(buildThemeNotice(true, null)).toBe(plain);
    expect(buildThemeNotice(true, undefined)).toBe(plain);
    expect(buildThemeNotice(true)).toBe(plain);
  });

  it("not invalid -> null, whatever the line", () => {
    expect(buildThemeNotice(false, 3)).toBeNull();
    expect(buildThemeNotice(false, null)).toBeNull();
  });

  it("the sentence stays one line ending with a full stop", () => {
    const text = buildThemeNotice(true, 120) ?? "";
    expect(text).toBe(WITH_LINE(120));
    expect(text.endsWith("。")).toBe(true);
    expect(text).not.toMatch(/[\r\n]/);
  });
});
