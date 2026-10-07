import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0009 第14版 R-70-1 / R-70-2 / AC-644 (the front end does not fold `invalid_path` into
//   `other`); SPEC-0300-0011 第9版 R-85-4 (the same code string as the other commands).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.12.7 (1): `fs-error.ts` gets `"invalid_path"`
//   in `FsListDirErrorCode` and `KNOWN_CODES`.
// Module under test: ./fs-error.ts (`normalizeFsListDirError`, `FsListDirError`).

import { FsListDirError, normalizeFsListDirError } from "./fs-error";

describe("normalizeFsListDirError keeps `invalid_path` (AC-644)", () => {
  it("a structured DTO object with code `invalid_path` keeps its code and message", () => {
    const err = normalizeFsListDirError({ code: "invalid_path", message: "not an absolute path: C:src" });
    expect(err).toBeInstanceOf(FsListDirError);
    expect(err.code).toBe("invalid_path");
    expect(err.message).toBe("not an absolute path: C:src");
  });

  it("an Error that already carries code `invalid_path` keeps it", () => {
    const err = normalizeFsListDirError(Object.assign(new Error("x"), { code: "invalid_path" }));
    expect(err.code).toBe("invalid_path");
    expect(err.message).toBe("x");
  });

  it("an FsListDirError built with `invalid_path` is returned as is", () => {
    // (the cast keeps this file type-checking before `FsListDirErrorCode` gains "invalid_path")
    const original = new FsListDirError("invalid_path" as string as FsListDirError["code"], "m");
    expect(normalizeFsListDirError(original)).toBe(original);
    expect(original.code).toBe("invalid_path");
  });

  it("the result is never the '[object Object]' text of the raw DTO", () => {
    const err = normalizeFsListDirError({ code: "invalid_path", message: "m" });
    expect(String(err.message)).not.toContain("[object Object]");
  });
});

describe("the other known codes are unchanged", () => {
  it.each(["access_denied", "not_found", "not_a_directory", "other"] as const)("%s is kept", (code) => {
    expect(normalizeFsListDirError({ code, message: "m" }).code).toBe(code);
  });

  it("an unknown code and a bare string still become `other`", () => {
    expect(normalizeFsListDirError({ code: "something_new", message: "m" }).code).toBe("other");
    expect(normalizeFsListDirError("invalid_path").code).toBe("other");
  });
});
