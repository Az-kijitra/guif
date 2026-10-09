import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0014 R-329 (create = a single result), R-351 / R-351-1
//   (an extraction that ends midway notifies "extracted part of it": reason,
//   extracted/total, destination, failed entry; the ERROR is an error dialog,
//   the CANCEL is a status; if nothing was extracted it is a plain error /
//   cancel), R-352 (ExtractResult = extracted / total / destination / reason),
//   R-383 (create canceled => status), R-384 (extract canceled => partial
//   notice), R-385 (canceled code), R-396 (success => status with the output
//   file name (+ skipped link count) / the destination and extracted count
//   (+ skipped entry count)), R-395-4 (library message kept), AC-331,
//   AC-331-1, AC-353, AC-354, AC-383, AC-384.
// Architecture: SPEC-0200-0001 §3.4.6 (result-report.ts: pure; status texts and
//   error-dialog contents for success / canceled / partial failure), §3.4.6
//   controller flow (Ok+completed => status; Ok+canceled => status with N/M and
//   destination; Ok+failed with extracted>0 => error dialog with "extracted
//   part" notice; failed with extracted==0 => the ordinary error; Err =>
//   error dialog; create canceled => "ZIPへの圧縮をキャンセルしました").
// Module under test (not yet implemented): ./result-report.ts
//
// Contract assumed (documented in the handback report):
//   type ArchiveReport = { kind: "success" | "canceled" | "failed";
//     status: string | null;                         // null when only a dialog is shown
//     dialog: null | { title: string; lines: string[]; note?: string } }
//   buildCreateSuccessReport({ outputPath, entries, skippedLinks }) -> ArchiveReport (success)
//   buildCreateErrorReport(err: { code, message, entryPath? }) -> ArchiveReport
//        (code "canceled" => kind canceled, status "ZIPへの圧縮をキャンセルしました" (W-45), dialog null;
//         otherwise kind failed, dialog non-null)
//   buildExtractResultReport(result: { extracted, skipped, total, destination,
//        outcome: "completed" | "failed" | "canceled", error?: {code,message,entryPath?} }) -> ArchiveReport
//   buildExtractErrorReport(err) -> ArchiveReport   (the `Err` = nothing written path;
//        code "canceled" => kind canceled with status "ZIPの展開をキャンセルしました" (W-49))

import {
  buildCreateErrorReport,
  buildCreateSuccessReport,
  buildExtractErrorReport,
  buildExtractResultReport,
} from "./result-report";
import { translateArchiveErrorCode } from "./error-format";

const dialogText = (r: { dialog: null | { title: string; lines: string[]; note?: string } }) =>
  r.dialog === null ? "" : [r.dialog.title, ...r.dialog.lines, r.dialog.note ?? ""].join("\n");

describe("buildCreateSuccessReport (R-396, AC-383)", () => {
  it("status names the created file (base name) and there is no dialog", () => {
    const r = buildCreateSuccessReport({ outputPath: "C:\\work\\docs.zip", entries: 5, skippedLinks: 0 });
    expect(r.kind).toBe("success");
    expect(r.status).toContain("docs.zip");
    expect(r.dialog).toBeNull();
  });

  it("no skipped links => the status does not talk about skipping", () => {
    const r = buildCreateSuccessReport({ outputPath: "C:\\work\\docs.zip", entries: 5, skippedLinks: 0 });
    expect(r.status).not.toContain("スキップ");
  });

  it("R-327-8 / R-396: skipped links are appended with their count", () => {
    const r = buildCreateSuccessReport({ outputPath: "C:\\work\\docs.zip", entries: 5, skippedLinks: 3 });
    expect(r.status).toContain("スキップ");
    expect(r.status).toContain("3");
  });

  it("works with POSIX and non-ASCII paths", () => {
    expect(buildCreateSuccessReport({ outputPath: "/home/u/資料.zip", entries: 1, skippedLinks: 0 }).status).toContain("資料.zip");
  });
});

describe("buildCreateErrorReport (R-328-1, R-383, R-385, AC-353)", () => {
  it("canceled => a canceled report with the status 'ZIPへの圧縮をキャンセルしました' and NO dialog", () => {
    const r = buildCreateErrorReport({ code: "canceled", message: "canceled" });
    expect(r.kind).toBe("canceled");
    expect(r.status).toBe("ZIPへの圧縮をキャンセルしました");
    expect(r.dialog).toBeNull();
  });

  it("another code => failed with an error dialog (translated text + the library detail + the failed path)", () => {
    const r = buildCreateErrorReport({ code: "permission_denied", message: "Access is denied. (os error 5)", entryPath: "C:\\work\\secret.txt" });
    expect(r.kind).toBe("failed");
    expect(r.dialog).not.toBeNull();
    const text = dialogText(r);
    expect(text).toContain(translateArchiveErrorCode("permission_denied") as string);
    expect(text).toContain("Access is denied");
    expect(text).toContain("secret.txt");
  });

  it("an unknown code still yields a dialog containing the original message (R-394)", () => {
    const r = buildCreateErrorReport({ code: "brand_new", message: "raw detail" });
    expect(r.kind).toBe("failed");
    expect(dialogText(r)).toContain("raw detail");
  });
});

