import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0011 R-84/R-86 (existing translations); SPEC-0300-0016
//   R-731/R-731-1 (the NEW `not_a_directory` entry, "フォルダーではありません。").
// Architecture: SPEC-0200-0001 §3.7.10.2(c) (architecture-guardian 16th
//   audit, MUST-98(c)): the translation table moves to `shared/error-text.ts`
//   (a leaf module) so `features/path-bar/` can translate R-731's codes
//   without importing the `file-ops` feature (§4.1). `features/file-ops/
//   error-format.ts` re-exports from here (SHOULD-129 `path-key` precedent)
//   so its own existing tests keep passing unmodified.
//
// Module under test: ./error-text.ts (new, TDD stub -- see its own header
// comment; every code currently maps to `null`, so every assertion below is
// RED until code-generator moves the real table here).

import { translateErrorCode } from "./error-text";

describe("translateErrorCode (SPEC-0300-0011 R-84/R-86, parity with the pre-existing file-ops table)", () => {
  it.each([
    ["invalid_path", "パスが正しくありません。"],
    ["permission_denied", "権限がないため操作を実行できませんでした。"],
    ["not_found", "対象が見つかりません。"],
    ["no_items", "対象が選択されていません。"],
  ] as const)("%s -> %s", (code, expected) => {
    expect(translateErrorCode(code)).toBe(expected);
  });

  // R-731-1 (承認時に確定・ISS-0171 (c)の代案): the ONE brand-new entry this
  // Phase adds -- does not exist anywhere in the codebase yet (not even in
  // file-ops/error-format.ts's pre-existing table).
  it("R-731-1: not_a_directory -> the dedicated 'not a folder' message", () => {
    expect(translateErrorCode("not_a_directory")).toBe("フォルダーではありません。");
  });

  it("R-84/R-86: an unrecognized code returns null (caller falls back to the raw message)", () => {
    expect(translateErrorCode("something_unheard_of")).toBeNull();
  });
});

// SPEC-0300-0019 §9 S-7 / SPEC-0200-0001 §3.13.6: these two tests move here from the Rust unit tests
// `r85_all_documented_error_codes_have_a_translation` and `r85_1_overwrite_ancestor_has_a_dedicated_translation`
// (Rust `translate_error_code` is removed in stage C; the FE table is the only one -- ISS-0209 (a)). They do not
// depend on the wording, so they are green from stage A on.
describe("translateErrorCode: R-85 / R-85-1 (moved from the Rust tests)", () => {
  const DOCUMENTED_CODES = [
    "invalid_name",
    "invalid_kind",
    "parent_not_found",
    "already_exists",
    "same_path",
    "not_found",
    "invalid_path",
    "no_items",
    "destination_not_found",
    "destination_not_dir",
    "destination_inside_source",
    "permission_denied",
    "conflict",
    "io_error",
    "unknown",
    "canceled",
    "overwrite_ancestor",
  ] as const;

  it("R-85: every documented error code has a (non-empty) translation", () => {
    for (const code of DOCUMENTED_CODES) {
      const text = translateErrorCode(code);
      expect(text, code).not.toBeNull();
      expect((text as string).length, code).toBeGreaterThan(0);
    }
  });

  it("R-85-1: overwrite_ancestor has its own sentence, different from conflict and io_error", () => {
    const text = translateErrorCode("overwrite_ancestor");
    expect(text).not.toBeNull();
    expect(text).not.toBe(translateErrorCode("conflict"));
    expect(text).not.toBe(translateErrorCode("io_error"));
  });

  it("AC-71: permission_denied is a dedicated sentence, distinct from io_error", () => {
    expect(translateErrorCode("permission_denied")).not.toBe(translateErrorCode("io_error"));
  });
});

// SPEC-0300-0019 W-25 (R-1220 / T-11): `フォルダ` -> `フォルダー` in the error-code table (stage B: RED until stage C).
describe("translateErrorCode: W-25 `フォルダー`", () => {
  it.each([
    ["parent_not_found", "作成先のフォルダーが見つかりません。"],
    ["destination_not_found", "宛先フォルダーが見つかりません。"],
    ["destination_not_dir", "宛先がフォルダーではありません。"],
    ["overwrite_ancestor", "コピー先の上位フォルダーを上書きすることはできません。"],
  ] as const)("%s -> %s", (code, expected) => {
    expect(translateErrorCode(code)).toBe(expected);
  });

  it("no translation uses the bare `フォルダ` (a `フォルダ` not followed by `ー`)", () => {
    const codes = [
      "invalid_name", "invalid_kind", "parent_not_found", "already_exists", "same_path", "not_found",
      "invalid_path", "no_items", "destination_not_found", "destination_not_dir", "destination_inside_source",
      "overwrite_ancestor", "permission_denied", "conflict", "io_error", "unknown", "canceled", "not_a_directory",
    ];
    for (const code of codes) expect(translateErrorCode(code) ?? "", code).not.toMatch(/フォルダ(?!ー)/);
  });
});

// MUST-98(c)/SHOULD-129 precedent: file-ops/error-format.ts must become a
// thin re-export of this module's translateErrorCode (not a second, parallel
// table) -- otherwise the two tables can silently drift (e.g. a future
// `not_a_directory`-style addition landing in only one of them).
describe("features/file-ops/error-format.ts re-exports from shared/error-text.ts (MUST-98(c), SHOULD-129 precedent)", () => {
  it("imports translateErrorCode (or its table) from shared/error-text, rather than defining its own ERROR_TRANSLATIONS", () => {
    const source = readFileSync(
      join(__dirname, "..", "features", "file-ops", "error-format.ts"),
      "utf-8",
    );
    expect(source).toContain("shared/error-text");
    expect(source).not.toContain("const ERROR_TRANSLATIONS");
  });
});
