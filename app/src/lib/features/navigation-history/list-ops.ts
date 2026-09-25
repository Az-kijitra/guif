// Pure logic for the visit-history / jump-list overlay (SPEC-0300-0013 R-251-2,
// SPEC-0200-0001 §3.2.3 / §3.2.8 / §3.2.10). DOM/Tauri independent; does NOT
// import features/keyboard (MUST-53, R-252).

import { applyMru, dedupeAndLimit } from "$lib/shared/mru-list";

// Locally defined structural type (MUST-53); keyboard's KeydownLikeEvent is
// structurally assignable to it.
export interface ListKeydownLikeEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const VISIT_HISTORY_LIMIT = 50; // R-205
const JUMP_LIST_LIMIT = 20; // R-205
const PAGE_STEP = 10; // R-228

// Stored/display form: case preserved (R-207-2).
export function normalizeStoredForm(path: string): string {
  let normalized = path.replace(/\//g, "\\");

  // Collapse consecutive separators BEFORE the UNC test (SHOULD-73), keeping
  // the leading "\\" marker of a UNC path.
  normalized = normalized.startsWith("\\\\")
    ? "\\\\" + normalized.slice(2).replace(/\\+/g, "\\")
    : normalized.replace(/\\+/g, "\\");

  const uncMatch = normalized.match(/^\\\\([^\\]+)\\([^\\]+)(.*)$/);
  if (uncMatch) {
    const rest = uncMatch[3].replace(/\\+$/, "");
    return `\\\\${uncMatch[1]}\\${uncMatch[2]}${rest}`;
  }

  // SHOULD-61(a): bare drive letter is completed to the drive root.
  if (/^[A-Za-z]:$/.test(normalized)) {
    return normalized + "\\";
  }
  if (/^[A-Za-z]:\\$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\\+$/, "");
}

// Comparison-only key: case folded (R-207).
export function pathComparisonKey(path: string): string {
  return normalizeStoredForm(path).toLowerCase();
}

export function addVisit(list: readonly string[], path: string): string[] {
  return applyMru(list, normalizeStoredForm(path), VISIT_HISTORY_LIMIT, pathComparisonKey);
}

export function addJumpEntry(list: readonly string[], path: string): string[] {
  return applyMru(list, normalizeStoredForm(path), JUMP_LIST_LIMIT, pathComparisonKey);
}

export function dedupeVisitHistory(list: readonly string[]): string[] {
  return dedupeAndLimit(list.map(normalizeStoredForm), VISIT_HISTORY_LIMIT, pathComparisonKey);
}

export function dedupeJumpList(list: readonly string[]): string[] {
  return dedupeAndLimit(list.map(normalizeStoredForm), JUMP_LIST_LIMIT, pathComparisonKey);
}

// R-213
export function removeAt(list: readonly string[], index: number): string[] {
  if (index < 0 || index >= list.length) return [...list];
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

// R-213-3
export function clampSelectionIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

export type SelectionDirection = "up" | "down" | "pageUp" | "pageDown" | "home" | "end";

// R-227/R-228: no wrap, page = +-10.
export function moveSelectionIndex(
  current: number,
  direction: SelectionDirection,
  length: number,
): number {
  let next: number;
  switch (direction) {
    case "up":
      next = current - 1;
      break;
    case "down":
      next = current + 1;
      break;
    case "pageUp":
      next = current - PAGE_STEP;
      break;
    case "pageDown":
      next = current + PAGE_STEP;
      break;
    case "home":
      next = 0;
      break;
    case "end":
      next = length - 1;
      break;
  }
  return clampSelectionIndex(next, length);
}

export type ListKeyIntent =
  | "switch_history"
  | "switch_jump"
  | "move_up"
  | "move_down"
  | "page_up"
  | "page_down"
  | "home"
  | "end"
  | "confirm"
  | "delete"
  | "cancel"
  | "trap";

// §3.2.8 (MUST-50): fixed keys are evaluated before the keymap-resolved
// mode-switch actions.
export function resolveListKeyIntent(
  event: ListKeydownLikeEvent,
  resolvedAction: string | null,
): ListKeyIntent | null {
  if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
    return "trap"; // SHOULD-71
  }
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    switch (event.key) {
      case "ArrowUp":
        return "move_up";
      case "ArrowDown":
        return "move_down";
      case "PageUp":
        return "page_up";
      case "PageDown":
        return "page_down";
      case "Home":
        return "home";
      case "End":
        return "end";
      case "Enter":
        return "confirm";
      case "Escape":
        return "cancel";
      case "Delete":
        return "delete";
    }
  }
  if (resolvedAction === "history") return "switch_history";
  if (resolvedAction === "history_jump_list") return "switch_jump";
  return null;
}
