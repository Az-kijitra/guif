/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0023 R-1721 / AC-1721 (no colour literal in .ts / .svelte / app.css / viewer-theme.css; the back-end `rgba` for the backdrop / shadows
//   is the only exception), AC-1726 (no `@media (prefers-color-scheme` in either stylesheet), AC-1749 (nothing interprets `ui_theme`, nothing reacts to the OS
//   theme changing), R-1748 / R-1749, R-1652 (the CHECK never applies anything: it must not reach applyAppearance / appearanceState), R-1741 (`color-scheme` comes from
//   a variable, with a colour-free fallback so that a failed load still draws readable text).
// Architecture: SPEC-0200-0001 §3.18.11 / §3.18.15 MUST-1 (CSS has NO colour value; the values live in the Rust `appearance/` only), SHOULD-6 (the TS half of the
//   AC-1749 scan; the Rust half is `appearance_structure_tests.rs`), MINOR-5 (no colour-format code in the front end: `parseColor`, `contrast(`, `luminance(`,
//   a `#rrggbb` regular expression), MINOR-a (fallback `light dark`), §3.18.4 (`config-evaluate.ts` and `settings-file-wiring.ts` do not import `appearance-apply` /
//   `appearance-state`).

const SRC = resolve(__dirname);
const rel = (f: string): string => relative(SRC, f).split(sep).join("/");

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

const prod = walk(SRC).filter((f) => /\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f) && !/\.d\.ts$/.test(f));
const read = (f: string): string => readFileSync(f, "utf-8");
const stripCss = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJs = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/<!--[\s\S]*?-->/g, "");

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/;
const NAMES = "white black red green blue gray grey silver maroon purple fuchsia lime olive yellow navy teal aqua orange pink brown gold cyan magenta".split(" ");
const VALUE_POS = /(?:^|[;{\s"'`])(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|fill|stroke|caret-color)\s*:\s*([^;}"'`]+)/gi;

// Black with an alpha (`rgba(0, 0, 0, .35)`) is the backdrop / shadow exception of AC-1721.
function colourHits(text: string): string[] {
  const t = text.replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*[\d.]+\s*\)/g, "");
  const hits: string[] = [];
  const hex = HEX.exec(t);
  if (hex) hits.push(hex[0]);
  const fn = COLOR_FN.exec(t);
  if (fn) hits.push(fn[0]);
  VALUE_POS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VALUE_POS.exec(t)) !== null) for (const tok of m[1].toLowerCase().split(/[\s,()/]+/)) if (NAMES.includes(tok)) hits.push(tok);
  return hits;
}

