// SPEC-0200-0001 §3.4.6: pure generators of the FormSpec / ConfirmSpec /
// ProgressSpec handed to the shared modal-host (SPEC-0300-0014 R-320, R-326-1,
// R-340, R-374, R-380/R-381, R-351-1). No password field, no "I understand"
// checkbox anywhere (R-320-1, R-340-1, R-340-2, R-390-1).

import type { ConfirmSpec, FormSpec, ProgressSpec } from "$lib/shared/state/modal-host.svelte";
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
    title: "ZIPを作成",
    lines: [`対象: ${input.count}件`],
    fields: [
      {
        id: "outputPath",
        label: "出力先",
        type: "text",
        value: input.outputPath,
        selection: selectionBeforeZipExtension(input.outputPath),
      },
    ],
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onSubmit: input.onSubmit,
  };
}

export function buildExtractFormSpec(input: { zipPath: string; destination: string; onSubmit: OnSubmit }): FormSpec {
  return {
    title: "ZIPを展開",
    lines: [`ZIP: ${input.zipPath}`],
    fields: [{ id: "destination", label: "展開先", type: "text", value: input.destination }],
    submitLabel: "展開",
    cancelLabel: "キャンセル",
    onSubmit: input.onSubmit,
  };
}

// R-326-1: exactly overwrite / cancel; the safe choice is the default.
export function buildOverwriteConfirmSpec(outputPath: string): ConfirmSpec {
  return {
    title: "同じ名前のZIPがあります",
    lines: [`「${basename(outputPath)}」はすでに存在します。`, "上書きしますか?"],
    buttons: [
      { id: "overwrite", label: "上書き" },
      { id: "cancel", label: "キャンセル" },
    ],
    defaultButtonId: "cancel",
    cancelButtonId: "cancel",
  };
}

// R-374/R-374-1/R-374-3: only FILES conflict (a folder is never merged by
// replacement); shows the archive-internal path and the total.
export function buildConflictConfirmSpec(entryPath: string, total: number): ConfirmSpec {
  return {
    title: "同じ名前のファイルがあります",
    lines: [
      `「${entryPath}」はすでに存在します。`,
      "上書きすると、既存のファイルが置き換えられます。",
      ...(total > 1 ? [`(競合: 全${total}件)`] : []),
    ],
    buttons: [
      { id: "overwrite", label: "上書き" },
      { id: "skip", label: "スキップ" },
      { id: "cancel", label: "キャンセル" },
    ],
    defaultButtonId: "cancel",
    cancelButtonId: "cancel",
    checkbox: { label: "すべてに適用", checked: true },
  };
}

export function buildErrorConfirmSpec(input: { title: string; lines: string[]; note?: string }): ConfirmSpec {
  return {
    title: input.title,
    lines: input.lines,
    ...(input.note !== undefined ? { note: input.note } : {}),
    buttons: [{ id: "close", label: "閉じる" }],
    defaultButtonId: "close",
    cancelButtonId: "close",
  };
}

export type ArchiveKind = "create" | "extract";

export function buildProgressSpec(kind: ArchiveKind, onCancel: () => void): ProgressSpec {
  return {
    title: kind === "create" ? "ZIPの作成" : "ZIPの展開",
    cancelLabel: "キャンセル",
    onCancel,
  };
}

// R-381: `<作成中|展開中> <name> (<index>/<total>)`.
export function formatArchiveProgressLabel(
  kind: ArchiveKind,
  info: { name: string; index: number; total: number },
): string {
  return `${kind === "create" ? "作成中" : "展開中"} ${info.name} (${info.index}/${info.total})`;
}
