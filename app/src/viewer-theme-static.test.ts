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

// Light part = everything outside the dark media block; dark part = the media block's content.
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

// #fff and #ffffff are the same colour: normalise before comparing.
const normHex = (v: string | undefined): string => {
  if (v === undefined) return "<missing>";
  const t = v.trim().toLowerCase();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : t;
};

// R-913-1 table, expressed as the --vw-* variables of design §3.11.7.
// PHASE 13 UPDATE (SPEC-0300-0017 第8版 R-913-1 / R-913-1-1 / R-913-4, SPEC-0200-0001 §3.14.12-13): the table grows by the gutter colours (2), the
// `--vw-hl-*` highlight colours (13, rows of R-913-1-1) and -- light only -- the two font variables (2); the dark line-number colour is `#8c8c8c`
// (承認時の発注者決定 2026-10-10; it was `#777`). The old "9 values" expectation became "9 + 2 + 13 (+ 2 fonts in the light part)".
const LIGHT: Record<string, string> = {
  "--vw-bg": "#fff", // html / body / viewer root background
  "--vw-fg": "#111", // text colour
  "--vw-header-bg": "#f0f0f0",
  "--vw-border": "#d0d0d0", // line under the header
  "--vw-banner-bg": "#fff4ce", // truncation banner
  "--vw-banner-fg": "#5c4400",
  "--vw-muted": "#666", // loading / no-file text
  "--vw-error": "#b00020",
  "--vw-lineno": "#666",
  // 第8版: the line-number gutter (SPEC-0300-0015 R-462-1 / R-462-4)
  "--vw-gutter-bg": "#f0f0f0",
  "--vw-gutter-border": "#d0d0d0",
  // 第8版: highlight colours (R-913-1-1; the full check incl. selectors / contrast is viewer-theme-highlight.test.ts)
  "--vw-hl-keyword": "#d73a49",
  "--vw-hl-title": "#6f42c1",
  "--vw-hl-constant": "#005cc5",
  "--vw-hl-string": "#032f62",
  "--vw-hl-builtin": "#c24e00",
  "--vw-hl-comment": "#6a737d",
  "--vw-hl-name": "#22863a",
  "--vw-hl-section": "#005cc5",
  "--vw-hl-bullet": "#735c0f",
  "--vw-hl-addition-fg": "#1e7f35",
  "--vw-hl-addition-bg": "#f0fff4",
  "--vw-hl-deletion-fg": "#b31d28",
  "--vw-hl-deletion-bg": "#ffeef0",
};
const DARK: Record<string, string> = {
  "--vw-bg": "#1e1e1e",
  "--vw-fg": "#ddd",
  "--vw-header-bg": "#2a2a2a",
  "--vw-border": "#444",
  "--vw-banner-bg": "#4a3b00",
  "--vw-banner-fg": "#ffd866",
  "--vw-muted": "#999",
  "--vw-error": "#ff8080",
  "--vw-lineno": "#8c8c8c", // 第8版: was #777 (3.4:1); #8c8c8c is 4.55 / 4.96 (R-462-4)
  "--vw-gutter-bg": "#252526",
  "--vw-gutter-border": "#3a3a3a",
  "--vw-hl-keyword": "#ff7b72",
  "--vw-hl-title": "#d2a8ff",
  "--vw-hl-constant": "#79c0ff",
  "--vw-hl-string": "#a5d6ff",
  "--vw-hl-builtin": "#ffa657",
  "--vw-hl-comment": "#8b949e",
  "--vw-hl-name": "#7ee787",
  "--vw-hl-section": "#4a8cf7",
  "--vw-hl-bullet": "#f2cc60",
  "--vw-hl-addition-fg": "#aff5b4",
  "--vw-hl-addition-bg": "#033a16",
  "--vw-hl-deletion-fg": "#ffdcd7",
  "--vw-hl-deletion-bg": "#67060c",
};

const R911_NAMES = [
  "--ui-bg", "--ui-fg", "--ui-surface", "--ui-surface-2", "--ui-surface-3", "--ui-border", "--ui-border-strong",
  "--ui-border-muted", "--ui-muted", "--ui-muted-2", "--ui-hover", "--ui-selected", "--ui-focused", "--ui-row-head",
  "--ui-link", "--ui-error", "--ui-backdrop", "--ui-shadow-1", "--ui-shadow-2",
];

