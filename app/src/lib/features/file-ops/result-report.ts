// SPEC-0200-0001 §3.3.4: pure translation of a batch summary into the status
// text and (when needed) the failure-list descriptor.
// R-25 (skipped), R-44 (canceled), R-80/R-81 (failure list, first 5), R-84.

import { formatFailureList, translateErrorCode, type FailureEntry } from "./error-format";
import { RESULT_REPORT_MESSAGES } from "./messages";

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
  copy: RESULT_REPORT_MESSAGES.verbCopy,
  move: RESULT_REPORT_MESSAGES.verbMove,
  trash: RESULT_REPORT_MESSAGES.verbDelete,
  permanent: RESULT_REPORT_MESSAGES.verbDelete,
};

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function buildResultReport(summary: SummaryLike, mode: ReportMode): ResultReport {
  const verb = VERB[mode];

  if (summary.failed === 0 && summary.failures.length === 0) {
    const skipped = summary.skipped > 0 ? RESULT_REPORT_MESSAGES.skippedSuffix(summary.skipped) : "";
    return { kind: "success", status: RESULT_REPORT_MESSAGES.success(summary.ok, verb, skipped), failureDialog: null };
  }

  if (summary.failures.length > 0 && summary.failures.every((f) => f.code === "canceled")) {
    return { kind: "canceled", status: RESULT_REPORT_MESSAGES.canceled(summary.ok), failureDialog: null };
  }

  const { shown, truncated } = formatFailureList(summary.failures);
  const lines = shown.map((f) => `${baseName(f.path)}: ${translateErrorCode(f.code) ?? f.message}`);
  const rest = summary.failures.length - shown.length;
  return {
    kind: "failed",
    status: RESULT_REPORT_MESSAGES.failedStatus(summary.ok, verb, summary.failed),
    failureDialog: {
      title: RESULT_REPORT_MESSAGES.failedTitle(verb),
      lines,
      ...(truncated ? { note: RESULT_REPORT_MESSAGES.moreFailures(rest) } : {}),
    },
  };
}
