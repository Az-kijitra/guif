/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0017 AC-905 (no colour literals outside app.css's `:root`
// variables and the viewer), AC-904 (static part: app.css defines every R-911
// variable, with the spec's exact strings), R-910 / R-912 / R-913, SPEC-0200-0001 §3.8.1, §3.8.15 G6 (colour NAMES
// are judged only in CSS value positions), §3.8.17 SHOULD-154(d) (no `@import` in
// component styles, no `additionalData` in vite config).
// Phase 12 (SPEC-0300-0017 第5版, SPEC-0200-0001 §3.11.6 / §3.11.12): app.css now holds the light `:root`
// block AND `@media (prefers-color-scheme: dark) { :root {...} .ui-root { color-scheme: dark } }`.
// `splitThemes` separates the two so each is compared on its own: AC-904 (light), AC-948 (dark: all 19
// colour variables with R-911-1's strings), R-912-1 (`.ui-root` colour-scheme light / dark, never on
// html / body / :root). The old AC-906 static part (`ui_theme-dark` / `set_window_theme` absent) was
// removed because R-912 was replaced (design §3.11.12).
// (`app.css` being imported only by routes/+page.svelte lives in
// import-boundary.test.ts, SHOULD-158.)

const SRC = resolve(__dirname);
const APP_ROOT = resolve(SRC, "..");
const APP_CSS = join(SRC, "app.css");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit" || name === "target") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => relative(SRC, f).split(sep).join("/");
const isTest = (f: string) => /\.test\.ts$/.test(f);
const isViewer = (f: string) => rel(f).startsWith("routes/viewer/");

// ---------- scanning helpers -------------------------------------------------

function stripJsComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function stringLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripJsComments(code))) !== null) out.push(m[2]);
  return out;
}

