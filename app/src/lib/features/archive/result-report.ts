// SPEC-0200-0001 §3.4.6: pure translation of a finished operation into a status
// text and (when needed) an error-dialog descriptor (SPEC-0300-0014 R-329,
// R-351/R-351-1, R-383/R-384, R-396). An error is a dialog; a cancel and a
// success are statuses.

import { formatArchiveError, type ArchiveErrorLike } from "./error-format";
import { basename } from "./path-util";

export interface ArchiveReport {
  kind: "success" | "canceled" | "failed";
  status: string | null;
  dialog: null | { title: string; lines: string[]; note?: string };
}

export interface CreateResultLike {
  outputPath: string;
  entries: number;
  skippedLinks: number;
}

export interface ExtractResultLike {
  extracted: number;
  skipped: number;
  total: number;
  destination: string;
  outcome: "completed" | "failed" | "canceled";
  error?: ArchiveErrorLike;
}

const CREATE_CANCELED = "ZIPの作成をキャンセルしました";
const EXTRACT_CANCELED = "展開をキャンセルしました";

// R-396 / R-327-8: the output name (+ the number of skipped links).
export function buildCreateSuccessReport(result: CreateResultLike): ArchiveReport {
  const skipped = result.skippedLinks > 0 ? `(リンク${result.skippedLinks}件をスキップ)` : "";
  return {
    kind: "success",
    status: `${basename(result.outputPath)} を作成しました${skipped}`,
    dialog: null,
  };
}

export function buildCreateErrorReport(err: ArchiveErrorLike): ArchiveReport {
  if (err.code === "canceled") return { kind: "canceled", status: CREATE_CANCELED, dialog: null };
  return {
    kind: "failed",
    status: null,
    dialog: { title: "ZIPを作成できませんでした", lines: [formatArchiveError(err)] },
  };
}

// The `Err` path: rejected before anything was written.
export function buildExtractErrorReport(err: ArchiveErrorLike): ArchiveReport {
  if (err.code === "canceled") return { kind: "canceled", status: EXTRACT_CANCELED, dialog: null };
  return {
    kind: "failed",
    status: null,
    dialog: { title: "展開できませんでした", lines: [formatArchiveError(err)] },
  };
}

export function buildExtractResultReport(result: ExtractResultLike): ArchiveReport {
  const { extracted, skipped, total, destination } = result;

  if (result.outcome === "completed") {
    const skip = skipped > 0 ? `(${skipped}件をスキップ)` : "";
    return { kind: "success", status: `${destination} に${extracted}件を展開しました${skip}`, dialog: null };
  }

  if (result.outcome === "canceled") {
    // R-351-1: nothing extracted yet => a plain cancel.
    if (extracted === 0) return { kind: "canceled", status: EXTRACT_CANCELED, dialog: null };
    return {
      kind: "canceled",
      status: `展開を途中までキャンセルしました(${extracted}/${total}件を ${destination} に展開済み)`,
      dialog: null,
    };
  }

  // failed
  const error: ArchiveErrorLike = result.error ?? { code: "unknown", message: "" };
  if (extracted === 0) {
    return {
      kind: "failed",
      status: null,
      dialog: { title: "展開に失敗しました", lines: [formatArchiveError(error)] },
    };
  }
  return {
    kind: "failed",
    status: null,
    dialog: {
      title: "展開に失敗しました",
      lines: [
        `途中まで展開しました(${extracted}/${total}件)。`,
        `展開先: ${destination}`,
        formatArchiveError(error),
      ],
      // R-350: not a rollback.
      note: "展開済みのファイルは残っています。",
    },
  };
}
