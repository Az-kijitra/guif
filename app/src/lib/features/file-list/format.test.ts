import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0009 R-20-11/R-20-12/R-71 (注記)/AC-620/AC-621.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.7.
// Module under test (not yet implemented): ./format.ts
//
// SHOULD-125: `formatModifiedForDisplay` is specified to use the LOCAL time
// zone (R-20-12), so this file never hardcodes an expected wall-clock string
// for a fixed epoch value (that would be flaky across machines/CI in
// different time zones). Instead every test builds the epoch-seconds input
// FROM a `Date` constructed with local-time components, and compares against
// a string built from the SAME `Date`'s local getters -- the assertion is
// therefore time-zone-agnostic while still exercising the real formatting
// rules (zero-padding, 24h, no seconds).

import { formatModifiedForDisplay, formatSize } from "./format";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Builds the 20-digit zero-padded UNIX-epoch-seconds string (R-71 注記) for a
// LOCAL date/time, plus the expected "YYYY-MM-DD HH:mm" display string
// derived from the very same Date.
function localModified(y: number, m: number, d: number, hh: number, mm: number) {
  const date = new Date(y, m - 1, d, hh, mm, 0, 0);
  const epochSeconds = Math.floor(date.getTime() / 1000);
  return {
    modified: String(epochSeconds).padStart(20, "0"),
    expected: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}

describe("formatSize (SPEC-0300-0009 R-20-11, AC-620)", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [12_582_912, "12.0 MB"],
    // 1,048,575 B = 1023.999...KB, which rounds to "1024.0 KB" -- must carry
    // to the next unit instead of ever displaying "1024.0 KB" (review B-2).
    [1_048_575, "1.0 MB"],
  ])("formatSize(%i) === %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  it("B values are integers (no decimal point)", () => {
    expect(formatSize(0)).not.toContain(".");
    expect(formatSize(1023)).not.toContain(".");
  });

  it("KB/MB/GB/TB values always show exactly one decimal place", () => {
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(1024 * 1024 * 5)).toBe("5.0 MB");
  });

  it("uses TB for values at or above 1024 GB (no unit beyond TB)", () => {
    const oneTb = 1024 ** 4;
    expect(formatSize(oneTb)).toBe("1.0 TB");
    expect(formatSize(oneTb * 1024)).toBe("1024.0 TB"); // no PB unit; stays TB
  });

  it("rounds to one decimal (not truncates)", () => {
    // 1,331 B = 1.2998... KB -> rounds to 1.3 KB, not 1.2 KB.
    expect(formatSize(1331)).toBe("1.3 KB");
  });
});

describe("formatModifiedForDisplay (SPEC-0300-0009 R-20-12/R-71 注記, AC-621)", () => {
  it("formats a local date/time as YYYY-MM-DD HH:mm, 24h, zero-padded", () => {
    const { modified, expected } = localModified(2026, 9, 27, 9, 5);
    expect(formatModifiedForDisplay(modified)).toBe(expected);
  });

  it("zero-pads single-digit month/day/hour/minute", () => {
    const { modified, expected } = localModified(2026, 1, 2, 3, 4);
    expect(formatModifiedForDisplay(modified)).toBe(expected);
    expect(formatModifiedForDisplay(modified)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("R-71 注記: the all-zero sentinel ('0' padded to 20 digits, pre-1970/unavailable) is blank", () => {
    expect(formatModifiedForDisplay("0".padStart(20, "0"))).toBe("");
  });

  it("an unparseable value is blank rather than throwing", () => {
    expect(formatModifiedForDisplay("not-a-number")).toBe("");
    expect(formatModifiedForDisplay("")).toBe("");
  });

  it("never displays the raw 20-digit epoch-seconds string itself", () => {
    const { modified } = localModified(2026, 9, 27, 9, 5);
    expect(formatModifiedForDisplay(modified)).not.toBe(modified);
    expect(formatModifiedForDisplay(modified)).not.toContain(modified);
  });
});
