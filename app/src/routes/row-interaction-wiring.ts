// The file list row's click/double-click handlers extracted from +page.svelte
// (SPEC-0200-0001 §3.3.5/MUST-80: the main list page stays a thin composition
// layer, ≤400 lines). SPEC-0300-0015 R-401-5/R-402-2/R-407 (SPEC-0300-0009
// R-50~R-52, ISS-0132): a click resolves selection via `fileList.clickRow`
// (`features/file-list/click.ts`); a double-click reuses the SAME
// `open-decision.ts` judgment as the keyboard "open" action (SHOULD-110), so
// a directory navigates and a file opens in the viewer -- opening itself
// never changes focus/selection again (R-407).

import { decideOpen } from "$lib/features/viewer/open-decision";
import type { NavigateResult } from "$lib/shared/navigation-result";

interface RowEntry {
  entryType: "file" | "dir";
  path: string;
}

export interface RowInteractionDeps<E extends RowEntry = RowEntry> {
  fileList: {
    entries: readonly E[];
    focusedIndex: number;
    clickRow(visible: readonly E[], path: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }): void;
    openFocused(): Promise<NavigateResult>;
  };
  filteredEntries: () => readonly E[];
  isFocusedPathVisible: () => boolean;
  afterUserNavigation: (navigation: Promise<NavigateResult>) => Promise<NavigateResult>;
  viewer: { openFile(path: string): void | Promise<unknown> };
}

export function createRowInteractionHandlers<E extends RowEntry>(deps: RowInteractionDeps<E>) {
  // R-402/R-402-1: the "open"/"Shift+Enter" target is the focused entry, but
  // only when it is currently displayed (search filter).
  function focusedEntry(): { entryType: "file" | "dir"; path: string } | null {
    if (!deps.isFocusedPathVisible()) return null;
    const entry = deps.fileList.entries[deps.fileList.focusedIndex];
    return entry === undefined ? null : { entryType: entry.entryType, path: entry.path };
  }

  function handleRowClick(path: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }): void {
    deps.fileList.clickRow(deps.filteredEntries(), path, modifiers);
  }

  function handleRowDblClick(entry: E): void {
    const decision = decideOpen({ entryType: entry.entryType }, false);
    if (decision === "navigate-dir") {
      void deps.afterUserNavigation(deps.fileList.openFocused());
    } else if (decision === "open-file") {
      void deps.viewer.openFile(entry.path);
    }
  }

  return { focusedEntry, handleRowClick, handleRowDblClick };
}
