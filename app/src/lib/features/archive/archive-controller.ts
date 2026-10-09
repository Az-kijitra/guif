// SPEC-0200-0001 §3.4.6, §3.4.13-4: orchestration of ZIP create / extract
// (targets -> form + pre-validation -> confirmations -> progress -> result ->
// reload). Every dependency is injected; this module imports no DOM, no Tauri
// and no other feature (§4.1). routes calls `handleAction` and nothing else.
//
// MUST-63/SHOULD-83: the whole async flow is wrapped in try/catch/finally and
// `busy` is always released in `finally`. MUST-68: the progress dialog is shown
// synchronously, THEN the subscription is awaited, THEN the command runs.
// R-397: a reload is not navigation; this controller has no navigation
// dependency, so a visit can never be recorded.

import { runConflictSessionAsync, type ConflictChoice } from "$lib/shared/conflict-session";
import {
  normalizeArchiveError,
  type ArchiveCheckCreateResult,
  type ArchiveConflictsResult,
  type ArchiveCreateResult,
  type ArchiveExtractResult,
  type ArchiveProgressEvent,
  type ArchiveResolutions,
} from "$lib/shared/ipc/archive";
import type { ConfirmSpec, FormSpec, ProgressHandle, ProgressSpec } from "$lib/shared/state/modal-host.svelte";
import {
  buildConflictConfirmSpec,
  buildCreateFormSpec,
  buildErrorConfirmSpec,
  buildExtractFormSpec,
  buildOverwriteConfirmSpec,
  buildProgressSpec,
  formatArchiveProgressLabel,
  type ArchiveKind,
} from "./dialog-specs";
import { formatArchiveError, formatPreflightError } from "./error-format";
import { ARCHIVE_MESSAGES } from "./messages";
import { basename, dirname, joinPath, samePath } from "./path-util";
import {
  buildCreateErrorReport,
  buildCreateSuccessReport,
  buildExtractErrorReport,
  buildExtractResultReport,
  type ArchiveReport,
} from "./result-report";
import {
  defaultCreateOutputPath,
  defaultExtractDestination,
  resolveZipCreateTargets,
  resolveZipExtractTarget,
  type ArchiveContext,
} from "./target-rules";

export type { ArchiveContext } from "./target-rules";

export interface ReloadOptions {
  focusPath?: string;
  clearSelection?: boolean;
}

export interface ArchiveDeps {
  ipc: {
    checkCreate(items: string[], outputPath: string, baseDir: string): Promise<ArchiveCheckCreateResult>;
    create(
      operationId: string,
      items: string[],
      outputPath: string,
      baseDir: string,
      overwrite: boolean,
    ): Promise<ArchiveCreateResult>;
    detectConflicts(zipPath: string, destination: string, baseDir: string): Promise<ArchiveConflictsResult>;
    extract(
      operationId: string,
      zipPath: string,
      destination: string,
      baseDir: string,
      resolutions?: ArchiveResolutions,
    ): Promise<ArchiveExtractResult>;
    cancel(operationId: string): Promise<void>;
    listenProgress(operationId: string, onEvent: (event: ArchiveProgressEvent) => void): Promise<() => void>;
    newOperationId(): string;
  };
  modal: {
    confirm(spec: ConfirmSpec): Promise<{ buttonId: string; checked: boolean }>;
    form(spec: FormSpec): Promise<"submitted" | "cancelled">;
    showProgress(spec: ProgressSpec): ProgressHandle;
  };
  status: { show(message: string): void };
  context: () => ArchiveContext;
  reload: (opts?: ReloadOptions) => Promise<unknown>;
}

