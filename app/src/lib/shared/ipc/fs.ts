// SPEC-0200-0001 §4.5: shared/ipc/ holds thin, per-feature Tauri invoke()
// wrappers only (no business logic, no state), one file per feature's
// backend module (never a single aggregated ipc.ts). This file is the
// fs-feature wrapper (SPEC-0300-0009, back_module `fs`) around the
// `fs_list_dir` Tauri command registered in
// app/src-tauri/src/fs/commands.rs.

import { invoke } from "@tauri-apps/api/core";

export type FsEntryType = "file" | "dir";

// Mirrors app/src-tauri/src/fs/commands.rs::FsEntryDto (camelCase on the
// wire; Tauri's invoke() layer converts these JS param names to the Rust
// command's snake_case parameter names automatically).
export interface FsEntry {
  name: string;
  path: string;
  entryType: FsEntryType;
  size: number;
  modified: string;
  hidden: boolean;
  ext: string;
}

export interface FsListDirParams {
  path: string;
  showHidden: boolean;
  sortKey: string;
  sortOrder: string;
}

// SPEC-0200-0001 §3.6.11.6 (MUST-89, §19 第15回 MUST-95): `fs_list_dir`'s
// backend error is now a structured `{code, message}` DTO. Tauri's `invoke()`
// rejects with that DTO as-is, so it is normalized into a real `Error`
// subclass here (the same precedent `shared/ipc/archive.ts`'s `ArchiveError`/
// `normalizeArchiveError` set) — otherwise `list-state.svelte.ts`'s existing
// `e instanceof Error ? e.message : String(e)` catch clause would display
// "[object Object]".
export type FsListDirErrorCode = "access_denied" | "not_found" | "other";

export class FsListDirError extends Error {
  code: FsListDirErrorCode;

  constructor(code: FsListDirErrorCode, message: string) {
    super(message);
    this.name = "FsListDirError";
    this.code = code;
  }
}

const KNOWN_CODES: readonly FsListDirErrorCode[] = ["access_denied", "not_found", "other"];

// Never throws: any rejected value becomes an FsListDirError. Accepts the 3
// input shapes MUST-95 requires: a structured DTO object, a bare string (an
// ACL-rejection message, or the pre-MUST-89 command shape), or an Error
// instance.
export function normalizeFsListDirError(raw: unknown): FsListDirError {
  if (raw instanceof FsListDirError) return raw;
  if (typeof raw === "string") return new FsListDirError("other", raw);
  if (raw instanceof Error) return new FsListDirError("other", raw.message);
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { code?: unknown; message?: unknown };
    const code = KNOWN_CODES.includes(o.code as FsListDirErrorCode) ? (o.code as FsListDirErrorCode) : "other";
    return new FsListDirError(code, typeof o.message === "string" ? o.message : "");
  }
  return new FsListDirError("other", String(raw));
}

// R-70: the single directory-enumeration command, used by both the file
// list and the tree (SPEC-0300-0009 §7).
export function fsListDir(params: FsListDirParams): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("fs_list_dir", {
    path: params.path,
    showHidden: params.showHidden,
    sortKey: params.sortKey,
    sortOrder: params.sortOrder,
  }).catch((e) => {
    throw normalizeFsListDirError(e);
  });
}
