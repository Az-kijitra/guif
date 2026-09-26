// SPEC-0200-0001 §3.4.2/§3.4.6/§4.5: thin invoke wrappers for the ZIP
// create / extract commands registered in app/src-tauri/src/archive/commands.rs.
// No business logic and no state. Every command rejects with an ArchiveError
// (normalised from the backend's { code, message, entryPath? } DTO).
//
// SPEC-0300-0014 R-386: progress arrives on its own event namespace
// (`archive://progress`), separate from the file operations. R-387-1: the
// operation id is minted by the caller.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const PROGRESS_EVENT_NAME = "archive://progress";

// R-394/R-395-4: machine-readable code + the library message + the entry
// path (archive-internal or filesystem) that caused the error, if any.
export class ArchiveError extends Error {
  code: string;
  entryPath?: string;

  constructor(code: string, message: string, entryPath?: string) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
    if (entryPath !== undefined) this.entryPath = entryPath;
  }
}

const CODE_FORMAT = /^code=([^;]+);\s*([\s\S]*)$/;

// Never throws: any rejected value becomes an ArchiveError (unknown code when
// nothing structured can be recovered; the original text is never lost).
export function normalizeArchiveError(raw: unknown): ArchiveError {
  if (raw instanceof ArchiveError) return raw;
  if (typeof raw === "string") {
    const m = CODE_FORMAT.exec(raw);
    if (m !== null) return new ArchiveError(m[1].trim(), m[2]);
    return new ArchiveError("unknown", raw);
  }
  if (raw instanceof Error) return new ArchiveError("unknown", raw.message);
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { code?: unknown; message?: unknown; entryPath?: unknown };
    if (typeof o.code === "string") {
      return new ArchiveError(
        o.code,
        typeof o.message === "string" ? o.message : "",
        typeof o.entryPath === "string" ? o.entryPath : undefined,
      );
    }
  }
  return new ArchiveError("unknown", String(raw));
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw normalizeArchiveError(e);
  }
}

// Mirrors archive/commands.rs DTOs (camelCase on the wire).
export interface ArchiveCheckCreateResult {
  outputPath: string;
  overwriteRequired: boolean;
}

export interface ArchiveCreateResult {
  outputPath: string;
  entries: number;
  skippedLinks: number;
}

export interface ArchiveConflictsResult {
  destination: string;
  totalEntries: number;
  conflicts: { entryPath: string }[];
}

export type ArchiveResolution = "overwrite" | "skip";
export type ArchiveResolutions = Record<string, ArchiveResolution>;

export interface ArchiveErrorInfo {
  code: string;
  message: string;
  entryPath?: string;
}

export interface ArchiveExtractResult {
  extracted: number;
  skipped: number;
  total: number;
  destination: string;
  outcome: "completed" | "failed" | "canceled";
  error?: ArchiveErrorInfo;
}

export interface ArchiveProgressEvent {
  operationId: string;
  name: string;
  index: number;
  total: number;
}

// R-322-1/R-325/R-326: pre-validation only; nothing is written.
export function archiveCheckCreate(
  items: string[],
  outputPath: string,
  baseDir: string,
): Promise<ArchiveCheckCreateResult> {
  return call("archive_check_create", { items, outputPath, baseDir });
}

// R-326-3: `overwrite` is always sent explicitly, never implied.
export function archiveCreate(
  operationId: string,
  items: string[],
  outputPath: string,
  baseDir: string,
  overwrite: boolean,
): Promise<ArchiveCreateResult> {
  return call("archive_create", { operationId, items, outputPath, baseDir, overwrite });
}

// R-371: conflict detection is a backend decision.
export function archiveDetectConflicts(
  zipPath: string,
  destination: string,
  baseDir: string,
): Promise<ArchiveConflictsResult> {
  return call("archive_detect_conflicts", { zipPath, destination, baseDir });
}

// R-375: without resolutions the key is omitted (no instruction is invented).
export function archiveExtract(
  operationId: string,
  zipPath: string,
  destination: string,
  baseDir: string,
  resolutions?: ArchiveResolutions,
): Promise<ArchiveExtractResult> {
  return call("archive_extract", {
    operationId,
    zipPath,
    destination,
    baseDir,
    ...(resolutions !== undefined ? { resolutions } : {}),
  });
}

export async function archiveCancel(operationId: string): Promise<void> {
  await call<void>("archive_cancel", { operationId });
}

export function createArchiveOperationId(): string {
  return crypto.randomUUID();
}

// R-386/R-387-1: only events of THIS operation are forwarded.
export function listenArchiveProgress(
  operationId: string,
  onEvent: (event: ArchiveProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<ArchiveProgressEvent>(PROGRESS_EVENT_NAME, (e) => {
    if (e.payload.operationId === operationId) onEvent(e.payload);
  });
}
