import { describe, expect, it } from "vitest";
import { buildPathsClipboardText, COPY_PATH_FAILED, formatCopyPathStatus } from "./copy-path-text";

// Spec: SPEC-0300-0018 R-1060-1 (path string as-is: `\\?\` prefix and case kept,
//   NO quotes, folders get NO trailing separator), R-1060-2 (display order,
//   CRLF separator, NO trailing newline), R-1060-3 (success status
//   `パスをコピーしました({n} 件)`; G-1 failure text `パスをコピーできませんでした`),
//   AC-1050.
// Architecture: SPEC-0200-0001 §3.9.8. Module under test (stub): ./copy-path-text.ts

describe("buildPathsClipboardText (AC-1050)", () => {
  it("1 path: the path itself, no quotes, no newline", () => {
    expect(buildPathsClipboardText(["C:\\work\\a.txt"])).toBe("C:\\work\\a.txt");
  });

  it("3 paths: joined by CRLF in the given (display) order, no trailing newline", () => {
    const text = buildPathsClipboardText(["C:\\w\\b.txt", "C:\\w\\a.txt", "C:\\w\\d"]);
    expect(text).toBe("C:\\w\\b.txt\r\nC:\\w\\a.txt\r\nC:\\w\\d");
    expect(text.endsWith("\n")).toBe(false);
    expect(text.split("\r\n")).toHaveLength(3);
  });

  it("uses CRLF only, never a bare LF", () => {
    const text = buildPathsClipboardText(["x", "y", "z"]);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("keeps a `\\\\?\\` prefix and the original letter case untouched", () => {
    const p = "\\\\?\\C:\\Users\\Foo\\Bar.TXT";
    expect(buildPathsClipboardText([p])).toBe(p);
  });

  it("a folder path gets no trailing separator and no quotes (only what was passed)", () => {
    expect(buildPathsClipboardText(["C:\\w\\d"])).toBe("C:\\w\\d");
    expect(buildPathsClipboardText(["C:\\w\\d"])).not.toMatch(/["\\/]$/);
    expect(buildPathsClipboardText(["C:\\w\\d", "C:\\w\\a.txt"])).not.toContain('"');
  });

  it("paths containing spaces are not quoted", () => {
    expect(buildPathsClipboardText(["C:\\My Docs\\a b.txt"])).toBe("C:\\My Docs\\a b.txt");
  });

  it("an empty list yields an empty string", () => {
    expect(buildPathsClipboardText([])).toBe("");
  });
});

describe("status texts (R-1060-3, G-1)", () => {
  it("success: パスをコピーしました({n} 件) with full-width parentheses and a space before 件", () => {
    expect(formatCopyPathStatus(2)).toBe("パスをコピーしました(2 件)");
    expect(formatCopyPathStatus(1)).toBe("パスをコピーしました(1 件)");
  });

  it("failure text is パスをコピーできませんでした", () => {
    expect(COPY_PATH_FAILED).toBe("パスをコピーできませんでした");
  });
});
