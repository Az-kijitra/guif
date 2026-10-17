// SPEC-0300-0021 R-1530 / R-1531 / R-1533 / R-1549 / R-1550 / R-1552 / R-1560 / SPEC-0200-0001 §3.16.6~§3.16.8, §3.16.15 (MUST-144, MINOR-36).
// Composes the external-app launch for its three entrances (a key, the menu bar, the right-click menu): it decides nothing itself (the
// decisions live in features/external-apps), it only collects the inputs (the registrations, the focus row, the current folder) and calls
// the launch flow. All dependencies are injected; the IPC defaults to the real wrapper.

import { matchExternalAppKey } from "$lib/features/external-apps/key-match";
import { launchExternalApp } from "$lib/features/external-apps/launch-flow";
import { decideTarget, isAvailable, type Target } from "$lib/features/external-apps/target";
import { normalizeKeyString, matchesAction, type KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
import { formatShortcut } from "$lib/features/menu-bar/shortcut-format";
import { externalAppLaunch } from "$lib/shared/ipc/external-apps";
import { SHARED_SENTENCES } from "$lib/shared/messages";

interface WiringEntry {
  index: number;
  label: string;
  keys: readonly string[];
}

interface DisplayedRow {
  path: string;
  name: string;
  entryType: "file" | "dir";
}

export interface ExternalAppsWiringDeps {
  // `externalAppsState.entries` in production (fixed at start-up, R-1501).
  entries: () => readonly WiringEntry[];
  // The displayed (search-filtered) rows, and the focused row's path ("" = none).
  filteredEntries: () => readonly DisplayedRow[];
  focusedPath: () => string;
  currentPath: () => string;
  status: { show(message: string): void };
  ipc?: { externalAppLaunch(index: number, path: string, kind: "file" | "dir"): Promise<void> };
}

export interface MenuApp {
  index: number;
  label: string;
  shortcutText?: string;
}

export function createExternalAppsWiring(deps: ExternalAppsWiringDeps) {
  const ipc = deps.ipc ?? { externalAppLaunch };

  // R-1530 / R-1531 / R-1533: the focus row among the DISPLAYED rows, else the current folder (as a folder). Decided at the moment of use.
  function currentTarget(): Target | null {
    const focused = deps.focusedPath();
    const row = focused === "" ? undefined : deps.filteredEntries().find((e) => e.path === focused);
    return decideTarget({ focusRow: row === undefined ? null : { path: row.path, entryType: row.entryType }, currentPath: deps.currentPath() });
  }

  function launchOnTarget(index: number, target: Target): void {
    const entry = deps.entries().find((e) => e.index === index);
    if (entry === undefined) return;
    // Not awaited (R-1527); the flow shows exactly one status message and never throws.
    void launchExternalApp({ entry: { index: entry.index, label: entry.label }, target, ipc, status: deps.status });
  }

  function launchByIndex(index: number): void {
    if (!deps.entries().some((e) => e.index === index)) return;
    const target = currentTarget();
    if (target === null) {
      deps.status.show(SHARED_SENTENCES.noTarget);
      return;
    }
    launchOnTarget(index, target);
  }

  // R-1552: the usable registrations for the menus; the shortcut text is the FIRST key, in the format of the other items (R-1330-1).
  function menuApps(): MenuApp[] {
    return deps.entries().map((e): MenuApp => {
      const shortcutText = e.keys.length > 0 ? formatShortcut(normalizeKeyString(e.keys[0])) : "";
      return shortcutText === "" ? { index: e.index, label: e.label } : { index: e.index, label: e.label, shortcutText };
    });
  }

  return {
    get entries(): readonly MenuApp[] {
      return menuApps();
    },
    barExtension(): { externalApps: readonly MenuApp[]; externalTargetAvailable: boolean } {
      return { externalApps: menuApps(), externalTargetAvailable: isAvailable(currentTarget()).enabled };
    },
    // R-1550 / R-1549: true = consumed. A key repeat starts nothing but is still consumed; a fresh press starts one launch.
    onKey(event: KeydownLikeEvent): boolean {
      const index = matchExternalAppKey(event, deps.entries(), matchesAction);
      if (index === null) return false;
      if (event.repeat !== true) launchByIndex(index);
      return true;
    },
    launchByIndex,
    launchOnTarget,
  };
}
