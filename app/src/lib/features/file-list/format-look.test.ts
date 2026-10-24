import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1780 (the mark column: `* ` when selected, two spaces otherwise; no emoji), R-1781 (`<DIR>` for a folder, files in the
//   R-20-11 format), R-1785 4 (executable: files whose name ends in .exe .bat .cmd .ps1, case-INSENSITIVE; T-25), AC-1780, AC-1722.
// Architecture: SPEC-0200-0001 §3.18.7: `features/file-list/format.ts` gains (pure):
//   formatSizeCell(isDir: boolean, bytes: number): string      // "<DIR>" for a folder, otherwise formatSize(bytes)
//   isExecutableName(name: string): boolean                     // the caller applies it to files only
//   selectionMark(selected: boolean): string                    // "* " / "  " (2 characters = the 2ch mark column)
//
// Module under test (not yet implemented): ./format.ts (new exports)

import { formatSizeCell, isExecutableName, selectionMark } from "./format";

describe("formatSizeCell (R-1781, AC-1780)", () => {
  it("a folder is `<DIR>` whatever its size value", () => {
    expect(formatSizeCell(true, 0)).toBe("<DIR>");
    expect(formatSizeCell(true, 4096)).toBe("<DIR>");
  });

  it("a file uses the R-20-11 format: 1,536 B -> `1.5 KB`; 12,582,912 B -> `12.0 MB`; 12 B -> `12 B`", () => {
    expect(formatSizeCell(false, 1536)).toBe("1.5 KB");
    expect(formatSizeCell(false, 12582912)).toBe("12.0 MB");
    expect(formatSizeCell(false, 12)).toBe("12 B");
  });

  it("an empty file is `0 B` (not blank, not `<DIR>`)", () => {
    expect(formatSizeCell(false, 0)).toBe("0 B");
  });
});

describe("isExecutableName (R-1785 4, T-25)", () => {
  it.each(["a.exe", "b.bat", "c.cmd", "d.ps1", "A.EXE", "B.Bat", "run.CMD", "x.Ps1", "my.tool.exe"])("%s is executable", (n) => {
    expect(isExecutableName(n)).toBe(true);
  });

  it.each(["a.txt", "exe", "a.exe.txt", "a.exex", "a.com", "a.sh", "a.py", ".exe.bak", "a.ps2", ""])("%s is not", (n) => {
    expect(isExecutableName(n)).toBe(false);
  });

  it("a name that is only the extension (`.exe`) is treated like tuif's ends-with check: executable", () => {
    expect(isExecutableName(".exe")).toBe(true);
  });
});

describe("selectionMark (R-1780, R-1783)", () => {
  it("`* ` when selected, two spaces otherwise; always 2 characters", () => {
    expect(selectionMark(true)).toBe("* ");
    expect(selectionMark(false)).toBe("  ");
  });
});
