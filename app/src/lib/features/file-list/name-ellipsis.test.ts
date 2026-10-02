import { describe, expect, it } from "vitest";
import { ellipsizeFileName, type MeasureText } from "./name-ellipsis";

// Spec: SPEC-0300-0017 R-949 (names that do not fit keep their extension and
// elide the middle; binary search over the candidate "first k chars + … + .ext"
// using a MEASURED width), AC-918 (incl. the Japanese name and the k-maximality
// check, which the spec delegates to a [単体] test with a replaceable measure
// function), AC-919, AC-944 / R-949-5 (avail <= 0 => "…" only).
// Design: SPEC-0200-0001 §3.8.5 (MeasureText DI, code-point units, O(log n)
// measure calls, early return when the name fits).
// Module under test (stub, not yet implemented): ./name-ellipsis.ts

// Fake measure: half-width (code point <= 0x7F) = 1, "…" = 1, everything else
// (full-width Japanese, surrogate-pair CJK, emoji) = 2. Iterates by code point.
const measure: MeasureText = (text) => {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    w += cp <= 0x7f || ch === "…" ? 1 : 2;
  }
  return w;
};

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const cps = (s: string) => Array.from(s);

function file(name: string, ext: string, avail: number, m: MeasureText = measure) {
  return ellipsizeFileName({ name, ext, isDir: false, avail }, m);
}

describe("ellipsizeFileName: fits (R-949 step 2)", () => {
  it("returns the name unchanged when its measured width is <= avail", () => {
    expect(file("report.xlsx", "xlsx", 100)).toBe("report.xlsx");
  });

  it("exactly equal to avail still fits", () => {
    expect(file("report.xlsx", "xlsx", 11)).toBe("report.xlsx");
  });

  it("early return: a fitting name needs exactly one measure() call", () => {
    let calls = 0;
    const counting: MeasureText = (t) => {
      calls += 1;
      return measure(t);
    };
    file("report.xlsx", "xlsx", 100, counting);
    expect(calls).toBe(1);
  });
});

describe("ellipsizeFileName: keeps the extension (R-949 step 3, AC-918)", () => {
  it("spec example: averyverylongname_report.xlsx -> averyveryl….xlsx at avail 16", () => {
    expect(file("averyverylongname_report.xlsx", "xlsx", 16)).toBe("averyveryl….xlsx");
  });

  it("AC-918 (i): long ASCII name ends with ….xlsx, starts with the original head, fits avail", () => {
    const name = "averyveryveryverylongname_quarterly_report_final.xlsx";
    const out = file(name, "xlsx", 30);
    expect(out.endsWith("….xlsx")).toBe(true);
    expect(out.startsWith("avery")).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(30);
  });

  it("AC-918 k is MAXIMAL: one more leading character would exceed avail (ASCII)", () => {
    const name = "averyveryveryverylongname_quarterly_report_final.xlsx";
    for (const avail of [12, 16, 20, 31, 40]) {
      const out = file(name, "xlsx", avail);
      const k = cps(out).length - cps("….xlsx").length;
      expect(k).toBeGreaterThanOrEqual(1);
      expect(cps(name).slice(0, k).join("")).toBe(cps(out).slice(0, k).join(""));
      expect(measure(out)).toBeLessThanOrEqual(avail);
      const bigger = cps(name).slice(0, k + 1).join("") + "….xlsx";
      expect(measure(bigger)).toBeGreaterThan(avail);
    }
  });

  it("AC-918 (ii): Japanese name keeps .xlsx; full-width characters are measured, not counted", () => {
    const name = "とても長い日本語のファイル名_四半期報告書_最終版_確定稿.xlsx";
    const out = file(name, "xlsx", 20);
    // suffix "….xlsx" = 6, leaves 14 -> 7 full-width characters.
    expect(out).toBe("とても長い日本….xlsx");
    expect(measure(out)).toBeLessThanOrEqual(20);
  });

  it("AC-918 (ii) odd avail: a full-width character that would overflow by 1 is not included", () => {
    const name = "とても長い日本語のファイル名_四半期報告書_最終版_確定稿.xlsx";
    expect(file(name, "xlsx", 19)).toBe("とても長い日….xlsx");
  });

  it("matches the extension case-insensitively (ext from the backend is lower-case)", () => {
    const out = file("Report_very_long_name_final.XLSX", "xlsx", 16);
    expect(out.toLowerCase().endsWith("….xlsx")).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(16);
  });

  it("does not cut a surrogate pair in half", () => {
    const name = "\u{20BB7}野家の牛丼ランチセット.txt"; // U+20BB7 is a surrogate pair, width 2
    const out = file(name, "txt", 7); // "….txt" = 5, leaves 2 -> exactly one code point
    expect(out).toBe("\u{20BB7}….txt");
    expect(LONE_SURROGATE.test(out)).toBe(false);
  });

  it("measure() is called O(log n) times for a very long name", () => {
    let calls = 0;
    const counting: MeasureText = (t) => {
      calls += 1;
      return measure(t);
    };
    const name = "a".repeat(2000) + ".txt";
    const out = file(name, "txt", 50, counting);
    expect(out.endsWith("….txt")).toBe(true);
    expect(calls).toBeLessThanOrEqual(40);
  });
});

