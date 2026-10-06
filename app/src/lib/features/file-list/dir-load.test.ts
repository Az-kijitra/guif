import { describe, expect, it } from "vitest";
import {
  affectsDirectoryReload,
  computeGoParentTarget,
  resetListStateOnDirChange,
  resolveOpenTarget,
} from "./dir-load";

// Spec: SPEC-0300-0009 (file list / tree view detail) R-72, R-23, R-61, R-63
// Module under test (not yet implemented): ./dir-load.ts
//
// R-72: opening a directory resets selection (empty), focus (first entry) and
// the range-selection anchor (none).
// Note: R-76-2 (preserving selection/focus across *file-watch* driven reloads)
// is explicitly out of scope here — it is a different trigger than a
// user-initiated directory change, and its edge cases are recorded as TBD
// (SPEC-0300-0009 §9-i); no test is written for behavior that is not yet
// determined by the spec.

describe("resetListStateOnDirChange (SPEC-0300-0009 R-72, AC-40)", () => {
  it("AC-40: clears the selection set", () => {
    const state = resetListStateOnDirChange();
    expect(state.selected).toEqual(new Set());
  });

  it("AC-40: resets focus to the first entry (index 0)", () => {
    const state = resetListStateOnDirChange();
    expect(state.focusedIndex).toBe(0);
  });

  it("AC-40: clears the range-selection anchor", () => {
    const state = resetListStateOnDirChange();
    expect(state.anchor).toBeNull();
  });
});

describe("affectsDirectoryReload (SPEC-0300-0009 R-23, AC-15)", () => {
  it("AC-15: toggling the size column does not trigger a directory reload", () => {
    expect(affectsDirectoryReload("toggle_size")).toBe(false);
  });

  it("AC-15: toggling the modified-time column does not trigger a directory reload", () => {
    expect(affectsDirectoryReload("toggle_time")).toBe(false);
  });

  it("opening a directory does trigger a reload (contrast case)", () => {
    expect(affectsDirectoryReload("open")).toBe(true);
  });

  it("go_parent does trigger a reload (contrast case)", () => {
    expect(affectsDirectoryReload("go_parent")).toBe(true);
  });
});

describe("computeGoParentTarget (SPEC-0300-0009 R-63, AC-47)", () => {
  it("AC-47: returns the parent path even when the current directory listing is empty", () => {
    const target = computeGoParentTarget({ currentPath: "C:/root/empty-dir", visibleCount: 0 });
    expect(target).toEqual({ shouldNavigate: true, path: "C:/root" });
  });

  it("returns the parent path when the current directory has entries too", () => {
    const target = computeGoParentTarget({ currentPath: "C:/root/dir", visibleCount: 12 });
    expect(target).toEqual({ shouldNavigate: true, path: "C:/root" });
  });

  it("does not navigate further when already at a filesystem root", () => {
    const target = computeGoParentTarget({ currentPath: "C:/", visibleCount: 0 });
    expect(target.shouldNavigate).toBe(false);
  });

  // Regression (2026-10-06, user report): "C:\Users" went up to "C:" (no separator), which Windows
  // resolves as the process's CURRENT directory on drive C; opening a folder there then produced the
  // drive-relative "C:src", from which go_parent could not move at all.
  it("a direct child of a drive root goes up to the root WITH its separator", () => {
    expect(computeGoParentTarget({ currentPath: "C:\\Users", visibleCount: 3 })).toEqual({ shouldNavigate: true, path: "C:\\" });
    expect(computeGoParentTarget({ currentPath: "C:\\Users\\", visibleCount: 3 })).toEqual({ shouldNavigate: true, path: "C:\\" });
    expect(computeGoParentTarget({ currentPath: "d:/data", visibleCount: 0 })).toEqual({ shouldNavigate: true, path: "d:/" });
  });

  it("deeper Windows paths keep going up one level at a time", () => {
    expect(computeGoParentTarget({ currentPath: "C:\\Users\\toshi", visibleCount: 1 })).toEqual({ shouldNavigate: true, path: "C:\\Users" });
  });

  it("drive roots in every spelling are roots", () => {
    for (const root of ["C:\\", "C:", "\\\\?\\C:\\", "\\\\.\\C:\\"]) {
      expect(computeGoParentTarget({ currentPath: root, visibleCount: 0 }).shouldNavigate).toBe(false);
    }
  });

  it("UNC: a share is a root, and its direct child goes up to the share root with its separator", () => {
    expect(computeGoParentTarget({ currentPath: "\\\\server\\share\\", visibleCount: 0 }).shouldNavigate).toBe(false);
    expect(computeGoParentTarget({ currentPath: "\\\\server\\share", visibleCount: 0 }).shouldNavigate).toBe(false);
    expect(computeGoParentTarget({ currentPath: "\\\\server\\share\\dir", visibleCount: 0 })).toEqual({ shouldNavigate: true, path: "\\\\server\\share\\" });
    expect(computeGoParentTarget({ currentPath: "\\\\server\\share\\dir\\sub", visibleCount: 0 })).toEqual({ shouldNavigate: true, path: "\\\\server\\share\\dir" });
  });

  it("namespace paths: a direct child of \\\\?\\C:\\ goes up to that root with its separator", () => {
    expect(computeGoParentTarget({ currentPath: "\\\\?\\C:\\dir", visibleCount: 0 })).toEqual({ shouldNavigate: true, path: "\\\\?\\C:\\" });
  });

  it("never navigates to or from a drive-relative path such as C:src", () => {
    expect(computeGoParentTarget({ currentPath: "C:src", visibleCount: 3 }).shouldNavigate).toBe(false);
    expect(computeGoParentTarget({ currentPath: "C:src\\sub", visibleCount: 3 }).shouldNavigate).toBe(false);
  });
});

describe("resolveOpenTarget (SPEC-0300-0009 R-61, §8.1 / SPEC-0300-0010 AC-09)", () => {
  it("AC-09/AC-46: opening a focused directory entry requests navigation into it", () => {
    const target = resolveOpenTarget({ type: "dir", path: "C:/root/dir" });
    expect(target).toEqual({ action: "open-directory", path: "C:/root/dir" });
  });

  it("§8.1: opening a focused file entry is a no-op in Phase 1 (viewer integration deferred)", () => {
    const target = resolveOpenTarget({ type: "file", path: "C:/root/a.txt" });
    expect(target).toEqual({ action: "noop" });
  });
});
