// SPEC-0300-0011 §3.2 (R-16, R-19, R-19-1): clipboard drop-effect output and
// paste-mode resolution.
//
// AC-04/AC-05/AC-06 (real OS clipboard round-trips with another
// application) are OS-integration-level checks and are out of scope for
// this module's automated unit tests; only the pure decision functions
// below are covered here.

// R-16: the drop-effect value this app writes to the OS clipboard when the
// user cuts internally (output-side only; see resolvePasteMode for why this
// app never reads such a hint back on paste, R-19-1).
export function dropEffectForCut(): "MOVE" {
  return "MOVE";
}

export type ClipboardOrigin = "internal-cut" | "internal-copy" | "external";

export interface PasteModeInput {
  origin: ClipboardOrigin;
  paths: readonly string[];
}

export type PasteMode = "move" | "copy";

// R-19/R-19-1: only this app's own cut resolves to a move. Every other
// origin — this app's own copy, or any external clipboard (even one that
// claims to be a cut via a drop-effect hint we deliberately never read) —
// resolves to a copy.
export function resolvePasteMode(input: PasteModeInput): PasteMode {
  return input.origin === "internal-cut" ? "move" : "copy";
}

// R-16 / SPEC-0200-0001 §3.10.8: the `Preferred DropEffect` to WRITE to the OS clipboard
// (only an internal cut writes "move").
export function osEffectFor(origin: ClipboardOrigin): "copy" | "move" {
  return origin === "internal-cut" ? "move" : "copy";
}
