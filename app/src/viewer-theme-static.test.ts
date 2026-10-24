/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0017 R-913 / R-913-1 (the viewer's colour table, light and dark) / R-913-2 (`html`
//   `color-scheme` light / dark), AC-907 (the viewer document has no R-911 `--ui-*` variables), AC-955;
//   SPEC-0300-0015 第5版 R-511 (the viewer follows the main window's theme).
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.11.7 (new `routes/viewer/viewer-theme.css`,
//   `--vw-*` variables, imported from `routes/viewer/+page.svelte`), §3.11.12 (3), §3.11.16 MINOR-5 (no
//   `app.css` in comments of the viewer files), MINOR-7 (only `routes/viewer/+page.svelte` imports it).
//
// SPEC-0300-0023 UPDATE: value tables removed (see the block comment below).
// Files under test: app/src/routes/viewer/viewer-theme.css and the changed
// routes/viewer/+page.svelte.

const SRC = resolve(__dirname);
const VIEWER_DIR = join(SRC, "routes", "viewer");
const VIEWER_CSS = join(VIEWER_DIR, "viewer-theme.css");
const VIEWER_PAGE = join(VIEWER_DIR, "+page.svelte");

const readRaw = (f: string): string => readFileSync(f, "utf-8");
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

function cssText(): string {
  expect(existsSync(VIEWER_CSS), "app/src/routes/viewer/viewer-theme.css must exist (design §3.11.7)").toBe(true);
  return stripCssComments(readRaw(VIEWER_CSS));
}

// (No theme switch any more: `light` is the whole stylesheet.)
function split(css: string): { light: string; dark: string; blocks: number } {
  const re = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/g;
  let light = "";
  let dark = "";
  let blocks = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    light += css.slice(last, m.index);
    dark += css.slice(start, i - 1);
    blocks++;
    last = i;
    re.lastIndex = i;
  }
  light += css.slice(last);
  return { light, dark, blocks };
}

function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of body.split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    out.set(d.slice(0, i).trim(), d.slice(i + 1).trim().toLowerCase());
  }
  return out;
}

// Declarations of the `html { ... }` rule(s) of one theme part.
function htmlDecls(part: string): Map<string, string> {
  const merged = new Map<string, string>();
  for (const r of rules(part)) {
    if (!r.selector.split(",").some((s) => s.trim() === "html")) continue;
    for (const [k, v] of declarations(r.body)) merged.set(k, v);
  }
  return merged;
}

// SPEC-0300-0023 §4.4 (R-1726 variables), SPEC-0200-0001 §3.18.15 MUST-1: the stylesheet holds NO colour value. The 24 `--vw-*` values (11 + 13 highlight) are
// computed by the Rust `appearance/` and handed over by the initialization script; the value tables moved to the Rust `vars_tests.rs` / `highlight_tests.rs`.
// This file keeps the structure: no theme switch, `html` colour-scheme from a variable, no `--ui-*`, fonts, body rules, the import site.
const R911_NAMES = [
  "--ui-bg", "--ui-fg", "--ui-surface", "--ui-surface-2", "--ui-surface-3", "--ui-border", "--ui-border-strong",
  "--ui-border-muted", "--ui-muted", "--ui-muted-2", "--ui-hover", "--ui-selected", "--ui-focused", "--ui-row-head",
  "--ui-link", "--ui-error", "--ui-backdrop", "--ui-shadow-1", "--ui-shadow-2",
  // SPEC-0300-0023 R-1723 (new main-window variables; the viewer must not carry any of them either)
  "--ui-border-active", "--ui-cursor-fg", "--ui-cursor-bg", "--ui-folder", "--ui-executable", "--ui-selected-fg", "--ui-status-fg", "--ui-status-bg",
  "--ui-menu-active-fg", "--ui-menu-active-bg", "--ui-tree-current", "--ui-tree-cursor", "--ui-color-scheme",
];

