import { describe, expect, it } from "vitest";
import { resolveCopyCutTargets, resolveDeleteTargets, resolveRenameTarget } from "./target-resolution";

// Spec: SPEC-0300-0011 (file operations detail) §3.1
// Module under test (not yet implemented): ./target-resolution.ts
//
// R-10: copy/cut targets = selection, or the focused single entry when
//       selection is empty.
// R-11: delete targets follow the same rule as R-10.
// R-12: rename targets exactly one entry — a multi-selection has no valid
//       rename target at all (used to disable the rename menu item, AC-50).

describe("resolveCopyCutTargets (SPEC-0300-0011 R-10)", () => {
  it("AC-01: returns every selected path when multiple entries are selected", () => {
    const targets = resolveCopyCutTargets(["/a.txt", "/b.txt", "/c.txt"], "/a.txt");
    expect(targets).toEqual(["/a.txt", "/b.txt", "/c.txt"]);
  });

  it("AC-02: falls back to the focused entry when selection is empty", () => {
    const targets = resolveCopyCutTargets([], "/focused.txt");
    expect(targets).toEqual(["/focused.txt"]);
  });

  it("AC-03: returns an empty list when there is neither a selection nor a focus", () => {
    const targets = resolveCopyCutTargets([], null);
    expect(targets).toEqual([]);
  });
});

describe("resolveDeleteTargets (SPEC-0300-0011 R-11)", () => {
  it("AC-02: follows the same selection/focus rule as copy/cut", () => {
    expect(resolveDeleteTargets(["/a.txt", "/b.txt"], "/a.txt")).toEqual(["/a.txt", "/b.txt"]);
    expect(resolveDeleteTargets([], "/focused.txt")).toEqual(["/focused.txt"]);
    expect(resolveDeleteTargets([], null)).toEqual([]);
  });
});

describe("resolveRenameTarget (SPEC-0300-0011 R-12)", () => {
  it("returns the single focused entry when nothing is selected", () => {
    expect(resolveRenameTarget([], "/focused.txt")).toBe("/focused.txt");
  });

  it("returns the single selected entry when exactly one is selected", () => {
    expect(resolveRenameTarget(["/a.txt"], "/a.txt")).toBe("/a.txt");
  });

  it("AC-50: returns null when multiple entries are selected (no valid rename target)", () => {
    expect(resolveRenameTarget(["/a.txt", "/b.txt"], "/a.txt")).toBeNull();
  });

  it("returns null when there is neither a selection nor a focus", () => {
    expect(resolveRenameTarget([], null)).toBeNull();
  });
});