const ZIP_ACTIONS = new Set(["zip_create", "zip_extract"]);
const BUSY_MESSAGE = ARCHIVE_MESSAGES.busy;
const NO_TARGET_MESSAGE = ARCHIVE_MESSAGES.noTarget;
const EXTRACT_ONE_MESSAGE = ARCHIVE_MESSAGES.extractOneAtATime;
const NOT_ZIP_MESSAGE = ARCHIVE_MESSAGES.notZipFile;
const BLANK_OUTPUT_MESSAGE = ARCHIVE_MESSAGES.blankOutput;
const BLANK_DESTINATION_MESSAGE = ARCHIVE_MESSAGES.blankDestination;
const EXTRACT_CANCELED_MESSAGE = ARCHIVE_MESSAGES.extractCanceled;

type RunOutcome<T> = { kind: "ok"; value: T } | { kind: "rejected"; error: unknown };

function nameOf(ctx: ArchiveContext, path: string): string {
  return ctx.entries.find((e) => e.path === path)?.name ?? basename(path);
}

export function createArchiveController(deps: ArchiveDeps) {
  const { ipc, modal, status } = deps;
  let busy = false;

  // --- progress (R-380~R-382, R-387, MUST-68) ------------------------------
  // The dialog first ("preparing", R-388), then the subscription, then the
  // command. A rejection of the subscription itself propagates (nothing was
  // started); a rejection of `run` is returned so the caller can report it.
  async function withProgress<T>(
    kind: ArchiveKind,
    operationId: string,
    run: () => Promise<T>,
  ): Promise<RunOutcome<T>> {
    const handle = modal.showProgress(
      buildProgressSpec(kind, () => {
        try {
          void Promise.resolve(ipc.cancel(operationId)).catch(() => {});
        } catch {
          // A failing cancel request must not break the run.
        }
      }),
    );
    let unlisten: (() => void) | undefined;
    try {
      handle.update({ label: ARCHIVE_MESSAGES.preparing, index: 0, total: 0 });
      unlisten = await ipc.listenProgress(operationId, (e) => {
        handle.update({ label: formatArchiveProgressLabel(kind, e), index: e.index, total: e.total });
      });
      try {
        return { kind: "ok", value: await run() };
      } catch (error) {
        return { kind: "rejected", error };
      }
    } finally {
      unlisten?.();
      handle.close();
    }
  }

  // --- after the run (R-396~R-398) -----------------------------------------
  // R-398: focus + clear selection only on success and only when the result
  // lies DIRECTLY under the displayed directory (SHOULD-97: samePath; the
  // focus path uses the displayed directory's own spelling).
  async function finish(report: ArchiveReport, ctx: ArchiveContext, resultPath: string | null): Promise<void> {
    if (report.status !== null) status.show(report.status);
    if (report.kind === "success" && resultPath !== null && samePath(dirname(resultPath), ctx.currentPath)) {
      await deps.reload({ focusPath: joinPath(ctx.currentPath, basename(resultPath)), clearSelection: true });
    } else {
      await deps.reload();
    }
    if (report.dialog !== null) await modal.confirm(buildErrorConfirmSpec(report.dialog));
  }

  // --- create (R-320~R-329, R-326-2 sequential loop) -----------------------
  async function create(): Promise<void> {
    const ctx = deps.context();
    const targets = resolveZipCreateTargets(ctx);
    if (targets.kind === "none") {
      status.show(NO_TARGET_MESSAGE);
      return;
    }
    const items = targets.paths;
    const base = ctx.currentPath;
    let prefill = defaultCreateOutputPath(
      base,
      items.map((p) => nameOf(ctx, p)),
    );

    let checked: ArchiveCheckCreateResult;
    let overwrite = false;
    for (;;) {
      const slot: { checked: ArchiveCheckCreateResult | null; typed: string } = { checked: null, typed: prefill };
      const result = await modal.form(
        buildCreateFormSpec({
          count: items.length,
          outputPath: prefill,
          onSubmit: async (values) => {
            const out = values.outputPath ?? "";
            if (out.trim() === "") return BLANK_OUTPUT_MESSAGE;
            try {
              slot.checked = await ipc.checkCreate(items, out, base);
              slot.typed = out;
              return null;
            } catch (e) {
              return formatPreflightError(normalizeArchiveError(e)); // R-395-1: inline, the form stays open
            }
          },
        }),
      );
      if (result === "cancelled" || slot.checked === null) return;
      prefill = slot.typed; // R-326-2-1: the INPUT, not the normalised path
      if (slot.checked.overwriteRequired) {
        const answer = await modal.confirm(buildOverwriteConfirmSpec(slot.checked.outputPath));
        if (answer.buttonId !== "overwrite") continue; // back to the form, input kept
        overwrite = true;
      }
      checked = slot.checked;
      break;
    }

    const operationId = ipc.newOperationId();
    const outcome = await withProgress("create", operationId, () =>
      ipc.create(operationId, items, checked.outputPath, base, overwrite),
    );
    if (outcome.kind === "ok") {
      await finish(buildCreateSuccessReport(outcome.value), ctx, outcome.value.outputPath);
    } else {
      // The backend may have written before rejecting: always reload.
      await finish(buildCreateErrorReport(normalizeArchiveError(outcome.error)), ctx, null);
    }
  }

  // --- extract (R-340~R-376) -----------------------------------------------
  async function askConflict(entryPath: string, total: number) {
    const answer = await modal.confirm(buildConflictConfirmSpec(entryPath, total));
    return { choice: answer.buttonId as ConflictChoice, applyToAll: answer.checked };
  }

  async function extract(): Promise<void> {
    const ctx = deps.context();
    const target = resolveZipExtractTarget(ctx);
    if (target.kind !== "ok") {
      status.show(
        target.kind === "none" ? NO_TARGET_MESSAGE : target.kind === "multiple" ? EXTRACT_ONE_MESSAGE : NOT_ZIP_MESSAGE,
      );
      return;
    }
    const zipPath = target.path;
    const base = ctx.currentPath;

    const slot: { check: ArchiveConflictsResult | null } = { check: null };
    const result = await modal.form(
      buildExtractFormSpec({
        zipPath,
        destination: defaultExtractDestination(zipPath),
        onSubmit: async (values) => {
          const dest = values.destination ?? "";
          if (dest.trim() === "") return BLANK_DESTINATION_MESSAGE;
          try {
            slot.check = await ipc.detectConflicts(zipPath, dest, base);
            return null;
          } catch (e) {
            return formatPreflightError(normalizeArchiveError(e)); // R-395-1
          }
        },
      }),
    );
    const check = slot.check;
    if (result === "cancelled" || check === null) return;

    // R-374-2: every confirmation finishes BEFORE the extraction starts.
    let resolutions: ArchiveResolutions = {};
    if (check.conflicts.length > 0) {
      const total = check.conflicts.length;
      const session = await runConflictSessionAsync(
        check.conflicts.map((c) => c.entryPath),
        (item) => askConflict(item, total),
      );
      if (session.canceled) {
        status.show(EXTRACT_CANCELED_MESSAGE); // nothing is written (AC-346)
        return;
      }
      resolutions = session.resolutions;
    }

    const operationId = ipc.newOperationId();
    const outcome = await withProgress("extract", operationId, () =>
      ipc.extract(operationId, zipPath, check.destination, base, resolutions),
    );
    if (outcome.kind === "ok") {
      await finish(buildExtractResultReport(outcome.value), ctx, outcome.value.destination);
    } else {
      await finish(buildExtractErrorReport(normalizeArchiveError(outcome.error)), ctx, null);
    }
  }

  // Returns true when the action is one of the two ZIP actions (the key event
  // is consumed even if refused because busy).
  function handleAction(action: string): boolean {
    if (!ZIP_ACTIONS.has(action)) return false;
    if (busy) {
      status.show(BUSY_MESSAGE);
      return true;
    }
    busy = true;
    void (action === "zip_create" ? create() : extract())
      .catch((e: unknown) => {
        status.show(formatArchiveError(normalizeArchiveError(e)));
      })
      .finally(() => {
        busy = false;
      });
    return true;
  }

  return { handleAction };
}
