// SPEC-0300-0015 R-447, R-513: the ONLY place that translates a viewer error
// code into a user-facing string (SPEC-0200-0001 §3.5.7/§3.5.9). The Rust
// `ViewerErrorCode` enum is not shared across the IPC boundary -- only the
// wire strings are kept consistent (SPEC-0300-0011 第6版 R-85, ISS-0128).

import { VIEWER_ERROR_MESSAGES, VIEWER_FALLBACK } from "./messages";

export type ViewerDisplayErrorCode =
  | "not_found"
  | "not_a_file"
  | "permission_denied"
  | "viewer_path_not_allowed"
  | "viewer_image_too_large"
  | "image_decode_failed" // R-485 (frontend-only: <img> failed to decode)
  | "unsupported_kind" // R-493 (frontend-only: navigated to an OS-open file)
  | "io_error"
  | "invalid_path" // R-89-2 / R-447: a path argument that is not absolute (same wording as shared/error-text.ts)
  | "unknown";

// SPEC-0200-0001 §3.13 (P7): the table itself lives in `./messages`.
const MESSAGES: Record<ViewerDisplayErrorCode, string> = VIEWER_ERROR_MESSAGES;

const FALLBACK = VIEWER_FALLBACK;

// R-447: never leaks the internal `code=<code>; <message>` representation
// (or the raw code string itself) into the display text; an unrecognized
// code (a future backend addition this build does not know) still returns a
// safe string instead of throwing.
export function formatViewerError(code: ViewerDisplayErrorCode): string {
  return MESSAGES[code] ?? FALLBACK;
}
