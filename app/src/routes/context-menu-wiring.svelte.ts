// SPEC-0300-0018 / SPEC-0200-0001 §3.9.1, §3.9.4, §3.9.6, §3.9.7, §3.9.17.
// Composes the right-click menu: it decides nothing itself (decisions live in
// features/context-menu), it only collects inputs and delegates to the existing
// controllers. All dependencies are injected; `attach` is the only part that
// touches the DOM (and is not unit-tested; the E2E covers it).

import { createContextMenuState } from "$lib/features/context-menu/menu-state.svelte";
import { buildMenu, planExecution, type MenuEntryId, type MenuItemId, type MenuTarget } from "$lib/features/context-menu/menu-model";
import { decideContextMenuEvent, decideMenuWheel } from "$lib/features/context-menu/menu-events";
import { resolveContextMenuKey } from "$lib/features/context-menu/menu-keys";
import { createContextMenuOriginTracker } from "$lib/features/context-menu/contextmenu-origin";
import { classifyContextTarget, type ClosestLike } from "$lib/features/context-menu/target-classify";
import { isMiddleButtonAuxclick, shouldSwallowAfterOutsideClose } from "$lib/features/context-menu/outside-click-shield";
import { buildPathsClipboardText, COPY_PATH_FAILED, formatCopyPathStatus } from "$lib/features/context-menu/copy-path-text";
import { decideOpen } from "$lib/features/viewer/open-decision";
import { isEditableTarget, type ElementLike } from "$lib/shared/contextmenu-guard";

export interface DisplayedEntry {
  path: string;
  name: string;
  entryType: "file" | "dir";
}

export type ContextEventTarget = (ElementLike & ClosestLike) | null;

export interface ContextMenuWiringDeps {
  fileList: {
    readonly currentPath: string;
    readonly selected: ReadonlySet<string>;
    contextClickRow(visible: readonly DisplayedEntry[], path: string): void;
    restoreDisplayedSelection(visible: readonly DisplayedEntry[], paths: readonly string[]): void;
  };
  // The displayed (search-filtered) entries in display order.
  filteredEntries: () => readonly DisplayedEntry[];
  // Dialog / history / jump list / sort menu open (R-1101).
  isOverlayOpen: () => boolean;
  // The clipboard port, read-only for the menu (R-1060-4): only the OS-file / app-internal
  // "has anything" answer, asked on every open (R-1040-1, CB-11; SPEC-0200-0001 §3.10.9).
  clipboard: { hasItems(): Promise<boolean> };
  focus: { container(): void };
  fileOps: { handleAction(action: string, event: { shiftKey: boolean }): unknown };
  archive: { handleAction(action: string): unknown };
  viewer: { openFile(path: string): unknown; openWithOsAssociation(path: string): unknown };
  // `afterUserNavigation(fileList.navigate(path))`.
  navigate: (path: string) => unknown;
  status: { show(message: string): void };
  writeClipboardText: (text: string) => Promise<void>;
  isZip: (name: string) => boolean;
  now: () => number;
  // Whether the event target lies inside the menu element.
  isInsideMenu: (target: ContextEventTarget) => boolean;
  // SPEC-0300-0021 R-1553: the registered apps for the menus, and the launch with the target the menu was opened with.
  externalApps?: { readonly entries: readonly { index: number; label: string }[]; launchOnTarget(index: number, target: { path: string; kind: "file" | "dir" }): void };
}

export interface ContextMenuKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
}

const toTarget = (e: DisplayedEntry): MenuTarget => ({ path: e.path, name: e.name, entryType: e.entryType });

