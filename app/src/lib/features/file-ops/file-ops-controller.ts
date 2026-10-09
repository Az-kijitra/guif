// SPEC-0200-0001 §3.3.4, §3.3.13-5: orchestration of the screen-level file
// operations (targets -> dialogs -> IPC -> progress -> result -> reload).
// Every dependency is injected; this module imports no DOM, no Tauri and no
// other feature (§4.1). routes calls `handleAction` and nothing else.
//
// MUST-63/SHOULD-83: the whole async flow is wrapped in try/catch/finally;
// `busy` is always released in `finally`.
// MUST-61: targets come only from what `context()` reports (routes already
// restricts it to the displayed entries).

import type { ConfirmSpec, FormSpec, ProgressHandle, ProgressSpec } from "$lib/shared/state/modal-host.svelte";
import type { FileOpsConflict, FileOpsItemResolutions, FileOpsSummary } from "$lib/shared/ipc/file-ops";
import type { ClipboardPort } from "./clipboard-port";
import { resolvePasteMode } from "./clipboard-mode";
import { appendPasteNotice, formatCopyCutStatus } from "./clipboard-messages";
import { FILE_OPS_MESSAGES } from "./messages";
import { createConflictDialogState, runConflictSessionAsync, type ConflictChoice } from "./conflict-flow";
import { initialCreateState } from "./create-flow";
import { buildDeleteConfirmContent, resolveDeleteMode, type DeleteMode } from "./delete-flow";
import { translateErrorCode } from "./error-format";
import { COMMON, SHARED_SENTENCES } from "$lib/shared/messages";
import { isNameBlank } from "./name-validation";
import {
  applyProgressEvent,
  createBatchProgressAccumulator,
  formatProgressLabel,
  type ProgressEvent,
} from "./progress-modal";
import { computeRenameInitialSelection } from "./rename-flow";
import { buildResultReport, type ReportMode } from "./result-report";
import { resolveCopyCutTargets, resolveDeleteTargets, resolveRenameTarget } from "./target-resolution";

export interface FileOpsContext {
  currentPath: string;
  entries: { name: string; path: string }[];
  selected: string[];
  focusedPath: string | null;
}

export interface ReloadOptions {
  focusPath?: string;
  clearSelection?: boolean;
}

export interface FileOpsDeps {
  ipc: {
    detectConflicts(items: string[], destination: string): Promise<FileOpsConflict[]>;
    copy(
      operationId: string,
      items: string[],
      destination: string,
      resolution: "reject",
      itemResolutions: FileOpsItemResolutions,
    ): Promise<FileOpsSummary>;
    move(
      operationId: string,
      items: string[],
      destination: string,
      resolution: "reject",
      itemResolutions: FileOpsItemResolutions,
    ): Promise<FileOpsSummary>;
    cancel(operationId: string): Promise<void>;
    deleteTrash(paths: string[]): Promise<FileOpsSummary>;
    deletePermanently(paths: string[]): Promise<FileOpsSummary>;
    rename(path: string, newName: string): Promise<string>;
    create(parent: string, name: string, kind: "file" | "folder"): Promise<void>;
    listenProgress(operationId: string, onEvent: (event: ProgressEvent) => void): Promise<() => void>;
    newOperationId(): string;
  };
  modal: {
    confirm(spec: ConfirmSpec): Promise<{ buttonId: string; checked: boolean }>;
    form(spec: FormSpec): Promise<"submitted" | "cancelled">;
    showProgress(spec: ProgressSpec): ProgressHandle;
  };
  status: { show(message: string): void };
  clipboard: ClipboardPort;
  context: () => FileOpsContext;
  reload: (opts?: ReloadOptions) => Promise<unknown>;
}

const FILE_OP_ACTIONS = new Set(["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"]);
const BUSY_MESSAGE = FILE_OPS_MESSAGES.busy;
const NO_SELECTION_MESSAGE = SHARED_SENTENCES.noSelection;
const BLANK_NAME_MESSAGE = FILE_OPS_MESSAGES.blankName;
const CODE_FORMAT = /^code=([^;]+);\s*([\s\S]*)$/;

