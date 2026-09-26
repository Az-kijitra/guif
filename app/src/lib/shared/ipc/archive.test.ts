import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 (第3版) R-310 (IPC wrapper = shared/ipc/archive.ts),
//   R-371 (conflict detection = backend operation), R-375/R-326-3 (a
//   resolution/overwrite instruction is explicit; never implied),
//   R-386 (event namespace `archive://progress`, separate from fs_ops),
//   R-387-1 (operation_id is minted by the CALLER), R-387-3 (ids are
//   independent), R-394 / R-395-1 / R-395-4 (machine-readable code + message
//   + the offending entry path survive to the UI), R-329 / R-352 (result DTOs).
//   AC-358-1 (subscribe with the caller-minted id), AC-377, AC-382.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.4.2
//   (5 commands and their arguments/returns; error = ArchiveErrorDto
//   { code, message, entryPath? } normalised to `ArchiveError` here),
//   §3.4.5 (event `archive://progress`, payload { operationId, name, index,
//   total }; the id filter), §3.4.6 (shared/ipc/archive.ts), §4.5 (thin
//   invoke wrappers only; no business logic, no state).
// Module under test (not yet implemented): ./archive.ts
//
// Contract assumed (documented in the handback report):
//   archiveCheckCreate(items, outputPath, baseDir)
//     -> invoke("archive_check_create", { items, outputPath, baseDir })
//   archiveCreate(operationId, items, outputPath, baseDir, overwrite)
//     -> invoke("archive_create", { operationId, items, outputPath, baseDir, overwrite })
//   archiveDetectConflicts(zipPath, destination, baseDir)
//     -> invoke("archive_detect_conflicts", { zipPath, destination, baseDir })
//   archiveExtract(operationId, zipPath, destination, baseDir, resolutions?)
//     -> invoke("archive_extract", { operationId, zipPath, destination, baseDir,
//        [resolutions] })   (`resolutions` key omitted when not given)
//   archiveCancel(operationId) -> invoke("archive_cancel", { operationId })
//   listenArchiveProgress(operationId, onEvent) -> listen("archive://progress"),
//     forwarding only payloads whose operationId matches, returns listen's promise
//   createArchiveOperationId(): string  (crypto.randomUUID)
//   class ArchiveError extends Error { code: string; entryPath?: string }
//   normalizeArchiveError(raw: unknown): ArchiveError
//   Every command wrapper REJECTS with an ArchiveError (never a raw object).

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArchiveError,
  archiveCancel,
  archiveCheckCreate,
  archiveCreate,
  archiveDetectConflicts,
  archiveExtract,
  createArchiveOperationId,
  listenArchiveProgress,
  normalizeArchiveError,
} from "./archive";

afterEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
});

async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("archiveCheckCreate (R-322-1, R-323, R-325, R-326; §3.4.2)", () => {
  it("invokes archive_check_create with { items, outputPath, baseDir } and returns the DTO unchanged", async () => {
    const dto = { outputPath: "C:\\work\\out.zip", overwriteRequired: true };
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    const result = await archiveCheckCreate(["C:\\work\\a.txt"], "out", "C:\\work");
    expect(invoke).toHaveBeenCalledWith("archive_check_create", {
      items: ["C:\\work\\a.txt"],
      outputPath: "out",
      baseDir: "C:\\work",
    });
    expect(result).toEqual(dto);
  });

  it("never sends snake_case keys (the Tauri layer maps camelCase itself)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: "x", overwriteRequired: false });
    await archiveCheckCreate(["a"], "o", "b");
    const args = vi.mocked(invoke).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(["baseDir", "items", "outputPath"]);
  });
});

describe("archiveCreate (R-326-3, R-387-1; §3.4.2)", () => {
  it("passes the caller-minted operationId and an EXPLICIT overwrite boolean (never omitted)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ outputPath: "C:\\w\\o.zip", entries: 3, skippedLinks: 0 });
    await archiveCreate("op-1", ["C:\\w\\a"], "C:\\w\\o.zip", "C:\\w", false);
    expect(invoke).toHaveBeenCalledWith("archive_create", {
      operationId: "op-1",
      items: ["C:\\w\\a"],
      outputPath: "C:\\w\\o.zip",
      baseDir: "C:\\w",
      overwrite: false,
    });
  });

  it("overwrite=true is sent as true", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await archiveCreate("op", ["a"], "o", "b", true);
    expect(vi.mocked(invoke).mock.calls[0][1]).toMatchObject({ overwrite: true });
  });

  it("returns the result DTO unchanged (outputPath / entries / skippedLinks)", async () => {
    const dto = { outputPath: "C:\\w\\o.zip", entries: 12, skippedLinks: 2 };
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    expect(await archiveCreate("op", ["a"], "o", "b", false)).toEqual(dto);
  });
});