function svelteStyleTexts(code: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const block = /<style[^>]*>([\s\S]*?)<\/style>/g;
  while ((m = block.exec(code)) !== null) out.push(m[1]);
  const attr = /\bstyle(?::[\w-]+)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
  while ((m = attr.exec(code)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/;

const COLOR_NAMES = new Set(
  (
    "white black red green blue gray grey silver maroon purple fuchsia lime olive yellow navy teal aqua orange pink " +
    "brown gold cyan magenta crimson indigo violet salmon tomato coral khaki beige ivory lavender plum orchid " +
    "darkgray darkgrey lightgray lightgrey dimgray dimgrey whitesmoke gainsboro ghostwhite aliceblue snow azure " +
    "darkred darkblue darkgreen lightblue lightgreen lightyellow lightpink steelblue royalblue skyblue slategray " +
    "slategrey cornflowerblue dodgerblue firebrick chocolate tan wheat linen"
  ).split(" "),
);

// Colour NAMES only count inside CSS value positions (G6).
const VALUE_POSITION =
  /(?:^|[;{\s"'`])(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|column-rule(?:-color)?)\s*:\s*([^;}"'`]+)/gi;

function colourViolations(text: string): string[] {
  const hits: string[] = [];
  const hex = HEX.exec(text);
  if (hex) hits.push(hex[0]);
  const fn = COLOR_FN.exec(text);
  if (fn) hits.push(fn[0]);
  let m: RegExpExecArray | null;
  VALUE_POSITION.lastIndex = 0;
  while ((m = VALUE_POSITION.exec(text)) !== null) {
    for (const tok of m[1].toLowerCase().split(/[\s,()/]+/)) {
      if (COLOR_NAMES.has(tok)) hits.push(tok);
    }
  }
  return hits;
}

function violationsInFile(file: string): string[] {
  const code = readFileSync(file, "utf-8");
  const texts = file.endsWith(".svelte") ? svelteStyleTexts(code) : stringLiterals(code);
  return texts.flatMap((t) => colourViolations(t));
}

// ---------- the scan ---------------------------------------------------------

const sourceFiles = walk(SRC).filter((f) => /\.(ts|svelte)$/.test(f) && !isTest(f));

describe("AC-905 / R-910: no colour literals outside app.css and the viewer", () => {
  it("scanner self-check: it flags hex / functional / value-position names and ignores var() and transparent", () => {
    expect(colourViolations("color: #7aa7ff;").length).toBeGreaterThan(0);
    expect(colourViolations("background: rgba(0,0,0,.35)").length).toBeGreaterThan(0);
    expect(colourViolations("border: 1px solid white;").length).toBeGreaterThan(0);
    expect(colourViolations("color: var(--ui-fg); background: transparent; outline: 1px solid currentColor;")).toEqual([]);
    // G6: a bare word in a non-CSS position is not a colour.
    expect(colourViolations("the red flag")).toEqual([]);
  });

  it("the scan covers the main-window sources (guards against an empty scan)", () => {
    const rels = sourceFiles.map(rel);
    expect(rels).toContain("routes/+page.svelte");
    expect(rels).toContain("lib/features/file-list/SortMenu.svelte");
    expect(rels.length).toBeGreaterThan(40);
  });

  it("no .svelte <style> / style attribute and no .ts string literal contains a colour literal (viewer and app.css excluded)", () => {
    const bad = sourceFiles
      .filter((f) => !isViewer(f))
      .map((f) => ({ f: rel(f), hits: violationsInFile(f) }))
      .filter((x) => x.hits.length > 0)
      .map((x) => `${x.f}: ${[...new Set(x.hits)].join(", ")}`);
    expect(bad).toEqual([]);
  });
});

// ---------- app.css ---------------------------------------------------------

function readAppCss(): string {
  expect(existsSync(APP_CSS), "app/src/app.css must exist (SPEC-0200-0001 §3.8.1)").toBe(true);
  return readFileSync(APP_CSS, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
}

// Splits the stylesheet into the light part (everything outside the dark media block) and the CONTENT of
// the `@media (prefers-color-scheme: dark) { ... }` block (brace-matched). `dark` is "" if there is none.
function splitThemes(css: string): { light: string; dark: string; darkBlocks: number } {
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
  return { light, dark, darkBlocks: blocks };
}

function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

function declarations(body: string): { prop: string; value: string }[] {
  return body
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d.includes(":"))
    .map((d) => {
      const i = d.indexOf(":");
      return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
    });
}

function rootVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const r of rules(css)) {
    if (!r.selector.split(",").some((s) => s.trim() === ":root")) continue;
    for (const d of declarations(r.body)) if (d.prop.startsWith("--")) vars.set(d.prop, d.value);
  }
  return vars;
}

// R-911 table (strings exactly as in the spec; compared after trim + lower-case, §16.0).
const R911: Record<string, string> = {
  "--ui-bg": "#f5f5f5",
  "--ui-fg": "#111",
  "--ui-surface": "#fff",
  "--ui-surface-2": "#f0f0f0",
  "--ui-surface-3": "#e8f0ff",
  "--ui-border": "#d0d0d0",
  "--ui-border-strong": "#cfcfcf",
  "--ui-border-muted": "#eee",
  "--ui-muted": "#666",
  "--ui-muted-2": "#999",
  "--ui-hover": "#e8f0ff",
  "--ui-selected": "#dbe9ff",
  "--ui-focused": "#7aa7ff",
  "--ui-row-head": "#f0f0f0",
  "--ui-link": "#2a6fdb",
  "--ui-error": "#b00020",
  "--ui-backdrop": "rgba(0,0,0,.35)",
  "--ui-shadow-1": "rgba(0,0,0,.12)",
  "--ui-shadow-2": "rgba(0,0,0,.14)",
  "--list-row-height": "28px",
};

describe("AC-904 (static part) / R-911 / R-924: app.css :root variables", () => {
  it("defines every variable of the R-911 table and --list-row-height with the spec's exact strings", () => {
    const vars = rootVars(splitThemes(readAppCss()).light);
    const norm = (v: string | undefined) => (v === undefined ? "<missing>" : v.trim().toLowerCase());
    const actual: Record<string, string> = {};
    for (const k of Object.keys(R911)) actual[k] = norm(vars.get(k));
    expect(actual).toEqual(R911);
  });

  it("R-920 / R-921 fonts: --ui-font and --ui-font-mono carry the specified stacks (design §3.8.1 names)", () => {
    const vars = rootVars(splitThemes(readAppCss()).light);
    expect(vars.get("--ui-font")?.trim()).toBe('"Segoe UI", "Meiryo", sans-serif');
    expect(vars.get("--ui-font-mono")?.trim()).toBe(
      'ui-monospace, "Cascadia Mono", "Consolas", "Menlo", "Monaco", "Courier New", monospace',
    );
  });
});

describe("R-912 / R-913 / design §3.8.1: app.css never styles the whole document", () => {
  it(":root defines custom properties only (no color-scheme / font / color), in the light part and in the dark media block", () => {
    const { light, dark } = splitThemes(readAppCss());
    for (const css of [light, dark]) {
      const rootRules = rules(css).filter((r) => r.selector.split(",").some((s) => s.trim() === ":root"));
      expect(rootRules.length).toBeGreaterThan(0);
      const nonVars = rootRules.flatMap((r) => declarations(r.body)).filter((d) => !d.prop.startsWith("--"));
      expect(nonVars.map((d) => d.prop)).toEqual([]);
    }
  });

  it("html / body rules are limited to the .app-shell document (:has) and never set color-scheme / font / color", () => {
    const { light, dark } = splitThemes(readAppCss());
    const css = light + "\n" + dark;
    const forbidden = /^(color-scheme|font|font-family|font-size|font-weight|color)$/;
    const bad: string[] = [];
    for (const r of rules(css)) {
      for (const sel of r.selector.split(",").map((s) => s.trim())) {
        if (!/^(html|body|:root)(?![\w-])/.test(sel)) continue;
        if (sel !== ":root" && !sel.includes(":has(")) bad.push(`bare selector '${sel}'`);
        for (const d of declarations(r.body)) if (forbidden.test(d.prop)) bad.push(`${sel} { ${d.prop} }`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// R-911-1 table (strings exactly as in the spec; compared after trim + lower-case, AC-948).
const R911_DARK: Record<string, string> = {
  "--ui-bg": "#1e1f22",
  "--ui-fg": "#e6e6e6",
  "--ui-surface": "#2b2d31",
  "--ui-surface-2": "#2b2d31",
  "--ui-surface-3": "#3a4a63",
  "--ui-border": "#3a3d44",
  "--ui-border-strong": "#3a3d44",
  "--ui-border-muted": "#3a3d44",
  "--ui-muted": "#cfcfcf",
  "--ui-muted-2": "#999",
  "--ui-hover": "#3a4a63",
  "--ui-selected": "#3a4a63",
  "--ui-focused": "#7aa7ff",
  "--ui-row-head": "#333741",
  "--ui-link": "#7ab4ff",
  "--ui-error": "#ff8a80",
  "--ui-backdrop": "rgba(0,0,0,.35)",
  "--ui-shadow-1": "rgba(0,0,0,.4)",
  "--ui-shadow-2": "rgba(0,0,0,.45)",
};

describe("AC-948 / R-911-1: the dark theme block of app.css (SPEC-0200-0001 §3.11.6)", () => {
  it("app.css has exactly one `@media (prefers-color-scheme: dark)` block (no html attribute / class marker is used)", () => {
    expect(splitThemes(readAppCss()).darkBlocks).toBe(1);
  });

  it("the dark :root block defines all 19 colour variables with R-911-1's exact strings (unchanged ones included)", () => {
    const vars = rootVars(splitThemes(readAppCss()).dark);
    const norm = (v: string | undefined) => (v === undefined ? "<missing>" : v.trim().toLowerCase());
    const actual: Record<string, string> = {};
    for (const k of Object.keys(R911_DARK)) actual[k] = norm(vars.get(k));
    expect(actual).toEqual(R911_DARK);
    expect(Object.keys(R911_DARK)).toHaveLength(19);
  });

  it("the dark block holds exactly the 19 colour variables: no --list-row-height / fonts (light-only, AC-948)", () => {
    const vars = rootVars(splitThemes(readAppCss()).dark);
    expect([...vars.keys()].sort()).toEqual(Object.keys(R911_DARK).sort());
  });

  it("the light part keeps --list-row-height = 28px (R-924)", () => {
    expect(rootVars(splitThemes(readAppCss()).light).get("--list-row-height")?.trim()).toBe("28px");
  });

  it("the dark block is not a copy of the light values (guards a vacuous block)", () => {
    const { light, dark } = splitThemes(readAppCss());
    expect(rootVars(dark).get("--ui-bg")).toBeDefined();
    expect(rootVars(dark).get("--ui-bg")).not.toBe(rootVars(light).get("--ui-bg"));
  });
});

describe("R-912-1: color-scheme follows the theme on .ui-root only", () => {
  const colorSchemeOf = (css: string, selector: string): string[] =>
    rules(css)
      .filter((r) => r.selector.split(",").some((s) => s.trim() === selector))
      .flatMap((r) => declarations(r.body))
      .filter((d) => d.prop === "color-scheme")
      .map((d) => d.value.trim());

  it("light: `.ui-root { color-scheme: light }`", () => {
    expect(colorSchemeOf(splitThemes(readAppCss()).light, ".ui-root")).toEqual(["light"]);
  });

  it("dark: `.ui-root { color-scheme: dark }` inside the dark media block", () => {
    expect(colorSchemeOf(splitThemes(readAppCss()).dark, ".ui-root")).toEqual(["dark"]);
  });

  it("no color-scheme is written on :root / html / body in either part (html stays `normal`)", () => {
    const { light, dark } = splitThemes(readAppCss());
    for (const part of [light, dark]) {
      for (const sel of [":root", "html", "body"]) expect(colorSchemeOf(part, sel)).toEqual([]);
    }
  });
});

describe("R-910 / AC-905 (app.css side): no hard-coded colours outside the --ui-* variable declarations", () => {
  it("every colour literal in app.css sits in a `--ui-*` custom-property declaration (rules use var())", () => {
    const withoutVarDecls = readAppCss().replace(/--ui-[\w-]+\s*:[^;}]+;?/g, "");
    expect(colourViolations(withoutVarDecls)).toEqual([]);
  });
});

describe("SHOULD-154(d): the stylesheet reaches the viewer through no side door", () => {
  it("no component <style> block uses @import", () => {
    const bad = sourceFiles
      .filter((f) => f.endsWith(".svelte"))
      .filter((f) => {
        const code = readFileSync(f, "utf-8");
        return svelteStyleTexts(code).some((t) => /@import/.test(t));
      });
    expect(bad.map(rel)).toEqual([]);
  });

  it("vite.config.ts has no css.preprocessorOptions.additionalData", () => {
    const vite = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf-8");
    expect(/additionalData/.test(vite)).toBe(false);
  });
});
