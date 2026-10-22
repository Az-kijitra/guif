import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0010 第8版 R-12 (priority table), R-13 (overlays trap keys),
//   R-14-2, R-14-3, R-16-2, §3.1 classification (c), AC-56;
//   SPEC-0300-0011 R-42-1/R-42-2 (progress modal is an overlay), AC-32-1
//   (background list does not react while a modal is shown).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.2
//   (computeDispatchOverlayFlags / createModalKeyHandler /
//   createModalFocusController, mutual exclusion invariant, focus rules),
//   §3.3.13-6 (focus control in $effect, initial mount does not focus the
//   container), §3.3.13-4 (SHOULD-85: history closes when a modal opens).
// Module under test (not yet implemented): ./overlay-wiring.ts (routes-only
//   wiring helper, all dependencies injected, imports no feature).
//
// Contract assumed for the helpers whose exact signature the design leaves
// open (documented in the handback report):
//   computeDispatchOverlayFlags({ modalOpen, historyOpen, searchActive,
//     searchInputFocused }) -> { isOverlayOpen, isSearchActive,
//     isSearchInputFocused }                        (fixed by §3.3.2)
//   createModalKeyHandler({ modal: { isOpen, top: {kind}|null,
//     dispatch(intent) }, focus: { cycle(dir: "next"|"prev") } })
//     -> (event) => boolean
//   createModalFocusController({ getDialogEl, focusContainer, nextTick,
//     getActiveElement }) -> { onTopIdChange(topId: number|null): Promise<void>,
//     cycle(dir: "next"|"prev"): void }
//   syncHistoryWithModal({ modalOpen, history: { isOpen, close() } }): void

import { dispatchKeydown } from "$lib/features/keyboard/key-dispatch";
import {
  computeDispatchOverlayFlags,
  createModalFocusController,
  createModalKeyHandler,
  syncHistoryWithModal,
} from "./overlay-wiring";

// Phase 7 (SPEC-0200-0001 §3.6.11.1 MUST-84): `syncSortMenuWithModal` is a
// NEW export -- a second import so the existing tests above (against the
// current exports) keep passing unaffected.
import { syncSortMenuWithModal } from "./overlay-wiring";

function key(k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing", boolean>> = {}) {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods };
}

describe("computeDispatchOverlayFlags (§3.3.2)", () => {
  const base = { modalOpen: false, historyOpen: false, searchActive: false, searchInputFocused: false };

  it("nothing open => all false", () => {
    expect(computeDispatchOverlayFlags(base)).toEqual({
      isOverlayOpen: false,
      isSearchActive: false,
      isSearchInputFocused: false,
      isPathBarEditing: false, // Phase 8 (MUST-99(b)): new always-present flag
    });
  });

  it("isOverlayOpen = modalOpen || historyOpen (R-13)", () => {
    expect(computeDispatchOverlayFlags({ ...base, modalOpen: true }).isOverlayOpen).toBe(true);
    expect(computeDispatchOverlayFlags({ ...base, historyOpen: true }).isOverlayOpen).toBe(true);
    expect(computeDispatchOverlayFlags({ ...base, modalOpen: true, historyOpen: true }).isOverlayOpen).toBe(true);
  });

  it("the search bar alone is NOT an overlay in the R-13 sense", () => {
    const flags = computeDispatchOverlayFlags({ ...base, searchActive: true, searchInputFocused: true });
    expect(flags.isOverlayOpen).toBe(false);
  });

  it("without a modal the search flags pass through unchanged", () => {
    expect(computeDispatchOverlayFlags({ ...base, searchActive: true })).toMatchObject({
      isSearchActive: true,
      isSearchInputFocused: false,
    });
    expect(computeDispatchOverlayFlags({ ...base, searchActive: true, searchInputFocused: true })).toMatchObject({
      isSearchActive: true,
      isSearchInputFocused: true,
    });
  });

  it("regression (must be red-first): while a modal is shown, an open search bar is masked (isSearchActive=false) so the modal's Escape is not stolen", () => {
    const flags = computeDispatchOverlayFlags({ ...base, modalOpen: true, searchActive: true });
    expect(flags.isSearchActive).toBe(false);
  });

  it("while a modal is shown, a focused search input is masked too (isSearchInputFocused=false)", () => {
    const flags = computeDispatchOverlayFlags({ ...base, modalOpen: true, searchActive: true, searchInputFocused: true });
    expect(flags.isSearchInputFocused).toBe(false);
    expect(flags.isOverlayOpen).toBe(true);
  });

  it("the history list open does not mask the search flags (they are mutually exclusive by the existing overlay controller)", () => {
    const flags = computeDispatchOverlayFlags({ ...base, historyOpen: true, searchActive: true });
    expect(flags.isSearchActive).toBe(true);
  });
});

