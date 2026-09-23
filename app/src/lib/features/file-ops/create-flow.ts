// SPEC-0300-0011 §9 (R-71~R-76): new-entry creation dialog state.

export type CreateEntryPoint = "new_file" | "new_folder" | "context_menu";
export type CreateKind = "file" | "folder";

export interface CreateDialogState {
  name: string;
  kind: CreateKind;
  error: string | null;
  closed: boolean;
}

// R-71: name always starts empty. R-72-1/R-72-2/R-72-3: the entry point
// decides the initial kind — `new_folder` starts as "folder"; every other
// entry point (`new_file`, the single unsplit context-menu entry) starts as
// "file".
export function initialCreateState(entryPoint: CreateEntryPoint): CreateDialogState {
  return {
    name: "",
    kind: entryPoint === "new_folder" ? "folder" : "file",
    error: null,
    closed: false,
  };
}

// R-74: already_exists (and other creation errors) are shown inline, dialog
// stays open.
export function applyCreateError(state: CreateDialogState, code: string): CreateDialogState {
  return { ...state, error: code, closed: false };
}

export interface CreateSuccessState {
  name: string;
  kind: CreateKind;
  error: string | null;
  closed: boolean;
}

// R-76: on success the dialog closes and does not enter a rename-armed
// ("editing") state.
export function applyCreateSuccess(state: CreateDialogState): CreateSuccessState {
  return { name: state.name, kind: state.kind, error: null, closed: true };
}
