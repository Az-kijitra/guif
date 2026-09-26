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
import { createConflictDialogState, runConflictSessionAsync, type ConflictChoice } from "./conflict-flow";
import { initialCreateState } from "./create-flow";
import { buildDeleteConfirmContent, resolveDeleteMode, type DeleteMode } from "./delete-flow";
import { translateErrorCode } from "./error-format";
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
const BUSY_MESSAGE = "別のファイル操作を実行中です";
const NO_SELECTION_MESSAGE = "選択がありません";
const BLANK_NAME_MESSAGE = "名前を入力してください";
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
    await clipboard.set({ paths, origin });
    status.show(origin === "internal-cut" ? `${paths.length}件を切り取りました` : `${paths.length}件をコピーしました`);
  }

  // --- paste (R-19, R-25, R-30~R-35, R-40~R-45) ----------------------------
  async function askConflict(conflict: FileOpsConflict, total: number) {
    const state = createConflictDialogState(conflict.name);
    const result = await modal.confirm({
      title: "同じ名前の項目があります",
      lines: [
        `「${state.name}」はすでに存在します。`,
        "上書きすると、フォルダはマージ(同名ファイルは置換)されます。",
        ...(total > 1 ? [`(競合: 全${total}件)`] : []),
      ],
      buttons: [
        { id: "overwrite", label: "上書き" },
        { id: "skip", label: "スキップ" },
        { id: "cancel", label: "キャンセル" },
      ],
      defaultButtonId: state.defaultFocus,
      cancelButtonId: "cancel",
      checkbox: { label: "すべてに適用", checked: state.applyToAll },
    });
    return { choice: result.buttonId as ConflictChoice, applyToAll: result.checked };
  }

  async function showFailureDialog(dialog: { title: string; lines: string[]; note?: string }): Promise<void> {
    await modal.confirm({
      title: dialog.title,
      lines: dialog.lines,
      ...(dialog.note !== undefined ? { note: dialog.note } : {}),
      buttons: [{ id: "close", label: "閉じる" }],
      defaultButtonId: "close",
      cancelButtonId: "close",
    });
  }

  async function paste(): Promise<void> {
    const clip = await clipboard.get();
    if (clip === null || clip.paths.length === 0) {
      status.show("貼り付ける項目がありません");
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
    const prefix = mode === "move" ? "移動中" : "コピー中";
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
        title: mode === "move" ? "移動" : "コピー",
        cancelLabel: "キャンセル",
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
    status.show(report.status);
    // A moved item no longer exists at its old path: drop the cut clipboard,
    // keeping only the items that failed to move (nothing moved: unchanged).
    if (mode === "move" && summary.ok > 0) {
      const failed = new Set(summary.failures.map((f) => f.path));
      const remaining = clip.paths.filter((p) => failed.has(p));
      if (remaining.length === 0) await clipboard.clear();
      else await clipboard.set({ paths: remaining, origin: "internal-cut" });
    }
    await deps.reload({ clearSelection: true });
    if (report.failureDialog !== null) await showFailureDialog(report.failureDialog);
  }

  // --- delete (R-11, R-53~R-56-4, R-45, R-82) ------------------------------
  function buildDeleteConfirm(names: string[], mode: DeleteMode): ConfirmSpec {
    const content = buildDeleteConfirmContent(names, mode);
    const head = content.count === 1 ? `「${names[0]}」` : `${content.count}件の項目`;
    const lines =
      mode === "permanent"
        ? [`${head}を完全に削除します。`, ...(content.count > 1 ? content.shownNames : []), ...(content.truncated ? ["…"] : []), "この操作は取り消せません。"]
        : [`${head}をごみ箱に移動します。`, ...(content.count > 1 ? content.shownNames : []), ...(content.truncated ? ["…"] : [])];
    return {
      title: mode === "permanent" ? "完全に削除" : "削除の確認",
      lines,
      tone: mode === "permanent" ? "danger" : "normal",
      buttons: [
        { id: "delete", label: mode === "permanent" ? "完全に削除する" : "削除する" },
        { id: "cancel", label: "キャンセル" },
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
      status.show(ctx.selected.length > 1 ? "名前の変更は1件ずつ行えます" : NO_SELECTION_MESSAGE);
      return;
    }
    const oldName = nameOf(ctx, target);
    const selection = computeRenameInitialSelection(oldName);
    const renamed: { newPath?: string } = {};
    const result = await modal.form({
      title: "名前の変更",
      fields: [
        {
          id: "name",
          label: "名前",
          type: "text",
          value: oldName,
          selection: [selection.selectionStart, selection.selectionEnd],
        },
      ],
      submitLabel: "OK",
      cancelLabel: "キャンセル",
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
      title: "新規作成",
      fields: [
        {
          id: "kind",
          label: "種別",
          type: "select",
          value: initial.kind,
          options: [
            { value: "file", label: "ファイル" },
            { value: "folder", label: "フォルダ" },
          ],
        },
        { id: "name", label: "名前", type: "text", value: initial.name },
      ],
      submitLabel: "作成",
      cancelLabel: "キャンセル",
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
