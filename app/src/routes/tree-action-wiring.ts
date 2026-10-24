// SPEC-0300-0009 R-43/R-43-1/R-65/R-66/R-14-14/R-59-2, AC-25/AC-49~AC-51/
// AC-614/AC-615/AC-623. SPEC-0300-0010 R-15/R-15-1, AC-59-1. Architecture:
// docs/architecture/proposals/SPEC-0200-0001.md §3.6.6
// (routes/tree-action-wiring.ts::createTreeActionHandler, the tree-side
// counterpart of routes/list-action-wiring.ts), §3.6.11.4 (d) (MUST-87:
// "open" must use pathsEqual, not !==, to decide whether to reload). Every
// dependency is injected; this module imports no feature module.

import { normalizeForTreeComparison, treePageStep } from "$lib/features/file-list/tree";
import { pathComparisonKey } from "$lib/shared/path-key";
import type { NavigateResult } from "$lib/shared/navigation-result";

export interface TreeActionDeps {
  tree: {
    moveFocus(direction: "up" | "down"): void;
    moveFocusPage(direction: "up" | "down", pageSize: number): void;
    handleMoveRight(): void; // R-65
    handleMoveLeft(): void; // R-66
    selectFocused(): { path: string } | null; // R-43
    toggleExpand(path: string): void;
  };
  afterUserNavigation: (navigation: Promise<NavigateResult>) => Promise<NavigateResult>;
  // SPEC-0200-0001 §3.7.2: node selection (drive nodes included, R-773) goes
  // through the shared navigate() so failures reach R-238/R-773-1 handling.
  navigate: (path: string) => Promise<NavigateResult>;
  fullyVisibleRows: () => number; // R-59-2
  currentPath: () => string;
}

// R-43/R-773 (shared by the keyboard "open" action and a tree row click):
// navigate to the node's path only when it differs from the current one.
// MUST-87(d)/SHOULD-146: both sides are compared with the `\\?\` prefix removed
// (tree node paths never carry it) and case/trailing-separator insensitively
// (R-40-6), so an already-open path triggers no reload / history entry.
export function createTreePathSelector(
  deps: Pick<TreeActionDeps, "afterUserNavigation" | "navigate" | "currentPath">,
) {
  return function selectTreePath(path: string): void {
    const same =
      pathComparisonKey(normalizeForTreeComparison(path)) ===
      pathComparisonKey(normalizeForTreeComparison(deps.currentPath()));
    // R-43-1: focus stays on the tree (the caller never touches focus).
    if (!same) void deps.afterUserNavigation(deps.navigate(path));
  };
}

export function createTreeActionHandler(deps: TreeActionDeps) {
  const selectTreePath = createTreePathSelector(deps);
  return function onTreeAction(action: string, event: { shiftKey: boolean }): boolean {
    // R-15-1(結果面)/AC-615: "open" with Shift (Shift+Enter) is routed here
    // by R-15 (TREE_HANDLED_ACTIONS includes "open"); the observed behavior
    // (nothing happens) is realized by checking the Shift modifier here and
    // no-op'ing (§3.6.10 所見1: R-15-1's wording assumes the file-list
    // handler receives it, but the actual delivery path per R-15 is this
    // tree handler).
    if (action === "open" && event.shiftKey) return true;

    switch (action) {
      case "move_up":
        deps.tree.moveFocus("up");
        return true;
      case "move_down":
        deps.tree.moveFocus("down");
        return true;
      case "page_up":
        // Bug fix (code-reviewer B2): R-59-2/AC-623 defines the tree's page
        // step as fullyVisibleRows-1 (min 1), via tree.ts::treePageStep --
        // passing fullyVisibleRows() straight through moved by ONE ROW TOO
        // MANY (e.g. 10 fully-visible rows must move by 9, not 10).
        deps.tree.moveFocusPage("up", treePageStep(deps.fullyVisibleRows()));
        return true;
      case "page_down":
        deps.tree.moveFocusPage("down", treePageStep(deps.fullyVisibleRows()));
        return true;
      case "move_right":
        deps.tree.handleMoveRight();
        return true;
      case "move_left":
        deps.tree.handleMoveLeft();
        return true;
      case "open": {
        const target = deps.tree.selectFocused();
        if (target !== null) selectTreePath(target.path);
        return true;
      }
      case "select_toggle": {
        const target = deps.tree.selectFocused();
        if (target !== null) {
          deps.tree.toggleExpand(target.path);
        }
        return true;
      }
      default:
        return false;
    }
  };
}
