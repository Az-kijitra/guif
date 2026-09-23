// SPEC-0300-0011 §7 (R-53~R-56-4-1): delete confirm-dialog flow and the
// trash/permanent-delete mode decision.
//
// R-56/R-56-4/R-56-4-1: the Shift modifier on the `delete` keypress (not the
// key's letter case) decides trash-delete vs. permanent-delete; the actual
// keymap matching that gets an event to this point is SPEC-0300-0010's
// responsibility (AC-42/AC-50) — this module only owns the *decision* once
// such an event is known to be the `delete` action.
//
// AC-37 (a deleted item is actually restorable from the real OS Recycle
// Bin) is an OS-level integration concern and out of scope for this
// module's unit tests; see app/src-tauri/src/fs_ops/delete.rs's module doc
// comment for the backend-side equivalent note.

export type DeleteMode = "trash" | "permanent";

export interface DeleteKeyLikeEvent {
  shiftKey: boolean;
}

// R-56-4/R-56-4-1: Shift decides permanent vs. trash, independent of the
// key's own case.
export function resolveDeleteMode(event: DeleteKeyLikeEvent): DeleteMode {
  return event.shiftKey ? "permanent" : "trash";
}

// R-53/R-55: exactly these two choices, default focus on the safe side.
export const DELETE_DIALOG_CHOICES = ["delete", "cancel"] as const;
export type DeleteDialogChoice = (typeof DELETE_DIALOG_CHOICES)[number];
export const DELETE_DIALOG_DEFAULT_FOCUS: DeleteDialogChoice = "cancel";

export interface DeleteConfirmFlowResult {
  proceed: boolean;
}

// R-53/R-56-1: choosing "delete" proceeds (for either mode); "cancel" never
// proceeds.
export function runDeleteConfirmFlow(
  targets: readonly string[],
  mode: DeleteMode,
  choice: DeleteDialogChoice,
): DeleteConfirmFlowResult {
  return { proceed: choice === "delete" };
}

export interface DeleteConfirmContent {
  shownNames: string[];
  truncated: boolean;
  count: number;
  irreversible: boolean;
  mode: DeleteMode;
}

const MAX_SHOWN_NAMES = 3;

// R-54: a single target shows its name; 4+ targets show the count plus the
// first 3 names, with the rest truncated. R-56-1: permanent-delete content
// is marked irreversible, distinct from trash-delete.
export function buildDeleteConfirmContent(targets: readonly string[], mode: DeleteMode): DeleteConfirmContent {
  const shownNames = targets.slice(0, MAX_SHOWN_NAMES);
  return {
    shownNames,
    truncated: targets.length > MAX_SHOWN_NAMES,
    count: targets.length,
    irreversible: mode === "permanent",
    mode,
  };
}
