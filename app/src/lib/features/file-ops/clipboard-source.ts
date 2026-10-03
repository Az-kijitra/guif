// SPEC-0300-0011 R-19-2 ~ R-19-6 (SPEC-0200-0001 §3.10.8, §3.10.17.5).
// Pure decisions: where a paste comes from, and what to do after a move.

import type { PasteNotice } from "./clipboard-messages";
import type { ClipboardContent } from "./clipboard-port";

export type OsRead = { state: "files"; paths: string[] } | { state: "none" | "unavailable" };

export interface PasteSourceInput {
  os: OsRead;
  /** Sequence number read now (0 = unknown). */
  osSequence: number;
  /** Set only when the OS write succeeded (0 = "succeeded but unknown"). */
  record: { sequence: number } | null;
  internal: ClipboardContent | null;
}

export type PasteDecision =
  | { kind: "none" }
  | { kind: "internal"; paths: string[]; mode: "move" | "copy"; notice?: PasteNotice }
  | { kind: "os"; paths: string[]; mode: "copy"; notice?: PasteNotice };

// R-19-2: (1) our own OS write is still on the clipboard -> the app-internal content as it was;
// (2) the OS holds files -> those, as a COPY; (3) otherwise the app-internal content (a cut
// becomes a copy); (4) nothing. `files` with zero paths counts as "no files" (SHOULD-172).
export function resolvePasteSource(input: PasteSourceInput): PasteDecision {
  const { os, osSequence, record, internal } = input;
  const osPaths = os.state === "files" && os.paths.length > 0 ? os.paths : null;
  const matches = record !== null && record.sequence !== 0 && osSequence !== 0 && record.sequence === osSequence;
  const isCut = internal !== null && internal.origin === "internal-cut";

  if (internal !== null && matches) {
    return { kind: "internal", paths: [...internal.paths], mode: isCut ? "move" : "copy" };
  }
  if (osPaths !== null) {
    const decision: PasteDecision = { kind: "os", paths: [...osPaths], mode: "copy" };
    if (isCut) decision.notice = "cut-changed";
    return decision;
  }
  if (internal !== null) {
    const decision: PasteDecision = { kind: "internal", paths: [...internal.paths], mode: "copy" };
    if (isCut) decision.notice = record === null ? "cut-write-failed" : "cut-changed";
    return decision;
  }
  return { kind: "none" };
}

export interface AfterMoveInput {
  record: { sequence: number } | null;
  failedPaths: readonly string[];
}

// What the port must do after a move (R-19-6).
export type AfterMovePlan = {
  /** App-internal clipboard: cleared, or replaced by the failed items as a cut. */
  internal: { kind: "clear" } | { kind: "set"; paths: string[] };
  /**
   * OS clipboard: `none` = do not touch;
   * `clear` = clearIfUnchanged(sequence);
   * `rewrite` = ONE setFiles(paths, "move", { expectedSequence: sequence }) call.
   */
  os:
    | { kind: "none" }
    | { kind: "clear"; sequence: number }
    | { kind: "rewrite"; paths: string[]; expectedSequence: number };
};

export function decideAfterMove(input: AfterMoveInput): AfterMovePlan {
  const { record, failedPaths } = input;
  const sequence = record !== null && record.sequence !== 0 ? record.sequence : null;
  if (failedPaths.length === 0) {
    return { internal: { kind: "clear" }, os: sequence === null ? { kind: "none" } : { kind: "clear", sequence } };
  }
  return {
    internal: { kind: "set", paths: [...failedPaths] },
    os: sequence === null ? { kind: "none" } : { kind: "rewrite", paths: [...failedPaths], expectedSequence: sequence },
  };
}
