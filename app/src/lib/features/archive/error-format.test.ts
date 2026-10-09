/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0014 R-394 (code + message pair; the UI translates the code,
//   an untranslated code shows the ORIGINAL message), R-395 (the error code
//   table), R-395-1 (inline pre-validation errors: translated text + the
//   offending archive-internal path (first one) + a hint that NOTHING was
//   written), R-395-3 (permission_denied has its own message, distinct from
//   the generic io_error), R-395-4 (a library-provided message is shown as a
//   detail and is never replaced/lost), R-390-1 (no password-related
//   translation strings), AC-377, AC-380, AC-381, AC-382; SPEC-0300-0011
//   R-85/R-85-2 (existing codes are reused).
// Architecture: SPEC-0200-0001 §3.4.1 (`translate_error_code` is NOT shared and
//   NOT created on the Rust side; the translation lives ONLY in the frontend
//   features/archive/error-format.ts), §3.4.2 (`ArchiveErrorCode`: existing
//   codes + zip_corrupt / zip_unsupported / zip_encrypted / zip_entry_rejected /
//   zip_too_large / insufficient_space), §3.4.10 (the Rust `ArchiveErrorCode`
//   enum and the TS translation table must have the same keys; checked here by
//   reading the Rust source in Node, the same way the ACL consistency test
//   works). features/archive must NOT import features/file-ops' error-format.
// Module under test (not yet implemented): ./error-format.ts
//
// Contract assumed (documented in the handback report):
//   translateArchiveErrorCode(code: string): string | null
//   formatArchiveError(e: { code: string; message: string; entryPath?: string }): string
//   formatPreflightError(e): string   (formatArchiveError(e) + a "nothing was written" hint)
//   Rust source: app/src-tauri/src/archive/error.rs, `fn as_str` maps each
//   variant to a `"snake_case_code"` string literal.

import { formatArchiveError, formatPreflightError, translateArchiveErrorCode } from "./error-format";

// R-395 (the full table). `canceled` is a code too (R-385).
const ALL_CODES = [
  "no_items",
  "not_found",
  "invalid_path",
  "invalid_name",
  "already_exists",
  "destination_inside_source",
  "destination_not_found",
  "destination_not_dir",
  "zip_corrupt",
  "zip_unsupported",
  "zip_encrypted",
  "zip_entry_rejected",
  "zip_too_large",
  "insufficient_space",
  "conflict",
  "permission_denied",
  "io_error",
  "unknown",
  "canceled",
] as const;

describe("translateArchiveErrorCode (R-394, R-395, AC-381)", () => {
  it.each(ALL_CODES)("%s has a non-empty translation", (code) => {
    const t = translateArchiveErrorCode(code);
    expect(t).not.toBeNull();
    expect((t as string).length).toBeGreaterThan(0);
  });

  it("all translations are distinct (a user can tell the causes apart)", () => {
    const all = ALL_CODES.map((c) => translateArchiveErrorCode(c));
    expect(new Set(all).size).toBe(ALL_CODES.length);
  });

  it("R-395-3 / AC-380: permission_denied is different from the generic io_error", () => {
    expect(translateArchiveErrorCode("permission_denied")).not.toBe(translateArchiveErrorCode("io_error"));
  });

  it("R-365-1 / AC-372: insufficient_space is recognisable as a free-space problem", () => {
    expect(translateArchiveErrorCode("insufficient_space")).toContain("容量");
  });

  it("R-365 L-1/L-2: zip_too_large is not the same message as insufficient_space", () => {
    expect(translateArchiveErrorCode("zip_too_large")).not.toBe(translateArchiveErrorCode("insufficient_space"));
  });

  it("R-390-1: no translation mentions a password (the feature does not exist; encrypted ZIPs are simply refused)", () => {
    for (const c of ALL_CODES) {
      expect(`${translateArchiveErrorCode(c)}`.toLowerCase()).not.toMatch(/パスワード|password/);
    }
  });

  it("R-394 / AC-382: an unknown code has NO translation (null) so the caller falls back to the original message", () => {
    expect(translateArchiveErrorCode("something_new")).toBeNull();
    expect(translateArchiveErrorCode("")).toBeNull();
  });

  it("R-390-1: there is no bad-password code", () => {
    // Assembled at run time so this file never contains the retired identifier
    // as a contiguous literal (AC-361 scans the whole app/ tree, tests included).
    const retired = ["ZIP_BAD", "_PASSWORD"].join("").toLowerCase();
    expect(translateArchiveErrorCode(retired)).toBeNull();
  });
});

// SPEC-0300-0019 W-25 (フォルダ -> フォルダー) and AC-1211 / R-1204 1 (Japanese body, English detail).
describe("SPEC-0300-0019 W-25 / AC-1211: ZIP error wording", () => {
  it("W-25: destination_not_found uses `フォルダー`", () => {
    expect(translateArchiveErrorCode("destination_not_found")).toBe("出力先のフォルダーが見つかりません。");
  });

  it("W-25: destination_not_dir uses `フォルダー`", () => {
    expect(translateArchiveErrorCode("destination_not_dir")).toBe("展開先がフォルダーではありません。");
  });

  it("W-25: no translation uses the bare `フォルダ` (a `フォルダ` not followed by `ー`)", () => {
    for (const c of ALL_CODES) {
      expect(`${translateArchiveErrorCode(c)}`).not.toMatch(/フォルダ(?!ー)/);
    }
  });

  it("AC-1211 / R-1204 1 / T-06: a known code is `{日本語の翻訳} 詳細: {message}` with the message left in English", () => {
    expect(formatArchiveError({ code: "zip_corrupt", message: "invalid Zip archive: Could not find EOCD" })).toBe(
      "ZIPファイルが壊れているか、読み取れません。 詳細: invalid Zip archive: Could not find EOCD",
    );
  });

  it("AC-1211 / R-1204 2: an unknown code shows the original message as it is", () => {
    expect(formatArchiveError({ code: "brand_new_code", message: "Some OS error" })).toBe("Some OS error");
  });
});

describe("formatArchiveError (R-394, R-395-4, AC-382)", () => {
  it("a known code shows the translation AND keeps the original library message as a detail (R-395-4)", () => {
    const text = formatArchiveError({ code: "zip_corrupt", message: "invalid Zip archive: Could not find EOCD" });
    expect(text).toContain(translateArchiveErrorCode("zip_corrupt") as string);
    expect(text).toContain("invalid Zip archive: Could not find EOCD");
  });

  it("R-395-1: the offending archive-internal path is included when present", () => {
    const text = formatArchiveError({ code: "zip_entry_rejected", message: "unsafe path", entryPath: "../evil.txt" });
    expect(text).toContain("../evil.txt");
    expect(text).toContain(translateArchiveErrorCode("zip_entry_rejected") as string);
  });

  it("AC-382: an UNKNOWN code shows the original message (never empty)", () => {
    const text = formatArchiveError({ code: "brand_new_code", message: "something specific happened" });
    expect(text).toContain("something specific happened");
  });

  it("AC-382: an unknown code with an empty message still shows something (the code), never an empty string", () => {
    const text = formatArchiveError({ code: "brand_new_code", message: "" });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("brand_new_code");
  });

  it("a known code with an empty message shows just the translation", () => {
    const text = formatArchiveError({ code: "no_items", message: "" });
    expect(text).toContain(translateArchiveErrorCode("no_items") as string);
  });

  it("a message equal to the code (bare-code rejections) is not repeated as a 'detail'", () => {
    const text = formatArchiveError({ code: "not_found", message: "not_found" });
    const t = translateArchiveErrorCode("not_found") as string;
    expect(text.split(t).join("")).not.toContain("not_found");
  });

  it("the entry path is not shown when absent (no 'undefined' / 'null' text)", () => {
    const text = formatArchiveError({ code: "io_error", message: "disk full" });
    expect(text).not.toMatch(/undefined|null/);
  });
});

describe("formatPreflightError (R-395-1, AC-377)", () => {
  it("contains everything formatArchiveError shows, plus a hint that nothing was written", () => {
    const e = { code: "zip_entry_rejected", message: "unsafe path", entryPath: "a/../../b.txt" };
    const text = formatPreflightError(e);
    expect(text).toContain(formatArchiveError(e));
    expect(text).toContain("何も書き込まれていません");
  });

  it("works for an unknown code as well (the original message is kept)", () => {
    const text = formatPreflightError({ code: "brand_new_code", message: "raw detail" });
    expect(text).toContain("raw detail");
    expect(text).toContain("何も書き込まれていません");
  });
});

describe("Rust ArchiveErrorCode <-> TS translation table stay in sync (SPEC-0200-0001 §3.4.10)", () => {
  const rustPath = resolve(__dirname, "../../../../src-tauri/src/archive/error.rs");

  function rustCodes(): string[] {
    const src = readFileSync(rustPath, "utf-8");
    const start = src.indexOf("fn as_str");
    if (start < 0) throw new Error("archive/error.rs has no `fn as_str` (ArchiveErrorCode::as_str, §3.4.2)");
    // The body of as_str: the string literals on the `=> "code"` arms.
    const body = src.slice(start, start + 4000);
    const out = new Set<string>();
    for (const m of body.matchAll(/=>\s*"([a-z][a-z0-9_]*)"/g)) out.add(m[1]);
    return [...out];
  }

  it("the Rust source exists (archive/error.rs, §3.4.2)", () => {
    expect(existsSync(rustPath)).toBe(true);
  });

  it("every code the Rust enum can emit has a TS translation", () => {
    const missing = rustCodes().filter((c) => translateArchiveErrorCode(c) === null);
    expect(missing).toEqual([]);
  });

  it("the Rust enum covers every code of R-395 (nothing is silently missing on the Rust side)", () => {
    const codes = new Set(rustCodes());
    const missing = ALL_CODES.filter((c) => !codes.has(c));
    expect(missing).toEqual([]);
  });
});