function pick(decls: Map<string, string>, table: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(table)) out[k] = normHex(decls.get(k));
  return out;
}
const normTable = (t: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, normHex(v)]));

describe("R-913-1: the viewer colour table in viewer-theme.css (SPEC-0200-0001 §3.11.7)", () => {
  it("the light `html` rule defines all 24 --vw-* values of the table (9 + gutter 2 + highlight 13)", () => {
    expect(Object.keys(LIGHT).length).toBe(24);
    const { light } = split(cssText());
    expect(pick(htmlDecls(light), LIGHT)).toEqual(normTable(LIGHT));
  });

  it("the dark `@media (prefers-color-scheme: dark)` block's `html` rule defines the 24 dark values (the previous fixed-dark values are kept, except the line number colour #8c8c8c)", () => {
    expect(Object.keys(DARK).length).toBe(24);
    const { dark, blocks } = split(cssText());
    expect(blocks).toBe(1);
    expect(pick(htmlDecls(dark), DARK)).toEqual(normTable(DARK));
  });

  it("R-913-4: --vw-font and --vw-font-mono are declared in the LIGHT `html` rule only (fonts do not change with the theme)", () => {
    const { light, dark } = split(cssText());
    expect(htmlDecls(light).has("--vw-font")).toBe(true);
    expect(htmlDecls(light).has("--vw-font-mono")).toBe(true);
    expect(htmlDecls(dark).has("--vw-font")).toBe(false);
    expect(htmlDecls(dark).has("--vw-font-mono")).toBe(false);
  });

  it("the light and the dark parts declare the same colour variables (every --vw-* except the two font variables, which are light-only)", () => {
    const { light, dark } = split(cssText());
    const names = (d: Map<string, string>): string[] => [...d.keys()].filter((k) => k.startsWith("--vw-") && !k.startsWith("--vw-font")).sort();
    expect(names(htmlDecls(light))).toEqual(names(htmlDecls(dark)));
    expect(names(htmlDecls(light)).length).toBe(24);
  });

  it("R-913-2: `html` color-scheme is `light` in the light part and `dark` in the dark block", () => {
    const { light, dark } = split(cssText());
    expect(htmlDecls(light).get("color-scheme")).toBe("light");
    expect(htmlDecls(dark).get("color-scheme")).toBe("dark");
  });

  it("`html, body` paint their background from var(--vw-bg) (moved here from +page.svelte's :global rules)", () => {
    const { light } = split(cssText());
    const r = rules(light).find((x) => x.selector.split(",").map((s) => s.trim()).sort().join() === "body,html");
    expect(r, "an `html, body { background: ... }` rule").toBeDefined();
    expect(declarations(r!.body).get("background")).toBe("var(--vw-bg)");
  });

  it("R-913-3 (6th edition): `html, body` have no page margin, so the 100vh viewer does not overflow the document", () => {
    const { light } = split(cssText());
    const r = rules(light).find((x) => x.selector.split(",").map((s) => s.trim()).sort().join() === "body,html");
    expect(declarations(r!.body).get("margin")).toBe("0");
    expect(declarations(r!.body).has("overflow"), "overflow stays visible (not hidden as in main)").toBe(false);
  });

  it("the stylesheet holds no colour literal outside the --vw-* declarations (rules use var())", () => {
    const rest = cssText().replace(/--vw-[\w-]+\s*:[^;}]+;?/g, "");
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rest).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});

describe("R-913 / m-5 / AC-907: the viewer never carries the main window's --ui-* variables", () => {
  it("the 19 R-911 names are absent from viewer-theme.css (comments included) and no `--ui-` prefix is used at all", () => {
    const raw = readRaw(VIEWER_CSS);
    expect(raw).not.toContain("--ui-");
    for (const n of R911_NAMES) expect(raw).not.toContain(n);
  });

  it("every custom property declared in viewer-theme.css is named --vw-*", () => {
    const names = [...cssText().matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    // PHASE 13 UPDATE: was >= 18 (9 light + 9 dark). Now 26 light (24 + the two font variables) + 24 dark = 50.
    expect(names.length).toBeGreaterThanOrEqual(50);
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
    const page = readRaw(VIEWER_PAGE);
    expect(page).not.toMatch(/:global\(html\)/);
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
