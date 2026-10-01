// SPEC-0300-0011 §10 (R-81, R-84, R-86): error-code translation and
// batch-failure-list formatting for display.

// R-84/R-86: the code -> message table lives in shared/error-text
// (SPEC-0200-0001 §3.7.10.2(c), MUST-98(c)); re-exported here so existing
// callers keep working. An unrecognized code returns null.
export { translateErrorCode } from "$lib/shared/error-text";

export interface FailureEntry {
  path: string;
  code: string;
  message: string;
}

export interface FailureListResult {
  shown: FailureEntry[];
  truncated: boolean;
}

const MAX_SHOWN_FAILURES = 5;

// R-81: show at most the first 5 failures, with the rest indicated as
// truncated.
export function formatFailureList(failures: readonly FailureEntry[]): FailureListResult {
  return {
    shown: failures.slice(0, MAX_SHOWN_FAILURES),
    truncated: failures.length > MAX_SHOWN_FAILURES,
  };
}
