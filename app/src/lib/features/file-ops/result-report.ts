// SPEC-0200-0001 §3.3.4: pure translation of a batch summary into the status
// text and (when needed) the failure-list descriptor.
// R-25 (skipped), R-44 (canceled), R-80/R-81 (failure list, first 5), R-84.

import { formatFailureList, translateErrorCode, type FailureEntry } from "./error-format";

export type ReportMode = "copy" | "move" | "trash" | "permanent";

export interface SummaryLike {
  ok: number;
  failed: number;
  total: number;
  skipped: number;
  failures: FailureEntry[];
}

export interface ResultReport {
  kind: "success" | "canceled" | "failed";
  status: string;
  failureDialog: null | { title: string; lines: string[]; note?: string };
}

const VERB: Record<ReportMode, string> = {
  copy: "コピー",
  move: "移動",
  trash: "削除",
  permanent: "削除",
};

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function buildResultReport(summary: SummaryLike, mode: ReportMode): ResultReport {
  const verb = VERB[mode];

  if (summary.failed === 0 && summary.failures.length === 0) {
    const skipped = summary.skipped > 0 ? `(${summary.skipped}件スキップ)` : "";
    return { kind: "success", status: `${summary.ok}件を${verb}しました${skipped}`, failureDialog: null };
  }

  if (summary.failures.length > 0 && summary.failures.every((f) => f.code === "canceled")) {
    return { kind: "canceled", status: `キャンセルしました(${summary.ok}件完了)`, failureDialog: null };
  }

  const { shown, truncated } = formatFailureList(summary.failures);
  const lines = shown.map((f) => `${baseName(f.path)}: ${translateErrorCode(f.code) ?? f.message}`);
  const rest = summary.failures.length - shown.length;
  return {
    kind: "failed",
    status: `${summary.ok}件を${verb}しました。${summary.failed}件は失敗しました`,
    failureDialog: {
      title: `${verb}できなかった項目`,
      lines,
      ...(truncated ? { note: `ほか${rest}件…` } : {}),
    },
  };
}
