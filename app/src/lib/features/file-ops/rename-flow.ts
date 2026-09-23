// SPEC-0300-0011 §8 (R-60~R-63): rename dialog behavior — initial name
// selection, Enter/Escape handling, and inline error display.

export interface RenameInitialSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

// R-60-1: preset the existing name and select only the stem (the part
// before the extension); a name with no extension has its entire value
// selected.
export function computeRenameInitialSelection(name: string): RenameInitialSelection {
  const lastDotIndex = name.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0;
  const selectionEnd = hasExtension ? lastDotIndex : name.length;

  return { value: name, selectionStart: 0, selectionEnd };
}

export interface RenameKeyLikeEvent {
  key: string;
}

// R-61: Enter confirms, Escape cancels.
export function handleRenameDialogKeydown(event: RenameKeyLikeEvent): "confirm" | "cancel" | null {
  if (event.key === "Enter") {
    return "confirm";
  }
  if (event.key === "Escape") {
    return "cancel";
  }
  return null;
}

export interface RenameDialogState {
  name: string;
  error: string | null;
  closed: boolean;
}

// R-63: validation/already_exists errors are shown inline, without closing
// the dialog, so the user can retry.
export function applyRenameError(state: RenameDialogState, code: string): RenameDialogState {
  return { ...state, error: code, closed: false };
}
