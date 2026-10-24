/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0017 AC-905 (no colour literals outside app.css's `:root`
// variables and the viewer), AC-904 (static part: app.css defines every R-911
// variable, with the spec's exact strings), R-910 / R-912 / R-913, SPEC-0200-0001 §3.8.1, §3.8.15 G6 (colour NAMES
// are judged only in CSS value positions), §3.8.17 SHOULD-154(d) (no `@import` in
// component styles, no `additionalData` in vite config).
// SPEC-0300-0023 UPDATE (SPEC-0200-0001 §3.18.10 / §3.18.15 MUST-1): the VALUE tables (AC-904 / AC-948) moved to the Rust `appearance/` tests; the stylesheet has no
// colour value, so this file keeps STRUCTURE only (the .ts / .svelte scan, `:root` custom properties only, no document-wide colour-scheme / font / colour).
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

// ---------- app.css (structure only) -------------------------------------

function readAppCss(): string {
  expect(existsSync(APP_CSS), "app/src/app.css must exist (SPEC-0200-0001 §3.8.1)").toBe(true);
  return readFileSync(APP_CSS, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
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


describe("SPEC-0300-0023 AC-1726 / R-1721: app.css has no theme switch and no colour value", () => {
  it("no `@media (prefers-color-scheme` block (the dark values are no longer in CSS)", () => {
    expect(readAppCss()).not.toMatch(/prefers-color-scheme\s*:/);
  });

  it("no colour literal at all in app.css", () => {
    expect(colourViolations(readAppCss())).toEqual([]);
  });
});

describe("R-920 / R-1752 fonts and R-1753 / R-1754 list variables (design §3.18.5)", () => {
  const vars = (): Map<string, string> => {
    const m = new Map<string, string>();
    for (const r of rules(readAppCss())) {
      if (!r.selector.split(",").some((x) => x.trim() === ":root")) continue;
      for (const d of declarations(r.body)) if (d.prop.startsWith("--")) m.set(d.prop, d.value);
    }
    return m;
  };

  it("--ui-font and --ui-font-mono both have the [font] stack (R-1750 / R-1752 second edition, U-04: the names stay, the values are the same)", () => {
    const stack = '"JetBrains Mono", "JetBrainsMono NFM", "JetBrainsMono NF", "Cascadia Mono", "Consolas", "BIZ UDGothic", monospace';
    expect(vars().get("--ui-font")).toBe(stack);
    expect(vars().get("--ui-font-mono")).toBe(stack);
  });

  it("the failure-time defaults --list-row-height / --ui-line-height 16px and --ui-font-size 12px exist (R-1753 / R-1754)", () => {
    expect(vars().get("--list-row-height")).toBe("16px");
    expect(vars().get("--ui-line-height")).toBe("16px");
    expect(vars().get("--ui-font-size")).toBe("12px");
  });
});

describe("R-912 / R-913 / design §3.8.1: app.css never styles the whole document", () => {
  it(":root defines custom properties only (no color-scheme / font / color)", () => {
    const rootRules = rules(readAppCss()).filter((r) => r.selector.split(",").some((s) => s.trim() === ":root"));
    expect(rootRules.length).toBeGreaterThan(0);
    const nonVars = rootRules.flatMap((r) => declarations(r.body)).filter((d) => !d.prop.startsWith("--"));
    expect(nonVars.map((d) => d.prop)).toEqual([]);
  });

  it("html / body rules are limited to the .app-shell document (:has) and never set color-scheme / font / color", () => {
    const forbidden = /^(color-scheme|font|font-family|font-size|font-weight|color)$/;
    const bad: string[] = [];
    for (const r of rules(readAppCss())) {
      for (const sel of r.selector.split(",").map((s) => s.trim())) {
        if (!/^(html|body|:root)(?![\w-])/.test(sel)) continue;
        if (sel !== ":root" && !sel.includes(":has(")) bad.push(`bare selector '${sel}'`);
        for (const d of declarations(r.body)) if (forbidden.test(d.prop)) bad.push(`${sel} { ${d.prop} }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("R-1741: `.ui-root` takes color-scheme from var(--ui-color-scheme, light dark) (the fallback is colour-free)", () => {
    const cs = rules(readAppCss())
      .filter((r) => r.selector.split(",").some((s) => s.trim() === ".ui-root"))
      .flatMap((r) => declarations(r.body))
      .filter((d) => d.prop === "color-scheme")
      .map((d) => d.value.replace(/\s+/g, " "));
    expect(cs).toEqual(["var(--ui-color-scheme, light dark)"]);
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
