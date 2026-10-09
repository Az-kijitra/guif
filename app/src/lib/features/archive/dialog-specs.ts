// SPEC-0200-0001 §3.4.6: pure generators of the FormSpec / ConfirmSpec /
// ProgressSpec handed to the shared modal-host (SPEC-0300-0014 R-320, R-326-1,
// R-340, R-374, R-380/R-381, R-351-1). No password field, no "I understand"
// checkbox anywhere (R-320-1, R-340-1, R-340-2, R-390-1).

import type { ConfirmSpec, FormSpec, ProgressSpec } from "$lib/shared/state/modal-host.svelte";
import { ARCHIVE_MESSAGES } from "./messages";
import { basename } from "./path-util";

type OnSubmit = FormSpec["onSubmit"];

// R-320: select the name before the extension so that typing renames the ZIP
// but keeps `.zip`.
function selectionBeforeZipExtension(value: string): [number, number] {
  const sep = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
  const start = sep + 1;
  const end = /\.zip$/i.test(value) ? value.length - 4 : value.length;
  return [start, Math.max(start, end)];
}

export function buildCreateFormSpec(input: { count: number; outputPath: string; onSubmit: OnSubmit }): FormSpec {
  return {
    title: ARCHIVE_MESSAGES.createTitle,
    lines: [ARCHIVE_MESSAGES.createCountLine(input.count)],
    fields: [
      {
        id: "outputPath",
        label: ARCHIVE_MESSAGES.createOutputLabel,
        type: "text",
        value: input.outputPath,
        selection: selectionBeforeZipExtension(input.outputPath),
      },
    ],
    submitLabel: ARCHIVE_MESSAGES.createSubmit,
    cancelLabel: ARCHIVE_MESSAGES.cancel,
    onSubmit: input.onSubmit,
  };
}

export function buildExtractFormSpec(input: { zipPath: string; destination: string; onSubmit: OnSubmit }): FormSpec {
  return {
    title: ARCHIVE_MESSAGES.extractTitle,
    lines: [ARCHIVE_MESSAGES.extractZipLine(input.zipPath)],
    fields: [
      { id: "destination", label: ARCHIVE_MESSAGES.extractDestinationLabel, type: "text", value: input.destination },
    ],
    submitLabel: ARCHIVE_MESSAGES.extractSubmit,
    cancelLabel: ARCHIVE_MESSAGES.cancel,
    onSubmit: input.onSubmit,
  };
}

// R-326-1: exactly overwrite / cancel; the safe choice is the default.
export function buildOverwriteConfirmSpec(outputPath: string): ConfirmSpec {
  return {
    title: ARCHIVE_MESSAGES.overwriteZipTitle,
    lines: [ARCHIVE_MESSAGES.existsLine(basename(outputPath)), ARCHIVE_MESSAGES.overwriteQuestion],
    buttons: [
      { id: "overwrite", label: ARCHIVE_MESSAGES.overwrite },
      { id: "cancel", label: ARCHIVE_MESSAGES.cancel },
    ],
    defaultButtonId: "cancel",
    cancelButtonId: "cancel",
  };
}

// R-374/R-374-1/R-374-3: only FILES conflict (a folder is never merged by
// replacement); shows the archive-internal path and the total.
export function buildConflictConfirmSpec(entryPath: string, total: number): ConfirmSpec {
  return {
    title: ARCHIVE_MESSAGES.conflictTitle,
    lines: [
      ARCHIVE_MESSAGES.existsLine(entryPath),
      ARCHIVE_MESSAGES.conflictReplace,
      ...(total > 1 ? [ARCHIVE_MESSAGES.conflictCount(total)] : []),
    ],
    buttons: [
      { id: "overwrite", label: ARCHIVE_MESSAGES.overwrite },
      { id: "skip", label: ARCHIVE_MESSAGES.skip },
      { id: "cancel", label: ARCHIVE_MESSAGES.cancel },
    ],
    defaultButtonId: "cancel",
    cancelButtonId: "cancel",
    checkbox: { label: ARCHIVE_MESSAGES.applyToAll, checked: true },
  };
}

export function buildErrorConfirmSpec(input: { title: string; lines: string[]; note?: string }): ConfirmSpec {
  return {
    title: input.title,
    lines: input.lines,
    ...(input.note !== undefined ? { note: input.note } : {}),
    buttons: [{ id: "close", label: ARCHIVE_MESSAGES.close }],
    defaultButtonId: "close",
    cancelButtonId: "close",
  };
}

export type ArchiveKind = "create" | "extract";

export function buildProgressSpec(kind: ArchiveKind, onCancel: () => void): ProgressSpec {
  return {
    title: kind === "create" ? ARCHIVE_MESSAGES.progressCreateTitle : ARCHIVE_MESSAGES.progressExtractTitle,
    cancelLabel: ARCHIVE_MESSAGES.cancel,
    onCancel,
  };
}

// R-381 / SPEC-0300-0019 W-43: `<圧縮中|展開中> <name> (<index>/<total>)`.
export function formatArchiveProgressLabel(
  kind: ArchiveKind,
  info: { name: string; index: number; total: number },
): string {
  const verb = kind === "create" ? ARCHIVE_MESSAGES.progressCreateVerb : ARCHIVE_MESSAGES.progressExtractVerb;
  return ARCHIVE_MESSAGES.progressLabel(verb, info.name, info.index, info.total);
}
