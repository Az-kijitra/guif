import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1530 (the target of the key / the menu bar is the FOCUS ROW only -- never the selection: several selected, the
//   focus row outside the selection, all irrelevant), R-1531 (no focus row -- an empty folder, a search that shows nothing -- means the
//   CURRENT FOLDER, treated as a folder), R-1534 (a `.zip` is a normal file), R-1560 (the only disabled case: no target can be decided
//   -- the current folder is unknown; the reason is W-9D `対象がありません`), R-1561, AC-1541, AC-1543 (unit part), AC-1512 / AC-1513 (unit part).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/target.ts`: `decideTarget({ focusRow, currentPath }) -> {path, kind} | null`,
//   `isAvailable`), §3.16.8 (the menu bar's availability = "a target can be decided").
//
// Contract assumed (reported to the implementer):
//   interface Target { path: string; kind: "file" | "dir" }
//   decideTarget(input: { focusRow: { path: string; entryType: "file" | "dir" } | null; currentPath: string }): Target | null
//     - focusRow !== null            -> { path: focusRow.path, kind: focusRow.entryType }       (nothing else of the list is consulted)
//     - focusRow === null, currentPath !== "" -> { path: currentPath, kind: "dir" }
//     - otherwise                    -> null
//   isAvailable(target: Target | null): { enabled: boolean; reason?: string }       // enabled unless null; reason = SHARED_SENTENCES.noTarget
//
// Module under test (not yet implemented): ./target.ts

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { decideTarget, isAvailable } from "./target";

const row = (path: string, entryType: "file" | "dir") => ({ path, entryType });

describe("decideTarget: the focus row (R-1530)", () => {
  it("a file row is a file target", () => {
    expect(decideTarget({ focusRow: row("C:\\w\\a b.txt", "file"), currentPath: "C:\\w" })).toEqual({ path: "C:\\w\\a b.txt", kind: "file" });
  });

  it("a folder row is a folder target", () => {
    expect(decideTarget({ focusRow: row("C:\\w\\d", "dir"), currentPath: "C:\\w" })).toEqual({ path: "C:\\w\\d", kind: "dir" });
  });

  it("AC-1541: a .zip file is an ordinary file", () => {
    expect(decideTarget({ focusRow: row("C:\\w\\archive.zip", "file"), currentPath: "C:\\w" })).toEqual({ path: "C:\\w\\archive.zip", kind: "file" });
    expect(decideTarget({ focusRow: row("C:\\w\\ARCHIVE.ZIP", "file"), currentPath: "C:\\w" })?.kind).toBe("file");
  });

  it("the paths are passed exactly as the list has them (no normalisation, no trailing separator change)", () => {
    expect(decideTarget({ focusRow: row("C:\\", "dir"), currentPath: "C:\\" })?.path).toBe("C:\\");
    expect(decideTarget({ focusRow: row("\\\\srv\\sh\\", "dir"), currentPath: "\\\\srv\\sh\\" })?.path).toBe("\\\\srv\\sh\\");
    expect(decideTarget({ focusRow: row("C:\\w\\x;y&z%.txt", "file"), currentPath: "C:\\w" })?.path).toBe("C:\\w\\x;y&z%.txt");
  });

  it("the current path is not used when there is a focus row", () => {
    expect(decideTarget({ focusRow: row("C:\\other\\a.txt", "file"), currentPath: "C:\\w" })?.path).toBe("C:\\other\\a.txt");
    expect(decideTarget({ focusRow: row("C:\\w\\a.txt", "file"), currentPath: "" })?.path).toBe("C:\\w\\a.txt");
  });

  it("the function takes no selection: its input has only the focus row and the current path", () => {
    // AC-1512: `a.txt` `b.txt` are selected but the focus row is `c.txt` -> the target is c.txt. The input type cannot even carry a selection.
    const input = { focusRow: row("C:\\w\\c.txt", "file"), currentPath: "C:\\w" };
    expect(Object.keys(input).sort()).toEqual(["currentPath", "focusRow"]);
    expect(decideTarget(input)?.path).toBe("C:\\w\\c.txt");
  });
});

describe("decideTarget: no focus row means the current folder (R-1531, AC-1513)", () => {
  it("is treated as a folder: path = the current folder", () => {
    expect(decideTarget({ focusRow: null, currentPath: "C:\\w\\e" })).toEqual({ path: "C:\\w\\e", kind: "dir" });
    expect(decideTarget({ focusRow: null, currentPath: "C:\\" })).toEqual({ path: "C:\\", kind: "dir" });
    expect(decideTarget({ focusRow: null, currentPath: "\\\\srv\\sh" })).toEqual({ path: "\\\\srv\\sh", kind: "dir" });
  });

  it("no focus row and no current folder: no target", () => {
    expect(decideTarget({ focusRow: null, currentPath: "" })).toBeNull();
  });
});

describe("isAvailable (R-1560, AC-1541)", () => {
  it("is disabled ONLY when no target can be decided, with the shared W-9D sentence", () => {
    expect(isAvailable(null)).toEqual({ enabled: false, reason: SHARED_SENTENCES.noTarget });
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
  });

  it("a folder, an ordinary file and a .zip file are all enabled, without a reason", () => {
    for (const t of [
      { path: "C:\\w\\d", kind: "dir" as const },
      { path: "C:\\w\\a.txt", kind: "file" as const },
      { path: "C:\\w\\a.zip", kind: "file" as const },
    ]) {
      const r = isAvailable(t);
      expect(r.enabled, t.path).toBe(true);
      expect(r.reason, t.path).toBeUndefined();
    }
  });

  it("the many-selected case never disables it: the function does not even know the selection", () => {
    expect(isAvailable.length).toBe(1);
  });
});
