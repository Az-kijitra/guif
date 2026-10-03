// SPEC-0200-0001 §3.9.11 (second extraction candidate): the history list's row click / remove
// callbacks, moved out of +page.svelte. Behaviour is unchanged (SPEC-0300-0013).

import type { ListKeyIntent } from "$lib/features/navigation-history/list-ops";

export interface HistoryRowHandlersDeps {
  history: { readonly isOpen: boolean; selectIndex(index: number): void; removeIndex(index: number): void };
  overlay: { handleIntent(intent: ListKeyIntent | null): boolean };
  focusContainer: () => void;
}

export function createHistoryRowHandlers(deps: HistoryRowHandlersDeps) {
  return {
    onHistoryRowClick(index: number): void {
      deps.history.selectIndex(index);
      deps.overlay.handleIntent("confirm");
    },
    onHistoryRemove(index: number): void {
      deps.history.removeIndex(index);
      if (!deps.history.isOpen) deps.focusContainer();
    },
  };
}
