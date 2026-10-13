/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0017 第8版 R-913-4 (確定 T-15: the viewer's `--vw-font` equals the main window's base font, `--vw-font-mono` its monospace font;
//   the equality is fixed by a static test so that changing the main value without the viewer value is caught; the fonts do not change with the theme, so
//   they are NOT inside the dark override), R-920 / R-921 (the two font values), SPEC-0300-0015 R-462 / R-510-2, AC-907 第8版 (static side).
// Architecture: SPEC-0200-0001 §3.14.5 ("フォント") and §3.14.8: the viewer does not load app.css (AC-907), so the sharing is by VALUE. Per R-913-4's
//   【レビュー S-5】 this comparison lives in THIS separate file, because `viewer-theme-static.test.ts` forbids `--ui-` and the app stylesheet's name from
//   appearing in `viewer-theme.css` (comments included) -- so the viewer stylesheet must not mention them either, and this file reads both files
//   from the outside.
//

const SRC = resolve(__dirname);
const APP_CSS = readFileSync(resolve(SRC, "app.css"), "utf-8");
const VIEWER_CSS = readFileSync(resolve(SRC, "routes", "viewer", "viewer-theme.css"), "utf-8");

const BASE = '"Segoe UI", "Meiryo", sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", "Consolas", "Menlo", "Monaco", "Courier New", monospace';

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const squash = (v: string): string => v.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();

function declarations(css: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:^|[;{\\s])${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;}]+)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(strip(css))) !== null) out.push(squash(m[1]));
  return out;
}

function darkBlock(css: string): string {
  const text = strip(css);
  const m = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/.exec(text);
  if (m === null) return "";
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < text.length && depth > 0) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    i++;
  }
  return text.slice(start, i - 1);
}

describe("the main window's font values (the source of truth, R-920 / R-921)", () => {
  it("app.css declares the two fonts once each with the spec values", () => {
    expect(declarations(APP_CSS, "--ui-font")).toEqual([squash(BASE)]);
    expect(declarations(APP_CSS, "--ui-font-mono")).toEqual([squash(MONO)]);
  });
});

describe("R-913-4: the viewer's font variables have the SAME values", () => {
  it("`--vw-font` is declared exactly once, and equals the main `--ui-font` as a string", () => {
    const v = declarations(VIEWER_CSS, "--vw-font");
    expect(v.length).toBe(1);
    expect(v[0]).toBe(declarations(APP_CSS, "--ui-font")[0]);
    expect(v[0]).toBe(squash(BASE));
  });

  it("`--vw-font-mono` is declared exactly once, and equals the main `--ui-font-mono` as a string", () => {
    const v = declarations(VIEWER_CSS, "--vw-font-mono");
    expect(v.length).toBe(1);
    expect(v[0]).toBe(declarations(APP_CSS, "--ui-font-mono")[0]);
    expect(v[0]).toBe(squash(MONO));
  });

  it("the first family of each is the one the E2E measures: \"Segoe UI\" and ui-monospace (AC-522 / AC-907)", () => {
    expect(declarations(VIEWER_CSS, "--vw-font")[0].startsWith('"Segoe UI"')).toBe(true);
    expect(declarations(VIEWER_CSS, "--vw-font-mono")[0].startsWith("ui-monospace")).toBe(true);
  });

  it("the fonts are NOT inside the dark override (they do not change with the theme)", () => {
    const dark = darkBlock(VIEWER_CSS);
    expect(dark.length).toBeGreaterThan(0);
    expect(dark).not.toContain("--vw-font");
  });

  it("they are on `html` (the ROOT of the viewer document), so AC-907's root computed-style check sees them", () => {
    const text = strip(VIEWER_CSS).replace(darkBlock(VIEWER_CSS), "");
    const htmlRule = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].split(",").map((s) => s.trim()).includes("html") && m[2].includes("--vw-font:"));
    expect(htmlRule, "an `html { ... --vw-font: ... }` rule").toBeDefined();
    expect(htmlRule![2]).toContain("--vw-font-mono:");
  });
});

describe("the existing separation is kept (R-913-4 【レビュー S-5】): viewer-theme.css names neither the main variables nor the app stylesheet", () => {
  it("no `--ui-` and no `app.css` anywhere in viewer-theme.css, comments included", () => {
    expect(VIEWER_CSS).not.toContain("--ui-");
    expect(VIEWER_CSS).not.toContain("app.css");
  });
});

describe("the viewer page uses the variables instead of the generic families (R-462, R-510-2, AC-907 第8版)", () => {
  it("routes/viewer sources carry no `font-family: sans-serif` and no 'Consolas' literal list of their own", () => {
    const page = readFileSync(resolve(SRC, "routes", "viewer", "+page.svelte"), "utf-8");
    expect(page).not.toMatch(/font-family\s*:\s*sans-serif/);
    expect(page).not.toMatch(/ui-monospace|Cascadia Mono|Consolas/);
    expect(page).toMatch(/var\(--vw-font\)/);
  });
});
