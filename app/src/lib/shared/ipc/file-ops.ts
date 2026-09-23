// SPEC-0200-0001 §4.5: shared/ipc/ holds thin, per-feature Tauri invoke()
// wrappers only (no business logic, no state), one file per feature's
// backend module (never a single aggregated ipc.ts). This file is the
// file-ops-feature wrapper (SPEC-0300-0011, back_module `fs_ops`) around
// the commands registered in app/src-tauri/src/fs_ops/commands.rs.
//
// R-40~R-45 (progress/cancel, ISS-0052): fsOpsCopy/fsOpsMove take an
// `operationId` (mint one with createFileOpsOperationId()) that correlates
// their progress events (listenFileOpsProgress) and cancellation
// (fsOpsCancel) — see fs_ops/commands.rs's module doc comment for the
// backend side of this contract.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Mirrors app/src-tauri/src/fs_ops/commands.rs::FailureDto (camelCase on
// the wire).
export interface FileOpsFailure {
  path: string;
  code: string;
  message: string;
}

// Mirrors app/src-tauri/src/fs_ops/commands.rs::OpSummaryDto.
export interface FileOpsSummary {
  ok: number;
  failed: number;
  total: number;
  skipped: number;
  failures: FileOpsFailure[];
}

// R-30/R-31: "reject" (the non-UI-path default, R-30-1/R-30-2) is applied
// unless the caller has an explicit user decision from the conflict dialog
// (features/file-ops/conflict-flow.ts).
export type FileOpsConflictResolution = "reject" | "overwrite" | "skip";

// R-40~R-45: one per-item progress notification broadcast by fsOpsCopy/
// fsOpsMove while they run. Deliberately kept structurally compatible with
// (but NOT importing) features/file-ops/progress-modal.ts's frozen
// `ProgressEvent` type: shared/ipc/ must never import from features/
// (SPEC-0200-0001 §4.1, dependency direction is routes/ -> features/ ->
// shared/ only). The feature layer passes values of this type directly
// into progress-modal.ts's applyProgressEvent — structurally assignable,
// since this type only adds `operationId` on top of that frozen shape.
export interface FileOpsProgressEvent {
  operationId: string;
  type: "start" | "done" | "fail";
  name: string;
  index: number;
  total: number;
  code?: string;
}

// R-40~R-45 (ISS-0052): the Tauri event name fs_ops_copy/fs_ops_move
// broadcast per-item progress under. Mirrors
// app/src-tauri/src/fs_ops/commands.rs::PROGRESS_EVENT_NAME (see that
// module's doc comment for the architecture-mapper follow-up note on this
// naming/channel convention).
const PROGRESS_EVENT_NAME = "fs_ops://progress";

// Mints a per-call operation id for progress/cancel correlation (Web
// Crypto API, available in the Tauri webview). Callers mint one before
// invoking fsOpsCopy/fsOpsMove so they can start listening (and can
// cancel) without racing the backend's own id assignment.
export function createFileOpsOperationId(): string {
  return crypto.randomUUID();
}

export function fsOpsCopy(
  operationId: string,
  items: string[],
  destination: string,
  resolution: FileOpsConflictResolution = "reject",
): Promise<FileOpsSummary> {
  return invoke<FileOpsSummary>("fs_ops_copy", { operationId, items, destination, resolution });
}

export function fsOpsMove(
  operationId: string,
  items: string[],
  destination: string,
  resolution: FileOpsConflictResolution = "reject",
): Promise<FileOpsSummary> {
  return invoke<FileOpsSummary>("fs_ops_move", { operationId, items, destination, resolution });
}

// R-40/R-41: subscribe to progress events for one specific copy/move
// operation. Thin wrapper only — filters by operationId and forwards the
// payload as-is; accumulation/formatting/display logic all lives in
// features/file-ops/progress-modal.ts, never here.
export function listenFileOpsProgress(
  operationId: string,
  onEvent: (event: FileOpsProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<FileOpsProgressEvent>(PROGRESS_EVENT_NAME, (e) => {
    if (e.payload.operationId === operationId) {
      onEvent(e.payload);
    }
  });
}

// R-42/R-43: request cancellation of a previously-started copy/move batch.
export function fsOpsCancel(operationId: string): Promise<void> {
  return invoke<void>("fs_ops_cancel", { operationId });
}

// R-56/R-56-4: the caller decides trash vs. permanent (delete-flow.ts's
// resolveDeleteMode) before invoking the corresponding command.
export function fsOpsDeleteTrash(paths: string[]): Promise<FileOpsSummary> {
  return invoke<FileOpsSummary>("fs_ops_delete_trash", { paths });
}

export function fsOpsDeletePermanently(paths: string[]): Promise<FileOpsSummary> {
  return invoke<FileOpsSummary>("fs_ops_delete_permanently", { paths });
}

export function fsOpsRename(path: string, newName: string): Promise<void> {
  return invoke<void>("fs_ops_rename", { path, newName });
}

export type CreateKind = "file" | "folder";

export function fsOpsCreate(parent: string, name: string, kind: CreateKind): Promise<void> {
  return invoke<void>("fs_ops_create", { parent, name, kind });
}
