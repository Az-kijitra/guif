import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0017 R-917-4 (an invalid `ui_theme` is reported as ONE separate
//   sentence, apart from R-45-2's), AC-958 (the notice says that `ui_theme` could not be
//   understood); SPEC-0300-0010 R-45-6 (the config.toml part of the startup message).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.4 (wording: English like
//   the other startup notices -- the Japanese text in the spec is only an example, owner
//   decision 2026-10-05), §3.11.11 (new `shared/theme-notice.ts`, a pure function).
//
// Module under test: ./theme-notice.ts
//
// API:
//   buildThemeNotice(invalid: boolean): string | null
//   - false -> null (no notice: key missing / "system" / "light" / "dark" / file unreadable)
//   - true  -> `Could not understand ui_theme in config.toml (use "light", "dark" or "system");
//              following the OS theme.`

import { buildThemeNotice } from "./theme-notice";

describe("buildThemeNotice (SPEC-0300-0017 R-917-4, AC-958)", () => {
  it("returns null when the value was valid or absent (no notice)", () => {
    expect(buildThemeNotice(false)).toBeNull();
  });

  it("returns the English notice text when ui_theme could not be interpreted", () => {
    expect(buildThemeNotice(true)).toBe(
      'Could not understand ui_theme in config.toml (use "light", "dark" or "system"); following the OS theme.',
    );
  });

  it("AC-958: the notice names `ui_theme` and `config.toml` and says the OS theme is followed", () => {
    const text = buildThemeNotice(true) ?? "";
    expect(text).toContain("ui_theme");
    expect(text).toContain("config.toml");
    expect(text).toContain("following the OS theme");
  });

  it("the notice is a single sentence ending with a period and holds no line break (it is joined into one status message)", () => {
    const text = buildThemeNotice(true) ?? "";
    expect(text.endsWith(".")).toBe(true);
    expect(text).not.toMatch(/[\r\n]/);
  });

  it("is deterministic (a pure function)", () => {
    expect(buildThemeNotice(true)).toBe(buildThemeNotice(true));
  });
});