// R-84: translate a rejected IPC value ("code=<code>; <message>" or a bare
// code / Error) into display text; unknown codes fall back to the original
// message.
function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = CODE_FORMAT.exec(raw);
  if (m !== null) return translateErrorCode(m[1].trim()) ?? (m[2] !== "" ? m[2] : raw);
  return translateErrorCode(raw) ?? raw;
}

function nameOf(ctx: FileOpsContext, path: string): string {
  const found = ctx.entries.find((e) => e.path === path);
  if (found !== undefined) return found.name;
  return path.slice(Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1);
}

export function createFileOpsController(deps: FileOpsDeps) {
  const { ipc, modal, status, clipboard } = deps;
  let busy = false;

  // --- copy / cut (R-10, R-15-1, R-17) -------------------------------------
  async function copyOrCut(origin: "internal-copy" | "internal-cut"): Promise<void> {
    const ctx = deps.context();
    const paths = resolveCopyCutTargets(ctx.selected, ctx.focusedPath);
    if (paths.length === 0) {
      status.show(NO_SELECTION_MESSAGE);
      return;
    }
    const written = await clipboard.set({ paths, origin });
    status.show(formatCopyCutStatus(origin, paths.length, written.os)); // CB-06: notes an OS write failure
  }

  // --- paste (R-19, R-25, R-30~R-35, R-40~R-45) ----------------------------
  async function askConflict(conflict: FileOpsConflict, total: number) {
    const state = createConflictDialogState(conflict.name);
    const result = await modal.confirm({
      title: FILE_OPS_MESSAGES.conflictTitle,
      lines: [
        FILE_OPS_MESSAGES.conflictExists(state.name),
        FILE_OPS_MESSAGES.conflictFolderMerge,
        ...(total > 1 ? [FILE_OPS_MESSAGES.conflictCount(total)] : []),
      ],
      buttons: [
        { id: "overwrite", label: COMMON.overwrite },
        { id: "skip", label: COMMON.skip },
        { id: "cancel", label: COMMON.cancel },
      ],
      defaultButtonId: state.defaultFocus,
      cancelButtonId: "cancel",
      checkbox: { label: COMMON.applyToAll, checked: state.applyToAll },
    });
    return { choice: result.buttonId as ConflictChoice, applyToAll: result.checked };
  }

  async function showFailureDialog(dialog: { title: string; lines: string[]; note?: string }): Promise<void> {
    await modal.confirm({
      title: dialog.title,
      lines: dialog.lines,
      ...(dialog.note !== undefined ? { note: dialog.note } : {}),
      buttons: [{ id: "close", label: COMMON.close }],
      defaultButtonId: "close",
      cancelButtonId: "close",
    });
  }

  async function paste(): Promise<void> {
    const clip = await clipboard.get();
    if (clip === null || clip.paths.length === 0) {
      status.show(FILE_OPS_MESSAGES.noPasteItems);
      return;
    }
    const mode = resolvePasteMode({ origin: clip.origin, paths: clip.paths });
    const destination = deps.context().currentPath;

    // R-32: conflicts are detected by the backend BEFORE anything else.
    const conflicts = await ipc.detectConflicts(clip.paths, destination);
    const itemResolutions: FileOpsItemResolutions = {};
    // MUST-59: an item that would overwrite its own ancestor is never offered
    // "overwrite"; it is rejected (reported as a failure by the backend).
    const askable = conflicts.filter((c) => c.kind !== "overwrite_ancestor");
    for (const c of conflicts) {
      if (c.kind === "overwrite_ancestor") itemResolutions[c.path] = "reject";
    }
    if (askable.length > 0) {
      const byPath = new Map(askable.map((c) => [c.path, c]));
      const session = await runConflictSessionAsync(
        askable.map((c) => c.path),
        (item) => askConflict(byPath.get(item) as FileOpsConflict, askable.length),
      );
      if (session.canceled) return; // AC-22: nothing is sent to the backend
      Object.assign(itemResolutions, session.resolutions);
    }

    const operationId = ipc.newOperationId();
    const prefix = mode === "move" ? FILE_OPS_MESSAGES.progressMovePrefix : FILE_OPS_MESSAGES.progressCopyPrefix;
    let unlisten: (() => void) | undefined;
    let handle: ProgressHandle | undefined;
    let summary: FileOpsSummary;
    let completed = false;
    try {
      // §3.3.13-1: subscribe BEFORE invoking so no event is missed.
      let acc = createBatchProgressAccumulator(clip.paths.length);
      unlisten = await ipc.listenProgress(operationId, (event) => {
        acc = applyProgressEvent(acc, event);
        if (acc.currentName === null) return;
        handle?.update({
          label: formatProgressLabel(prefix, { currentName: acc.currentName, index: acc.index, total: acc.total }),
          index: acc.index,
          total: acc.total,
        });
      });
      handle = modal.showProgress({
        title: mode === "move" ? FILE_OPS_MESSAGES.progressMoveTitle : FILE_OPS_MESSAGES.progressCopyTitle,
        cancelLabel: COMMON.cancel,
        onCancel: () => {
          void Promise.resolve(ipc.cancel(operationId)).catch(() => {});
        },
      });
      const run = mode === "move" ? ipc.move : ipc.copy;
      summary = await run(operationId, clip.paths, destination, "reject", itemResolutions);
      completed = true;
    } finally {
      unlisten?.();
      handle?.close();
      // The backend may have partly executed before the IPC rejected: never
      // leave the listing stale (the error itself is reported by the caller).
      if (!completed) await Promise.resolve(deps.reload({ clearSelection: true })).catch(() => {});
    }

    const report = buildResultReport(summary, mode);
    status.show(appendPasteNotice(report.status, clip.notice)); // CB-13 / R-19-5
    // A moved item no longer exists at its old path (R-19-6): the port drops the cut, keeping
    // only the items that failed to move (nothing moved: unchanged).
    if (mode === "move" && summary.ok > 0) await clipboard.afterMove(summary.failures.map((f) => f.path));
    await deps.reload({ clearSelection: true });
    if (report.failureDialog !== null) await showFailureDialog(report.failureDialog);
  }

  // --- delete (R-11, R-53~R-56-4, R-45, R-82) ------------------------------
  function buildDeleteConfirm(names: string[], mode: DeleteMode): ConfirmSpec {
    const content = buildDeleteConfirmContent(names, mode);
    const head =
      content.count === 1 ? FILE_OPS_MESSAGES.deleteHeadSingle(names[0]) : FILE_OPS_MESSAGES.deleteHeadMany(content.count);
    const lines =
      mode === "permanent"
        ? [
            FILE_OPS_MESSAGES.deletePermanentLine(head),
            ...(content.count > 1 ? content.shownNames : []),
            ...(content.truncated ? [FILE_OPS_MESSAGES.deleteMoreMark] : []),
            FILE_OPS_MESSAGES.deleteIrreversible,
          ]
        : [
            FILE_OPS_MESSAGES.deleteTrashLine(head),
            ...(content.count > 1 ? content.shownNames : []),
            ...(content.truncated ? [FILE_OPS_MESSAGES.deleteMoreMark] : []),
          ];
    return {
      title: mode === "permanent" ? FILE_OPS_MESSAGES.deletePermanentTitle : FILE_OPS_MESSAGES.deleteConfirmTitle,
      lines,
      tone: mode === "permanent" ? "danger" : "normal",
      buttons: [
        { id: "delete", label: mode === "permanent" ? FILE_OPS_MESSAGES.deletePermanentButton : FILE_OPS_MESSAGES.deleteTrashButton },
        { id: "cancel", label: COMMON.cancel },
      ],
      defaultButtonId: "cancel", // R-55
      cancelButtonId: "cancel",
    };
  }

  async function deleteTargets(event: { shiftKey: boolean }): Promise<void> {
    const ctx = deps.context();
    const paths = resolveDeleteTargets(ctx.selected, ctx.focusedPath);
    if (paths.length === 0) {
      status.show(NO_SELECTION_MESSAGE);
      return;
    }
    const mode = resolveDeleteMode(event);
    const answer = await modal.confirm(
      buildDeleteConfirm(
        paths.map((p) => nameOf(ctx, p)),
        mode,
      ),
    );
    if (answer.buttonId !== "delete") return;

    // R-45: no progress dialog for delete.
    const summary = mode === "permanent" ? await ipc.deletePermanently(paths) : await ipc.deleteTrash(paths);
    const report = buildResultReport(summary, mode as ReportMode);
    status.show(report.status);
    await deps.reload({ clearSelection: true });
    if (report.failureDialog !== null) await showFailureDialog(report.failureDialog);
  }

  // --- rename (R-12, R-60~R-64, R-36) --------------------------------------
  async function rename(): Promise<void> {
    const ctx = deps.context();
    const target = resolveRenameTarget(ctx.selected, ctx.focusedPath);
    if (target === null) {
      // R-12: a multi-selection has no rename target.
      status.show(ctx.selected.length > 1 ? FILE_OPS_MESSAGES.renameOneAtATime : NO_SELECTION_MESSAGE);
      return;
    }
    const oldName = nameOf(ctx, target);
    const selection = computeRenameInitialSelection(oldName);
    const renamed: { newPath?: string } = {};
    const result = await modal.form({
      title: FILE_OPS_MESSAGES.renameTitle,
      fields: [
        {
          id: "name",
          label: FILE_OPS_MESSAGES.renameNameLabel,
          type: "text",
          value: oldName,
          selection: [selection.selectionStart, selection.selectionEnd],
        },
      ],
      submitLabel: FILE_OPS_MESSAGES.renameSubmit,
      cancelLabel: COMMON.cancel,
      onSubmit: async (values) => {
        const name = values.name ?? "";
        if (isNameBlank(name)) return BLANK_NAME_MESSAGE; // R-62-1: only the blank check is frontend-side
        try {
          renamed.newPath = await ipc.rename(target, name);
          return null;
        } catch (e) {
          return errorText(e);
        }
      },
    });
    if (result === "submitted") {
      await deps.reload(renamed.newPath ? { focusPath: renamed.newPath } : undefined);
    }
  }

  // --- new file / new folder (R-70~R-78) -----------------------------------
  async function create(action: "new_file" | "new_folder"): Promise<void> {
    const initial = initialCreateState(action);
    const parent = deps.context().currentPath;
    const result = await modal.form({
      title: FILE_OPS_MESSAGES.createTitle,
      fields: [
        {
          id: "kind",
          label: FILE_OPS_MESSAGES.createKindLabel,
          type: "select",
          value: initial.kind,
          options: [
            { value: "file", label: FILE_OPS_MESSAGES.createKindFile },
            { value: "folder", label: FILE_OPS_MESSAGES.createKindFolder },
          ],
        },
        { id: "name", label: FILE_OPS_MESSAGES.createNameLabel, type: "text", value: initial.name },
      ],
      submitLabel: FILE_OPS_MESSAGES.createSubmit,
      cancelLabel: COMMON.cancel,
      onSubmit: async (values) => {
        const name = values.name ?? "";
        if (isNameBlank(name)) return BLANK_NAME_MESSAGE;
        try {
          await ipc.create(parent, name, values.kind === "folder" ? "folder" : "file");
          return null;
        } catch (e) {
          return errorText(e);
        }
      },
    });
    // R-76/R-77 (provisional default): reload without moving focus.
    if (result === "submitted") await deps.reload();
  }

  async function run(action: string, event: { shiftKey: boolean }): Promise<void> {
    switch (action) {
      case "copy":
        return copyOrCut("internal-copy");
      case "cut":
        return copyOrCut("internal-cut");
      case "paste":
        return paste();
      case "delete":
        return deleteTargets(event);
      case "rename":
        return rename();
      case "new_file":
      case "new_folder":
        return create(action);
    }
  }

  // Returns true when the action is one of the 7 file operations (the key
  // event is consumed even if refused because busy).
  function handleAction(action: string, event: { shiftKey: boolean }): boolean {
    if (!FILE_OP_ACTIONS.has(action)) return false;
    if (busy) {
      status.show(BUSY_MESSAGE);
      return true;
    }
    busy = true;
    void run(action, event)
      .catch((e: unknown) => {
        status.show(errorText(e));
      })
      .finally(() => {
        busy = false;
      });
    return true;
  }

  return { handleAction };
}
