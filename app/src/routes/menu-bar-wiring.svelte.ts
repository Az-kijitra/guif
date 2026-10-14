// SPEC-0300-0020 / SPEC-0300-0010 第16版 R-14-5 / SPEC-0200-0001 §3.14.1-3~6, §3.14.12-9.
// Composes the menu bar: it decides nothing itself (the decisions live in features/menu-bar), it only collects the inputs (displayed
// targets, check states, clipboard), records / restores the focus, and delegates the execution to the existing handlers
// (routes/menu-bar-exec.ts). All dependencies are injected; `attach` is the only part that touches the DOM.
//
// Activation: F10 and Alt+F/E/V/G arrive through the key dispatch (keys.onActivate); Alt ALONE (a keyup after a clean keydown) is tracked by
// the window listeners in `attach` (SPEC-0200-0001 §3.14.12-9). The real-machine spike (2026-10-14) showed that preventDefault is enough
// to keep Windows out of its menu mode, so no Rust-side plan A is needed. The Alt / F10 preventDefault lives ONLY in those listeners.

import { untrack } from "svelte";
import { isZipFileName } from "$lib/features/archive/target-rules";
import { buildPathsClipboardText, COPY_PATH_FAILED, formatCopyPathStatus } from "$lib/features/context-menu/copy-path-text";
import { shouldSwallowAfterOutsideClose } from "$lib/features/context-menu/outside-click-shield";
import type { MenuBarActivationKind } from "$lib/features/keyboard/menubar-activation";
import type { KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
import {
  createAltTracker,
  INACTIVE_STATE,
  MENU_ORDER,
  reduceAltAlone,
  reduceMenuBarKey,
  type MenuBarKeyResult,
  type MenuBarKeyState,
} from "$lib/features/menu-bar/menu-bar-keys";
import type { MenuBarActions, MenuBarView } from "$lib/features/menu-bar/menu-bar-view";
import { buildMenuBar, type BarEntry, type BarInput, type ItemId, type MenuId } from "$lib/features/menu-bar/menu-model";
import { firstEnabled } from "$lib/shared/menu-navigation";
import { writeClipboardText } from "$lib/shared/clipboard-text";
import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { exitOnly } from "./bootstrap-wiring";
import { resolveCurrentStop } from "./focus-wiring";
import { createMenuExecutor, type MenuExecutorDeps } from "./menu-bar-exec";
import { buildShortcutTable } from "./menu-bar-shortcuts";

interface DisplayedEntry {
  path: string;
  name: string;
  entryType: "file" | "dir";
}

export interface MenuBarWiringDeps {
  fileList: {
    readonly selected: ReadonlySet<string>;
    showTree(): boolean;
    showHidden(): boolean;
    showSize(): boolean;
    showTime(): boolean;
  };
  // The displayed (search-filtered) entries in display order, and the focused row's path ("" = none).
  filteredEntries: () => readonly DisplayedEntry[];
  focusedPath: () => string;
  // Read-only: the OS-file / app-internal "has anything" answer (R-1322, same reader as the right-click menu).
  clipboard: { hasItems(): Promise<boolean> };
  // Dialog / history / jump list / sort menu / right-click menu (R-1350-1, R-1365, R-1370).
  overlays: ReadonlyArray<{ readonly isOpen: boolean }>;
  pathEditing: () => boolean;
  search: { readonly active: boolean; readonly inputFocused: boolean };
  isTreeFocused: () => boolean;
  focus: { container(): void; tree(): void; searchInput(): void };
  onListAction: MenuExecutorDeps["onListAction"];
  // Production defaults (the real keymap state, the exit route, the shared status line); tests may replace them.
  customOverrides?: () => Record<string, string>;
  onExitAction?: MenuExecutorDeps["onExitAction"];
  status?: { show(message: string): void };
  isZip?: (name: string) => boolean;
  writeClipboardText?: (text: string) => Promise<void>;
  now?: () => number;
}

// R-1352: where the keyboard focus was before the menu bar took it.
interface FocusOrigin {
  kind: "list" | "tree" | "search-input";
  element?: HTMLElement;
}

const SWALLOW_WINDOW_MS = 700;

export function createMenuBarWiring(deps: MenuBarWiringDeps) {
  const isZip = deps.isZip ?? isZipFileName;
  const write = deps.writeClipboardText ?? writeClipboardText;
  const customOverrides = deps.customOverrides ?? ((): Record<string, string> => keymapState.customOverrides);
  const status = deps.status ?? statusMessage;
  const now = deps.now ?? ((): number => Date.now());

  // `raw`: the reducer replaces the whole object; `entries` holds the BarEntry snapshot of the open dropdown (R-1322).
  let keyState = $state.raw<MenuBarKeyState>(INACTIVE_STATE);
  let origin: FocusOrigin = { kind: "list" };
  let originPending = false;
  let openToken = 0;

  const isOverlayOpen = (): boolean => deps.overlays.some((o) => o.isOpen);

  // ---- the displayed targets (R-1340: the file list's, by the key operations' rule) ----

  function displayedTargets(): { targets: DisplayedEntry[]; focusRow: DisplayedEntry | null } {
    const shown = deps.filteredEntries();
    const selected = shown.filter((e) => deps.fileList.selected.has(e.path));
    const focused = deps.focusedPath();
    const focusRow = focused === "" ? null : (shown.find((e) => e.path === focused) ?? null);
    return { targets: selected.length > 0 ? selected : focusRow === null ? [] : [focusRow], focusRow };
  }

  function barInput(clipboardHasItems: boolean): BarInput {
    const { targets, focusRow } = displayedTargets();
    return {
      targets,
      focusRow,
      clipboardHasItems,
      isZip,
      checks: {
        tree: deps.fileList.showTree(),
        hidden: deps.fileList.showHidden(),
        size: deps.fileList.showSize(),
        time: deps.fileList.showTime(),
      },
      shortcuts: buildShortcutTable(customOverrides()),
    };
  }

  // R-1060 on the displayed targets.
  function copyPath(): void {
    const { targets } = displayedTargets();
    let written: Promise<void>;
    try {
      // Called synchronously inside the user gesture.
      written = write(buildPathsClipboardText(targets.map((t) => t.path)));
    } catch (error) {
      written = Promise.reject(error);
    }
    written.then(
      () => status.show(formatCopyPathStatus(targets.length)),
      () => status.show(COPY_PATH_FAILED),
    );
  }

  const execute = createMenuExecutor({ onListAction: deps.onListAction, onExitAction: deps.onExitAction ?? exitOnly, copyPath });

  // ---- the focus (R-1350-1, R-1352) ----

  function captureOrigin(): void {
    originPending = false;
    if (deps.pathEditing()) {
      origin = { kind: "list" }; // R-1352-1: the path bar is not returned to
      return;
    }
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.tagName === "BUTTON" && el.closest("[data-menubar]") === null && el.closest(".search-bar") !== null) {
      origin = { kind: "search-input", element: el }; // a search bar button is returned to as it is
      return;
    }
    const stop = resolveCurrentStop({ isTreeFocused: deps.isTreeFocused(), searchInputFocused: deps.search.inputFocused });
    origin = { kind: stop === "search" ? "search-input" : stop };
  }

  // Never drops the focus on `document.body`: whatever is gone falls back to the file list.
  function restoreFocus(): void {
    const o = origin;
    origin = { kind: "list" };
    if (o.element?.isConnected === true) {
      o.element.focus();
      return;
    }
    if (o.kind === "tree" && deps.fileList.showTree()) deps.focus.tree();
    else if (o.kind === "search-input" && deps.search.active) deps.focus.searchInput();
    else deps.focus.container();
  }

  function deactivate(restore: boolean): void {
    openToken += 1;
    keyState = INACTIVE_STATE;
    originPending = false;
    if (restore) restoreFocus();
  }

  // ---- opening a dropdown (R-1322: the state is read when it opens; the clipboard read finishes before it shows) ----

  async function openDropdown(menu: MenuId, highlight: "first" | "none"): Promise<void> {
    openToken += 1;
    const token = openToken;
    let clipboardHasItems = false;
    if (menu === "edit") {
      try {
        clipboardHasItems = await deps.clipboard.hasItems();
      } catch {
        clipboardHasItems = false;
      }
    }
    if (token !== openToken || !keyState.active || keyState.openMenu !== menu) return; // deactivated / switched meanwhile
    const entries: BarEntry[] = buildMenuBar(barInput(clipboardHasItems)).find((m) => m.id === menu)?.entries ?? [];
    keyState = { ...keyState, entries, highlightId: highlight === "first" ? firstEnabled(entries) : null };
  }

  function runItem(id: string): void {
    restoreFocus(); // R-1341: close, give the focus back, THEN call the handler
    execute(id);
  }

  function apply(result: MenuBarKeyResult): void {
    keyState = result.state;
    if (!result.state.active) openToken += 1;
    const effect = result.effect;
    switch (effect.kind) {
      case "open-menu":
        void openDropdown(effect.menu, effect.highlight);
        break;
      case "execute":
        runItem(effect.id);
        break;
      case "deactivate":
        restoreFocus();
        break;
      default:
        break;
    }
  }

  // ---- the keyboard (R-14-5-1 / R-14-5-2) ----

  const keys = {
    get active(): boolean {
      return keyState.active;
    },
    onKey(_action: string | null, event: KeydownLikeEvent): boolean {
      const result = reduceMenuBarKey(keyState, event);
      apply(result);
      return result.handled;
    },
    onActivate(_kind: MenuBarActivationKind, event: KeydownLikeEvent): boolean {
      captureOrigin();
      const result = reduceMenuBarKey(INACTIVE_STATE, event);
      if (!result.handled) return false;
      apply(result);
      return true;
    },
  };

  // ---- the mouse (R-1360~R-1365) ----

  function openByMouse(index: number): void {
    const menu = MENU_ORDER[index];
    keyState = { active: true, headingIndex: index, openMenu: menu, highlightId: null, entries: [] };
    void openDropdown(menu, "none");
  }

  const actions: MenuBarActions = {
    onHeadingMouseDown(): void {
      if (keyState.active || isOverlayOpen()) return;
      captureOrigin(); // before the browser moves the focus onto the heading
      originPending = true;
    },
    onHeadingClick(index: number): void {
      if (isOverlayOpen()) {
        if (!keyState.active) restoreFocus(); // R-1365: nothing opens; the heading must not keep the focus
        return;
      }
      if (keyState.active && keyState.openMenu === MENU_ORDER[index]) {
        deactivate(true); // the open heading again: close
        return;
      }
      if (!keyState.active && !originPending) captureOrigin();
      originPending = false;
      openByMouse(index);
    },
    onHeadingHover(index: number): void {
      if (!keyState.active || keyState.openMenu === null || keyState.headingIndex === index) return; // R-1361
      openByMouse(index);
    },
    onItemRun(id: ItemId): void {
      const entry = keyState.entries.find((e) => e.type === "item" && e.id === id);
      if (entry === undefined || entry.type !== "item" || !entry.enabled) return;
      deactivate(false);
      runItem(id);
    },
    onItemHover(id: ItemId): void {
      const entry = keyState.entries.find((e) => e.type === "item" && e.id === id);
      if (entry !== undefined && entry.type === "item" && entry.enabled) keyState = { ...keyState, highlightId: id };
    },
  };

  const view: MenuBarView = {
    get active(): boolean {
      return keyState.active;
    },
    get headingIndex(): number {
      return keyState.headingIndex;
    },
    get openMenu(): MenuId | null {
      return keyState.openMenu;
    },
    get highlightId(): string | null {
      return keyState.highlightId;
    },
    get entries(): readonly BarEntry[] {
      // Only this wiring ever stores entries, and they are always BarEntry snapshots.
      return keyState.entries as readonly BarEntry[];
    },
  };

  // R-1370: a dialog / overlay that appears while the bar is active closes the menu (nothing is executed; the focus follows the overlay).
  $effect(() => {
    if (isOverlayOpen()) {
      untrack(() => {
        if (keyState.active) deactivate(false);
      });
    }
  });

  return {
    view,
    actions,
    keys,
    // The only DOM-touching part: window subscriptions. Returns the unsubscribe.
    attach(win: Window): () => void {
      const tracker = createAltTracker();
      // R-1350-1: not while an overlay is shown or the path bar is being edited.
      const canActivate = (): boolean => !isOverlayOpen() && !deps.pathEditing();
      const suppressible = (): boolean => keyState.active || canActivate();
      const onKeyDown = (e: KeyboardEvent): void => {
        tracker.onKeyDown(e);
        const f10 = e.key === "F10" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
        if ((e.key === "Alt" || f10) && !e.isComposing && suppressible()) e.preventDefault(); // R-1350: no default action of Alt / F10
      };
      const onKeyUp = (e: KeyboardEvent): void => {
        const alone = tracker.onKeyUp(e);
        if (e.key !== "Alt") return;
        if (!suppressible()) return;
        if (!e.isComposing) e.preventDefault();
        if (!alone) return;
        if (!keyState.active) captureOrigin();
        apply(reduceAltAlone(keyState)); // inactive: activate; active: deactivate (R-1351)
      };
      const onPointerDown = (): void => tracker.onPointerDown();
      let closedAt: { time: number; x: number; y: number } | null = null;
      let swallowUntil = 0;
      const insideBar = (t: EventTarget | null): boolean => (t as Element | null)?.closest?.("[data-menubar]") != null;
      const swallow = (e: Event): void => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      // R-1363: a click outside only closes the menu; the whole gesture (down, up, click, context menu) is kept from the element below.
      const onMouseDown = (e: MouseEvent): void => {
        if (keyState.active) {
          if (insideBar(e.target)) return;
          closedAt = { time: now(), x: e.clientX, y: e.clientY };
          swallowUntil = now() + SWALLOW_WINDOW_MS;
          swallow(e);
          deactivate(true);
          return;
        }
        const second = shouldSwallowAfterOutsideClose({ now: now(), closedAt, type: "mousedown", detail: e.detail, x: e.clientX, y: e.clientY });
        swallowUntil = second ? now() + SWALLOW_WINDOW_MS : 0;
        if (second) swallow(e);
      };
      const onGesture = (e: MouseEvent): void => {
        // While active no context menu opens, not even on the bar itself (R-1363).
        if (keyState.active && e.type === "contextmenu") swallow(e);
        else if (now() <= swallowUntil && !insideBar(e.target)) swallow(e);
      };
      const onWheel = (e: WheelEvent): void => {
        if (keyState.active && !insideBar(e.target)) e.preventDefault(); // R-1364
      };
      const onCloseTrigger = (): void => {
        if (keyState.active) deactivate(true);
      };
      const onBlur = (): void => {
        tracker.reset();
        onCloseTrigger();
      };
      const GESTURE = ["mouseup", "click", "auxclick", "dblclick", "contextmenu"] as const;
      win.addEventListener("keydown", onKeyDown, true);
      win.addEventListener("keyup", onKeyUp, true);
      win.addEventListener("pointerdown", onPointerDown, true);
      win.addEventListener("mousedown", onMouseDown, true);
      for (const t of GESTURE) win.addEventListener(t, onGesture, true);
      win.addEventListener("wheel", onWheel, { capture: true, passive: false });
      win.addEventListener("resize", onCloseTrigger);
      win.addEventListener("blur", onBlur);
      return () => {
        win.removeEventListener("keydown", onKeyDown, true);
        win.removeEventListener("keyup", onKeyUp, true);
        win.removeEventListener("pointerdown", onPointerDown, true);
        win.removeEventListener("mousedown", onMouseDown, true);
        for (const t of GESTURE) win.removeEventListener(t, onGesture, true);
        win.removeEventListener("wheel", onWheel, true);
        win.removeEventListener("resize", onCloseTrigger);
        win.removeEventListener("blur", onBlur);
      };
    },
  };
}
