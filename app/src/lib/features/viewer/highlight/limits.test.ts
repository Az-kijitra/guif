import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-466-5 (確定 T-17: the highlight limit is 1,000,000 characters of the decoded string, UTF-16
//   code units; over the limit the body is shown WITHOUT colour and nothing is announced; the limit is a constant, not a setting),
//   AC-527 (1,000,000 chars exactly -> coloured, 1,000,001 -> not).
// Architecture: SPEC-0200-0001 §3.14.7 ("`code.length > 1_000_000` なら送らない・通知しない").
//
//
// Contract assumed (reported to the implementer):
//   export const MAX_HIGHLIGHT_CHARS = 1_000_000;
//   canHighlight(code: string, language: string | null): boolean      // language !== null && code.length <= MAX_HIGHLIGHT_CHARS
//
// Module under test (not yet implemented): ./limits.ts

import { MAX_HIGHLIGHT_CHARS, MAX_HIGHLIGHT_LINE_CHARS, canHighlight, longestLineLength } from "./limits";

// R-466-5-1 (第10版): a body of exactly `total` UTF-16 units made of short lines (the total limit is tested without
// tripping the 10,000-unit line limit).
const shortLines = (total: number): string => ("x".repeat(99) + "\n").repeat(Math.floor(total / 100)).padEnd(total, "y");

describe("MAX_HIGHLIGHT_CHARS", () => {
  it("is exactly 1,000,000", () => {
    expect(MAX_HIGHLIGHT_CHARS).toBe(1_000_000);
  });
});

// `total` UTF-16 units made of astral characters (2 units each) in short lines.
const astralUnits = (total: number): string => {
  const r = total % 99;
  return ("😀".repeat(49) + "\n").repeat(Math.floor(total / 99)) + "😀".repeat(Math.floor(r / 2)) + (r % 2 === 1 ? "x" : "");
};

describe("canHighlight (AC-527)", () => {
  it("1,000,000 characters exactly: highlighted", () => {
    expect(canHighlight(shortLines(1_000_000), "typescript")).toBe(true);
  });

  it("1,000,001 characters: not highlighted", () => {
    expect(canHighlight(shortLines(1_000_001), "typescript")).toBe(false);
  });

  it("the unit is the UTF-16 code unit (`String.length`): astral characters totalling 1,000,000 units -> yes; 1,000,001 -> no", () => {
    expect(canHighlight(astralUnits(1_000_000), "rust")).toBe(true);
    expect(canHighlight(astralUnits(1_000_001), "rust")).toBe(false);
  });

  it("no language means no highlight, whatever the size", () => {
    expect(canHighlight("x", null)).toBe(false);
    expect(canHighlight("", null)).toBe(false);
  });

  it("an empty body with a language is allowed (nothing to colour, nothing wrong)", () => {
    expect(canHighlight("", "c")).toBe(true);
  });
});

describe("R-466-5-1 / AC-530: the longest line limit (10,000 UTF-16 units, newlines not counted)", () => {
  const withLongest = (n: number): string => "short\n" + "x".repeat(n) + "\nshort\n";

  it("the constant is 10,000", () => {
    expect(MAX_HIGHLIGHT_LINE_CHARS).toBe(10_000);
  });

  it("boundary: the longest line of exactly 10,000 is coloured, 10,001 is not (c.js / d.js)", () => {
    expect(canHighlight(withLongest(10_000), "javascript")).toBe(true);
    expect(canHighlight(withLongest(10_001), "javascript")).toBe(false);
  });

  it("\n and \r\n are not counted as part of the line", () => {
    expect(canHighlight("x".repeat(10_000) + "\n", "c")).toBe(true);
    expect(canHighlight("x".repeat(10_000) + "\r\n" + "y\r\n", "c")).toBe(true);
    expect(canHighlight("x".repeat(10_001) + "\r\n", "c")).toBe(false);
    expect(longestLineLength("ab\r\ncde\r\n")).toBe(3);
    expect(longestLineLength("a\n\n\nbc")).toBe(2);
  });

  it("surrogate pairs count as two units: 5,000 astral characters = 10,000 (yes), 5,001 = 10,002 (no)", () => {
    expect(canHighlight("😀".repeat(5_000), "rust")).toBe(true);
    expect(canHighlight("😀".repeat(5_001), "rust")).toBe(false);
  });

  it("any one long line rejects the whole file, wherever it is", () => {
    expect(canHighlight("x".repeat(10_001) + "\nshort", "c")).toBe(false);
    expect(canHighlight("short\nx".concat("x".repeat(10_001)), "c")).toBe(false);
  });

  it("longestLineLength of the empty string is 0; no language still means no highlight", () => {
    expect(longestLineLength("")).toBe(0);
    expect(canHighlight(withLongest(5), null)).toBe(false);
  });
});
