import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0013 R-207/R-207-1/R-207-2 (ISS-0076); SPEC-0300-0009
//   R-40-6.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.10,
//   §3.6.11.11 SHOULD-129: `normalizeStoredForm`/`pathComparisonKey` are
//   extracted from `features/navigation-history/list-ops.ts` into this new,
//   feature-independent `shared/path-key.ts` (mirroring `shared/mru-list.ts`'s
//   position) so BOTH `navigation-history` (R-207) and `file-list`'s tree
//   (R-40-6) can use the SAME comparison rules without an illegal
//   feature-to-feature import (§4.1). SHOULD-129 condition 1: `list-ops.ts`
//   re-exports these two names from here so its own existing tests keep
//   passing unmodified.
// SHOULD-129 condition 2 (out of scope for this file): the `\\?\` prefix
//   stripping (R-40-0) and volume-GUID/device-namespace exclusion
//   (R-40-0-1) are tree-specific rules and stay in `features/file-list/
//   tree.ts`, not here.
//
// Module under test (not yet implemented): ./path-key.ts. This file
// reproduces the exact behavior already pinned (and passing) against
// `features/navigation-history/list-ops.ts`'s CURRENT implementation in
// `list-ops.test.ts`, so the extraction is a pure move with zero behavior
// change (list-ops.test.ts itself is left untouched, per SHOULD-129
// condition 1 -- it will keep passing once list-ops.ts re-exports these).

import { normalizeStoredForm, pathComparisonKey } from "./path-key";

describe("normalizeStoredForm / pathComparisonKey (SPEC-0300-0013 R-207, SPEC-0200-0001 §3.2.10)", () => {
  it("(a) preserves case in the stored form but folds it in the comparison key", () => {
    expect(normalizeStoredForm("C:\\Users\\Foo")).toBe("C:\\Users\\Foo");
    expect(normalizeStoredForm("C:\\users\\foo")).toBe("C:\\users\\foo");
    expect(pathComparisonKey("C:\\Users\\Foo")).toBe(pathComparisonKey("C:\\users\\foo"));
    expect(pathComparisonKey("C:\\Users\\Foo")).toBe("c:\\users\\foo");
  });

  it("(b) unifies '/' and '\\' separators", () => {
    expect(normalizeStoredForm("C:/Users/Foo/Bar")).toBe("C:\\Users\\Foo\\Bar");
    expect(pathComparisonKey("C:/Users/Foo/Bar")).toBe(pathComparisonKey("C:\\Users\\Foo\\Bar"));
  });

  it("(c) strips a trailing separator for an ordinary (non-root) path", () => {
    expect(normalizeStoredForm("C:\\Users\\Foo\\")).toBe("C:\\Users\\Foo");
    expect(pathComparisonKey("C:\\Users\\Foo\\")).toBe(pathComparisonKey("C:\\Users\\Foo"));
  });

  it("(d) a bare drive letter completes to the drive root, WITH a trailing separator (SHOULD-129 condition 3)", () => {
    expect(normalizeStoredForm("C:")).toBe("C:\\");
    expect(normalizeStoredForm("C:\\")).toBe("C:\\");
    expect(pathComparisonKey("C:")).toBe(pathComparisonKey("C:\\"));
  });

  it("(e) a UNC share root strips its trailing separator like an ordinary path", () => {
    expect(normalizeStoredForm("\\\\server\\share")).toBe("\\\\server\\share");
    expect(normalizeStoredForm("\\\\server\\share\\")).toBe("\\\\server\\share");
    expect(pathComparisonKey("\\\\server\\share")).toBe(pathComparisonKey("\\\\server\\share\\"));
  });

  it("(e) a UNC path with a subdirectory strips only the trailing separator", () => {
    expect(normalizeStoredForm("\\\\server\\share\\sub\\")).toBe("\\\\server\\share\\sub");
  });

  it("(f) collapses consecutive separators", () => {
    expect(normalizeStoredForm("C:\\a\\\\b")).toBe("C:\\a\\b");
    expect(pathComparisonKey("C:\\a\\\\b")).toBe(pathComparisonKey("C:\\a\\b"));
  });

  it("(g) collapses consecutive separators between the UNC server and share names too (SHOULD-73 regression)", () => {
    expect(normalizeStoredForm("\\\\server\\\\\\share")).toBe("\\\\server\\share");
    expect(normalizeStoredForm("\\\\server\\\\\\share")).not.toBe("\\server\\share");
  });

  it("leaves an already-canonical path unchanged", () => {
    expect(normalizeStoredForm("C:\\Users\\Foo\\Bar")).toBe("C:\\Users\\Foo\\Bar");
  });
});
