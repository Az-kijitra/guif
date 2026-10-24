// SPEC-0300-0023 R-1753 / R-1754 / R-1791 / R-1804 / R-1792; SPEC-0200-0001 §3.18.5 / §3.18.6 / §3.18.15 MINOR-6.
// Shared state: the numbers the list and the tree need from the resolved appearance, and the measured `ch`
// (px per `0` of the list font). `startAppearanceLoad()` remembers the FIRST call's Promise so that +layout.ts and
// routes/startup-wiring.ts share one IPC.

import { appearanceLoad, type AppearanceDto } from "$lib/shared/ipc/appearance";

// SPEC-0300-0023 第2版 R-1753 / R-1754: the same defaults as Rust's appearance/font.rs (12px, round(12 x 1.32) = 16px).
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_ROW_HEIGHT = 16;
const DEFAULT_MIN_COL_WIDTH = 24;
const DEFAULT_TREE_WIDTH_PERCENT = 24;
// Until the list font is measured, one `ch` is estimated as 0.6 em.
const PROVISIONAL_CH_RATIO = 0.6;

let minColWidth = $state(DEFAULT_MIN_COL_WIDTH);
let treeWidthPercent = $state(DEFAULT_TREE_WIDTH_PERCENT);
let fontSize = $state(DEFAULT_FONT_SIZE);
let rowHeight = $state(DEFAULT_ROW_HEIGHT);
let ch = $state(DEFAULT_FONT_SIZE * PROVISIONAL_CH_RATIO);

export const appearanceState = {
  get minColWidth(): number {
    return minColWidth;
  },
  get treeWidthPercent(): number {
    return treeWidthPercent;
  },
  get fontSize(): number {
    return fontSize;
  },
  get rowHeight(): number {
    return rowHeight;
  },
  get ch(): number {
    return ch;
  },
  hydrate(dto: AppearanceDto): void {
    minColWidth = dto.minColWidth;
    treeWidthPercent = dto.treeWidthPercent;
    fontSize = dto.fontSize;
    rowHeight = dto.rowHeight;
    ch = dto.fontSize * PROVISIONAL_CH_RATIO;
  },
  setCh(value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    ch = value;
  },
};

let loading: Promise<AppearanceDto> | null = null;

export function startAppearanceLoad(): Promise<AppearanceDto> {
  loading ??= appearanceLoad();
  return loading;
}
