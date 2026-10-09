// SPEC-0300-0014 R-394/R-395: translation of the backend's machine-readable
// error codes. The translation lives ONLY here (SPEC-0200-0001 §3.4.1); the
// Rust side returns codes and the library message. Not shared with
// features/file-ops (§4.1). There is no password-related code (R-390-1).
// SPEC-0200-0001 §3.13 (P7): the table itself lives in `./messages` (ARCHIVE_ERROR_MESSAGES).

import { ARCHIVE_ERROR_MESSAGES, ARCHIVE_MESSAGES } from "./messages";

// R-394: an unrecognised code has no translation so the caller falls back to
// the original message.
export function translateArchiveErrorCode(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(ARCHIVE_ERROR_MESSAGES, code) ? ARCHIVE_ERROR_MESSAGES[code] : null;
}

export interface ArchiveErrorLike {
  code: string;
  message: string;
  entryPath?: string;
}

// R-395-1/R-395-4: translation + the offending path + the library message as
// a detail (never lost, never repeated when it is just the bare code).
export function formatArchiveError(e: ArchiveErrorLike): string {
  const translated = translateArchiveErrorCode(e.code);
  const message = e.message ?? "";
  const parts: string[] = [];
  if (translated !== null) {
    parts.push(translated);
  } else {
    parts.push(message !== "" ? message : e.code);
  }
  if (e.entryPath !== undefined && e.entryPath !== "") parts.push(ARCHIVE_MESSAGES.targetPart(e.entryPath));
  if (translated !== null && message !== "" && message !== e.code) parts.push(ARCHIVE_MESSAGES.detailPart(message));
  return parts.join(" ");
}

// R-395-1: a pre-validation rejection - tell the user nothing was written.
export function formatPreflightError(e: ArchiveErrorLike): string {
  return `${formatArchiveError(e)}${ARCHIVE_MESSAGES.nothingWritten}`;
}