describe("ellipsizeFileName: end ellipsis fallbacks (R-949 step 4, AC-919)", () => {
  it("k = 1 does not fit -> end ellipsis with the maximal prefix", () => {
    // "a…" + ".xlsx" = 7 > 6, so fall back: 5 characters + "…" = 6.
    expect(file("averylongname.xlsx", "xlsx", 6)).toBe("avery…");
  });

  it("directory: end ellipsis, never an extension split", () => {
    const out = ellipsizeFileName({ name: "very_long_directory_name", ext: "", isDir: true, avail: 10 }, measure);
    expect(out).toBe("very_long…");
  });

  it("directory whose name looks like it has an extension is still end-ellipsized", () => {
    const out = ellipsizeFileName({ name: "my.folder.name_long", ext: "name_long", isDir: true, avail: 8 }, measure);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("my.fold…");
  });

  it("file without an extension: end ellipsis", () => {
    expect(file("README_very_long_file_name", "", 10)).toBe("README_ve…");
  });

  it("ext not matching the end of the name falls back to end ellipsis", () => {
    const out = file("archive.tar.gz_backup_copy", "gz", 10);
    expect(out).toBe("archive.t…");
  });

  it("end ellipsis is maximal and fits avail, also for full-width names", () => {
    const name = "とても長いディレクトリの名前";
    const out = ellipsizeFileName({ name, ext: "", isDir: true, avail: 10 }, measure);
    expect(out.endsWith("…")).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(10);
    const k = cps(out).length - 1;
    expect(measure(cps(name).slice(0, k + 1).join("") + "…")).toBeGreaterThan(10);
  });

  it("end ellipsis does not cut a surrogate pair", () => {
    const name = "\u{20BB7}野家の牛丼ランチセット.txt";
    const out = file(name, "txt", 6); // k=1 candidate "𠮷….txt" = 7 > 6 -> end ellipsis, 2 code points + "…" = 5
    expect(out).toBe("\u{20BB7}野…");
    expect(LONE_SURROGATE.test(out)).toBe(false);
  });
});

describe("ellipsizeFileName: no room at all (R-949 step 5, AC-944)", () => {
  it("avail = 0 -> only the ellipsis mark", () => {
    expect(file("report_long_name.xlsx", "xlsx", 0)).toBe("…");
    expect(ellipsizeFileName({ name: "long_directory", ext: "", isDir: true, avail: 0 }, measure)).toBe("…");
  });

  it("negative avail -> only the ellipsis mark", () => {
    expect(file("report_long_name.xlsx", "xlsx", -20)).toBe("…");
  });

  it("avail = 1 (room for the mark only) -> '…'", () => {
    expect(file("report_long_name.xlsx", "xlsx", 1)).toBe("…");
  });
});