describe("archiveDetectConflicts (R-371, R-345; §3.4.2)", () => {
  it("invokes archive_detect_conflicts with { zipPath, destination, baseDir } and returns the DTO", async () => {
    const dto = { destination: "C:\\w\\a", totalEntries: 4, conflicts: [{ entryPath: "docs/x.txt" }] };
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    const result = await archiveDetectConflicts("C:\\w\\a.zip", "C:\\w\\a", "C:\\w");
    expect(invoke).toHaveBeenCalledWith("archive_detect_conflicts", {
      zipPath: "C:\\w\\a.zip",
      destination: "C:\\w\\a",
      baseDir: "C:\\w",
    });
    expect(result).toEqual(dto);
  });
});

describe("archiveExtract (R-375, R-376, R-387-1; §3.4.2)", () => {
  const ok = { extracted: 1, skipped: 0, total: 1, destination: "C:\\w\\a", outcome: "completed" };

  it("sends operationId / zipPath / destination / baseDir and camelCase `resolutions` keyed by the archive-internal entry path", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(ok);
    await archiveExtract("op-2", "C:\\w\\a.zip", "C:\\w\\a", "C:\\w", { "docs/x.txt": "overwrite", "y.txt": "skip" });
    expect(invoke).toHaveBeenCalledWith("archive_extract", {
      operationId: "op-2",
      zipPath: "C:\\w\\a.zip",
      destination: "C:\\w\\a",
      baseDir: "C:\\w",
      resolutions: { "docs/x.txt": "overwrite", "y.txt": "skip" },
    });
  });

  it("R-375: without resolutions the key is OMITTED (no instruction is invented)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(ok);
    await archiveExtract("op", "z", "d", "b");
    const args = vi.mocked(invoke).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).not.toContain("resolutions");
  });

  it("returns the ExtractResult DTO unchanged (R-352: extracted / skipped / total / destination / outcome / error)", async () => {
    const failed = {
      extracted: 2,
      skipped: 0,
      total: 5,
      destination: "C:\\w\\a",
      outcome: "failed",
      error: { code: "zip_corrupt", message: "crc", entryPath: "b.txt" },
    };
    vi.mocked(invoke).mockResolvedValueOnce(failed);
    expect(await archiveExtract("op", "z", "d", "b", {})).toEqual(failed);
  });
});

describe("archiveCancel (R-387-2/R-387-3; §3.4.1)", () => {
  it("invokes archive_cancel (NOT fs_ops_cancel) with { operationId }", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await archiveCancel("op-9");
    expect(invoke).toHaveBeenCalledWith("archive_cancel", { operationId: "op-9" });
    expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === "fs_ops_cancel")).toBe(false);
  });
});

describe("createArchiveOperationId (R-387-1)", () => {
  it("mints a fresh non-empty id per call (unique => cancel requests never cross operations, R-387-3)", () => {
    const a = createArchiveOperationId();
    const b = createArchiveOperationId();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).not.toBe(b);
  });
});

describe("listenArchiveProgress (R-386, R-387-1; §3.4.5)", () => {
  it("subscribes to the `archive://progress` event (NOT fs_ops://progress)", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(unlisten);
    await listenArchiveProgress("op-1", () => {});
    expect(vi.mocked(listen).mock.calls[0][0]).toBe("archive://progress");
  });

  it("resolves with the unlisten function returned by listen", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(unlisten);
    expect(await listenArchiveProgress("op-1", () => {})).toBe(unlisten);
  });

  it("forwards ONLY payloads with the matching operationId, unchanged", async () => {
    let handler: ((e: { payload: unknown }) => void) | undefined;
    vi.mocked(listen).mockImplementationOnce(async (_name: string, h: unknown) => {
      handler = h as (e: { payload: unknown }) => void;
      return () => {};
    });
    const onEvent = vi.fn();
    await listenArchiveProgress("op-1", onEvent);
    const mine = { operationId: "op-1", name: "docs/a.txt", index: 1, total: 4 };
    handler?.({ payload: { operationId: "op-2", name: "other", index: 9, total: 9 } });
    handler?.({ payload: mine });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(mine);
  });

  it("a rejection of listen propagates to the caller (the controller must survive it)", async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error("no event system"));
    await expect(listenArchiveProgress("op", () => {})).rejects.toThrow("no event system");
  });
});

