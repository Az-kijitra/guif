import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0011 R-21 (copy/move contracts), R-30-2/R-34/R-34-2
//   (per-item resolutions; a batch without an explicit decision must not
//   overwrite), R-32/R-32-1 (conflict detection = filesystem existence),
//   R-43/R-43-1 (operation id supplied by the caller), R-64 (rename),
//   R-31-2 (top-level-only conflict detection, §3.3.14-2).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.7
//   (fs_ops_detect_conflicts(items, destination); item_resolutions ->
//   camelCase `itemResolutions`, key = source path, 5th optional argument of
//   fsOpsCopy/fsOpsMove), §3.3.13-7 SHOULD-80 (fsOpsRename returns the new
//   FULL path: Promise<string>), SHOULD-82 (validation rules are Rust-side).
// Module under test: ./file-ops.ts (thin invoke wrappers; the Tauri `invoke`
//   is mocked — no real IPC).

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  fsOpsCopy,
  fsOpsDetectConflicts,
  fsOpsMove,
  fsOpsRename,
  fsOpsCreate,
  fsOpsCancel,
  fsOpsDeleteTrash,
  fsOpsDeletePermanently,
} from "./file-ops";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("fsOpsDetectConflicts (§3.3.7)", () => {
  it("invokes fs_ops_detect_conflicts with { items, destination } and returns the DTO list unchanged", async () => {
    const dto = [{ path: "C:\\src\\a.txt", name: "a.txt" }];
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    const result = await fsOpsDetectConflicts(["C:\\src\\a.txt", "C:\\src\\b.txt"], "C:\\dst");
    expect(invoke).toHaveBeenCalledWith("fs_ops_detect_conflicts", {
      items: ["C:\\src\\a.txt", "C:\\src\\b.txt"],
      destination: "C:\\dst",
    });
    expect(result).toEqual(dto);
  });

  it("propagates a rejection (e.g. destination_not_found, R-24/R-83) to the caller", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("destination_not_found");
    await expect(fsOpsDetectConflicts(["a"], "C:\\nope")).rejects.toBe("destination_not_found");
  });
});

describe("fsOpsCopy / fsOpsMove itemResolutions (§3.3.7, SHOULD-82)", () => {
  it("existing 4-argument form still works: invoke carries operationId/items/destination/resolution", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ ok: 1, failed: 0, total: 1, skipped: 0, failures: [] });
    await fsOpsCopy("op", ["a"], "C:\\dst", "reject");
    expect(invoke).toHaveBeenCalledWith(
      "fs_ops_copy",
      expect.objectContaining({ operationId: "op", items: ["a"], destination: "C:\\dst", resolution: "reject" }),
    );
  });

  it("R-30-2: without itemResolutions the resolution defaults to 'reject' (never a silent overwrite)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await fsOpsMove("op", ["a"], "C:\\dst");
    expect(invoke).toHaveBeenCalledWith("fs_ops_move", expect.objectContaining({ resolution: "reject" }));
  });

  it("fsOpsCopy: the 5th argument is sent as camelCase `itemResolutions`", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await fsOpsCopy("op", ["a", "b"], "C:\\dst", "reject", { a: "overwrite", b: "skip" });
    expect(invoke).toHaveBeenCalledWith(
      "fs_ops_copy",
      expect.objectContaining({ itemResolutions: { a: "overwrite", b: "skip" } }),
    );
  });

  it("fsOpsMove: the 5th argument is sent as camelCase `itemResolutions`", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await fsOpsMove("op", ["a"], "C:\\dst", "reject", { a: "overwrite" });
    expect(invoke).toHaveBeenCalledWith(
      "fs_ops_move",
      expect.objectContaining({ itemResolutions: { a: "overwrite" } }),
    );
  });

  it("the snake_case key is never sent (the Tauri layer maps camelCase itself)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await fsOpsCopy("op", ["a"], "C:\\dst", "reject", { a: "skip" });
    const args = vi.mocked(invoke).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).not.toContain("item_resolutions");
  });
});

describe("fsOpsRename (SHOULD-80, R-64)", () => {
  it("returns the new FULL path given by the backend", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("C:\\dir\\z.txt");
    const result: string = await fsOpsRename("C:\\dir\\a.txt", "z.txt");
    expect(result).toBe("C:\\dir\\z.txt");
    expect(invoke).toHaveBeenCalledWith("fs_ops_rename", { path: "C:\\dir\\a.txt", newName: "z.txt" });
  });

  it("propagates the bare error code on rejection (R-63: the caller shows it inline)", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("already_exists");
    await expect(fsOpsRename("C:\\dir\\a.txt", "b.txt")).rejects.toBe("already_exists");
  });
});

describe("other wrappers keep their contracts (regression)", () => {
  it("fsOpsCreate / fsOpsCancel / fsOpsDeleteTrash / fsOpsDeletePermanently", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await fsOpsCreate("C:\\dir", "n", "folder");
    await fsOpsCancel("op-9");
    await fsOpsDeleteTrash(["a"]);
    await fsOpsDeletePermanently(["b"]);
    expect(invoke).toHaveBeenCalledWith("fs_ops_create", { parent: "C:\\dir", name: "n", kind: "folder" });
    expect(invoke).toHaveBeenCalledWith("fs_ops_cancel", { operationId: "op-9" });
    expect(invoke).toHaveBeenCalledWith("fs_ops_delete_trash", { paths: ["a"] });
    expect(invoke).toHaveBeenCalledWith("fs_ops_delete_permanently", { paths: ["b"] });
  });
});
