// SPEC-0300-0011 §5 (R-30~R-36): UI-side confirm-dialog *sequencing* for a
// paste batch that hits one or more name conflicts. This module does not
// perform any filesystem work itself — see app/src-tauri/src/fs_ops/transfer.rs
// for the actual per-item overwrite/skip execution and the non-UI-path
// `conflict` rejection (AC-29/AC-29-1).

// R-31/R-31-1: exactly these three choices, in this order — no "keep both".
export const CONFLICT_DIALOG_CHOICES = ["overwrite", "skip", "cancel"] as const;
export type ConflictChoice = (typeof CONFLICT_DIALOG_CHOICES)[number];

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

export interface ConflictDecision {
  choice: ConflictChoice;
  applyToAll: boolean;
}

export type ConflictDecider = (item: string) => ConflictDecision;

export interface ConflictSessionResult {
  canceled: boolean;
  resolutions: Record<string, "overwrite" | "skip">;
}

// R-33/R-34/R-34-2: run the conflict-dialog sequencing over a batch of
// conflicting items. When "apply to all" is checked, the first decision is
// reused for every subsequent item without asking again; otherwise each
// item is evaluated individually (one at a time, per R-34-2).
export function runConflictSession(items: readonly string[], decide: ConflictDecider): ConflictSessionResult {
  const resolutions: Record<string, "overwrite" | "skip"> = {};
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

export type AsyncConflictDecider = (item: string) => Promise<ConflictDecision>;

// Async twin of runConflictSession (SPEC-0200-0001 §3.3.4): a synchronous
// decider cannot wait for a dialog. Items are asked one at a time, awaiting
// each answer (R-34-2). A decide rejection propagates to the caller.
export async function runConflictSessionAsync(
  items: readonly string[],
  decide: AsyncConflictDecider,
): Promise<ConflictSessionResult> {
  const resolutions: Record<string, "overwrite" | "skip"> = {};
  let appliedChoice: "overwrite" | "skip" | null = null;

  for (const item of items) {
    let choice: ConflictChoice;
    if (appliedChoice !== null) {
      choice = appliedChoice;
    } else {
      const decision = await decide(item);
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
