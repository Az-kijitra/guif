// SPEC-0200-0001 §3.4.1: the conflict-dialog sequencing shared by every
// feature that asks "overwrite / skip / cancel" per conflicting item
// (SPEC-0300-0011 R-31~R-35, SPEC-0300-0014 R-374/R-377). Pure; imports no
// feature (§4.1). features/file-ops/conflict-flow.ts re-exports these.

// R-31/R-31-1: exactly these three choices, in this order - no "keep both".
export const CONFLICT_DIALOG_CHOICES = ["overwrite", "skip", "cancel"] as const;
export type ConflictChoice = (typeof CONFLICT_DIALOG_CHOICES)[number];

export interface ConflictDecision {
  choice: ConflictChoice;
  applyToAll: boolean;
}

export interface ConflictSessionResult {
  canceled: boolean;
  resolutions: Record<string, "overwrite" | "skip">;
}

export type AsyncConflictDecider = (item: string) => Promise<ConflictDecision>;

// R-33/R-34/R-34-2: items are asked one at a time, awaiting each answer.
// When "apply to all" is checked the first decision is reused for the rest.
// A cancel aborts the whole batch with empty resolutions. A decide rejection
// propagates to the caller.
export async function runConflictSessionAsync(
  items: readonly string[],
  decide: AsyncConflictDecider,
): Promise<ConflictSessionResult> {
  // Null prototype: an entry named "__proto__" must be an ordinary own key
  // (it is sent to the backend as a JSON key), not a prototype assignment.
  const resolutions: Record<string, "overwrite" | "skip"> = Object.create(null);
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