describe("integration with dispatchKeydown (search bar open + modal opened)", () => {
  function makeCtx(flags: ReturnType<typeof computeDispatchOverlayFlags>, overrides: Record<string, unknown> = {}) {
    return {
      isMenuBarActive: false,
      isTreeFocused: false,
      customOverrides: {},
      ...flags,
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(false),
      onOverlayKey: vi.fn().mockReturnValue(true),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(false),
      onSearchAction: vi.fn(),
      ...overrides,
    };
  }

  it("Escape with a modal shown and the search bar open (focus elsewhere) reaches the overlay handler, NOT the search cancel", () => {
    const flags = computeDispatchOverlayFlags({
      modalOpen: true,
      historyOpen: false,
      searchActive: true,
      searchInputFocused: false,
    });
    const ctx = makeCtx(flags);
    expect(dispatchKeydown(key("Escape"), ctx)).toBe(true);
    expect(ctx.onSearchAction).not.toHaveBeenCalled();
    expect(ctx.onOverlayKey).toHaveBeenCalledTimes(1);
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("without the mask (modal closed) the same Escape does cancel the search (existing behavior preserved)", () => {
    const flags = computeDispatchOverlayFlags({
      modalOpen: false,
      historyOpen: false,
      searchActive: true,
      searchInputFocused: false,
    });
    const ctx = makeCtx(flags);
    expect(dispatchKeydown(key("Escape"), ctx)).toBe(true);
    expect(ctx.onSearchAction).toHaveBeenCalledWith("cancel");
    expect(ctx.onOverlayKey).not.toHaveBeenCalled();
  });

  it("with a modal shown, list keys never reach the list handler (R-13 / AC-32-1)", () => {
    const flags = computeDispatchOverlayFlags({ modalOpen: true, historyOpen: false, searchActive: false, searchInputFocused: false });
    const ctx = makeCtx(flags, { onOverlayKey: vi.fn().mockReturnValue(false) });
    dispatchKeydown(key("ArrowDown"), ctx);
    dispatchKeydown(key("Delete"), ctx);
    dispatchKeydown(key("a", { ctrlKey: true }), ctx);
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });

  it("R-14-3 + modal: a custom exit='Q' does not exit while a modal is shown (Q reaches the overlay handler); Ctrl+Q still does", () => {
    const flags = computeDispatchOverlayFlags({ modalOpen: true, historyOpen: false, searchActive: false, searchInputFocused: false });
    const ctx = makeCtx(flags, {
      customOverrides: { exit: "Q" },
      onExitAction: vi.fn().mockReturnValue(true),
      onOverlayKey: vi.fn().mockReturnValue(false),
      onHardcodedShortcut: vi.fn().mockReturnValue(true),
    });
    dispatchKeydown(key("q"), ctx);
    expect(ctx.onExitAction).not.toHaveBeenCalled();
    expect(ctx.onOverlayKey).toHaveBeenCalled();
    dispatchKeydown(key("q", { ctrlKey: true }), ctx);
    expect(ctx.onHardcodedShortcut).toHaveBeenCalledWith("exit", expect.anything());
  });
});

describe("createModalKeyHandler (§3.3.2 onOverlayKey for modals)", () => {
  function setup(kind: "confirm" | "form" | "progress" = "form") {
    const modal = { isOpen: true, top: { kind }, dispatch: vi.fn() };
    const focus = { cycle: vi.fn() };
    const handler = createModalKeyHandler({ modal, focus });
    return { modal, focus, handler };
  }

  it("Escape => dispatch cancel and returns true (preventDefault)", () => {
    const { modal, handler } = setup("form");
    expect(handler(key("Escape"))).toBe(true);
    expect(modal.dispatch).toHaveBeenCalledWith({ type: "cancel" });
  });

  it("form Enter => dispatch submit and returns true", () => {
    const { modal, handler } = setup("form");
    expect(handler(key("Enter"))).toBe(true);
    expect(modal.dispatch).toHaveBeenCalledWith({ type: "submit" });
  });

  it("confirm Enter => null intent => returns false and dispatches nothing (native button click)", () => {
    const { modal, handler } = setup("confirm");
    expect(handler(key("Enter"))).toBe(false);
    expect(modal.dispatch).not.toHaveBeenCalled();
  });

  it("Tab / Shift+Tab => focus.cycle('next'/'prev') and returns true", () => {
    const { focus, handler } = setup("confirm");
    expect(handler(key("Tab"))).toBe(true);
    expect(focus.cycle).toHaveBeenLastCalledWith("next");
    expect(handler(key("Tab", { shiftKey: true }))).toBe(true);
    expect(focus.cycle).toHaveBeenLastCalledWith("prev");
  });

  it("an ordinary character in the form => false (browser inserts it into the input) and no side effect", () => {
    const { modal, focus, handler } = setup("form");
    expect(handler(key("q"))).toBe(false);
    expect(modal.dispatch).not.toHaveBeenCalled();
    expect(focus.cycle).not.toHaveBeenCalled();
  });

  it("IME composition Enter/Escape => false, nothing dispatched (SHOULD-78)", () => {
    const { modal, handler } = setup("form");
    expect(handler(key("Enter", { isComposing: true }))).toBe(false);
    expect(handler(key("Escape", { isComposing: true }))).toBe(false);
    expect(modal.dispatch).not.toHaveBeenCalled();
  });

  it("progress Escape => cancel (R-42-2: same path as the cancel button)", () => {
    const { modal, handler } = setup("progress");
    expect(handler(key("Escape"))).toBe(true);
    expect(modal.dispatch).toHaveBeenCalledWith({ type: "cancel" });
  });
});

describe("AC-56: modal-local keys are independent of custom keymap overrides", () => {
  it("even with clear_selection disabled and open remapped, Escape still cancels and form Enter still submits through dispatchKeydown", () => {
    const modal = { isOpen: true, top: { kind: "form" as const }, dispatch: vi.fn() };
    const handler = createModalKeyHandler({ modal, focus: { cycle: vi.fn() } });
    const ctx = {
      isOverlayOpen: true,
      isMenuBarActive: false,
      isTreeFocused: false,
      isSearchInputFocused: false,
      isSearchActive: false,
      customOverrides: { clear_selection: "", open: "X", delete: "F8", move_down: "J" },
      onHardcodedShortcut: vi.fn().mockReturnValue(false),
      onExitAction: vi.fn().mockReturnValue(false),
      onOverlayKey: (_action: string | null, event: { key: string }) => handler(event as never),
      onMenuBarKey: vi.fn().mockReturnValue(false),
      onTreeAction: vi.fn().mockReturnValue(false),
      onListAction: vi.fn().mockReturnValue(false),
      onSearchAction: vi.fn(),
    };
    expect(dispatchKeydown(key("Escape"), ctx)).toBe(true);
    expect(modal.dispatch).toHaveBeenLastCalledWith({ type: "cancel" });
    expect(dispatchKeydown(key("Enter"), ctx)).toBe(true);
    expect(modal.dispatch).toHaveBeenLastCalledWith({ type: "submit" });
    expect(ctx.onListAction).not.toHaveBeenCalled();
  });
});

describe("createModalFocusController (§3.3.2 focus rules, §3.3.13-6)", () => {
  function setup() {
    const initialEl = { focus: vi.fn() };
    const dialogEl = {
      querySelector: vi.fn((sel: string) => (sel.includes("data-modal-initial") ? initialEl : null)),
      querySelectorAll: vi.fn(() => [] as unknown[]),
    };
    const focusContainer = vi.fn();
    const nextTick = vi.fn(() => Promise.resolve());
    const ctl = createModalFocusController({
      getDialogEl: () => dialogEl,
      focusContainer,
      nextTick,
      getActiveElement: () => null,
    });
    return { initialEl, dialogEl, focusContainer, nextTick, ctl };
  }

  it("initial mount (topId null from the start) does NOT focus the container", async () => {
    const { ctl, focusContainer } = setup();
    await ctl.onTopIdChange(null);
    expect(focusContainer).not.toHaveBeenCalled();
  });

  it("a modal opening (topId null -> 1) focuses the [data-modal-initial] element after nextTick", async () => {
    const { ctl, initialEl, nextTick, focusContainer } = setup();
    await ctl.onTopIdChange(null);
    await ctl.onTopIdChange(1);
    expect(nextTick).toHaveBeenCalled();
    expect(initialEl.focus).toHaveBeenCalledTimes(1);
    expect(focusContainer).not.toHaveBeenCalled();
  });

  it("the modal closing (topId 1 -> null) returns focus to the container (always restore focus somewhere)", async () => {
    const { ctl, focusContainer } = setup();
    await ctl.onTopIdChange(1);
    await ctl.onTopIdChange(null);
    expect(focusContainer).toHaveBeenCalledTimes(1);
  });

  it("an unchanged topId does nothing (previous value is remembered; the effect may re-run)", async () => {
    const { ctl, initialEl, focusContainer } = setup();
    await ctl.onTopIdChange(1);
    await ctl.onTopIdChange(1);
    expect(initialEl.focus).toHaveBeenCalledTimes(1);
    await ctl.onTopIdChange(null);
    await ctl.onTopIdChange(null);
    expect(focusContainer).toHaveBeenCalledTimes(1);
  });

  it("a different modal opening in sequence (1 -> null -> 2) focuses the new initial element again", async () => {
    const { ctl, initialEl } = setup();
    await ctl.onTopIdChange(1);
    await ctl.onTopIdChange(null);
    await ctl.onTopIdChange(2);
    expect(initialEl.focus).toHaveBeenCalledTimes(2);
  });

  it("no [data-modal-initial] element / no dialog element does not throw", async () => {
    const focusContainer = vi.fn();
    const ctl = createModalFocusController({
      getDialogEl: () => undefined,
      focusContainer,
      nextTick: () => Promise.resolve(),
      getActiveElement: () => null,
    });
    await expect(ctl.onTopIdChange(1)).resolves.not.toThrow();
  });

  it("cycle('next'/'prev') moves focus among the dialog's focusable elements via nextFocusIndex (Tab trap)", () => {
    const a = { focus: vi.fn() };
    const b = { focus: vi.fn() };
    const c = { focus: vi.fn() };
    let active: unknown = b;
    const dialogEl = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [a, b, c]),
    };
    const ctl = createModalFocusController({
      getDialogEl: () => dialogEl,
      focusContainer: vi.fn(),
      nextTick: () => Promise.resolve(),
      getActiveElement: () => active as never,
    });
    ctl.cycle("next");
    expect(c.focus).toHaveBeenCalledTimes(1);
    active = c;
    ctl.cycle("next"); // wraps
    expect(a.focus).toHaveBeenCalledTimes(1);
    active = a;
    ctl.cycle("prev"); // wraps back
    expect(c.focus).toHaveBeenCalledTimes(2);
  });

  it("cycle with focus outside the dialog (-1): next => first, prev => last", () => {
    const a = { focus: vi.fn() };
    const b = { focus: vi.fn() };
    const dialogEl = { querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => [a, b]) };
    const ctl = createModalFocusController({
      getDialogEl: () => dialogEl,
      focusContainer: vi.fn(),
      nextTick: () => Promise.resolve(),
      getActiveElement: () => ({}) as never,
    });
    ctl.cycle("next");
    expect(a.focus).toHaveBeenCalledTimes(1);
    ctl.cycle("prev");
    expect(b.focus).toHaveBeenCalledTimes(1);
  });
});

