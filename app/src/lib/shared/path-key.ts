// SPEC-0300-0013 R-207/R-207-1/R-207-2 (ISS-0076); SPEC-0300-0009 R-40-6.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.2.10,
//   §3.6.11.11 SHOULD-129.
//
// Feature-independent path comparison utilities, extracted from
// `features/navigation-history/list-ops.ts` (which re-exports these two
// names so its own tests keep passing, SHOULD-129 condition 1) so that
// `features/file-list/tree.ts` (R-40-6) can share the SAME comparison rules
// without an illegal feature-to-feature import (§4.1). This module stays a
// leaf: it imports neither features/ nor routes/ (SHOULD-129 condition 2).
//
// Out of scope here (stays in features/file-list/tree.ts, SHOULD-129
// condition 2): the `\\?\` prefix stripping (R-40-0) and volume-GUID/
// device-namespace exclusion (R-40-0-1) are tree-specific rules, not part of
// the general path-comparison contract R-207 governs.

// Stored/display form: case preserved (R-207-2).
export function normalizeStoredForm(path: string): string {
  let normalized = path.replace(/\//g, "\\");

  // Collapse consecutive separators BEFORE the UNC test (SHOULD-73), keeping
  // the leading "\\" marker of a UNC path.
  normalized = normalized.startsWith("\\\\")
    ? "\\\\" + normalized.slice(2).replace(/\\+/g, "\\")
    : normalized.replace(/\\+/g, "\\");

  const uncMatch = normalized.match(/^\\\\([^\\]+)\\([^\\]+)(.*)$/);
  if (uncMatch) {
    const rest = uncMatch[3].replace(/\\+$/, "");
    return `\\\\${uncMatch[1]}\\${uncMatch[2]}${rest}`;
  }

  // SHOULD-129 condition 3 (formerly SHOULD-61(a)): a bare drive letter is
  // completed to the drive root, WITH a trailing separator.
  if (/^[A-Za-z]:$/.test(normalized)) {
    return normalized + "\\";
  }
  if (/^[A-Za-z]:\\$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\\+$/, "");
}

// Comparison-only key: case folded (R-207).
export function pathComparisonKey(path: string): string {
  return normalizeStoredForm(path).toLowerCase();
}