function stylesAndAttrs(code: string): string[] {
  const out = [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  for (const m of code.matchAll(/\bstyle(?::[\w-]+)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

function stringLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m: RegExpExecArray | null;
  const src = stripJs(code);
  while ((m = re.exec(src)) !== null) out.push(m[2]);
  return out;
}

const APP_CSS = join(SRC, "app.css");
const VIEWER_CSS = join(SRC, "routes", "viewer", "viewer-theme.css");

describe("AC-1721 / MUST-1: no colour literal anywhere in the front end", () => {
  it("the scanner: hex / functions / value-position names are hits; var(), transparent, currentColor and the black-alpha backdrop are not", () => {
    expect(colourHits("color: #7aa7ff")).not.toEqual([]);
    expect(colourHits("background: rgb(1, 2, 3)")).not.toEqual([]);
    expect(colourHits("border: 1px solid white")).not.toEqual([]);
    expect(colourHits("color: var(--ui-fg); background: transparent; outline: 1px solid currentColor")).toEqual([]);
    expect(colourHits("box-shadow: 0 2px 8px rgba(0,0,0,.4)")).toEqual([]);
  });

  it("the scan sees the sources (an empty scan must not pass)", () => {
    expect(prod.length).toBeGreaterThan(100);
    expect(prod.map(rel)).toContain("routes/viewer/+page.svelte");
    expect(existsSync(APP_CSS) && existsSync(VIEWER_CSS)).toBe(true);
  });

  it("no .svelte <style> / style attribute (the viewer included) and no .ts string literal holds a colour", () => {
    const bad = prod
      .map((f) => ({ f: rel(f), hits: (f.endsWith(".svelte") ? stylesAndAttrs(read(f)) : stringLiterals(read(f))).flatMap(colourHits) }))
      .filter((x) => x.hits.length > 0)
      .map((x) => `${x.f}: ${[...new Set(x.hits)].join(", ")}`);
    expect(bad).toEqual([]);
  });

  it("app.css holds no colour value at all (not even inside --ui-* declarations: the values come from the back end)", () => {
    expect(colourHits(stripCss(read(APP_CSS)))).toEqual([]);
  });

  it("viewer-theme.css holds no colour value at all (not even inside --vw-* declarations)", () => {
    expect(colourHits(stripCss(read(VIEWER_CSS)))).toEqual([]);
  });

  it("the --ui-* / --vw-* colour variables are not declared in the stylesheets (only fonts, sizes and the colour-free fallbacks)", () => {
    const decl = (css: string): string[] => [...stripCss(css).matchAll(/(--(?:ui|vw)-[\w-]+)\s*:/g)].map((m) => m[1]);
    const allowed = /^--(ui|vw)-(font|font-mono|font-size|line-height)$/;
    expect(decl(read(APP_CSS)).filter((n) => !allowed.test(n))).toEqual([]);
    expect(decl(read(VIEWER_CSS)).filter((n) => !allowed.test(n))).toEqual([]);
  });
});

describe("AC-1726 / R-1741: colour scheme and media queries", () => {
  it("neither stylesheet has `@media (prefers-color-scheme`", () => {
    expect(read(APP_CSS)).not.toMatch(/prefers-color-scheme/);
    expect(read(VIEWER_CSS)).not.toMatch(/prefers-color-scheme/);
  });

  it("app.css: `.ui-root { color-scheme: var(--ui-color-scheme, light dark) }` (MINOR-a fallback) and no colour-scheme on :root / html / body", () => {
    const css = stripCss(read(APP_CSS));
    expect(css).toMatch(/\.ui-root\s*\{[^}]*color-scheme:\s*var\(--ui-color-scheme,\s*light dark\)/);
    for (const sel of [":root", "html", "body"]) expect(css).not.toMatch(new RegExp(`(^|[},\\s])${sel}\\s*\\{[^}]*color-scheme`));
  });

  it("viewer-theme.css: `html { color-scheme: var(--vw-color-scheme, light dark) }` (R-913-2) and no --ui-* reference", () => {
    const css = stripCss(read(VIEWER_CSS));
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*var\(--vw-color-scheme,\s*light dark\)/);
    expect(read(VIEWER_CSS)).not.toContain("--ui-");
  });
});

describe("AC-1749 / R-1748 / SHOULD-6: nothing interprets ui_theme or follows the OS theme", () => {
  const nonMessages = prod.filter((f) => !/(^|\/)messages\.ts$/.test(rel(f)));

  it("no matchMedia('(prefers-color-scheme' and no theme-changed listener in production code", () => {
    const bad = prod.filter((f) => /prefers-color-scheme|onThemeChanged|ThemeChanged|themeChanged/.test(stripJs(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });

  it("no production code outside messages.ts mentions ui_theme / uiTheme / UiTheme / interpret_ui_theme / ThemeSetting", () => {
    const bad = nonMessages.filter((f) => /ui_theme|uiTheme|UiTheme|interpret_ui_theme|ThemeSetting/.test(stripJs(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });

  it("the W-33 notice module is gone (shared/theme-notice.ts)", () => {
    expect(existsSync(join(SRC, "lib", "shared", "theme-notice.ts"))).toBe(false);
    expect(existsSync(join(SRC, "lib", "shared", "theme-notice.test.ts"))).toBe(false);
  });
});

describe("MINOR-5 / R-1721: the front end has no colour-format or colour-math code", () => {
  it("no parseColor / parse_color / contrast( / luminance( / xterm table in production code", () => {
    const bad = prod.filter((f) => /\bparseColor\b|\bparse_color\b|\bcontrast\s*\(|\bluminance\s*\(|\bxterm_?256\b|\bhexToRgb\b/i.test(stripJs(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });

  it("no regular expression that reads #rrggbb / #rgb", () => {
    const bad = prod.filter((f) => /\[0-9a-f(?:A-F)?\]\{[0-9,]+\}/i.test(stripJs(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });

  it("the old contrast test (the maths moved to the back end) is deleted", () => {
    expect(existsSync(join(SRC, "contrast.test.ts"))).toBe(false);
  });

  it("the old column-scroll module and its test are deleted (R-1793)", () => {
    expect(existsSync(join(SRC, "lib", "features", "file-list", "column-scroll.ts"))).toBe(false);
    expect(existsSync(join(SRC, "lib", "features", "file-list", "column-scroll.test.ts"))).toBe(false);
  });
});

describe("R-1652 / §3.18.4: the check applies nothing", () => {
  const imports = (f: string): string[] => [...stripJs(read(join(SRC, f))).matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);

  it.each(["routes/config-evaluate.ts", "routes/settings-file-wiring.ts"])("%s imports neither appearance-apply nor appearance-state", (file) => {
    const bad = imports(file).filter((s) => /appearance-apply|appearance-state/.test(s));
    expect(bad).toEqual([]);
  });

  it("neither of them calls applyAppearance / appearanceState / startAppearanceLoad", () => {
    for (const f of ["routes/config-evaluate.ts", "routes/settings-file-wiring.ts"]) {
      expect(stripJs(read(join(SRC, f))), f).not.toMatch(/applyAppearance|applyCssVars|appearanceState|startAppearanceLoad/);
    }
  });

  it("the start-up wiring is the writer: startup-wiring.ts calls startAppearanceLoad (the same Promise as +layout.ts)", () => {
    expect(stripJs(read(join(SRC, "routes", "startup-wiring.ts")))).toContain("startAppearanceLoad");
  });

  it("only +layout.ts applies the appearance (applyAppearance / applyCssVars are called nowhere else in production code)", () => {
    const callers = prod.filter((f) => /\b(applyAppearance|applyCssVars)\s*\(/.test(stripJs(read(f)))).map(rel).filter((r) => r !== "lib/shared/appearance-apply.ts");
    expect(callers).toEqual(["routes/+layout.ts"]);
  });

  it("the file-list code never imports appearance-state directly (the wiring passes minColWidth / ch as arguments, §3.18.12)", () => {
    const bad = prod.filter((f) => rel(f).startsWith("lib/features/file-list/") && /appearance-state/.test(stripJs(read(f)))).map(rel);
    expect(bad).toEqual([]);
  });
});
