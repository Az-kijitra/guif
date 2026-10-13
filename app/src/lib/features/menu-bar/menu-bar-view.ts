// SPEC-0200-0001 §3.14.1-1 / §3.14.1-6: the shapes `MenuBar.svelte` reads (view) and calls (actions).
// `routes/menu-bar-wiring.svelte.ts` provides both (the view through getters over its runes state).

import type { BarEntry, ItemId, MenuId } from "./menu-model";

export interface MenuBarView {
  readonly active: boolean;
  // 0..3, the highlighted heading.
  readonly headingIndex: number;
  // The dropdown that is open, or null.
  readonly openMenu: MenuId | null;
  readonly highlightId: string | null;
  // The snapshot of the open dropdown (R-1322); [] while closed or while it is being prepared.
  readonly entries: readonly BarEntry[];
}

export interface MenuBarActions {
  // Before the browser moves the focus to the clicked heading (R-1352: the previous focus is recorded first).
  onHeadingMouseDown(): void;
  onHeadingClick(index: number): void;
  onHeadingHover(index: number): void;
  onItemRun(id: ItemId): void;
  onItemHover(id: ItemId): void;
}
