import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0016 §5 (R-720~R-727), §6 (R-730/R-731), §14.2 (AC-706~712,
//   740~753). Module under test: ./normalize.ts (TDD stub -- every case
//   below is RED because both exported functions currently `throw`).
//
// Pure functions, no DOM/Tauri dependency (SPEC-0200-0001 §3.7.4/§3.7.8).

import { isPathBarRoot, normalizePathBarInput } from "./normalize";

function path(raw: string) {
  return { kind: "path" as const, path: raw };
}

describe("normalizePathBarInput: R-722-1 (empty input)", () => {
  it("an empty string is 'empty'", () => {
    expect(normalizePathBarInput("")).toEqual({ kind: "empty" });
  });

  it("whitespace-only input (spaces/tabs/newlines) is 'empty' after step 1's trim", () => {
    expect(normalizePathBarInput("   \t\n  ")).toEqual({ kind: "empty" });
  });
});

describe("normalizePathBarInput: R-722 rejected formats -> 'invalid' (AC-709)", () => {
  it.each([
    "Foo", // relative
    ".\\Foo", // relative
    "..", // relative
    "C:Foo", // drive-relative
    "\\Foo", // root-relative
    "~", // home-tilde
    "~\\Documents", // home-tilde
    "file:///C:/", // URL
    "\\\\server", // UNC without a share
    "\\\\server\\", // UNC without a share (trailing separator, still no share)
    "\\\\.\\PhysicalDrive0", // \\.\ form other than X:\ or Volume{GUID}\
    "\\\\.\\pipe\\foo", // \\.\ form other than X:\ or Volume{GUID}\
  ])("%s is rejected as invalid (fs_list_dir is never called for these)", (raw) => {
    expect(normalizePathBarInput(raw)).toEqual({ kind: "invalid" });
  });
});

describe("normalizePathBarInput: R-722 accepted formats", () => {
  it("AC-752/R-795-2: a \\\\.\\X:\\... device-namespace path IS accepted", () => {
    expect(normalizePathBarInput("\\\\.\\C:\\Windows")).toEqual(path("\\\\.\\C:\\Windows"));
  });

  it("a \\\\.\\Volume{GUID}\\... path is accepted", () => {
    const guid = "\\\\.\\Volume{12345678-1234-1234-1234-123456789abc}\\x";
    expect(normalizePathBarInput(guid)).toEqual(path(guid));
  });

  it("a \\\\?\\ extended-length path is accepted and left otherwise untouched (case, no de-slashing)", () => {
    expect(normalizePathBarInput("\\\\?\\C:\\Long\\X")).toEqual(path("\\\\?\\C:\\Long\\X"));
  });
});

describe("normalizePathBarInput: R-721 step 1 (trim) / step 2 (dequote) / step 3 (/ -> \\)", () => {
  it("AC-708: surrounding whitespace, a wrapping pair of double quotes, and forward slashes are all normalized", () => {
    expect(normalizePathBarInput('  "c:/Users/Foo/"  ')).toEqual(path("c:\\Users\\Foo"));
  });
});

describe("normalizePathBarInput: R-721 step 4 (bare drive letter + colon -> that drive's root)", () => {
  it("'d:' becomes 'd:\\\\' (AC-708)", () => {
    expect(normalizePathBarInput("d:")).toEqual(path("d:\\"));
  });

  it("case is preserved (D3: no drive-letter uppercasing, m-8)", () => {
    expect(normalizePathBarInput("d:")).toEqual(path("d:\\"));
    expect(normalizePathBarInput("D:")).toEqual(path("D:\\"));
  });
});

describe("normalizePathBarInput: R-721 step 5 (collapse repeated separators, UNC leading \\\\ excepted)", () => {
  it("AC-708: 'c:/Users//Foo/' collapses the doubled separator", () => {
    expect(normalizePathBarInput("c:/Users//Foo/")).toEqual(path("c:\\Users\\Foo"));
  });

  it("a UNC path's leading \\\\\\\\ is never collapsed to a single \\\\", () => {
    expect(normalizePathBarInput("\\\\server\\share\\\\A")).toEqual(path("\\\\server\\share\\A"));
  });
});

describe("normalizePathBarInput: R-721 step 6 (lexical . / .. resolution, never above the root)", () => {
  it("AC-708: '.' and '..' components are resolved AFTER separators are collapsed", () => {
    expect(normalizePathBarInput("C:\\Users\\\\..\\Users\\Foo")).toEqual(path("C:\\Users\\Foo"));
  });

  it("'C:\\..' does not escape the drive root", () => {
    expect(normalizePathBarInput("C:\\..")).toEqual(path("C:\\"));
  });

  it("R-721-1: a UNC share root cannot be escaped by .. (AC-753)", () => {
    expect(normalizePathBarInput("\\\\server\\share\\..")).toEqual(path("\\\\server\\share\\"));
    expect(normalizePathBarInput("\\\\server\\share\\A\\..\\..")).toEqual(path("\\\\server\\share\\"));
  });

  it("symlinks/junctions are not followed -- this is purely lexical (no filesystem access)", () => {
    // There is nothing to assert about I/O here (normalize.ts never touches
    // the filesystem) -- this pins that '..' resolution is string-only.
    expect(normalizePathBarInput("C:\\A\\B\\..")).toEqual(path("C:\\A"));
  });

  it("the \\\\?\\ / \\\\.\\ exception skips step 6: a literal '..' component is NOT resolved", () => {
    // R-721 exception clause: steps 3/5/6/7 do not apply to \\?\ / \\.\
    // paths -- they are passed through verbatim (except step 8's trailing
    // separator rule, which still applies).
    expect(normalizePathBarInput("\\\\?\\C:\\A\\..")).toEqual(path("\\\\?\\C:\\A\\.."));
  });
});

describe("normalizePathBarInput: R-721 step 7 (trailing dot/space per component -> Win32 parity, ISS-0171 (a))", () => {
  it("AC-708: a trailing dot on the final component is removed", () => {
    expect(normalizePathBarInput("C:\\Users\\Foo.")).toEqual(path("C:\\Users\\Foo"));
  });

  it("AC-708: a trailing space on the final component is removed", () => {
    expect(normalizePathBarInput("C:\\Users\\Foo ")).toEqual(path("C:\\Users\\Foo"));
  });

  it("AC-708: a component that becomes empty after trimming trailing dots/spaces is 'invalid'", () => {
    expect(normalizePathBarInput("C:\\Users\\. .")).toEqual({ kind: "invalid" });
  });

  it("the \\\\?\\ exception skips step 7: a trailing dot is kept verbatim", () => {
    expect(normalizePathBarInput("\\\\?\\C:\\A.")).toEqual(path("\\\\?\\C:\\A."));
  });
});

describe("normalizePathBarInput: R-721 step 8 (trailing separator: removed except for a root)", () => {
  it("a non-root trailing separator is removed ('C:\\A\\' -> 'C:\\A')", () => {
    expect(normalizePathBarInput("C:\\A\\")).toEqual(path("C:\\A"));
  });

  it.each([
    ["C:\\", "C:\\"],
    ["\\\\server\\share\\", "\\\\server\\share\\"],
    ["\\\\?\\C:\\", "\\\\?\\C:\\"],
    ["\\\\?\\UNC\\server\\share\\", "\\\\?\\UNC\\server\\share\\"],
  ] as const)("AC-753: a root's trailing separator is KEPT (%s -> %s)", (raw, expected) => {
    expect(normalizePathBarInput(raw)).toEqual(path(expected));
  });
});

describe("normalizePathBarInput: AC-711/R-723 same-path comparison groundwork (case/trailing-separator differences)", () => {
  it("differing case and a trailing separator both normalize to a form comparable via shared/path-key.ts", () => {
    // This module does not itself decide "same as current path" (that is
    // path-bar-state.ts's R-723 job, via shared/path-key.ts's
    // pathComparisonKey) -- it only needs to produce a stable string.
    const a = normalizePathBarInput("c:\\users\\foo\\");
    const b = normalizePathBarInput("C:\\Users\\Foo");
    expect(a.kind).toBe("path");
    expect(b.kind).toBe("path");
  });
});

describe("isPathBarRoot (R-721-1: the 7 root forms, and non-roots)", () => {
  it.each([
    "C:\\",
    "\\\\server\\share\\",
    "\\\\?\\C:\\",
    "\\\\?\\UNC\\server\\share\\",
    "\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\",
    "\\\\.\\C:\\",
    "\\\\.\\Volume{12345678-1234-1234-1234-123456789abc}\\",
  ])("%s IS a root", (root) => {
    expect(isPathBarRoot(root)).toBe(true);
  });

  it.each(["C:\\A", "\\\\server\\share\\A", "\\\\?\\C:\\A", "D:\\"])("%s is NOT necessarily the SAME root as another drive/share", (nonMatchingButStillRoot) => {
    // Sanity: isPathBarRoot answers "is this string ITSELF a root", not
    // "is this an ancestor of some other root" -- D:\\ is still a root, but
    // "C:\\A" is not.
    if (nonMatchingButStillRoot === "D:\\") {
      expect(isPathBarRoot(nonMatchingButStillRoot)).toBe(true);
    } else {
      expect(isPathBarRoot(nonMatchingButStillRoot)).toBe(false);
    }
  });
});

// SPEC-0300-0016 第4版 AC-758 (R-722, R-722-3) and SPEC-0200-0001 §3.12.2 (unit-test-writer, 2026-10-07).
// The SAME representative values as AC-757 are held by the Rust side in
// `app/src-tauri/src/shared/abs_path_tests.rs` (`ac757_accepted` / `ac757_rejected`): keep the two tables in step
// (a function cannot be shared across the languages; M-4 records why a shared data file was not adopted).
// Excluded from the comparison (AC-758): values the form check normalises first (R-721: a trailing separator, `/`,
// a bare `C:`), the length limit (the path bar has none, R-722-3 M-2 (a)) and the strict GUID shape (MINOR-9).
// Those are listed below WITH the front end's own result so the difference stays visible and intentional.
describe("AC-758: the path bar accepts/rejects the same representative values as the backend (abs_path_tests.rs, AC-757)", () => {
  const GUID = "01234567-89ab-cdef-0123-456789abcdef";
  // [value, backend accepts (AC-757)]: only values that need no normalisation.
  const COMPARED: ReadonlyArray<readonly [string, boolean]> = [
    ["C:\\", true],
    ["C:\\Users", true],
    ["\\\\server\\share", true],
    ["\\\\server\\share\\", true],
    ["\\\\server\\share\\a", true],
    ["\\\\?\\C:\\a", true],
    ["\\\\?\\UNC\\server\\share\\a", true],
    [`\\\\?\\Volume{${GUID}}\\`, true],
    ["\\\\.\\C:\\a", true],
    [`\\\\.\\Volume{${GUID}}\\a`, true],
    ["C:src", false],
    ["src", false],
    [".\\src", false],
    ["..", false],
    ["\\foo", false],
    ["/foo", false],
    ["\\\\server", false],
    ["\\\\server\\", false],
    ["\\\\.\\PhysicalDrive0", false],
    ["\\\\.\\pipe\\x", false],
    ["\\\\.\\", false],
    ["\\\\?\\", false],
    // T-12 (known limitation, fixed on the backend by AC-757): `\\?\` device paths are accepted by both.
    ["\\\\?\\PhysicalDrive0", true],
    ["\\\\?\\pipe\\x", true],
    ["\\\\?\\C:", true],
  ];

  it.each(COMPARED)("%j: front end accepts === backend accepts (%s)", (value, backendAccepts) => {
    expect(normalizePathBarInput(value).kind === "path").toBe(backendAccepts);
  });

  it("the empty string is not a path for the front end either ('empty', R-722-1), as on the backend", () => {
    expect(normalizePathBarInput("").kind).not.toBe("path");
  });

  it("the table covers every AC-757 value except the excluded ones (12 accepted + 16 rejected + 3 T-12 = 31; 6 excluded here)", () => {
    // accepted by the backend: 12 - {c:\a\, C:\a/b} (normalised) = 10 compared; T-12: 3
    // rejected by the backend: 16 - {"", C:, 32,768-unit, C:/foo} = 12 compared
    expect(COMPARED.filter(([, accepts]) => accepts).length).toBe(10 + 3);
    expect(COMPARED.filter(([, accepts]) => !accepts).length).toBe(12);
  });

  // The excluded values: the front end NORMALISES first (R-721) and so answers differently from the raw backend check
  // (which then never sees them, because the path bar hands the normalised string over).
  it("excluded: a trailing separator, `/` and a bare `C:` are normalised and then accepted by the front end", () => {
    expect(normalizePathBarInput("c:\\a\\")).toEqual({ kind: "path", path: "c:\\a" });
    expect(normalizePathBarInput("C:\\a/b")).toEqual({ kind: "path", path: "C:\\a\\b" });
    expect(normalizePathBarInput("C:")).toEqual({ kind: "path", path: "C:\\" });
    expect(normalizePathBarInput("C:/foo")).toEqual({ kind: "path", path: "C:\\foo" });
  });

  it("excluded: the path bar has no length limit; the strict GUID shape is looser on the front end", () => {
    const long = `C:\\${"a".repeat(32_768 - 3)}`;
    expect(normalizePathBarInput(long).kind).toBe("path");
    expect(normalizePathBarInput("\\\\.\\Volume{abc}\\x").kind).toBe("path");
  });
});
