import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0009 R-40-3/R-70.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.6.11.6
//   (MUST-89: fs_list_dir becomes async + a structured
//   { code: "access_denied"|"not_found"|"other", message } error DTO),
//   §19 第15回 MUST-95 (the actual reason this file is needed): Tauri's
//   `invoke()` rejects with the command's `Err` value AS-IS. Once
//   `fs_list_dir`'s error becomes an OBJECT (not a bare `String`), the
//   existing `list-state.svelte.ts` catch clause
//   (`e instanceof Error ? e.message : String(e)`) would display
//   "[object Object]" unless this module normalizes every rejection into a
//   real `Error` first -- exactly the precedent `shared/ipc/archive.ts`'s
//   `ArchiveError`/`normalizeArchiveError` already set (17-51 in that file).
//   `tree-state.svelte.ts` additionally needs the `code` field to implement
//   R-40-3 (access-denied/not-found are silent; anything else is notified).
//
// Module under test (not yet implemented): ./fs.ts's new `FsListDirError`/
// `normalizeFsListDirError` exports, and `fsListDir`'s rejection path being
// wired through them (mirrors `shared/ipc/archive.ts`'s `call<T>` helper).

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { FsListDirError, fsListDir, normalizeFsListDirError } from "./fs";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    throw new Error("expected the promise to reject");
  } catch (e) {
    return e;
  }
}

describe("normalizeFsListDirError: the 3 input shapes MUST-95 requires (a DTO object, a string, and an Error)", () => {
  it("a DTO object { code, message } becomes an FsListDirError carrying both", () => {
    const err = normalizeFsListDirError({ code: "access_denied", message: "Access is denied." });
    expect(err).toBeInstanceOf(FsListDirError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("access_denied");
    expect(err.message).toBe("Access is denied.");
  });

  it("a bare string (e.g. an ACL-rejection message, or the pre-MUST-89 command shape) becomes an 'other'-coded error, message preserved", () => {
    const err = normalizeFsListDirError("not allowed by ACL");
    expect(err).toBeInstanceOf(FsListDirError);
    expect(err.code).toBe("other");
    expect(err.message).toBe("not allowed by ACL");
  });

  it("a plain Error instance becomes an 'other'-coded FsListDirError, preserving its message", () => {
    const err = normalizeFsListDirError(new Error("boom"));
    expect(err).toBeInstanceOf(FsListDirError);
    expect(err.code).toBe("other");
    expect(err.message).toBe("boom");
  });

  it("an already-normalized FsListDirError passes through unchanged", () => {
    const original = new FsListDirError("not_found", "gone");
    expect(normalizeFsListDirError(original)).toBe(original);
  });

  it("an unrecognized value never throws -- falls back to an 'other'-coded error with a String() message", () => {
    const err = normalizeFsListDirError(42);
    expect(err).toBeInstanceOf(FsListDirError);
    expect(err.code).toBe("other");
  });

  it("recognizes the not_found code from a DTO object", () => {
    expect(normalizeFsListDirError({ code: "not_found", message: "gone" }).code).toBe("not_found");
  });
});

describe("fsListDir: every rejection is normalized (SPEC-0200-0001 §19 第15回 MUST-95)", () => {
  it("a structured { code, message } rejection from invoke() becomes an FsListDirError, not '[object Object]'", async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ code: "access_denied", message: "Access is denied." });
    const err = await rejectionOf(fsListDir({ path: "C:\\secret", showHidden: false, sortKey: "name", sortOrder: "asc" }));
    expect(err).toBeInstanceOf(FsListDirError);
    expect((err as FsListDirError).code).toBe("access_denied");
    expect(String((err as Error).message)).not.toContain("[object Object]");
  });

  it("a plain string rejection (pre-MUST-89 backward compatibility) still normalizes cleanly", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("boom");
    const err = await rejectionOf(fsListDir({ path: "C:\\x", showHidden: false, sortKey: "name", sortOrder: "asc" }));
    expect(err).toBeInstanceOf(FsListDirError);
    expect((err as Error).message).toBe("boom");
  });

  it("a successful call is unaffected by the normalization (resolves with the entries as before)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    await expect(fsListDir({ path: "C:\\x", showHidden: false, sortKey: "name", sortOrder: "asc" })).resolves.toEqual([]);
  });
});
