// SPEC-0300-0016 R-703/R-704/R-704-1, R-710~R-711, R-761~R-765; SPEC-0200-0001
// §3.7.6, §3.7.10.4 (MUST-100), §3.7.10.5 (MUST-101), §3.7.10.14 (SHOULD-143).
// Composition of the path bar feature with the rest of the page: the DOM
// operations (`.focus()`, `.select()`, caret), the blur decision (R-704 vs
// R-704-1) and the history-list hand-off live here, never in the feature
// module (which never touches `document`).

import { createPathBarState, type PathBarDeps } from "$lib/features/path-bar/path-bar-state.svelte";
import type { NavigateResult } from "$lib/shared/navigation-result";

export interface OpenHistoryFromPathBarDeps {
  history: { readonly isOpen: boolean; openHistory(): void; openJump(): void };
  search: { readonly active: boolean; cancel(): void };
  pathBar: { endEditing(): void };
  focus: { historyList(): void };
  nextTick: () => Promise<void>;
}

// R-762-4 / R-765 / MUST-101 / SHOULD-143: never goes through
// overlay.openHistoryList (which would refocus the file list on an empty
// list and destroy the path bar's edit, AC-748).
export async function openHistoryFromPathBar(
  deps: OpenHistoryFromPathBarDeps,
  mode: "history" | "jump",
): Promise<void> {
  if (mode === "history") deps.history.openHistory();
  else deps.history.openJump();
  // Empty list: it stayed closed (the no_items notice is the history state's
  // own duty) -- the path bar keeps editing, its input untouched.
  if (!deps.history.isOpen) return;
  if (deps.search.active) deps.search.cancel(); // only when the list really opened
  deps.pathBar.endEditing(); // text reset only; focus moves below
  await deps.nextTick(); // the list element is conditionally rendered
  deps.focus.historyList();
}

export type PathBarFixedKeyName = "confirm" | "cancel" | "complete" | "exit_to_list" | "open_history";
export type PathBarOverlayActionName = "history" | "history_jump_list" | "jump_add";

export interface PathBarControllerDeps {
  currentPath: () => string;
  // afterUserNavigation-wrapped navigate (history record, tree follow, R-238).
  navigate: (path: string) => Promise<NavigateResult>;
  listDirForCompletion: PathBarDeps["listDirForCompletion"];
  showHidden: () => boolean;
  notify: (message: string) => void;
  history: OpenHistoryFromPathBarDeps["history"];
  search: OpenHistoryFromPathBarDeps["search"];
  // R-710-5: closes the search bar like R-108 WITHOUT moving focus.
  closeSearchForPathBar: () => void;
  addJump: (path: string) => void;
  focus: { container(): void; historyList(): void; pathBarInput(): HTMLInputElement | undefined };
  nextTick: () => Promise<void>;
}

export function createPathBarController(deps: PathBarControllerDeps) {
  function caretToEnd(): void {
    void deps.nextTick().then(() => {
      const el = deps.focus.pathBarInput();
      if (el === undefined) return;
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

  const state = createPathBarState({
    currentPath: deps.currentPath,
    navigate: deps.navigate,
    listDirForCompletion: deps.listDirForCompletion,
    showHidden: deps.showHidden,
    notify: deps.notify,
    onExitToList: () => deps.focus.container(), // R-724/R-723/R-761-2
    onOpenHistory: (mode) => void openHistoryFromPathBar(historyDeps, mode),
    onAddJump: () => addCurrentPathToJumpList(),
    onCaretToEnd: caretToEnd, // R-730-1 / R-746
  });

  const historyDeps: OpenHistoryFromPathBarDeps = {
    history: deps.history,
    search: deps.search,
    pathBar: state,
    focus: { historyList: deps.focus.historyList },
    nextTick: deps.nextTick,
  };

  // R-762-3: the CURRENT path (not the typed text); the bar keeps editing.
  function addCurrentPathToJumpList(): void {
    const path = deps.currentPath();
    if (path) deps.addJump(path);
  }

  // R-761: Escape / Shift+Tab restore the input and leave for the file list.
  function exitToList(): void {
    state.discardEdit();
    deps.focus.container();
  }

  function onKey(key: PathBarFixedKeyName): void {
    switch (key) {
      case "confirm":
        void state.handleConfirm();
        return;
      case "cancel":
      case "exit_to_list":
        exitToList();
        return;
      case "complete":
        void state.handleTabComplete();
        return;
      case "open_history":
        void openHistoryFromPathBar(historyDeps, "history");
        return;
    }
  }

  function onOverlayAction(action: PathBarOverlayActionName): void {
    if (action === "jump_add") addCurrentPathToJumpList();
    else void openHistoryFromPathBar(historyDeps, action === "history" ? "history" : "jump");
  }

  // R-710 (the `focus_path` action): R-710-5 closes an open search bar (no
  // focus move), then focus + select-all (R-710-2). The reset of the input to
  // the current path (R-710-1) happens in handleFocus (MUST-100(a)).
  function open(): void {
    if (deps.search.active) deps.closeSearchForPathBar();
    const el = deps.focus.pathBarInput();
    if (el === undefined) return;
    el.focus();
    el.select();
  }

  function handleFocus(): void {
    state.setFocused(true);
  }

  // MUST-100(c): R-704 (window switch -> keep editing) vs R-704-1 (focus fell
  // to nowhere -> discard and go to the file list). `relatedTarget` is the
  // element receiving focus (null = nothing focusable); `document.activeElement`
  // is already `body` during `blur`, so it cannot be used here.
  function handleBlur(event: FocusEvent): void {
    if (!document.hasFocus()) return; // window switch: stay in editing
    state.setFocused(false);
    if (event.relatedTarget === null) {
      state.discardEdit();
      deps.focus.container();
    }
  }

  return {
    state,
    open,
    handleFocus,
    handleBlur,
    handleInput: (value: string) => state.setText(value),
    keys: { onKey, onOverlayAction },
  };
}
