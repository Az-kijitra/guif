// Feature-local UI state for the visit-history / jump-list overlay
// (SPEC-0200-0001 §3.2.3, §5.1). Never touches the DOM (§3.2.9-1); focus
// control is the responsibility of routes. Each mutation calls
// navigationPersistence.requestSave() itself (R-243); hydrate() does not.

import { navigationPersistence } from "$lib/shared/state/navigation-persistence.svelte";
import { COMMON } from "$lib/shared/messages";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import {
  addJumpEntry,
  addVisit,
  clampSelectionIndex,
  dedupeJumpList,
  dedupeVisitHistory,
  moveSelectionIndex,
  removeAt,
  type SelectionDirection,
} from "./list-ops";

export type NavigationHistoryMode = "history" | "jump";

const NO_ITEMS_MESSAGE = COMMON.noItems; // R-218

export function createNavigationHistoryState() {
  let visitHistory = $state<string[]>([]);
  let jumpList = $state<string[]>([]);
  let isOpen = $state(false);
  let mode = $state<NavigationHistoryMode>("history");
  let selectedIndex = $state(0);

  function listFor(target: NavigationHistoryMode): string[] {
    return target === "history" ? visitHistory : jumpList;
  }

  function hydrate(loadedVisitHistory: readonly string[], loadedJumpList: readonly string[]): void {
    visitHistory = dedupeVisitHistory(loadedVisitHistory);
    jumpList = dedupeJumpList(loadedJumpList);
  }

  function recordVisit(path: string): void {
    visitHistory = addVisit(visitHistory, path);
    navigationPersistence.requestSave();
  }

  function addJump(path: string): void {
    jumpList = addJumpEntry(jumpList, path);
    navigationPersistence.requestSave();
  }

  function open(target: NavigationHistoryMode): void {
    if (listFor(target).length === 0) {
      statusMessage.show(NO_ITEMS_MESSAGE); // R-218
      return;
    }
    mode = target;
    selectedIndex = 0;
    isOpen = true;
  }

  function openHistory(): void {
    open("history");
  }

  function openJump(): void {
    open("jump");
  }

  function switchMode(next: NavigationHistoryMode): void {
    if (listFor(next).length === 0) {
      statusMessage.show(NO_ITEMS_MESSAGE); // R-218-1
      return;
    }
    mode = next;
    selectedIndex = 0;
  }

  function close(): void {
    isOpen = false;
  }

  function moveSelection(direction: SelectionDirection): void {
    selectedIndex = moveSelectionIndex(selectedIndex, direction, listFor(mode).length);
  }

  // Sets the selection directly (mouse click on a row).
  function selectIndex(index: number): void {
    selectedIndex = clampSelectionIndex(index, listFor(mode).length);
  }

  function selectedPath(): string | null {
    return listFor(mode)[selectedIndex] ?? null;
  }

  // R-213: delete a specific row (the delete button passes its own index).
  function removeIndex(index: number): void {
    const list = listFor(mode);
    if (index < 0 || index >= list.length) return;
    const next = removeAt(list, index);
    if (mode === "history") visitHistory = next;
    else jumpList = next;
    if (next.length === 0) {
      isOpen = false; // R-224 #3
      selectedIndex = 0;
    } else if (index < selectedIndex) {
      selectedIndex = clampSelectionIndex(selectedIndex - 1, next.length);
    } else {
      selectedIndex = clampSelectionIndex(selectedIndex, next.length);
    }
    navigationPersistence.requestSave();
  }

  function removeSelected(): void {
    removeIndex(selectedIndex);
  }

  return {
    get visitHistory() {
      return visitHistory;
    },
    get jumpList() {
      return jumpList;
    },
    get isOpen() {
      return isOpen;
    },
    get mode() {
      return mode;
    },
    get selectedIndex() {
      return selectedIndex;
    },
    hydrate,
    recordVisit,
    addJump,
    openHistory,
    openJump,
    switchMode,
    close,
    moveSelection,
    selectIndex,
    selectedPath,
    removeSelected,
    removeIndex,
  };
}

export const navigationHistoryState = createNavigationHistoryState();

navigationPersistence.register({
  getSnapshot: () => ({
    visitHistory: $state.snapshot(navigationHistoryState.visitHistory),
    jumpList: $state.snapshot(navigationHistoryState.jumpList),
  }),
  hydrate: (data) => navigationHistoryState.hydrate(data.visitHistory, data.jumpList),
});
