import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0015 R-447, R-513. AC-457.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.5.7/§3.5.9
//   (`features/viewer/error-format.ts`: the ONLY place that translates a
//   `ViewerErrorDto.code` into a user-facing string; the Rust enum is not
//   shared, only the wire strings are kept consistent).
// Module under test (not yet implemented): ./error-format.ts
//
// Contract assumed (documented in the handback report):
//   export type ViewerDisplayErrorCode =
//     | "not_found" | "not_a_file" | "permission_denied"
//     | "viewer_path_not_allowed" | "viewer_image_too_large"
//     | "image_decode_failed"      // R-485 (frontend-only: <img> failed to decode)
//     | "unsupported_kind"         // R-493 (frontend-only: navigated to an OS-open file)
//     | "io_error" | "unknown";
//   formatViewerError(code: ViewerDisplayErrorCode): string

import { translateErrorCode } from "$lib/shared/error-text";
import { formatViewerError } from "./error-format";

const ALL_CODES = [
  "not_found",
  "not_a_file",
  "permission_denied",
  "viewer_path_not_allowed",
  "viewer_image_too_large",
  "image_decode_failed",
  "unsupported_kind",
  "io_error",
  "unknown",
] as const;

describe("formatViewerError (R-447)", () => {
  it("R-513: every documented error code has a distinct, non-empty message", () => {
    const messages = ALL_CODES.map((code) => formatViewerError(code));
    for (const m of messages) {
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(0);
    }
    expect(new Set(messages).size).toBe(ALL_CODES.length);
  });

  it("R-447: the internal `code=<code>; <message>` representation never leaks into the display text", () => {
    for (const code of ALL_CODES) {
      const m = formatViewerError(code);
      expect(m.startsWith("code=")).toBe(false);
      expect(m).not.toBe(code);
    }
  });

  it("R-444: the 50 MiB image size limit message states the fixed limit", () => {
    expect(formatViewerError("viewer_image_too_large")).toMatch(/50\s*MiB/);
  });

  it("R-493: the 'cannot display' message for an OS-open-only file during prev/next is distinguishable from a hard error", () => {
    const unsupported = formatViewerError("unsupported_kind");
    const permission = formatViewerError("permission_denied");
    expect(unsupported).not.toBe(permission);
  });

  it("an unrecognized code still returns a safe, non-throwing fallback string", () => {
    // Deliberately outside the known union (a hypothetical future backend
    // code this frontend build does not know about yet) -- must not throw.
    expect(() => formatViewerError("something_new" as never)).not.toThrow();
  });
});

// SPEC-0300-0015 第6版 R-440 / R-447 / R-513, AC-514 / AC-515 (unit-test-writer, 2026-10-07):
// `invalid_path` (the backend refuses a path that is not absolute) is a documented viewer code.
// The cast keeps this file type-checking before `ViewerDisplayErrorCode` gains "invalid_path"
// (SPEC-0200-0001 §3.12.6).
describe("formatViewerError: invalid_path (R-447, SPEC-0200-0001 §3.12.6)", () => {
  const INVALID_PATH = "invalid_path" as string as Parameters<typeof formatViewerError>[0];

  it("has its own message", () => {
    expect(formatViewerError(INVALID_PATH)).toBe("パスが正しくありません。");
  });

  it("is the same text as shared/error-text.ts (the viewer table is the only place that translates, but the wording must not drift)", () => {
    expect(formatViewerError(INVALID_PATH)).toBe(translateErrorCode("invalid_path"));
  });

  it("is distinct from every other viewer message and never leaks the raw code or the internal `code=` form", () => {
    const m = formatViewerError(INVALID_PATH);
    for (const code of ALL_CODES) expect(formatViewerError(code)).not.toBe(m);
    expect(m).not.toBe("invalid_path");
    expect(m.startsWith("code=")).toBe(false);
  });

  it("a viewer-side invalid_path is not the 'unknown' fallback", () => {
    expect(formatViewerError(INVALID_PATH)).not.toBe(formatViewerError("unknown"));
  });
});