describe("R-913-1 / R-913-2 / R-1721: the viewer stylesheet has no colour values and no theme switch", () => {
  it("no `@media (prefers-color-scheme` (AC-1726)", () => {
    expect(cssText()).not.toMatch(/prefers-color-scheme/);
  });

  it("no colour literal anywhere (not even inside a --vw-* declaration: the values come from the initialization script)", () => {
    const css = cssText();
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });

  it("no --vw-* COLOUR variable is declared (only --vw-font and --vw-font-mono, R-913-4 / R-1728)", () => {
    const names = [...cssText().matchAll(/(--vw-[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(names.filter((n) => !/^--vw-font(-mono)?$/.test(n))).toEqual([]);
  });

  it("R-913-4: --vw-font and --vw-font-mono are declared in the `html` rule", () => {
    const d = htmlDecls(split(cssText()).light);
    expect(d.has("--vw-font")).toBe(true);
    expect(d.has("--vw-font-mono")).toBe(true);
  });

  it("R-913-2 / R-1741: `html` color-scheme is var(--vw-color-scheme, light dark) (the fallback has no colour)", () => {
    expect(htmlDecls(split(cssText()).light).get("color-scheme")).toBe("var(--vw-color-scheme, light dark)");
  });

  it("`html, body` paint their background from var(--vw-bg)", () => {
    const r = rules(cssText()).find((x) => x.selector.split(",").map((s) => s.trim()).sort().join() === "body,html");
    expect(r, "an `html, body { background: ... }` rule").toBeDefined();
    expect(declarations(r!.body).get("background")).toBe("var(--vw-bg)");
  });

  it("R-913-3: `html, body` have no page margin and no overflow rule", () => {
    const r = rules(cssText()).find((x) => x.selector.split(",").map((s) => s.trim()).sort().join() === "body,html");
    expect(declarations(r!.body).get("margin")).toBe("0");
    expect(declarations(r!.body).has("overflow")).toBe(false);
  });

  it("routes/viewer/+page.svelte uses --vw-header-bg / --vw-header-fg for the header (R-1726)", () => {
    const styles = [...readRaw(VIEWER_PAGE).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    expect(styles).toContain("var(--vw-header-bg)");
    expect(styles).toContain("var(--vw-header-fg)");
  });
});

describe("R-913 / m-5 / AC-907: the viewer never carries the main window's --ui-* variables", () => {
  it("the R-911 and R-1723 names are absent from viewer-theme.css (comments included) and no `--ui-` prefix is used at all", () => {
    const raw = readRaw(VIEWER_CSS);
    expect(raw).not.toContain("--ui-");
    for (const n of R911_NAMES) expect(raw).not.toContain(n);
  });

  it("every custom property declared in viewer-theme.css is named --vw-*", () => {
    const names = [...cssText().matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names.filter((n) => !n.startsWith("--vw-"))).toEqual([]);
    expect(names.filter((n) => R911_NAMES.includes(n))).toEqual([]);
  });

  it("routes/viewer/+page.svelte uses var(--vw-*) for colours and neither declares nor reads any --ui-* variable", () => {
    const page = readRaw(VIEWER_PAGE);
    expect(page).not.toContain("--ui-");
    const styles = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    expect(styles).toContain("var(--vw-");
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styles).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });

  it("the previous `:global(html), :global(body)` background rule is gone from +page.svelte (it lives in viewer-theme.css)", () => {
    expect(readRaw(VIEWER_PAGE)).not.toMatch(/:global\(html\)/);
  });
});

describe("R-913 / MINOR-5: the viewer files never mention app.css (HTML comments count)", () => {
  it("viewer-theme.css (comments included) does not contain `app.css`", () => {
    expect(readRaw(VIEWER_CSS)).not.toContain("app.css");
  });

  it("routes/viewer/+page.svelte (HTML comments included) does not contain `app.css`", () => {
    expect(readRaw(VIEWER_PAGE)).not.toContain("app.css");
  });

  it("the stale comment `R-511: dark theme fixed, never follows the main window` is gone (R-511 now follows the theme)", () => {
    const page = readRaw(VIEWER_PAGE);
    expect(page).not.toMatch(/dark theme fixed/i);
    expect(page).not.toMatch(/never follows the main window/i);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit" || name === "target") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}

describe("MINOR-7: only routes/viewer/+page.svelte imports viewer-theme.css", () => {
  const importers = (): string[] =>
    walk(SRC)
      .filter((f) => /\.(ts|svelte|css)$/.test(f) && !/\.test\.ts$/.test(f))
      .filter((f) => /viewer-theme\.css/.test(readRaw(f)))
      .map((f) => relative(SRC, f).split(sep).join("/"));

  it("the scan finds exactly routes/viewer/+page.svelte", () => {
    expect(importers()).toEqual(["routes/viewer/+page.svelte"]);
  });

  it("+page.svelte imports it as a side-effect import (`import \"./viewer-theme.css\"`)", () => {
    expect(readRaw(VIEWER_PAGE)).toMatch(/import\s+["']\.\/viewer-theme\.css["']/);
  });

  it("the viewer page does not import app.css (R-913) nor reach it via a relative path", () => {
    expect(readRaw(VIEWER_PAGE)).not.toMatch(/import\s+["'][^"']*app\.css["']/);
  });

  it("the main page does not import viewer-theme.css (the two themes never mix)", () => {
    expect(readRaw(join(SRC, "routes", "+page.svelte"))).not.toContain("viewer-theme");
  });
});
