// SPEC-0300-0021 R-1530 / R-1531 / R-1560 / SPEC-0200-0001 §3.16.6: the target of a key or a menu-bar launch is the FOCUS ROW only (never the
// selection); with no focus row it is the current folder, treated as a folder. Pure.

import { SHARED_SENTENCES } from "$lib/shared/messages";

export interface Target {
  path: string;
  kind: "file" | "dir";
}

export function decideTarget(input: { focusRow: { path: string; entryType: "file" | "dir" } | null; currentPath: string }): Target | null {
  if (input.focusRow !== null) return { path: input.focusRow.path, kind: input.focusRow.entryType };
  if (input.currentPath !== "") return { path: input.currentPath, kind: "dir" };
  return null;
}

// R-1560: disabled only when no target can be decided; the reason is the shared "no target" sentence (W-9D).
export function isAvailable(target: Target | null): { enabled: boolean; reason?: string } {
  return target === null ? { enabled: false, reason: SHARED_SENTENCES.noTarget } : { enabled: true };
}
