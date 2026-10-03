// SPEC-0300-0009 R-14-11/R-14-11-1/R-14-11-2, AC-609~AC-611. SPEC-0300-0010
// R-10-1/R-10-1-1. Architecture: docs/architecture/proposals/SPEC-0200-0001.md
// §3.6.4: DOM-independent pure functions + a thin DI controller that
// `+page.svelte` wires `.focus()` calls into.

export type TabStopId = "tree" | "search" | "list";

// R-14-11-2: tree visible -> first; search visible -> second (or first if
// the tree is hidden); the list is always last.
export function computeTabStops(input: { treeVisible: boolean; searchVisible: boolean }): TabStopId[] {
  const stops: TabStopId[] = [];
  if (input.treeVisible) stops.push("tree");
  if (input.searchVisible) stops.push("search");
  stops.push("list");
  return stops;
}

// R-14-11-2: wraps at either end (Tab never leaves the Webview). A current
// stop absent from `stops` (e.g. the tree just became hidden) falls back to
// the first stop.
export function nextTabStop(
  stops: readonly TabStopId[],
  current: TabStopId,
  direction: "next" | "prev",
): TabStopId {
  if (stops.length === 0) return current;
  const index = stops.indexOf(current);
  if (index === -1) return stops[0];
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (index + delta + stops.length) % stops.length;
  return stops[nextIndex];
}

export interface TabStopControllerDeps {
  treeVisible: () => boolean;
  searchVisible: () => boolean;
  currentStop: () => TabStopId;
  focus: { tree(): void; search(): void; list(): void };
}

// AC-611: always reports the key as consumed (never lets Tab escape the
// Webview).
export function createTabStopController(deps: TabStopControllerDeps): (direction: "next" | "prev") => boolean {
  return function onTabStop(direction: "next" | "prev"): boolean {
    const stops = computeTabStops({ treeVisible: deps.treeVisible(), searchVisible: deps.searchVisible() });
    const target = nextTabStop(stops, deps.currentStop(), direction);
    deps.focus[target]();
    return true;
  };
}

// SPEC-0200-0001 §3.9.17.7: where the keyboard focus is now (moved out of +page.svelte).
export function resolveCurrentStop(s: { isTreeFocused: boolean; searchInputFocused: boolean }): TabStopId {
  return s.isTreeFocused ? "tree" : s.searchInputFocused ? "search" : "list";
}
