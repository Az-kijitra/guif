// SPEC-0300-0023 R-1820 / R-1822 / R-1700-1; SPEC-0200-0001 §3.18.4: the notices about the colour scheme, the font and the layout (W-B0..W-B9),
// built from the back end's `problems` (values only). Pure. `routes/config-evaluate.ts` puts buildAppearanceNotice after the keymap notice and
// buildUnusedNotice (W-B8) after the external apps and before the unknown settings (W-AC).

import { limitList } from "$lib/shared/notice-list";
import type { ProblemDto } from "$lib/shared/ipc/appearance";
import { APPEARANCE_MESSAGES as M } from "./messages";

type Problem = ProblemDto;
type Kind = Problem["kind"];

// R-1820: colours W-B0 / W-B1 / W-B5 / W-B2 -> font W-B7 (font) / W-B6 / W-B9 / W-B3 -> layout W-B7 (layout) / W-B4. `unused` (W-B8) is not here.
function rank(p: Problem): number {
  switch (p.kind) {
    case "presetUnusable":
      return 0;
    case "presetWrongType":
      return 1;
    case "colorsNotTable":
      return 2;
    case "colorsUnparsable":
      return 3;
    case "notTable":
      return p.key === "font" ? 4 : 8;
    case "fontFamily":
      return 5;
    case "fontFamilyElements":
      return 6;
    case "fontSize":
      return 7;
    case "layoutValue":
      return p.key === "min_col_width" ? 9 : 10; // the [layout] keys in their documented order
    case "unused":
      return -1;
  }
}

// R-1755 (vii): control characters of a raw name are shown as `?` (the DTO keeps the raw name).
function visibleName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, "?");
}

function sentenceOf(p: Problem): string {
  switch (p.kind) {
    case "presetUnusable":
      return M.presetUnusable(p.line, visibleName(p.value), p.usable);
    case "presetWrongType":
      return M.presetWrongType(p.line, p.key);
    case "colorsNotTable":
      return M.colorsNotTable(p.line);
    case "colorsUnparsable":
      return M.colorsUnparsable(p.items.length, limitList(p.items.map((i) => M.colorItem(i.name, i.line))));
    case "notTable":
      return M.notTable(p.line, p.key);
    case "fontFamily":
      return M.fontFamily(p.line);
    case "fontFamilyElements":
      return M.fontFamilyElements(p.line, p.names.map((n) => M.quoteName(visibleName(n))).join(M.nameSeparator));
    case "fontSize":
      return M.fontSize(p.line, p.default, p.min, p.max);
    case "layoutValue":
      return M.layoutValue(p.line, p.key, p.default, p.min, p.max);
    case "unused":
      return "";
  }
}

// W-B0..W-B7, W-B9 joined by ONE half-width space (R-1661); null when there is nothing to say.
export function buildAppearanceNotice(problems: readonly Problem[]): string | null {
  const sentences = problems
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.kind as Kind) !== "unused")
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => sentenceOf(p));
  return sentences.length === 0 ? null : sentences.join(" ");
}

// W-B8: known settings that are not used (R-1700-1 / R-1704). null when there is none.
export function buildUnusedNotice(problems: readonly Problem[]): string | null {
  const items: string[] = [];
  for (const p of problems) {
    if (p.kind === "unused") for (const i of p.items) items.push(M.unusedItem(i.name, i.line, i.used));
  }
  return items.length === 0 ? null : M.unusedSettings(items.length, limitList(items));
}
