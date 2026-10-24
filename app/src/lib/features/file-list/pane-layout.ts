// SPEC-0300-0023 R-1763 / R-1764 / R-1795 / R-1804; SPEC-0200-0001 §3.18.7 / §3.18.8: the headings of the list and tree frames and the tree width.
// Pure; the wording is in ./messages.ts (W-C0 / W-C1, the sort-key names of W-06).

import { PANE_MESSAGES, SORT_KEY_LABELS } from "./messages";

export interface ListHeadingInput {
  count: number;
  sortKey: keyof typeof SORT_KEY_LABELS;
  sortOrder: "asc" | "desc";
  // hasLeft = startCol > 0; hasRight = startCol + shown < totalCols.
  hasLeft: boolean;
  hasRight: boolean;
}

export function listHeadingText(input: ListHeadingInput): string {
  const text = PANE_MESSAGES.listHeading(input.count, SORT_KEY_LABELS[input.sortKey], input.sortOrder);
  return (input.hasLeft ? PANE_MESSAGES.hiddenLeft : "") + text + (input.hasRight ? PANE_MESSAGES.hiddenRight : "");
}

export function treeHeadingText(): string {
  return PANE_MESSAGES.treeHeading;
}

// R-1804 1: an integer px (CSS `%` does not floor).
export function treePanelWidthPx(bodyWidth: number, percent: number): number {
  return Math.max(0, Math.floor((bodyWidth * percent) / 100));
}
