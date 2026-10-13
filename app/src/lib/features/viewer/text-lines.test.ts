import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-460 (line numbers from 1), R-462-1 (the gutter column and the single body <pre> have the
//   same number of rows), R-463 (an empty file is one empty line numbered 1), R-463-1 (承認後の追補: a final newline gives a
//   last EMPTY line that is numbered too; `a\nb\n` is 3 lines), R-445-4 (the line limit counts the same way), AC-523 (a) and
//   the `a\nb\n` clause.
// Architecture: SPEC-0200-0001 §3.14.5 (two-column text view; `lineCount()` is the pure function shared with the highlight
//   chunking; the gutter is ONE text node "1\n2\n...\nN"; a `<span class="tail">` is placed only when the body ends with
//   "\n", because a <pre> makes no empty line box for a trailing newline alone), §3.14.12-4(c).
//
//
// Contract assumed (reported to the implementer):
//   lineCount(content: string): number            // === content.split("\n").length  (the current behaviour is kept)
//   gutterText(count: number): string             // "1\n2\n...\n<count>"  (no trailing newline)
//   needsTailSpacer(content: string): boolean     // true iff the body ends with "\n" (the <span class="tail"> is rendered)
//
// Module under test (not yet implemented): ./text-lines.ts

import { gutterText, lineCount, needsTailSpacer } from "./text-lines";

describe("lineCount: the same number as content.split('\\n').length (R-463, R-463-1)", () => {
  it.each([
    ["", 1], // R-463: an empty file is one empty line
    ["a", 1],
    ["a\n", 2], // the final newline gives an empty last line
    ["a\nb", 2],
    ["a\nb\n", 3], // R-463-1 / AC-523: line numbers 1~3, the third is empty
    ["\n", 2],
    ["\n\n", 3],
    ["a\n\nb", 3], // an empty line in the middle counts
  ] as const)("%j -> %i", (content, expected) => {
    expect(lineCount(content)).toBe(expected);
  });

  it("the kind of newline does not change the count: CRLF text (as decoded) counts like LF text (R-463-1: 改行の種類によらず同じ)", () => {
    expect(lineCount("a\r\nb\r\n")).toBe(3);
    expect(lineCount("a\r\nb\r\n")).toBe(lineCount("a\nb\n"));
  });

  it("matches the old implementation for any input (split-based)", () => {
    for (const s of ["x", "x\ny", "\t\n \n", "あ\nい\n"]) {
      expect(lineCount(s)).toBe(s.split("\n").length);
    }
  });

  it("120,000 lines (the R-445-4 limit) is counted exactly", () => {
    const body = Array.from({ length: 120000 }, () => "x").join("\n");
    expect(lineCount(body)).toBe(120000);
    expect(lineCount(body + "\n")).toBe(120001);
  });
});

describe("gutterText: one text node '1\\n2\\n...\\nN' (R-462-1, §3.14.5)", () => {
  it("N rows, numbered from 1, newline-separated, no trailing newline", () => {
    expect(gutterText(1)).toBe("1");
    expect(gutterText(3)).toBe("1\n2\n3");
    expect(gutterText(12)).toBe("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12");
  });

  it("AC-523 (a): the gutter rows equal the body rows for the same content, and the last number is the line count", () => {
    for (const content of ["", "a", "a\nb\n", Array.from({ length: 50 }, (_, i) => `l${i}`).join("\n")]) {
      const n = lineCount(content);
      const g = gutterText(n);
      expect(g.split("\n").length).toBe(n);
      expect(g.split("\n")[n - 1]).toBe(String(n));
    }
  });

  it("a 50-line file ends with `50` (AC-523 (a))", () => {
    const g = gutterText(lineCount(Array.from({ length: 50 }, () => "x").join("\n")));
    expect(g.endsWith("\n50")).toBe(true);
  });

  it("120,000 rows: 6-digit numbers are produced (the 72px column was sized for this, R-462-1)", () => {
    const g = gutterText(120000);
    expect(g.length).toBeGreaterThan(600000);
    expect(g.endsWith("\n120000")).toBe(true);
  });
});

describe("needsTailSpacer: the empty last line after a final newline (R-463-1; <pre> draws no line box for it)", () => {
  it("true only when the body ends with a newline", () => {
    expect(needsTailSpacer("a\nb\n")).toBe(true);
    expect(needsTailSpacer("\n")).toBe(true);
    expect(needsTailSpacer("a\nb")).toBe(false);
    expect(needsTailSpacer("a")).toBe(false);
    expect(needsTailSpacer("")).toBe(false); // the empty file is one empty line: the <pre> itself holds a (zero-width) row
  });

  it("is consistent with lineCount: a trailing-newline body has one more row than its newline-terminated lines", () => {
    expect(lineCount("a\nb\n") - "a\nb\n".split("\n").filter((l) => l !== "").length).toBe(1);
  });
});
