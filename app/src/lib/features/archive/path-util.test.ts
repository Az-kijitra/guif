import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0014 R-321 / R-342 (default paths are built by joining a
//   directory and a name), R-398 (after a success the focus goes to the
//   created ZIP / the extraction folder only when it is DIRECTLY under the
//   displayed directory: dirname(result) compared with the current path),
//   AC-385.
// Architecture: SPEC-0200-0001 §3.4.6 (path-util.ts: join / dirname / basename
//   / samePath; Windows AND POSIX separators; used to compute the focus
//   target), §3.4.13-8 SHOULD-97 (samePath on Windows does not distinguish case
//   or separators; the reload `focusPath` comparison follows the same rule;
//   focusPath = join(ctx.currentPath, basename(result)) so it matches the
//   displayed directory's own spelling).
// Module under test (not yet implemented): ./path-util.ts (pure functions).
//   features/archive must not import features/file-ops (§4.1), so this module
//   is its own small copy of the path helpers.

import { basename, dirname, joinPath, samePath } from "./path-util";

describe("joinPath (R-321, R-342, R-398)", () => {
  it("joins a Windows directory and a name with a backslash", () => {
    expect(joinPath("C:\\work", "a.zip")).toBe("C:\\work\\a.zip");
  });

  it("does not double the separator when the directory already ends with one (drive root)", () => {
    expect(joinPath("C:\\", "a.zip")).toBe("C:\\a.zip");
    expect(joinPath("C:\\work\\", "a.zip")).toBe("C:\\work\\a.zip");
  });

  it("joins a POSIX directory with a slash", () => {
    expect(joinPath("/home/u", "a.zip")).toBe("/home/u/a.zip");
    expect(joinPath("/", "a.zip")).toBe("/a.zip");
  });

  it("keeps non-ASCII names intact", () => {
    expect(joinPath("C:\\作業", "資料.txt.zip")).toBe("C:\\作業\\資料.txt.zip");
  });
});

describe("dirname (R-398: is the result directly under the displayed directory?)", () => {
  it("Windows: parent directory of a file / folder path", () => {
    expect(dirname("C:\\work\\a.zip")).toBe("C:\\work");
    expect(dirname("C:\\work\\a\\b")).toBe("C:\\work\\a");
  });

  it("Windows: a direct child of the drive root has the root (with its separator) as parent", () => {
    expect(dirname("C:\\a.zip")).toBe("C:\\");
  });

  it("POSIX", () => {
    expect(dirname("/home/u/a.zip")).toBe("/home/u");
    expect(dirname("/a.zip")).toBe("/");
  });

  it("mixed separators are both treated as separators", () => {
    expect(dirname("C:\\work/a.zip")).toBe("C:\\work");
  });
});

describe("basename", () => {
  it("returns the last component for both separators", () => {
    expect(basename("C:\\work\\a.zip")).toBe("a.zip");
    expect(basename("/home/u/a.zip")).toBe("a.zip");
    expect(basename("C:\\work/a.zip")).toBe("a.zip");
  });

  it("ignores a trailing separator (a folder path)", () => {
    expect(basename("C:\\work\\docs\\")).toBe("docs");
    expect(basename("/home/u/docs/")).toBe("docs");
  });

  it("a bare name is returned as is", () => {
    expect(basename("a.zip")).toBe("a.zip");
  });
});

describe("samePath (SHOULD-97, R-398)", () => {
  it("does not distinguish case (Windows)", () => {
    expect(samePath("C:\\Work\\Docs", "c:\\work\\docs")).toBe(true);
  });

  it("does not distinguish `\\` from `/`", () => {
    expect(samePath("C:\\work\\docs", "C:/work/docs")).toBe(true);
    expect(samePath("C:\\work/docs", "C:\\work\\docs")).toBe(true);
  });

  it("ignores a trailing separator", () => {
    expect(samePath("C:\\work\\", "C:\\work")).toBe(true);
    expect(samePath("C:\\work", "C:\\work\\")).toBe(true);
  });

  it("different paths are different (a sibling / a child / a parent is not the same)", () => {
    expect(samePath("C:\\work", "C:\\work2")).toBe(false);
    expect(samePath("C:\\work", "C:\\work\\a")).toBe(false);
    expect(samePath("C:\\work\\a", "C:\\work")).toBe(false);
    expect(samePath("C:\\work", "D:\\work")).toBe(false);
  });

  it("is symmetric and reflexive", () => {
    expect(samePath("C:\\a", "C:\\a")).toBe(true);
    expect(samePath("C:\\A", "c:/a")).toBe(samePath("c:/a", "C:\\A"));
  });

  it("the drive root compares equal to itself with or without the separator", () => {
    expect(samePath("C:\\", "C:\\")).toBe(true);
    expect(samePath("C:\\", "c:/")).toBe(true);
  });
});