describe("buildExtractResultReport: completed (R-396, AC-384)", () => {
  it("status contains the destination and the extracted count; no dialog", () => {
    const r = buildExtractResultReport({ extracted: 12, skipped: 0, total: 12, destination: "C:\\work\\a", outcome: "completed" });
    expect(r.kind).toBe("success");
    expect(r.status).toContain("C:\\work\\a");
    expect(r.status).toContain("12");
    expect(r.dialog).toBeNull();
  });

  it("AC-384: skipped entries are mentioned with their count; with 0 skipped nothing is said", () => {
    const some = buildExtractResultReport({ extracted: 9, skipped: 3, total: 12, destination: "C:\\work\\a", outcome: "completed" });
    expect(some.status).toContain("スキップ");
    expect(some.status).toContain("3");
    const none = buildExtractResultReport({ extracted: 12, skipped: 0, total: 12, destination: "C:\\work\\a", outcome: "completed" });
    expect(none.status).not.toContain("スキップ");
  });
});

describe("buildExtractResultReport: canceled midway (R-351, R-351-1, R-384, AC-354)", () => {
  it("extracted > 0 => a STATUS (not a dialog) saying it stopped midway, with N/M and the destination", () => {
    const r = buildExtractResultReport({ extracted: 3, skipped: 0, total: 10, destination: "C:\\work\\a", outcome: "canceled" });
    expect(r.kind).toBe("canceled");
    expect(r.dialog).toBeNull();
    expect(r.status).toContain("ZIPの展開を途中でキャンセルしました"); // SPEC-0300-0019 W-49
    expect(r.status).toContain("3/10");
    expect(r.status).toContain("C:\\work\\a");
  });

  it("R-351-1: nothing extracted yet => a plain 'canceled' status, NOT the 'extracted part' notice", () => {
    const r = buildExtractResultReport({ extracted: 0, skipped: 0, total: 10, destination: "C:\\work\\a", outcome: "canceled" });
    expect(r.kind).toBe("canceled");
    expect(r.status).toContain("キャンセル");
    expect(r.status).not.toContain("途中まで");
    expect(r.dialog).toBeNull();
  });
});

describe("buildExtractResultReport: failed midway (R-351, R-351-1, R-350, AC-331, AC-331-1)", () => {
  const partial = {
    extracted: 4,
    skipped: 0,
    total: 10,
    destination: "C:\\work\\a",
    outcome: "failed" as const,
    error: { code: "zip_corrupt", message: "CRC mismatch: expected 1, got 2", entryPath: "data/big.bin" },
  };

  it("extracted > 0 => kind failed with an ERROR DIALOG (not only a status)", () => {
    const r = buildExtractResultReport(partial);
    expect(r.kind).toBe("failed");
    expect(r.dialog).not.toBeNull();
  });

  it("AC-331: the dialog says it extracted part of the archive, with N/M, the destination, the failed entry and the error", () => {
    const text = dialogText(buildExtractResultReport(partial));
    expect(text).toContain("途中まで");
    expect(text).toContain("4/10");
    expect(text).toContain("C:\\work\\a");
    expect(text).toContain("data/big.bin");
    expect(text).toContain(translateArchiveErrorCode("zip_corrupt") as string);
  });

  it("R-395-4: the library detail is kept next to the translation", () => {
    expect(dialogText(buildExtractResultReport(partial))).toContain("CRC mismatch");
  });

  it("R-350: the notice tells that already-extracted files remain (it is not a rollback)", () => {
    expect(dialogText(buildExtractResultReport(partial))).toMatch(/残/);
  });

  it("AC-331-1: extracted == 0 => the ordinary error only: NO 'extracted part' notice, no N/M", () => {
    const r = buildExtractResultReport({ ...partial, extracted: 0 });
    expect(r.kind).toBe("failed");
    expect(r.dialog).not.toBeNull();
    const text = dialogText(r);
    expect(text).not.toContain("途中まで");
    expect(text).not.toContain("0/10");
    expect(text).toContain(translateArchiveErrorCode("zip_corrupt") as string);
  });

  it("R-395-2: io_error midway (disk full while writing, AC-380-1) reports the partial extraction", () => {
    const r = buildExtractResultReport({
      ...partial,
      error: { code: "io_error", message: "No space left on device (os error 112)", entryPath: "b.bin" },
    });
    const text = dialogText(r);
    expect(text).toContain("途中まで");
    expect(text).toContain(translateArchiveErrorCode("io_error") as string);
    expect(text).toContain("No space left on device");
  });

  it("outcome failed without an error object still produces a dialog (defensive; code unknown)", () => {
    const { error: _omit, ...noError } = partial;
    const r = buildExtractResultReport(noError);
    expect(r.kind).toBe("failed");
    expect(r.dialog).not.toBeNull();
  });
});

