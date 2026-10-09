// SPEC-0200-0001 §3.7.10.2(c) (architecture-guardian 16th audit, MUST-98(c)):
// the R-731/R-84/R-86 error-code -> Japanese message lookup, extracted from
// `features/file-ops/error-format.ts` (SHOULD-129's `path-key` extraction is
// the precedent) so `features/path-bar/` and `features/file-list/` can both
// translate a code WITHOUT a feature-to-feature import (§4.1).
// `features/file-ops/error-format.ts` re-exports `translateErrorCode`.
// SPEC-0200-0001 §3.13 (P7): the table itself lives in `shared/messages.ts`.

import { FILE_OP_ERROR_MESSAGES } from "$lib/shared/messages";

// R-84/R-86: an unrecognized code returns null so the caller can fall back to
// the raw message rather than displaying nothing.
export function translateErrorCode(code: string): string | null {
  return FILE_OP_ERROR_MESSAGES[code] ?? null;
}
