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
