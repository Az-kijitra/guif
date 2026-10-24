/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0023 R-1727 (the 13 highlight colours are COMPUTED by the back end: GitHub / GitHub Dark values, only those below 4.5:1 adjusted; the table of
//   values, the 4.5:1 maths and the six-preset check are Rust tests: `highlight_tests.rs` / AC-1725), SPEC-0200-0001 §3.18.15 MUST-1 (no colour value in CSS).
//   KEPT from SPEC-0300-0017 第8版 R-913-1-1: the classification -> variable mapping (`.hljs-keyword { color: var(--vw-hl-keyword) }` ...), selector SPECIFICITY equal to the
//   official stylesheet (compound selectors, no !important), plain text / unstyled classes inherit --vw-fg, bold / italic as official, addition / deletion carry text + background.
// Variable names are the table's; the stylesheet declares none of them (the initialization script sets them).

const CSS_PATH = resolve(__dirname, "routes", "viewer", "viewer-theme.css");
const RAW = readFileSync(CSS_PATH, "utf-8");
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const CSS = stripCssComments(RAW);
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

function darkBlock(css: string): { light: string; dark: string } {
  const m = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/.exec(css);
  if (m === null) return { light: css, dark: "" };
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return { light: css.slice(0, m.index) + css.slice(i), dark: css.slice(start, i - 1) };
}
function rulesOf(css: string): { selectors: string[]; body: Map<string, string> }[] {
  const out: { selectors: string[]; body: Map<string, string> }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const body = new Map<string, string>();
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) body.set(d.slice(0, i).trim(), squash(d.slice(i + 1)).toLowerCase());
    }
    out.push({ selectors: m[1].split(",").map(squash), body });
  }
  return out;
}
const norm = (v: string | undefined): string => (v ?? "<missing>").trim().toLowerCase();

// classification (official selector, in the official compound form) -> the variable that colours it
const COLOUR_RULES: [string, string][] = [
  ...[".hljs-doctag", ".hljs-keyword", ".hljs-meta .hljs-keyword", ".hljs-template-tag", ".hljs-template-variable", ".hljs-type", ".hljs-variable.language_"].map((s): [string, string] => [s, "--vw-hl-keyword"]),
  ...[".hljs-title", ".hljs-title.class_", ".hljs-title.class_.inherited__", ".hljs-title.function_"].map((s): [string, string] => [s, "--vw-hl-title"]),
  ...[".hljs-attr", ".hljs-attribute", ".hljs-literal", ".hljs-meta", ".hljs-number", ".hljs-operator", ".hljs-variable", ".hljs-selector-attr", ".hljs-selector-class", ".hljs-selector-id"].map((s): [string, string] => [s, "--vw-hl-constant"]),
  ...[".hljs-regexp", ".hljs-string", ".hljs-meta .hljs-string"].map((s): [string, string] => [s, "--vw-hl-string"]),
  ...[".hljs-built_in", ".hljs-symbol"].map((s): [string, string] => [s, "--vw-hl-builtin"]),
  ...[".hljs-comment", ".hljs-code", ".hljs-formula"].map((s): [string, string] => [s, "--vw-hl-comment"]),
  ...[".hljs-name", ".hljs-quote", ".hljs-selector-tag", ".hljs-selector-pseudo"].map((s): [string, string] => [s, "--vw-hl-name"]),
  [".hljs-section", "--vw-hl-section"],
  [".hljs-bullet", "--vw-hl-bullet"],
];

const specificity = (selector: string): number => (selector.match(/\.[A-Za-z_][\w-]*/g) ?? []).length; // (0, classes, 0) is all the official sheet uses

const colorOf = (selector: string): string | undefined => {
  let color: string | undefined;
  for (const r of rulesOf(CSS)) if (r.selectors.includes(selector) && r.body.has("color")) color = r.body.get("color");
  return color;
};
const declOf = (selector: string, prop: string): string | undefined => {
  let v: string | undefined;
  for (const r of rulesOf(CSS)) if (r.selectors.includes(selector) && r.body.has(prop)) v = r.body.get(prop);
  return v;
};

