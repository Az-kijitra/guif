// SPEC-0300-0023 R-1720 / SPEC-0200-0001 §3.18.3 / §3.18.5: a thin invoke() wrapper around `appearance_load`
// (app/src-tauri/src/appearance/commands.rs, camelCase on the wire, main window only, no arguments).
// No state here: the first call's Promise is remembered by `state/appearance-state.svelte.ts::startAppearanceLoad()`.
// The back end sends values and codes only; the sentences (W-B0..W-B9) are built in `features/appearance/`.

import { invoke } from "@tauri-apps/api/core";

/** One CSS custom property: [name, value]. */
export type CssVarDto = [name: string, value: string];

export type ProblemDto =
  | { kind: "presetUnusable"; line: number | null; value: string; usable: string[] }
  | { kind: "presetWrongType"; line: number | null; key: "preset" | "name" | "theme" }
  | { kind: "colorsUnparsable"; items: { name: string; line: number | null }[] }
  | { kind: "colorsNotTable"; line: number | null }
  | { kind: "fontSize"; line: number | null; key: "size"; default: number; min: number; max: number }
  | { kind: "fontFamily"; line: number | null }
  | { kind: "fontFamilyElements"; line: number | null; names: string[] }
  | { kind: "notTable"; line: number | null; key: "font" | "layout" }
  | { kind: "layoutValue"; line: number | null; key: "min_col_width" | "tree_width_percent"; default: number; min: number; max: number }
  | { kind: "unused"; items: { table: string; name: string; line: number | null; used: string }[] };

export interface AppearanceDto {
  dark: boolean;
  bg: string;
  uiVars: CssVarDto[];
  fontFamily: string;
  fontSize: number;
  rowHeight: number;
  minColWidth: number;
  treeWidthPercent: number;
  problems: ProblemDto[];
}

export function appearanceLoad(): Promise<AppearanceDto> {
  return invoke<AppearanceDto>("appearance_load");
}
