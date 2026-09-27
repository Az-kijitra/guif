// SPEC-0300-0015 R-401~R-407, R-401-2, R-401-3, R-401-5, R-401-6, R-402,
// R-402-1, R-402-2, R-403, R-404: the shared keyboard/mouse "what happens
// when this row is opened" judgment (SPEC-0200-0001 §3.5.7, SHOULD-110).
// Pure and DOM-free: called from both `routes/list-action-wiring.ts`'s
// `case "open"` and the file list's double-click handler.

export type OpenDecision = "navigate-dir" | "open-file" | "os-open" | "noop";

export interface OpenDecisionEntry {
  entryType: "file" | "dir";
}

// `entry === null` covers R-402-1 (focused entry not displayed / no focus at
// all); the tree panel's own Shift+Enter no-op (R-401-6/ISS-0124(d)) is
// handled at the wiring layer (the tree's focus row is always a directory,
// so it never reaches this function for a file at all).
export function decideOpen(entry: OpenDecisionEntry | null, shiftKey: boolean): OpenDecision {
  if (entry === null) return "noop";
  if (entry.entryType === "dir") {
    // R-401-3: Shift+Enter on a directory does nothing (folder move only via
    // a non-Shift open, R-403).
    return shiftKey ? "noop" : "navigate-dir";
  }
  // R-401-2/R-404: a file opens in the viewer, or via the OS association app
  // when Shift is held.
  return shiftKey ? "os-open" : "open-file";
}
