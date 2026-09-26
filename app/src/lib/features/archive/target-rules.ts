// SPEC-0200-0001 §3.4.6: pure rules for choosing the operation targets and the
// default paths (SPEC-0300-0014 R-307/R-307-1/R-308/R-308-1/R-308-2/R-309/
// R-321/R-342/R-342-1). The context is what routes reports: displayed entries
// only (MUST-61), each with its entry type (MUST-67).

import { basename, dirname, joinPath } from "./path-util";

export interface ArchiveContext {
  currentPath: string;
  entries: { name: string; path: string; entryType: "file" | "dir" }[];
  selected: string[];
  focusedPath: string | null;
}

export type CreateTargets = { kind: "none" } | { kind: "ok"; paths: string[] };
export type ExtractTarget =
  | { kind: "none" }
  | { kind: "multiple" }
  | { kind: "not_zip" }
  | { kind: "ok"; path: string };

// R-307/R-307-1: the selection (displayed entries only) wins; otherwise the
// focused entry (if displayed); otherwise nothing.
function decideTargets(ctx: ArchiveContext): string[] {
  const shown = new Set(ctx.entries.map((e) => e.path));
  const selected = ctx.selected.filter((p) => shown.has(p));
  if (selected.length > 0) return selected;
  const focused = ctx.focusedPath;
  if (focused !== null && focused !== "" && shown.has(focused)) return [focused];
  return [];
}

export function resolveZipCreateTargets(ctx: ArchiveContext): CreateTargets {
  const paths = decideTargets(ctx);
  return paths.length === 0 ? { kind: "none" } : { kind: "ok", paths };
}

// R-309: recognised by the extension only, case-insensitive.
export function isZipFileName(name: string): boolean {
  return /\.zip$/i.test(name);
}

// R-308-2: whether the action may start and which entry it acts on come from
// the SAME decision as the create targets.
export function resolveZipExtractTarget(ctx: ArchiveContext): ExtractTarget {
  const paths = decideTargets(ctx);
  if (paths.length === 0) return { kind: "none" };
  if (paths.length > 1) return { kind: "multiple" };
  const entry = ctx.entries.find((e) => e.path === paths[0]);
  if (entry === undefined || entry.entryType === "dir" || !isZipFileName(entry.name)) return { kind: "not_zip" };
  return { kind: "ok", path: entry.path };
}

// R-321: the existing extension is not replaced (`a.txt` -> `a.txt.zip`).
export function defaultCreateOutputPath(currentPath: string, targetNames: string[]): string {
  const name = targetNames.length === 1 ? `${targetNames[0]}.zip` : "archive.zip";
  return joinPath(currentPath, name);
}

const FORBIDDEN_NAME_CHARS = /[<>:"/\|?*\u0000-\u001f]/;

// R-342/R-342-1: `<ZIP's folder>\<name without .zip>`; a degenerate stem
// falls back to `archive`.
export function defaultExtractDestination(zipPath: string): string {
  const name = basename(zipPath);
  const stem = isZipFileName(name) ? name.slice(0, -4) : name;
  const invalid = stem === "" || /[. ]$/.test(stem) || FORBIDDEN_NAME_CHARS.test(stem);
  return joinPath(dirname(zipPath), invalid ? "archive" : stem);
}