describe("the colour rules: official classifications -> variables (R-466-7)", () => {
  it.each(COLOUR_RULES)("%s { color: var(%s) }", (selector, variable) => {
    expect(colorOf(selector), selector).toBe(`var(${variable})`);
  });

  it(".hljs-subst is the body colour var(--vw-fg), not the official #24292e / #c9d1d9", () => {
    expect(colorOf(".hljs-subst")).toBe("var(--vw-fg)");
  });

  it("section is bold, strong is bold, emphasis is italic (as in the official sheet)", () => {
    expect(declOf(".hljs-section", "font-weight")).toBe("bold");
    expect(declOf(".hljs-strong", "font-weight")).toBe("bold");
    expect(declOf(".hljs-emphasis", "font-style")).toBe("italic");
  });

  it("addition / deletion carry their own text colour AND background", () => {
    expect(colorOf(".hljs-addition")).toBe("var(--vw-hl-addition-fg)");
    expect(declOf(".hljs-addition", "background-color") ?? declOf(".hljs-addition", "background")).toBe("var(--vw-hl-addition-bg)");
    expect(colorOf(".hljs-deletion")).toBe("var(--vw-hl-deletion-fg)");
    expect(declOf(".hljs-deletion", "background-color") ?? declOf(".hljs-deletion", "background")).toBe("var(--vw-hl-deletion-bg)");
  });

  it("classes the official sheet leaves unstyled (char.escape_, link, params, property, punctuation, tag) are NOT given a colour (they inherit --vw-fg)", () => {
    for (const s of [".hljs-char.escape_", ".hljs-link", ".hljs-params", ".hljs-property", ".hljs-punctuation", ".hljs-tag"]) {
      expect(colorOf(s), s).toBeUndefined();
    }
  });

  it("the highlight rules use var() only: no colour literal outside the --vw-* declarations", () => {
    const rest = CSS.replace(/--vw-[\w-]+\s*:[^;}]+;?/g, "");
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rest).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});

describe("【再レビュー m-d】 specificity equals the official stylesheet's", () => {
  const sels = COLOUR_RULES.map(([s]) => s);

  it("the compound selectors exist verbatim (never flattened to a single class)", () => {
    for (const s of [".hljs-variable.language_", ".hljs-meta .hljs-keyword", ".hljs-meta .hljs-string", ".hljs-title.class_", ".hljs-title.class_.inherited__", ".hljs-title.function_"]) {
      expect(colorOf(s), s).toBeDefined();
    }
  });

  it("the specificity numbers: compound > the single class it must beat", () => {
    expect(specificity(".hljs-variable.language_")).toBeGreaterThan(specificity(".hljs-variable"));
    expect(specificity(".hljs-meta .hljs-string")).toBeGreaterThan(specificity(".hljs-meta"));
    expect(specificity(".hljs-meta .hljs-keyword")).toBeGreaterThan(specificity(".hljs-meta"));
    expect(specificity(".hljs-title.class_")).toBeGreaterThan(specificity(".hljs-title"));
    expect(specificity(".hljs-title.class_.inherited__")).toBeGreaterThan(specificity(".hljs-title.class_"));
  });

  it("the winners carry different variables where the official sheet does: language_ -> keyword (not constant), meta string -> string, meta keyword -> keyword", () => {
    expect(colorOf(".hljs-variable.language_")).not.toBe(colorOf(".hljs-variable"));
    expect(colorOf(".hljs-meta .hljs-string")).not.toBe(colorOf(".hljs-meta"));
    expect(colorOf(".hljs-meta .hljs-keyword")).not.toBe(colorOf(".hljs-meta"));
  });

  it("no rule relies on !important or on source order to win", () => {
    expect(CSS).not.toMatch(/!important/);
  });

  it("all listed selectors are written with their official class count (none lower than official)", () => {
    const official: Record<string, number> = {
      ".hljs-doctag": 1, ".hljs-keyword": 1, ".hljs-meta .hljs-keyword": 2, ".hljs-template-tag": 1, ".hljs-template-variable": 1, ".hljs-type": 1,
      ".hljs-variable.language_": 2, ".hljs-title": 1, ".hljs-title.class_": 2, ".hljs-title.class_.inherited__": 3, ".hljs-title.function_": 2,
      ".hljs-meta .hljs-string": 2,
    };
    for (const s of sels) if (s in official) expect(specificity(s), s).toBe(official[s]);
  });
});

describe("R-1727 / MUST-1: the highlight rules reference variables only", () => {
  it("no --vw-hl-* variable is declared in the stylesheet, and no @media theme block exists", () => {
    expect([...CSS.matchAll(/(--vw-hl-[\w-]+)\s*:/g)].map((m) => m[1])).toEqual([]);
    expect(CSS).not.toMatch(/prefers-color-scheme/);
  });

  it("every hl variable used by a rule is one of the 13 names (no stray variable)", () => {
    const used = new Set([...CSS.matchAll(/var\((--vw-hl-[\w-]+)\)/g)].map((m) => m[1]));
    const known = ["keyword", "title", "constant", "string", "builtin", "comment", "name", "section", "bullet", "addition-fg", "addition-bg", "deletion-fg", "deletion-bg"].map((k) => `--vw-hl-${k}`);
    expect([...used].sort()).toEqual([...known].sort());
  });
});
