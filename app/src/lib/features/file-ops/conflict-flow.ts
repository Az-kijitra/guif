// SPEC-0300-0011 §5 (R-30~R-36): UI-side confirm-dialog *sequencing* for a
// paste batch that hits one or more name conflicts. This module does not
// perform any filesystem work itself — see app/src-tauri/src/fs_ops/transfer.rs
// for the actual per-item overwrite/skip execution and the non-UI-path
// `conflict` rejection (AC-29/AC-29-1).

import type { ConflictChoice, ConflictDecision, ConflictSessionResult } from "$lib/shared/conflict-session";

// SPEC-0200-0001 §3.4.1: the async session, the choice constant and their
// types live in shared/ so that features/archive uses the SAME implementation
// (SPEC-0300-0014 R-377).
export { CONFLICT_DIALOG_CHOICES, runConflictSessionAsync } from "$lib/shared/conflict-session";
export type {
  AsyncConflictDecider,
  ConflictChoice,
  ConflictDecision,
  ConflictSessionResult,
} from "$lib/shared/conflict-session";

export interface ConflictDialogState {
  name: string;
  applyToAll: boolean;
  defaultFocus: "cancel";
}

// R-34-1/R-35: "apply to all" starts checked; default focus is the safe
// side ("cancel").
export function createConflictDialogState(name: string): ConflictDialogState {
  return {
    name,
    applyToAll: true,
    defaultFocus: "cancel",
  };
}

export type ConflictDecider = (item: string) => ConflictDecision;

// R-33/R-34/R-34-2: run the conflict-dialog sequencing over a batch of
// conflicting items. When "apply to all" is checked, the first decision is
// reused for every subsequent item without asking again; otherwise each
// item is evaluated individually (one at a time, per R-34-2).
export function runConflictSession(items: readonly string[], decide: ConflictDecider): ConflictSessionResult {
  // Null prototype: an entry named "__proto__" must be an ordinary own key
  // (it is sent to the backend as a JSON key), not a prototype assignment.
  const resolutions: Record<string, "overwrite" | "skip"> = Object.create(null);
  let appliedChoice: "overwrite" | "skip" | null = null;

  for (const item of items) {
    let choice: ConflictChoice;

    if (appliedChoice !== null) {
      choice = appliedChoice;
    } else {
      const decision = decide(item);
      choice = decision.choice;

      if (choice === "cancel") {
        return { canceled: true, resolutions: {} };
      }

      if (decision.applyToAll) {
        appliedChoice = choice;
      }
    }

    resolutions[item] = choice;
  }

  return { canceled: false, resolutions };
}
