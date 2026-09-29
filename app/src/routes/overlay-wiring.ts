// Composition helpers for the modal overlay (SPEC-0200-0001 §3.3.2,
// §3.3.13-4/6). Every dependency is injected; this module imports no feature
// module. It owns the imperative `.focus()` sequencing for modals (like
// navigation-wiring.ts does for the inline overlays).

import { nextFocusIndex, resolveModalKeyIntent, type ModalKeyEvent, type ModalKind } from "$lib/shared/modal-keys";

// R-13 / §3.3.2: the modal or the history list makes `isOverlayOpen` true. The
// search bar alone is not an overlay. key-dispatch evaluates an open search
// bar's Escape BEFORE the overlay branch, so while a modal is shown both
// search flags are masked (otherwise the modal's Escape would cancel the
// search instead).
// SPEC-0200-0001 §3.6.11.1 (MUST-84): `sortMenuOpen` is an OPTIONAL new
// parameter (defaults to false) so every existing call site keeps behaving
// exactly as before. The sort menu also masks the search flags (Escape must
// close the menu, not cancel the search, AC-03) but -- unlike a modal --
// does NOT close the search bar itself (R-34-13/AC-617: the search bar
// survives a sort change).
export function computeDispatchOverlayFlags(s: {
  modalOpen: boolean;
  historyOpen: boolean;
  searchActive: boolean;
  searchInputFocused: boolean;
  sortMenuOpen?: boolean;
}) {
  const sortMenuOpen = s.sortMenuOpen ?? false;
  const masked = s.modalOpen || sortMenuOpen;
  return {
    isOverlayOpen: s.modalOpen || s.historyOpen || sortMenuOpen,
    isSearchActive: s.searchActive && !masked,
    isSearchInputFocused: s.searchInputFocused && !masked,
  };
}

export interface ModalKeyHandlerDeps {
  modal: {
    readonly isOpen: boolean;
    readonly top: { kind: ModalKind } | null;
    dispatch(intent: { type: "cancel" } | { type: "submit" }): void;
  };
  focus: { cycle(dir: "next" | "prev"): void };
}

// onOverlayKey for modals. Returns whether the key was consumed
// (preventDefault); null intents return false so the browser's default
// (typing into an input, native button click) stays alive.
export function createModalKeyHandler(deps: ModalKeyHandlerDeps) {
  return function handleModalKey(event: ModalKeyEvent): boolean {
    const top = deps.modal.top;
    if (!deps.modal.isOpen || top === null) return false;
    const intent = resolveModalKeyIntent(event, top.kind);
    switch (intent) {
      case "cancel":
        deps.modal.dispatch({ type: "cancel" });
        return true;
      case "submit":
        deps.modal.dispatch({ type: "submit" });
        return true;
      case "focus_next":
        deps.focus.cycle("next");
        return true;
      case "focus_prev":
        deps.focus.cycle("prev");
        return true;
      default:
        return false;
    }
  };
}

interface FocusableLike {
  focus(): void;
}
interface DialogLike {
  querySelector(selector: string): FocusableLike | null;
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

export interface ModalFocusControllerDeps {
  getDialogEl: () => DialogLike | undefined;
  focusContainer: () => void;
  nextTick: () => Promise<void>;
  getActiveElement: () => unknown;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// §3.3.2 focus rules: opening -> the dialog's [data-modal-initial] element
// (after the DOM update); closing -> back to the file list; an unchanged
// topId (effect re-run) or the initial mount does nothing.
export function createModalFocusController(deps: ModalFocusControllerDeps) {
  let previous: number | null = null;

  async function onTopIdChange(topId: number | null): Promise<void> {
    if (topId === previous) return;
    previous = topId;
    await deps.nextTick();
    if (topId === null) {
      deps.focusContainer();
      return;
    }
    deps.getDialogEl()?.querySelector("[data-modal-initial]")?.focus();
  }

  // Tab trap: cycle among the dialog's focusable elements.
  function cycle(dir: "next" | "prev"): void {
    const dialog = deps.getDialogEl();
    if (dialog === undefined) return;
    const elements = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)) as FocusableLike[];
    const current = elements.indexOf(deps.getActiveElement() as FocusableLike);
    const next = nextFocusIndex(current, elements.length, dir);
    if (next >= 0) elements[next].focus();
  }

  return { onTopIdChange, cycle };
}

// §3.3.2 exclusion invariant / SHOULD-85: a history list open while a modal
// opens is closed (state only; the modal takes the focus).
export function syncHistoryWithModal(s: { modalOpen: boolean; history: { readonly isOpen: boolean; close(): void } }): void {
  if (s.modalOpen && s.history.isOpen) s.history.close();
}

// SHOULD-126/MUST-84 (c): a modal opening while the sort menu is shown must
// close the sort menu (same shape as syncHistoryWithModal/SHOULD-85).
export function syncSortMenuWithModal(s: {
  modalOpen: boolean;
  sortMenu: { readonly isOpen: boolean; close(): void };
}): void {
  if (s.modalOpen && s.sortMenu.isOpen) s.sortMenu.close();
}
