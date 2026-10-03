// SPEC-0200-0001 §3.4.7: assembles the two operation controllers (Phase 2 file
// operations and Phase 5 ZIP create/extract) from ONE displayed-only context
// (MUST-61, R-307-1). Routes layer (§4.1 path 2): imports several features,
// holds no state and no business logic.

import { createArchiveController } from "$lib/features/archive/archive-controller";
import { createInternalClipboard } from "$lib/features/file-ops/clipboard-port";
import { createFileOpsController } from "$lib/features/file-ops/file-ops-controller";
import { createOsClipboardPort, type OsClipboardIpc } from "$lib/features/file-ops/os-clipboard-port";
import type { ConfirmSpec, FormSpec, ProgressHandle, ProgressSpec } from "$lib/shared/state/modal-host.svelte";
import { archiveIpc } from "./archive-ipc";
import { clipboardIpc } from "./clipboard-ipc";
import { fileOpsIpc } from "./file-ops-ipc";
import { createFileOpsContext } from "./list-action-wiring";

export interface OperationControllerDeps {
  modal: {
    confirm(spec: ConfirmSpec): Promise<{ buttonId: string; checked: boolean }>;
    form(spec: FormSpec): Promise<"submitted" | "cancelled">;
    showProgress(spec: ProgressSpec): ProgressHandle;
  };
  status: { show(message: string): void };
  currentPath: () => string;
  entries: () => readonly { name: string; path: string; entryType: "file" | "dir" }[];
  filteredEntries: () => readonly { name: string; path: string; entryType: "file" | "dir" }[];
  selected: () => ReadonlySet<string>;
  focusedPath: () => string | null;
  reload: (opts?: { focusPath?: string; clearSelection?: boolean }) => Promise<unknown>;
  /** Tests only: the OS clipboard IPC (defaults to the real Tauri wrappers). */
  clipboardIpc?: OsClipboardIpc;
}

// Operation targets are limited to the displayed entries (MUST-61); reloads
// after an operation are not navigation, so no visit is recorded (R-208/R-209,
// SPEC-0300-0014 R-397).
export function createOperationControllers(deps: OperationControllerDeps) {
  const context = createFileOpsContext({
    currentPath: deps.currentPath,
    entries: deps.entries,
    filteredEntries: deps.filteredEntries,
    selected: deps.selected,
    focusedPath: deps.focusedPath,
  });
  // OS clipboard first, the app-internal one as the fallback (SPEC-0300-0011 R-15~R-19; §3.10.8).
  // The menu reads this same instance (SPEC-0200-0001 §3.9.4); it only asks `hasItems()`.
  const clipboard = createOsClipboardPort({ internal: createInternalClipboard(), ipc: deps.clipboardIpc ?? clipboardIpc });
  const fileOps = createFileOpsController({
    ipc: fileOpsIpc,
    modal: deps.modal,
    status: deps.status,
    clipboard,
    context,
    reload: deps.reload,
  });
  const archive = createArchiveController({
    ipc: archiveIpc,
    modal: deps.modal,
    status: deps.status,
    context,
    reload: deps.reload,
  });
  return { fileOps, archive, clipboard };
}