export function createContextMenuWiring(deps: ContextMenuWiringDeps) {
  const state = createContextMenuState();
  const origin = createContextMenuOriginTracker();

  function closeNow(): void {
    state.close();
    deps.focus.container();
  }

  function copyPaths(targets: readonly MenuTarget[]): void {
    let written: Promise<void>;
    try {
      // Called synchronously inside the user gesture (§3.9.8).
      written = deps.writeClipboardText(buildPathsClipboardText(targets.map((t) => t.path)));
    } catch (error) {
      written = Promise.reject(error);
    }
    written.then(
      () => deps.status.show(formatCopyPathStatus(targets.length)),
      () => deps.status.show(COPY_PATH_FAILED),
    );
  }

  function open(target: MenuTarget): void {
    const decision = decideOpen({ entryType: target.entryType }, false);
    if (decision === "navigate-dir") void deps.navigate(target.path);
    else if (decision === "open-file") void deps.viewer.openFile(target.path);
  }

  // R-1055 / R-1056 / R-1056-1 / §3.9.7 + §3.9.17.2: plan, close, restore, then call.
  function run(id: MenuEntryId): void {
    const snapshot = state.snapshot;
    if (snapshot === null) return;
    // SPEC-0300-0021 R-1554 / MUST-144: a registered app is NOT planned or put back (R-1056-1 does not apply, the selection stays): close, then launch
    // with the target the menu was opened with (the right-clicked row, else the folder) -- a vanished target is the backend's answer (R-1536).
    const external = /^ext:(\d+)$/.exec(id);
    if (external !== null) {
      const row = snapshot.rowTarget ?? null;
      closeNow();
      deps.externalApps?.launchOnTarget(Number(external[1]), row === null ? { path: snapshot.directory, kind: "dir" } : { path: row.path, kind: row.entryType });
      return;
    }
    const itemId = id as MenuItemId;
    const visible = deps.filteredEntries();
    const plan = planExecution({ snapshot, id: itemId, displayed: visible.map(toTarget), isZip: deps.isZip });
    closeNow();
    if (plan.kind === "notice") {
      deps.status.show(plan.message);
      return;
    }
    if (plan.kind === "noop") return;
    // Row-menu items put the menu's targets back first (the blank menu is exempt).
    if (snapshot.kind === "row" && plan.targets.length > 0) {
      deps.fileList.restoreDisplayedSelection(visible, plan.targets.map((t) => t.path));
    }
    switch (plan.id) {
      case "open":
        open(plan.targets[0]);
        return;
      case "os_open":
        void deps.viewer.openWithOsAssociation(plan.targets[0].path);
        return;
      case "copy_path":
        copyPaths(plan.targets);
        return;
      case "zip_create":
      case "zip_extract":
        void deps.archive.handleAction(plan.id);
        return;
      default:
        // copy / cut / paste / rename / delete / new_file: never a Shift (R-1053).
        void deps.fileOps.handleAction(plan.id, { shiftKey: false });
    }
  }

  async function onContextMenu(e: { target: ContextEventTarget; clientX: number; clientY: number }): Promise<void> {
    const source = origin.consume(); // always first, exactly once (MUST-113)
    const target = classifyContextTarget(e.target);
    const decision = decideContextMenuEvent({
      editable: isEditableTarget(e.target),
      menuOpen: state.isOpen,
      origin: source,
      insideMenu: deps.isInsideMenu(e.target),
      overlayOpen: deps.isOverlayOpen(),
      target,
    });
    if (decision === "ignore") return;
    if (decision === "close") {
      closeNow();
      return;
    }
    // Synchronous part (R-1004, R-1024, R-1020): focus, selection, targets.
    deps.focus.container();
    const visible = deps.filteredEntries();
    if (decision === "open-row" && target.kind === "row") deps.fileList.contextClickRow(visible, target.path);
    const targets: MenuTarget[] =
      decision === "open-row"
        ? visible.filter((v) => deps.fileList.selected.has(v.path)).map(toTarget)
        : [];
    const kind = decision === "open-row" ? "row" : "blank";
    const directory = deps.fileList.currentPath;
    const token = state.nextOpenToken();

    let clipboardHasItems = false;
    try {
      clipboardHasItems = await deps.clipboard.hasItems();
    } catch {
      clipboardHasItems = false;
    }
    if (!state.isLatestOpenToken(token) || deps.isOverlayOpen() || deps.fileList.currentPath !== directory) return;
    const entries = buildMenu({ kind, targets, clipboardHasItems, isZip: deps.isZip, externalApps: deps.externalApps?.entries, directory });
    if (entries.length === 0) return;
    const rowTarget = decision === "open-row" && target.kind === "row" ? (visible.find((v) => v.path === target.path) ?? null) : null;
    state.open({ kind, targets, clipboardHasItems, directory, rowTarget: rowTarget === null ? null : toTarget(rowTarget), entries, cursor: { x: e.clientX, y: e.clientY } });
  }

  function onOutsideClose(e: { x: number; y: number }): void {
    state.recordOutsideClose({ time: deps.now(), x: e.x, y: e.y });
    closeNow();
  }

  function handleKey(event: ContextMenuKeyEvent): boolean {
    const intent = resolveContextMenuKey(event);
    switch (intent) {
      case "pass":
        return false;
      case "move_up":
        state.moveHighlight("up");
        return true;
      case "move_down":
        state.moveHighlight("down");
        return true;
      case "confirm": {
        const id = state.confirmTarget();
        if (id !== null) run(id);
        return true;
      }
      case "cancel":
        closeNow();
        return true;
      default:
        return true;
    }
  }

  const wiring = {
    state,
    onPointerDown(e: { button: number }): void {
      origin.onPointerDown(e);
    },
    onKeyDownForOrigin(e: { key: string; shiftKey: boolean; repeat?: boolean }): void {
      origin.onKeyDown(e);
    },
    onContextMenu,
    run,
    closeNow,
    handleKey,
    onOutsideClose,
    onOutsideAuxClick(e: { button: number; x: number; y: number }): void {
      if (isMiddleButtonAuxclick(e)) onOutsideClose(e);
    },
    shouldSwallow(e: { type: "mousedown" | "mouseup" | "click" | "dblclick"; detail: number; x: number; y: number }): boolean {
      return shouldSwallowAfterOutsideClose({ now: deps.now(), closedAt: state.lastOutsideClose, ...e });
    },
    // Called by the page's `$effect` watching `fileList.currentPath` (R-1056 last sentence).
    onCurrentPathChange(path: string): void {
      const snapshot = state.snapshot;
      if (snapshot !== null && snapshot.directory !== path) closeNow();
    },
    // The only DOM-touching part: document / window subscriptions. Returns the unsubscribe.
    attach(doc: Document, win: Window): () => void {
      const asTarget = (t: EventTarget | null): ContextEventTarget => t as ContextEventTarget;
      const onPointerDown = (e: PointerEvent): void => wiring.onPointerDown(e);
      const onKeyDown = (e: KeyboardEvent): void => wiring.onKeyDownForOrigin(e);
      const onCtx = (e: MouseEvent): void => {
        void onContextMenu({ target: asTarget(e.target), clientX: e.clientX, clientY: e.clientY });
      };
      const onWheel = (e: WheelEvent): void => {
        if (!state.isOpen) return;
        const menu = (e.target as Element | null)?.closest?.('[role="menu"]') ?? null;
        const scrollable = menu !== null && menu.scrollHeight > menu.clientHeight;
        if (decideMenuWheel({ insideMenu: menu !== null, scrollable }) === "prevent") e.preventDefault();
      };
      const onCloseTrigger = (): void => {
        if (state.isOpen) closeNow();
      };
      const onShield = (e: MouseEvent): void => {
        const type = e.type as "mousedown" | "mouseup" | "click" | "dblclick";
        if (wiring.shouldSwallow({ type, detail: e.detail, x: e.clientX, y: e.clientY })) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      };
      const SHIELDED = ["mousedown", "mouseup", "click", "dblclick"] as const;
      win.addEventListener("pointerdown", onPointerDown, true);
      win.addEventListener("keydown", onKeyDown, true);
      doc.addEventListener("contextmenu", onCtx);
      win.addEventListener("wheel", onWheel, { capture: true, passive: false });
      win.addEventListener("resize", onCloseTrigger);
      win.addEventListener("blur", onCloseTrigger);
      for (const t of SHIELDED) win.addEventListener(t, onShield, true);
      return () => {
        win.removeEventListener("pointerdown", onPointerDown, true);
        win.removeEventListener("keydown", onKeyDown, true);
        doc.removeEventListener("contextmenu", onCtx);
        win.removeEventListener("wheel", onWheel, true);
        win.removeEventListener("resize", onCloseTrigger);
        win.removeEventListener("blur", onCloseTrigger);
        for (const t of SHIELDED) win.removeEventListener(t, onShield, true);
      };
    },
  };
  return wiring;
}