describe("syncHistoryWithModal (§3.3.2 exclusion invariant, SHOULD-85)", () => {
  it("closes an open history list when a modal is open", () => {
    const history = { isOpen: true, close: vi.fn() };
    syncHistoryWithModal({ modalOpen: true, history });
    expect(history.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no modal is open", () => {
    const history = { isOpen: true, close: vi.fn() };
    syncHistoryWithModal({ modalOpen: false, history });
    expect(history.close).not.toHaveBeenCalled();
  });

  it("does nothing when the history list is already closed", () => {
    const history = { isOpen: false, close: vi.fn() };
    syncHistoryWithModal({ modalOpen: true, history });
    expect(history.close).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Phase 7 (SPEC-0300-0009 R-34-13/AC-617; SPEC-0200-0001 §3.6.11.1 MUST-84).
// The withdrawn §3.6.5 design closed the search bar when the sort menu
// opened and masked search flags only by `modalOpen` -- both wrong (AC-617
// requires search to survive a sort change; masking only by modalOpen let
// Escape while the sort menu is open cancel the search bar instead of
// closing the menu, AC-03). `sortMenuOpen` is an OPTIONAL new parameter
// (defaults to false) so every existing call site above, which never passes
// it, keeps behaving exactly as before (no regression).
// ---------------------------------------------------------------------

describe("computeDispatchOverlayFlags: sortMenuOpen masking (SPEC-0200-0001 §3.6.11.1 MUST-84)", () => {
  const base = { modalOpen: false, historyOpen: false, searchActive: false, searchInputFocused: false };

  it("isOverlayOpen becomes true while the sort menu is open (Tab/Escape must reach the overlay branch)", () => {
    expect(computeDispatchOverlayFlags({ ...base, sortMenuOpen: true }).isOverlayOpen).toBe(true);
  });

  it("MUST-84/AC-03: while the sort menu is open, the search-active flag is masked so Escape reaches the overlay branch, not the search-cancel branch", () => {
    const flags = computeDispatchOverlayFlags({ ...base, searchActive: true, sortMenuOpen: true });
    expect(flags.isSearchActive).toBe(false);
  });

  it("the search-input-focused flag is masked too while the sort menu is open", () => {
    const flags = computeDispatchOverlayFlags({ ...base, searchActive: true, searchInputFocused: true, sortMenuOpen: true });
    expect(flags.isSearchInputFocused).toBe(false);
  });

  it("AC-617: with the sort menu CLOSED, an active search bar is untouched (masking is specific to the sort menu being open)", () => {
    const flags = computeDispatchOverlayFlags({ ...base, searchActive: true, searchInputFocused: true, sortMenuOpen: false });
    expect(flags.isSearchActive).toBe(true);
    expect(flags.isSearchInputFocused).toBe(true);
  });

  it("omitting sortMenuOpen entirely behaves exactly like sortMenuOpen: false (backward compatible)", () => {
    expect(computeDispatchOverlayFlags(base)).toEqual({
      isOverlayOpen: false,
      isSearchActive: false,
      isSearchInputFocused: false,
      isPathBarEditing: false, // Phase 8 (MUST-99(b)): new always-present flag
    });
  });
});

// SHOULD-126/MUST-84 (c): a modal opening while the sort menu is shown must
// close the sort menu (same shape as syncHistoryWithModal/SHOULD-85).
describe("syncSortMenuWithModal (SPEC-0200-0001 §3.6.11.1 MUST-84 (c))", () => {
  it("closes an open sort menu when a modal opens", () => {
    const sortMenu = { isOpen: true, close: vi.fn() };
    syncSortMenuWithModal({ modalOpen: true, sortMenu });
    expect(sortMenu.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no modal is open", () => {
    const sortMenu = { isOpen: true, close: vi.fn() };
    syncSortMenuWithModal({ modalOpen: false, sortMenu });
    expect(sortMenu.close).not.toHaveBeenCalled();
  });

  it("does nothing when the sort menu is already closed", () => {
    const sortMenu = { isOpen: false, close: vi.fn() };
    syncSortMenuWithModal({ modalOpen: true, sortMenu });
    expect(sortMenu.close).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Phase 8 (SPEC-0300-0016 R-14-4-1/R-760-2; SPEC-0200-0001 §3.7.10.3(b),
// §3.7.10.13 MUST-107): `pathBarEditing` is OPTIONAL (default false) and
// `isPathBarEditing` is masked by the WHOLE isOverlayOpen set -- modal,
// history/jump list AND sort menu (MUST-107: the history list was missing).
// ---------------------------------------------------------------------
describe("computeDispatchOverlayFlags: isPathBarEditing (MUST-99(b), MUST-107)", () => {
  const base = { modalOpen: false, historyOpen: false, searchActive: false, searchInputFocused: false };

  it("passes through when no overlay is open; defaults to false when omitted", () => {
    expect(computeDispatchOverlayFlags({ ...base, pathBarEditing: true }).isPathBarEditing).toBe(true);
    expect(computeDispatchOverlayFlags(base).isPathBarEditing).toBe(false);
  });

  it.each([
    ["modalOpen", { modalOpen: true }],
    ["historyOpen (MUST-107)", { historyOpen: true }],
    ["sortMenuOpen", { sortMenuOpen: true }],
  ])("is masked while %s", (_n, over) => {
    expect(computeDispatchOverlayFlags({ ...base, ...over, pathBarEditing: true }).isPathBarEditing).toBe(false);
  });

  it("existing flags are unchanged (historyOpen still does not mask the search flags)", () => {
    const f = computeDispatchOverlayFlags({ ...base, historyOpen: true, searchActive: true, pathBarEditing: true });
    expect(f.isOverlayOpen).toBe(true);
    expect(f.isSearchActive).toBe(true);
  });
});
