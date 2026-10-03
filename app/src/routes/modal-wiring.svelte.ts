// Extracted from +page.svelte (SPEC-0200-0001 §3.9.11 extraction (1), §3.9.17.7): the modal's
// focus control and the overlay exclusion invariants (history list / sort menu / right-click
// menu are closed while a modal is open). Must be called during component initialisation
// (it registers `$effect`s).

import { tick, untrack } from "svelte";
import {
  createModalFocusController,
  createModalKeyHandler,
  syncContextMenuWithModal,
  syncHistoryWithModal,
  syncSortMenuWithModal,
} from "./overlay-wiring";

type ClosableOverlay = { readonly isOpen: boolean; close(): void };

export interface ModalWiringDeps {
  modal: Parameters<typeof createModalKeyHandler>[0]["modal"] & { readonly topId: number | null };
  history: ClosableOverlay;
  sortMenu: ClosableOverlay;
  contextMenu: ClosableOverlay;
  getDialogEl: Parameters<typeof createModalFocusController>[0]["getDialogEl"];
  focusContainer: () => void;
}

export function createModalWiring(deps: ModalWiringDeps) {
  const modalFocus = createModalFocusController({
    getDialogEl: deps.getDialogEl,
    focusContainer: deps.focusContainer,
    nextTick: tick,
    getActiveElement: () => document.activeElement,
  });
  const handleModalKey = createModalKeyHandler({ modal: deps.modal, focus: modalFocus });

  // §3.3.13-6: focus control runs in $effect (after the DOM update, so the
  // background is no longer inert when the container is refocused).
  $effect(() => {
    const topId = deps.modal.topId;
    untrack(() => void modalFocus.onTopIdChange(topId));
  });
  // §3.3.2/§3.6.11.1 exclusion invariants (SHOULD-85/MUST-84 (c)); R-1104 for the context menu.
  $effect(() => {
    const modalOpen = deps.modal.isOpen;
    syncHistoryWithModal({ modalOpen, history: deps.history });
    syncSortMenuWithModal({ modalOpen, sortMenu: deps.sortMenu });
    syncContextMenuWithModal({ modalOpen, contextMenu: deps.contextMenu });
  });

  return { handleModalKey };
}
