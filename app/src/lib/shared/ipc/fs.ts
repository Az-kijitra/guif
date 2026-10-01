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

// SPEC-0200-0001 §3.6.11.6 (MUST-89, §19 第15回 MUST-95): the structured
// error type lives in ./fs-error (re-exported); SPEC-0300-0016 R-731-1 adds
// the `not_a_directory` code.
import { FsListDirError, normalizeFsListDirError } from "./fs-error";
export { FsListDirError, normalizeFsListDirError };
export type { FsListDirErrorCode } from "./fs-error";

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

// SPEC-0300-0016 R-780~R-785: logical drive roots ("C:\\", "D:\\", ...), in
// drive-letter order. Never fails by design (R-783); an invoke() failure is
// passed through as an exception (not swallowed into []) so the tree can
// treat it like any other unexpected listing failure.
export function fsListDrives(): Promise<string[]> {
  return invoke<string[]>("fs_list_drives");
}
