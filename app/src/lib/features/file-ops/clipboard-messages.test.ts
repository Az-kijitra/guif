import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0011 R-15-3 / CB-06 (status when the OS write failed),
//   R-19-5 / CB-13 (the notice appended to the paste result), R-19-5 (E1 consequence:
//   `cut-write-failed` wording).
// Architecture: SPEC-0200-0001 §3.10.8 (clipboard-messages.ts, pure).
// The strings are pinned VERBATIM against the specification text.

import { appendPasteNotice, formatCopyCutStatus } from "./clipboard-messages";

describe("formatCopyCutStatus (CB-06)", () => {
  it("success: {n}件をコピーしました / {n}件を切り取りました", () => {
    expect(formatCopyCutStatus("internal-copy", 3, "written")).toBe("3件をコピーしました");
    expect(formatCopyCutStatus("internal-cut", 1, "written")).toBe("1件を切り取りました");
  });

  it("not-applicable (no OS write) is worded like success", () => {
    expect(formatCopyCutStatus("internal-copy", 2, "not-applicable")).toBe("2件をコピーしました");
    expect(formatCopyCutStatus("internal-cut", 2, "not-applicable")).toBe("2件を切り取りました");
  });

  it("os failed: the wording + (OSのクリップボードには書き込めませんでした)", () => {
    expect(formatCopyCutStatus("internal-copy", 3, "failed")).toBe("3件をコピーしました(OSのクリップボードには書き込めませんでした)");
    expect(formatCopyCutStatus("internal-cut", 1, "failed")).toBe("1件を切り取りました(OSのクリップボードには書き込めませんでした)");
  });

  it("the parentheses are full-width-free ASCII ( ) exactly as in the specification", () => {
    const s = formatCopyCutStatus("internal-copy", 1, "failed");
    expect(s).toContain("(");
    expect(s.endsWith(")")).toBe(true);
    expect(s).not.toContain("（");
  });

  it("the count is printed as a plain number", () => {
    expect(formatCopyCutStatus("internal-copy", 12345, "written")).toBe("12345件をコピーしました");
    expect(formatCopyCutStatus("internal-copy", 0, "written")).toBe("0件をコピーしました");
  });
});

describe("appendPasteNotice (CB-13 / R-19-5)", () => {
  it("cut-changed", () => {
    expect(appendPasteNotice("2件をコピーしました", "cut-changed")).toBe(
      "2件をコピーしました(切り取りの後にクリップボードが変わったため、コピーしました)",
    );
  });

  it("cut-write-failed", () => {
    expect(appendPasteNotice("1件をコピーしました", "cut-write-failed")).toBe(
      "1件をコピーしました(切り取りをOSのクリップボードに書き込めなかったため、コピーしました)",
    );
  });

  it("no notice: the status is returned unchanged", () => {
    expect(appendPasteNotice("1件をコピーしました", undefined)).toBe("1件をコピーしました");
  });

  it("concatenates AFTER the status with no space or other separator", () => {
    const out = appendPasteNotice("X", "cut-changed");
    expect(out.startsWith("X(")).toBe(true);
  });

  it("works on any status text (also a failure summary)", () => {
    expect(appendPasteNotice("", "cut-changed")).toBe("(切り取りの後にクリップボードが変わったため、コピーしました)");
  });
});
