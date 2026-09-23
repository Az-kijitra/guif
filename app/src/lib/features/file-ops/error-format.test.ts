import { describe, expect, it } from "vitest";
import { formatFailureList, translateErrorCode } from "./error-format";

// Spec: SPEC-0300-0011 (file operations detail) §10
// Module under test (not yet implemented): ./error-format.ts
//
// R-84: error codes are translated for display; an unrecognized code falls
//   back to the raw message rather than displaying nothing.
// R-81: a batch failure list shows at most the first 5 entries, with the
//   rest indicated as truncated.
// R-86: permission_denied has its own dedicated message, distinct from the
//   generic io_error fallback.

describe("translateErrorCode (SPEC-0300-0011 R-84, R-86)", () => {
  it("AC-73: an unrecognized code has no translation (caller falls back to the raw message)", () => {
    expect(translateErrorCode("totally_unknown_code_xyz")).toBeNull();
  });

  it("AC-71: permission_denied has a dedicated message distinct from the generic io_error message", () => {
    const permissionDenied = translateErrorCode("permission_denied");
    const ioError = translateErrorCode("io_error");
    expect(permissionDenied).not.toBeNull();
    expect(ioError).not.toBeNull();
    expect(permissionDenied).not.toBe(ioError);
  });
});

describe("formatFailureList (SPEC-0300-0011 R-81)", () => {
  it("AC-69: shows every failure's path and message when there are 5 or fewer", () => {
    const failures = [
      { path: "a.txt", code: "not_found", message: "not found" },
      { path: "b.txt", code: "permission_denied", message: "access denied" },
      { path: "c.txt", code: "io_error", message: "disk error" },
    ];

    const result = formatFailureList(failures);

    expect(result.shown).toHaveLength(3);
    expect(result.shown[0]).toMatchObject({ path: "a.txt" });
    expect(result.truncated).toBe(false);
  });

  it("AC-70: shows only the first 5 and marks the rest as truncated when there are 6 or more", () => {
    const failures = Array.from({ length: 7 }, (_, i) => ({
      path: `f${i}.txt`,
      code: "io_error",
      message: `error ${i}`,
    }));

    const result = formatFailureList(failures);

    expect(result.shown).toHaveLength(5);
    expect(result.shown.map((f) => f.path)).toEqual(["f0.txt", "f1.txt", "f2.txt", "f3.txt", "f4.txt"]);
    expect(result.truncated).toBe(true);
  });
});