describe("buildExtractErrorReport (Err = rejected before anything was written; R-345, R-360, R-375, R-387-2)", () => {
  it("a rejection => failed with a dialog carrying the translation, the detail and the entry path; no 'extracted part' notice", () => {
    const r = buildExtractErrorReport({ code: "conflict", message: "exists: a.txt", entryPath: "a.txt" });
    expect(r.kind).toBe("failed");
    const text = dialogText(r);
    expect(text).toContain(translateArchiveErrorCode("conflict") as string);
    expect(text).toContain("a.txt");
    expect(text).not.toContain("途中まで");
  });

  it("R-387-2: a canceled rejection (cancel arrived before the start) => canceled status, no dialog", () => {
    const r = buildExtractErrorReport({ code: "canceled", message: "canceled" });
    expect(r.kind).toBe("canceled");
    expect(r.status).toBe("ZIPの展開をキャンセルしました");
    expect(r.dialog).toBeNull();
  });
});

// SPEC-0300-0019 AC-1208-1 (W-44 / W-45 / W-46 / W-48 / W-49 / W-4A, R-1221): the exact titles and status texts.
describe("AC-1208-1: ZIP result wording (用語「ZIPに圧縮」「ZIPを展開」)", () => {
  const failedPartial = {
    extracted: 4,
    skipped: 0,
    total: 10,
    destination: "C:\\work\\a",
    outcome: "failed" as const,
    error: { code: "zip_corrupt", message: "CRC mismatch", entryPath: "data/big.bin" },
  };

  it("W-44: a failed create has the title `ZIPに圧縮できませんでした`", () => {
    const r = buildCreateErrorReport({ code: "io_error", message: "disk" });
    expect(r.dialog?.title).toBe("ZIPに圧縮できませんでした");
  });

  it("W-45: a canceled create is `ZIPへの圧縮をキャンセルしました`", () => {
    expect(buildCreateErrorReport({ code: "canceled", message: "canceled" }).status).toBe("ZIPへの圧縮をキャンセルしました");
  });

  it("W-46: a successful create stays `{name} を作成しました`", () => {
    const r = buildCreateSuccessReport({ outputPath: "C:\\work\\docs.zip", entries: 5, skippedLinks: 0 });
    expect(r.status).toBe("docs.zip を作成しました");
  });

  it("W-48 (pre-validation rejection): the title is `ZIPを展開できませんでした`", () => {
    expect(buildExtractErrorReport({ code: "conflict", message: "exists" }).dialog?.title).toBe("ZIPを展開できませんでした");
  });

  it("W-48 (failed before extracting anything): the title is `ZIPを展開できませんでした`", () => {
    expect(buildExtractResultReport({ ...failedPartial, extracted: 0 }).dialog?.title).toBe("ZIPを展開できませんでした");
  });

  it("W-48 (failed midway): the title is `ZIPを展開できませんでした` and the body lines are unchanged", () => {
    const r = buildExtractResultReport(failedPartial);
    expect(r.dialog?.title).toBe("ZIPを展開できませんでした");
    expect(r.dialog?.lines[0]).toBe("途中まで展開しました(4/10件)。");
    expect(r.dialog?.lines[1]).toBe("展開先: C:\\work\\a");
    expect(r.dialog?.note).toBe("展開済みのファイルは残っています。");
  });

  it("W-49: canceled before anything was extracted is `ZIPの展開をキャンセルしました`", () => {
    const r = buildExtractResultReport({ extracted: 0, skipped: 0, total: 10, destination: "C:\\work\\a", outcome: "canceled" });
    expect(r.status).toBe("ZIPの展開をキャンセルしました");
  });

  it("W-49: canceled midway is `ZIPの展開を途中でキャンセルしました({x}/{n}件を {destination} に展開済み)`", () => {
    const r = buildExtractResultReport({ extracted: 3, skipped: 0, total: 10, destination: "C:\\work\\a", outcome: "canceled" });
    expect(r.status).toBe("ZIPの展開を途中でキャンセルしました(3/10件を C:\\work\\a に展開済み)");
  });

  it("W-4A: a successful extract stays `{destination} に{n}件を展開しました{skip}`", () => {
    const r = buildExtractResultReport({ extracted: 12, skipped: 3, total: 15, destination: "C:\\work\\a", outcome: "completed" });
    expect(r.status).toBe("C:\\work\\a に12件を展開しました(3件をスキップ)");
  });
});
