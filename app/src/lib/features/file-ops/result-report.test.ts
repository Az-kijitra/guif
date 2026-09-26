import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0011 R-25 (skipped count appended to the status), R-44
//   (canceled items carry code `canceled`), R-80 (failures are collected and
//   shown after the batch), R-81 (failure list: first 5 entries, then an
//   ellipsis note), R-84 (translate known codes; unknown => original
//   message), R-85-1 (overwrite_ancestor is translated), R-86, AC-14, AC-21,
//   AC-33, AC-36~AC-39.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.4
//   (result-report.ts: `buildResultReport(summary, mode)` pure function that
//   returns the status text and the failure-list descriptor, using
//   formatFailureList/translateErrorCode), §3.3.3/§3.3.13-4 (failure list is
//   a confirm with `lines` + `note`).
// Module under test (not yet implemented): ./result-report.ts
//
// Contract assumed (the design names the function but not the return shape;
// documented in the handback report):
//   buildResultReport(summary, mode: "copy"|"move"|"trash"|"permanent") ->
//     { kind: "success" | "canceled" | "failed",
//       status: string,
//       failureDialog: null | { title: string; lines: string[]; note?: string } }

import { translateErrorCode } from "./error-format";
import { buildResultReport } from "./result-report";

function summary(over: Partial<Record<string, unknown>> = {}) {
  return { ok: 0, failed: 0, total: 0, skipped: 0, failures: [] as { path: string; code: string; message: string }[], ...over };
}

function fail(name: string, code: string, message = `msg for ${name}`) {
  return { path: `C:\\dir\\${name}`, code, message };
}

describe("success (failed === 0)", () => {
  it("copy: status mentions the count and copy; no failure dialog", () => {
    const r = buildResultReport(summary({ ok: 3, total: 3 }), "copy");
    expect(r.kind).toBe("success");
    expect(r.status).toContain("3");
    expect(r.status).toContain("コピー");
    expect(r.failureDialog).toBeNull();
  });

  it("move: status mentions move", () => {
    const r = buildResultReport(summary({ ok: 2, total: 2 }), "move");
    expect(r.status).toContain("2");
    expect(r.status).toContain("移動");
  });

  it("R-25/AC-14: the skipped count is shown alongside", () => {
    const r = buildResultReport(summary({ ok: 1, total: 3, skipped: 2 }), "copy");
    expect(r.status).toContain("スキップ");
    expect(r.status).toContain("2");
  });

  it("no skipped => the status does not mention skipping", () => {
    const r = buildResultReport(summary({ ok: 1, total: 1, skipped: 0 }), "copy");
    expect(r.status).not.toContain("スキップ");
  });

  it("trash / permanent delete: status mentions delete", () => {
    expect(buildResultReport(summary({ ok: 2, total: 2 }), "trash").status).toContain("削除");
    expect(buildResultReport(summary({ ok: 2, total: 2 }), "permanent").status).toContain("削除");
  });
});

describe("canceled only (R-44)", () => {
  it("all failures are `canceled` => kind=canceled, status says canceled with the completed count, no failure dialog", () => {
    const r = buildResultReport(
      summary({ ok: 2, failed: 3, total: 5, failures: [fail("c", "canceled"), fail("d", "canceled"), fail("e", "canceled")] }),
      "copy",
    );
    expect(r.kind).toBe("canceled");
    expect(r.status).toContain("キャンセル");
    expect(r.status).toContain("2");
    expect(r.failureDialog).toBeNull();
  });

  it("a mix of canceled and a real failure is NOT treated as canceled-only", () => {
    const r = buildResultReport(
      summary({ ok: 1, failed: 2, total: 3, failures: [fail("b", "io_error"), fail("c", "canceled")] }),
      "move",
    );
    expect(r.kind).toBe("failed");
    expect(r.failureDialog).not.toBeNull();
  });
});

describe("failures (R-80, R-81, R-84)", () => {
  it("each line carries the file name and the translated message", () => {
    const r = buildResultReport(
      summary({ ok: 0, failed: 1, total: 1, failures: [fail("a.txt", "permission_denied")] }),
      "copy",
    );
    expect(r.kind).toBe("failed");
    const dialog = r.failureDialog!;
    expect(dialog.lines).toHaveLength(1);
    expect(dialog.lines[0]).toContain("a.txt");
    expect(dialog.lines[0]).toContain(translateErrorCode("permission_denied")!);
    expect(dialog.note).toBeUndefined();
  });

  it("R-84: an untranslated code falls back to the original message", () => {
    const r = buildResultReport(
      summary({ failed: 1, total: 1, failures: [fail("a.txt", "totally_new_code", "raw backend message")] }),
      "trash",
    );
    expect(r.failureDialog!.lines[0]).toContain("raw backend message");
  });

  it("R-85-1/MUST-59: overwrite_ancestor is translated to a human-readable message (not the raw code alone)", () => {
    const r = buildResultReport(
      summary({ failed: 1, total: 1, failures: [fail("dir", "overwrite_ancestor", "raw")] }),
      "copy",
    );
    expect(translateErrorCode("overwrite_ancestor")).not.toBeNull();
    expect(r.failureDialog!.lines[0]).toContain(translateErrorCode("overwrite_ancestor")!);
  });

  it("R-81: exactly 5 failures are all listed with no ellipsis note", () => {
    const failures = ["a", "b", "c", "d", "e"].map((n) => fail(n, "io_error"));
    const r = buildResultReport(summary({ failed: 5, total: 5, failures }), "copy");
    expect(r.failureDialog!.lines).toHaveLength(5);
    expect(r.failureDialog!.note).toBeUndefined();
  });

  it("R-81: 7 failures => first 5 listed plus an ellipsis note for the rest", () => {
    const failures = ["a", "b", "c", "d", "e", "f", "g"].map((n) => fail(n, "io_error"));
    const r = buildResultReport(summary({ failed: 7, total: 7, failures }), "copy");
    expect(r.failureDialog!.lines).toHaveLength(5);
    expect(r.failureDialog!.lines[4]).toContain("e");
    expect(r.failureDialog!.note).toBeDefined();
    expect(r.failureDialog!.note).toContain("2");
  });

  it("a partial success still reports the successes in the status alongside the failure dialog", () => {
    const r = buildResultReport(summary({ ok: 2, failed: 1, total: 3, failures: [fail("x", "io_error")] }), "copy");
    expect(r.failureDialog).not.toBeNull();
    expect(typeof r.status).toBe("string");
  });
});
