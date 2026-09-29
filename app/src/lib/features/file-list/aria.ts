// SPEC-0300-0009 §3.1/§3.4 (R-10~R-14, R-24, R-25) and initial-display
// defaults (R-21/R-30 note/R-74 note). These functions compute the *data*
// (role/attribute values, initial UI state) that the eventual Svelte
// components render, so accessibility/screen-init acceptance criteria can be
// verified without a DOM rendering environment (SPEC-0400-0001 §3).

import type { SortKey, SortOrder } from "./sort";

export interface InitialUiState {
  showTree: boolean;
  showSize: boolean;
  showTime: boolean;
  sortKey: SortKey;
  sortOrder: SortOrder;
  showHidden: boolean;
}

// R-13: ui_show_tree default true. R-21: size shown, time hidden by default.
// R-30 note (ISS-0022-c): initial sort name/asc. R-74 note (ISS-0022-c):
// hidden files not shown by default.
export const INITIAL_UI_STATE: InitialUiState = {
  showTree: true,
  showSize: true,
  showTime: false,
  sortKey: "name",
  sortOrder: "asc",
  showHidden: false,
};

// R-12/AC-55 (8th ed., SPEC-0200-0001 §3.6.11.4 MUST-87(e)): the tree panel
// is a fixed 220px with no resize range (min === max === default).
export const TREE_PANEL_WIDTH = { default: 220, min: 220, max: 220 } as const;

export interface TreeFocusReassignmentInput {
  focusRegion: "tree" | "file-list";
  treeNowVisible: boolean;
}

export interface TreeFocusReassignmentResult {
  focusRegion: "tree" | "file-list";
}

// R-14/AC-09: hiding the tree while focus is inside it reassigns focus to
// the file list.
export function computeTreeFocusReassignment(
  input: TreeFocusReassignmentInput,
): TreeFocusReassignmentResult {
  if (input.focusRegion === "tree" && !input.treeNowVisible) {
    return { focusRegion: "file-list" };
  }
  return { focusRegion: input.focusRegion };
}

export interface FileListAria {
  role: "listbox";
  "aria-multiselectable": true;
  "aria-activedescendant"?: string;
}

// R-24/AC-52, SPEC-0300-0012 R-119/AC-120 (SPEC-0200-0001 §3.1.6 SHOULD-39):
// file list root ARIA attributes. `aria-activedescendant` is omitted
// entirely (not just left pointing at a stale id) when the focused entry has
// been filtered out of the currently visible set, so the list never keeps
// pointing at a hidden row.
export function computeFileListAria(input: {
  focusedPath: string;
  isFocusedPathVisible: boolean;
}): FileListAria {
  return {
    role: "listbox",
    "aria-multiselectable": true,
    ...(input.isFocusedPathVisible ? { "aria-activedescendant": input.focusedPath } : {}),
  };
}

export interface RowAria {
  role: "option";
  "aria-selected": boolean;
}

// R-24/AC-53: each row's ARIA attributes.
export function computeRowAria(input: { selected: boolean }): RowAria {
  return { role: "option", "aria-selected": input.selected };
}

export interface TreeAria {
  role: "tree";
}

// R-25/AC-54: tree root ARIA attributes.
export function computeTreeAria(): TreeAria {
  return { role: "tree" };
}

export interface TreeItemAria {
  role: "treeitem";
  "aria-level": number;
  "aria-expanded": boolean;
}

// R-25/AC-54: tree node ARIA attributes.
export function computeTreeItemAria(input: { level: number; expanded: boolean }): TreeItemAria {
  return { role: "treeitem", "aria-level": input.level, "aria-expanded": input.expanded };
}
