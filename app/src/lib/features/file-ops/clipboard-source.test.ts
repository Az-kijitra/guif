import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0011 R-19-2 (source order 1..4), R-19-3 (the sequence-number record; 0 = unknown;
//   E1: a failed OS write leaves NO record and is never matched), R-19-5 (cut -> copy and the
//   notices, L-7, E1 consequence), R-19-6 (after a move), AC-06-2 / AC-06-11;
//   SPEC-0200-0001 §3.10.8 (resolvePasteSource), §3.10.17.5 (decideAfterMove: ONE setFiles call),
//   §3.10.17.7 SHOULD-172 (`files` with 0 paths == none).
// Pure functions: no IPC, no clock.

import { decideAfterMove, resolvePasteSource, type OsRead, type PasteSourceInput } from "./clipboard-source";
import type { ClipboardContent } from "./clipboard-port";

const COPY: ClipboardContent = Object.freeze({ paths: Object.freeze(["C:\\w\\a.txt", "C:\\w\\b.txt"]) as unknown as string[], origin: "internal-copy" });
const CUT: ClipboardContent = Object.freeze({ paths: Object.freeze(["C:\\w\\a.txt", "C:\\w\\b.txt"]) as unknown as string[], origin: "internal-cut" });
const OS_FILES: OsRead = { state: "files", paths: ["D:\\x\\1.txt", "D:\\x\\2.txt"] };
const OS_NONE: OsRead = { state: "none" };
const OS_UNAVAILABLE: OsRead = { state: "unavailable" };

function input(over: Partial<PasteSourceInput>): PasteSourceInput {
  return { os: OS_NONE, osSequence: 5, record: { sequence: 5 }, internal: CUT, ...over };
}

describe("resolvePasteSource: record matches (R-19-2 step 1, R-19-3)", () => {
  it("internal CUT + equal non-zero sequence + OS has other files => the app-internal cut is MOVED, no notice", () => {
    const d = resolvePasteSource(input({ os: OS_FILES }));
    expect(d).toEqual({ kind: "internal", paths: CUT.paths, mode: "move" });
    expect((d as { notice?: unknown }).notice).toBeUndefined();
  });

  it("internal CUT + equal sequence + OS has no files => move", () => {
    expect(resolvePasteSource(input({ os: OS_NONE }))).toMatchObject({ kind: "internal", mode: "move" });
  });

  it("OS read UNAVAILABLE but the sequence still equals => step 1 applies (G-11): move", () => {
    expect(resolvePasteSource(input({ os: OS_UNAVAILABLE }))).toMatchObject({ kind: "internal", mode: "move" });
  });

  it("internal COPY + equal sequence => internal copy as it was, no notice", () => {
    for (const os of [OS_FILES, OS_NONE, OS_UNAVAILABLE]) {
      const d = resolvePasteSource(input({ internal: COPY, os }));
      expect(d).toEqual({ kind: "internal", paths: COPY.paths, mode: "copy" });
    }
  });
});

describe("resolvePasteSource: record differs (OS changed)", () => {
  const changed = { osSequence: 6 }; // record 5

  it("cut + OS has no files => internal paths as COPY with cut-changed (R-19-5)", () => {
    expect(resolvePasteSource(input({ ...changed, os: OS_NONE }))).toEqual({
      kind: "internal",
      paths: CUT.paths,
      mode: "copy",
      notice: "cut-changed",
    });
  });

  it("cut + OS unavailable => treated as 'no files': COPY with cut-changed", () => {
    expect(resolvePasteSource(input({ ...changed, os: OS_UNAVAILABLE }))).toEqual({
      kind: "internal",
      paths: CUT.paths,
      mode: "copy",
      notice: "cut-changed",
    });
  });

  it("cut + OS has other files => the OS files as COPY with cut-changed (L-7)", () => {
    expect(resolvePasteSource(input({ ...changed, os: OS_FILES }))).toEqual({
      kind: "os",
      paths: OS_FILES.paths,
      mode: "copy",
      notice: "cut-changed",
    });
  });

  it("copy + OS has files => the OS files as COPY, no notice (the OS wins when it is not our own content)", () => {
    const d = resolvePasteSource(input({ ...changed, internal: COPY, os: OS_FILES }));
    expect(d).toEqual({ kind: "os", paths: OS_FILES.paths, mode: "copy" });
    expect((d as { notice?: unknown }).notice).toBeUndefined();
  });

  it("copy + OS has no files (text in the OS, R-19-4) => internal copy, no notice", () => {
    expect(resolvePasteSource(input({ ...changed, internal: COPY, os: OS_NONE }))).toEqual({
      kind: "internal",
      paths: COPY.paths,
      mode: "copy",
    });
  });
});

describe("resolvePasteSource: no record = the OS write failed or never happened (E1)", () => {
  const norecord = { record: null };

  it("OS has files => OS COPY even if the sequence would have 'matched' anything; cut internal => cut-changed", () => {
    expect(resolvePasteSource(input({ ...norecord, os: OS_FILES }))).toEqual({
      kind: "os",
      paths: OS_FILES.paths,
      mode: "copy",
      notice: "cut-changed",
    });
    expect(resolvePasteSource(input({ ...norecord, os: OS_FILES, internal: COPY }))).toEqual({
      kind: "os",
      paths: OS_FILES.paths,
      mode: "copy",
    });
  });

  it("OS has no files + internal CUT => COPY with cut-write-failed (承認後の追補)", () => {
    expect(resolvePasteSource(input({ ...norecord, os: OS_NONE }))).toEqual({
      kind: "internal",
      paths: CUT.paths,
      mode: "copy",
      notice: "cut-write-failed",
    });
    expect(resolvePasteSource(input({ ...norecord, os: OS_UNAVAILABLE }))).toMatchObject({
      mode: "copy",
      notice: "cut-write-failed",
    });
  });

  it("OS has no files + internal COPY => internal copy, no notice", () => {
    expect(resolvePasteSource(input({ ...norecord, os: OS_NONE, internal: COPY }))).toEqual({
      kind: "internal",
      paths: COPY.paths,
      mode: "copy",
    });
  });

  it("is never matched, whatever the current sequence (E1: decision #3 without exception)", () => {
    for (const osSequence of [0, 1, 5, 99]) {
      const d = resolvePasteSource(input({ record: null, osSequence, os: OS_NONE }));
      expect(d).toMatchObject({ kind: "internal", mode: "copy", notice: "cut-write-failed" });
    }
  });
});

describe("resolvePasteSource: 0 = unknown is never equal (R-19-3, M-1)", () => {
  it.each([
    ["record 0, current 0", { sequence: 0 }, 0],
    ["record 5, current 0", { sequence: 5 }, 0],
    ["record 0, current 5", { sequence: 0 }, 5],
  ])("%s => not matched: a cut is COPIED with cut-changed (record exists, so not 'write-failed')", (_n, record, osSequence) => {
    expect(resolvePasteSource(input({ record, osSequence, os: OS_NONE }))).toEqual({
      kind: "internal",
      paths: CUT.paths,
      mode: "copy",
      notice: "cut-changed",
    });
    expect(resolvePasteSource(input({ record, osSequence, os: OS_FILES }))).toMatchObject({
      kind: "os",
      mode: "copy",
      notice: "cut-changed",
    });
  });

  it("a copy with 0 is not 'matched' either: an OS with files wins", () => {
    expect(resolvePasteSource(input({ internal: COPY, record: { sequence: 0 }, osSequence: 0, os: OS_FILES }))).toMatchObject({
      kind: "os",
      mode: "copy",
    });
  });
});

describe("resolvePasteSource: nothing to paste (R-19-2 step 4) and degenerate input", () => {
  it("app clipboard empty and OS without files => none", () => {
    expect(resolvePasteSource(input({ internal: null, os: OS_NONE }))).toEqual({ kind: "none" });
    expect(resolvePasteSource(input({ internal: null, os: OS_UNAVAILABLE }))).toEqual({ kind: "none" });
    expect(resolvePasteSource(input({ internal: null, os: OS_NONE, record: null }))).toEqual({ kind: "none" });
  });

  it("app clipboard empty, OS has files => the OS files as COPY, no notice (a record cannot match an empty app clipboard)", () => {
    for (const record of [null, { sequence: 5 }]) {
      expect(resolvePasteSource(input({ internal: null, os: OS_FILES, record }))).toEqual({
        kind: "os",
        paths: OS_FILES.paths,
        mode: "copy",
      });
    }
  });

  // SHOULD-172: a probeOnly result must not hide the app clipboard.
  it("`files` with ZERO paths counts as none: the app clipboard is used", () => {
    const empty: OsRead = { state: "files", paths: [] };
    expect(resolvePasteSource(input({ internal: COPY, os: empty, osSequence: 6 }))).toEqual({
      kind: "internal",
      paths: COPY.paths,
      mode: "copy",
    });
    expect(resolvePasteSource(input({ internal: null, os: empty }))).toEqual({ kind: "none" });
    expect(resolvePasteSource(input({ internal: CUT, os: empty, osSequence: 6 }))).toMatchObject({
      kind: "internal",
      mode: "copy",
      notice: "cut-changed",
    });
  });

  it("an OS paste is always COPY (R-19-1): `os` decisions never carry mode move", () => {
    for (const internal of [null, COPY, CUT]) {
      for (const record of [null, { sequence: 5 }, { sequence: 0 }]) {
        for (const osSequence of [0, 5, 6]) {
          const d = resolvePasteSource({ os: OS_FILES, osSequence, record, internal });
          if (d.kind === "os") expect(d.mode).toBe("copy");
        }
      }
    }
  });

  it("does not mutate its input", () => {
    const os: OsRead = { state: "files", paths: ["D:\\1"] };
    const inp: PasteSourceInput = { os, osSequence: 5, record: { sequence: 5 }, internal: CUT };
    const copy = JSON.stringify(inp);
    resolvePasteSource(inp);
    expect(JSON.stringify(inp)).toBe(copy);
  });
});

// ---------------------------------------------------------------------------
describe("decideAfterMove (R-19-6, AC-06-11, MUST-121)", () => {
  const FAILED = ["C:\\w\\b.txt"];

  it("(1) all succeeded + a usable record => clear the app clipboard and clearIfUnchanged(record)", () => {
    expect(decideAfterMove({ record: { sequence: 7 }, failedPaths: [] })).toEqual({
      internal: { kind: "clear" },
      os: { kind: "clear", sequence: 7 },
    });
  });

  it("(1) record sequence 0 (unknown) => the OS is NOT touched", () => {
    expect(decideAfterMove({ record: { sequence: 0 }, failedPaths: [] })).toEqual({
      internal: { kind: "clear" },
      os: { kind: "none" },
    });
  });

  it("(1) no record (the OS write had failed) => the OS is NOT touched; the app clipboard is still cleared", () => {
    expect(decideAfterMove({ record: null, failedPaths: [] })).toEqual({
      internal: { kind: "clear" },
      os: { kind: "none" },
    });
  });

  it("(2) partial failure + usable record => ONE conditional rewrite of the failed items with expectedSequence = the record", () => {
    const plan = decideAfterMove({ record: { sequence: 7 }, failedPaths: FAILED });
    expect(plan).toEqual({
      internal: { kind: "set", paths: FAILED },
      os: { kind: "rewrite", paths: FAILED, expectedSequence: 7 },
    });
    // exactly one OS step: a rewrite is never combined with a separate clear
    expect(plan.os.kind).toBe("rewrite");
  });

  it("(2) partial failure + record 0 / no record => the app clipboard shrinks to the failed items, the OS is NOT touched", () => {
    for (const record of [{ sequence: 0 }, null]) {
      expect(decideAfterMove({ record, failedPaths: FAILED })).toEqual({
        internal: { kind: "set", paths: FAILED },
        os: { kind: "none" },
      });
    }
  });

  it("keeps the order of the failed paths and returns fresh arrays (no aliasing of the input)", () => {
    const failed = ["C:\\z", "C:\\a"];
    const plan = decideAfterMove({ record: { sequence: 3 }, failedPaths: failed });
    expect(plan.internal).toEqual({ kind: "set", paths: ["C:\\z", "C:\\a"] });
    if (plan.internal.kind === "set") expect(plan.internal.paths).not.toBe(failed);
    failed.push("C:\\later");
    expect(plan.internal).toEqual({ kind: "set", paths: ["C:\\z", "C:\\a"] });
  });
});
