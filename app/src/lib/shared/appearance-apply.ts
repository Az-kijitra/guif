// SPEC-0300-0023 R-1721 / R-1751 5 / R-1742 / R-1749; SPEC-0200-0001 §3.18.5: puts the values the back end resolved onto
// the document root as CSS custom properties. No colour is written or computed here. The font family is set as a style VALUE
// (never by concatenating CSS text; the back end already quoted and escaped it). The settings-file CHECK never calls this.

import type { AppearanceDto } from "$lib/shared/ipc/appearance";
import { appearanceState } from "$lib/shared/state/appearance-state.svelte";

export type CssVarPair = readonly [name: string, value: string];

export interface StyleTarget {
  style: { setProperty(name: string, value: string): void };
}

function defaultRoot(): StyleTarget {
  return document.documentElement;
}

export function applyCssVars(vars: readonly CssVarPair[], root: StyleTarget = defaultRoot()): void {
  for (const [name, value] of vars) root.style.setProperty(name, value);
}

export function applyAppearance(dto: AppearanceDto, root: StyleTarget = defaultRoot()): void {
  applyCssVars(dto.uiVars, root);
  root.style.setProperty("--ui-font", dto.fontFamily);
  root.style.setProperty("--ui-font-mono", dto.fontFamily);
  root.style.setProperty("--ui-font-size", `${dto.fontSize}px`);
  root.style.setProperty("--ui-line-height", `${dto.rowHeight}px`);
  root.style.setProperty("--list-row-height", `${dto.rowHeight}px`);
  appearanceState.hydrate(dto);
}

// The viewer window's initialization script places `window.__GUIF_APPEARANCE__ = { vars: [[name, value], ...] }` before the document
// exists; +layout.ts reads it synchronously. null when missing or malformed (the caller logs console.error).
export function readViewerInitVars(win: { __GUIF_APPEARANCE__?: unknown } = window as never): CssVarPair[] | null {
  const raw = win.__GUIF_APPEARANCE__;
  if (typeof raw !== "object" || raw === null) return null;
  const vars = (raw as { vars?: unknown }).vars;
  if (!Array.isArray(vars)) return null;
  const out: CssVarPair[] = [];
  for (const entry of vars) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "string") return null;
    out.push([entry[0], entry[1]]);
  }
  return out;
}