describe("normalizeArchiveError (R-394, R-395-1, R-395-4; §3.4.2 ArchiveErrorDto)", () => {
  it("an ArchiveErrorDto-shaped object => ArchiveError with code / message / entryPath", () => {
    const e = normalizeArchiveError({ code: "zip_entry_rejected", message: "path escapes", entryPath: "../evil.txt" });
    expect(e).toBeInstanceOf(ArchiveError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("zip_entry_rejected");
    expect(e.message).toBe("path escapes");
    expect(e.entryPath).toBe("../evil.txt");
  });

  it("a missing or null entryPath => undefined (the field is optional on the wire)", () => {
    expect(normalizeArchiveError({ code: "no_items", message: "m" }).entryPath).toBeUndefined();
    expect(normalizeArchiveError({ code: "no_items", message: "m", entryPath: null }).entryPath).toBeUndefined();
  });

  it("a code without a message keeps the code (the message is a string, never undefined)", () => {
    const e = normalizeArchiveError({ code: "zip_corrupt" });
    expect(e.code).toBe("zip_corrupt");
    expect(typeof e.message).toBe("string");
  });

  it("the library-provided message is preserved verbatim (R-395-4: no replacement by a translation here)", () => {
    const e = normalizeArchiveError({ code: "zip_corrupt", message: "invalid Zip archive: Could not find EOCD" });
    expect(e.message).toBe("invalid Zip archive: Could not find EOCD");
  });

  it("a legacy `code=<code>; <message>` string is parsed as well (defensive; fs_ops-style)", () => {
    const e = normalizeArchiveError("code=io_error; disk full");
    expect(e.code).toBe("io_error");
    expect(e.message).toBe("disk full");
  });

  it("an unstructured string => code `unknown` with the string as the message (never lost)", () => {
    const e = normalizeArchiveError("something exploded");
    expect(e.code).toBe("unknown");
    expect(e.message).toContain("something exploded");
  });

  it("an Error => code `unknown` with its message", () => {
    const e = normalizeArchiveError(new Error("boom"));
    expect(e.code).toBe("unknown");
    expect(e.message).toContain("boom");
  });

  it("an ArchiveError passes through with the same code / entryPath", () => {
    const original = new ArchiveError("conflict", "exists", "a.txt");
    const e = normalizeArchiveError(original);
    expect(e.code).toBe("conflict");
    expect(e.entryPath).toBe("a.txt");
  });

  it("an object without a string code (or null / undefined) => code `unknown`, never throws", () => {
    expect(normalizeArchiveError({ foo: 1 }).code).toBe("unknown");
    expect(normalizeArchiveError(null).code).toBe("unknown");
    expect(normalizeArchiveError(undefined).code).toBe("unknown");
  });
});

describe("every command wrapper rejects with an ArchiveError (R-394)", () => {
  const dto = { code: "zip_too_large", message: "too many entries", entryPath: "" };

  it.each([
    ["archiveCheckCreate", () => archiveCheckCreate(["a"], "o", "b")],
    ["archiveCreate", () => archiveCreate("op", ["a"], "o", "b", false)],
    ["archiveDetectConflicts", () => archiveDetectConflicts("z", "d", "b")],
    ["archiveExtract", () => archiveExtract("op", "z", "d", "b", {})],
    ["archiveCancel", () => archiveCancel("op")],
  ])("%s: a structured rejection from invoke becomes an ArchiveError with code and message", async (_n, call) => {
    vi.mocked(invoke).mockRejectedValueOnce(dto);
    const e = await rejectionOf(call());
    expect(e).toBeInstanceOf(ArchiveError);
    expect((e as ArchiveError).code).toBe("zip_too_large");
    expect((e as ArchiveError).message).toBe("too many entries");
  });

  it("a string rejection (no structure) still becomes an ArchiveError", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("Command archive_extract not allowed by ACL");
    const e = await rejectionOf(archiveExtract("op", "z", "d", "b"));
    expect(e).toBeInstanceOf(ArchiveError);
    expect((e as ArchiveError).message).toContain("not allowed by ACL");
  });
});
