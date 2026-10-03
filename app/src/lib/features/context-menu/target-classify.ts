// SPEC-0300-0018 R-1000/R-1001, §1 (一覧の余白) / SPEC-0200-0001 §3.9.4.
// DOM contract (strings): rows carry `data-entry-path`, the list frame `data-context-area="list"`.

export type ContextTarget = { kind: "row"; path: string } | { kind: "blank" } | { kind: "none" };

export interface ClosestLike {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
}

export function classifyContextTarget(el: ClosestLike | null): ContextTarget {
  if (el === null) return { kind: "none" };
  const row = el.closest("[data-entry-path]");
  if (row !== null) {
    const path = row.getAttribute("data-entry-path");
    if (path !== null) return { kind: "row", path };
  }
  if (el.closest('[data-context-area="list"]') !== null) return { kind: "blank" };
  return { kind: "none" };
}
