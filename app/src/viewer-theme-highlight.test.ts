/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的 / 単体] Spec: SPEC-0300-0017 第8版 R-913-1-1 (the table: classification -> `--vw-hl-*` variable -> light / dark adopted value; exactly three
//   adjusted colours: light built_in `#e36209 -> #c24e00`, light addition text `#22863a -> #1e7f35`, dark section `#1f6feb -> #4a8cf7`; plain text and
//   unstyled classes use `--vw-fg`; bold / italic as in the official stylesheet), 【再レビュー m-d】 (selector SPECIFICITY equals the official
//   stylesheet's: compound selectors are written in the official form, never flattened to single classes, never relying on source order),
//   R-913-1 第8版注記 (the values live ONLY in `viewer-theme.css`, as `--vw-*` variables), AC-905-1 (c), SPEC-0300-0015 R-466-7 / R-466-8 (every colour is
//   >= 4.5:1 against its own background), AC-528 (the unit part: "宣言が表の行・値と過不足なく一致し、コントラスト比が 4.5:1 以上").
// Architecture: SPEC-0200-0001 §3.14.7 "配色" (`--vw-hl-*` in `viewer-theme.css`, light in `html`, dark inside the existing `prefers-color-scheme: dark`
//   block; the rules `.hljs-keyword, .hljs-doctag { color: var(--vw-hl-keyword) }` ... with the official compound selectors; the three adjusted
//   colours carry the official value and the ratio in a comment).
//
//
// Variable names are taken from the table of R-913-1-1 (the spec calls them examples but the design says "変数名は表に従い"); if the implementer
// renames them, change the NAMES below together with that decision -- the structure of the check stays.

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
const { light: LIGHT_PART, dark: DARK_PART } = darkBlock(CSS);

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
const declsOfHtml = (part: string): Map<string, string> => {
  const merged = new Map<string, string>();
  for (const r of rulesOf(part)) if (r.selectors.includes("html")) for (const [k, v] of r.body) merged.set(k, v);
  return merged;
};
const norm = (v: string | undefined): string => {
  const t = (v ?? "<missing>").trim().toLowerCase();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : t;
};

// ---- the table of R-913-1-1 ----------------------------------------------------------------------------------------------------------
const HL_LIGHT: Record<string, string> = {
  "--vw-hl-keyword": "#d73a49",
  "--vw-hl-title": "#6f42c1",
  "--vw-hl-constant": "#005cc5",
  "--vw-hl-string": "#032f62",
  "--vw-hl-builtin": "#c24e00", // adjusted (official #e36209)
  "--vw-hl-comment": "#6a737d",
  "--vw-hl-name": "#22863a",
  "--vw-hl-section": "#005cc5",
  "--vw-hl-bullet": "#735c0f",
  "--vw-hl-addition-fg": "#1e7f35", // adjusted (official #22863a)
  "--vw-hl-addition-bg": "#f0fff4",
  "--vw-hl-deletion-fg": "#b31d28",
  "--vw-hl-deletion-bg": "#ffeef0",
};
const HL_DARK: Record<string, string> = {
  "--vw-hl-keyword": "#ff7b72",
  "--vw-hl-title": "#d2a8ff",
  "--vw-hl-constant": "#79c0ff",
  "--vw-hl-string": "#a5d6ff",
  "--vw-hl-builtin": "#ffa657",
  "--vw-hl-comment": "#8b949e",
  "--vw-hl-name": "#7ee787",
  "--vw-hl-section": "#4a8cf7", // adjusted (official #1f6feb)
  "--vw-hl-bullet": "#f2cc60",
  "--vw-hl-addition-fg": "#aff5b4",
  "--vw-hl-addition-bg": "#033a16",
  "--vw-hl-deletion-fg": "#ffdcd7",
  "--vw-hl-deletion-bg": "#67060c",
};

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

// WCAG 2.1 relative luminance contrast
function lum(hex: string): number {
  let h = norm(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("R-913-1-1 / AC-905-1 (c): the --vw-hl-* declarations equal the table, in both themes, with nothing extra and nothing missing", () => {
  const lightDecls = declsOfHtml(LIGHT_PART);
  const darkDecls = declsOfHtml(DARK_PART);
  const hlNames = (d: Map<string, string>): string[] => [...d.keys()].filter((k) => k.startsWith("--vw-hl-")).sort();

  it("light (`html`): exactly the 13 variables with the adopted values", () => {
    expect(hlNames(lightDecls)).toEqual(Object.keys(HL_LIGHT).sort());
    for (const [k, v] of Object.entries(HL_LIGHT)) expect(norm(lightDecls.get(k)), k).toBe(norm(v));
  });

  it("dark (`@media (prefers-color-scheme: dark) { html }`): exactly the same 13 names with the adopted values", () => {
    expect(hlNames(darkDecls)).toEqual(Object.keys(HL_DARK).sort());
    for (const [k, v] of Object.entries(HL_DARK)) expect(norm(darkDecls.get(k)), k).toBe(norm(v));
  });

  it("light and dark declare the SAME hl variable names (a theme switch can never leave one unset)", () => {
    expect(hlNames(lightDecls)).toEqual(hlNames(darkDecls));
  });

  it("every declaration of the stylesheet is a --vw-* custom property or a plain property (no --ui-*, no custom names outside --vw-)", () => {
    const names = [...CSS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(names.filter((n) => !n.startsWith("--vw-"))).toEqual([]);
  });

  it("exactly three colours differ from the official github / github-dark values, and the comments keep the official value", () => {
    const adjusted = [
      ["--vw-hl-builtin", "light", "#e36209"],
      ["--vw-hl-addition-fg", "light", "#22863a"],
      ["--vw-hl-section", "dark", "#1f6feb"],
    ] as const;
    for (const [, , official] of adjusted) expect(RAW.toLowerCase(), `the official ${official} must be recorded in a comment`).toContain(official);
    expect(norm(lightDecls.get("--vw-hl-builtin"))).not.toBe("#e36209");
    expect(norm(lightDecls.get("--vw-hl-addition-fg"))).not.toBe("#22863a");
    expect(norm(darkDecls.get("--vw-hl-section"))).not.toBe("#1f6feb");
  });
});

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

describe("R-466-8 / AC-528: every colour is at least 4.5:1 against its own background (computed from the values in the CSS)", () => {
  const read = (part: string): Map<string, string> => declsOfHtml(part);

  it("light: each text colour on --vw-bg", () => {
    const d = read(LIGHT_PART);
    const bg = d.get("--vw-bg") ?? "#fff";
    for (const k of ["keyword", "title", "constant", "string", "builtin", "comment", "name", "section", "bullet"]) {
      expect(contrast(d.get(`--vw-hl-${k}`) ?? "", bg), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dark: each text colour on --vw-bg", () => {
    const d = read(DARK_PART);
    const bg = d.get("--vw-bg") ?? "#1e1e1e";
    for (const k of ["keyword", "title", "constant", "string", "builtin", "comment", "name", "section", "bullet"]) {
      expect(contrast(d.get(`--vw-hl-${k}`) ?? "", bg), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("addition / deletion on their OWN background, both themes", () => {
    for (const part of [LIGHT_PART, DARK_PART]) {
      const d = read(part);
      for (const k of ["addition", "deletion"]) {
        expect(contrast(d.get(`--vw-hl-${k}-fg`) ?? "", d.get(`--vw-hl-${k}-bg`) ?? ""), `${k} ${part === LIGHT_PART ? "light" : "dark"}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the line-number colour on the gutter and on the body (SPEC-0300-0015 R-462-4: dark #8c8c8c is 4.55 / 4.96)", () => {
    for (const part of [LIGHT_PART, DARK_PART]) {
      const d = read(part);
      expect(contrast(d.get("--vw-lineno") ?? "", d.get("--vw-gutter-bg") ?? ""), "on the gutter").toBeGreaterThanOrEqual(4.5);
      expect(contrast(d.get("--vw-lineno") ?? "", d.get("--vw-bg") ?? ""), "on the body").toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the helper itself: black on white is 21, #8c8c8c on #252526 is about 4.55", () => {
    expect(contrast("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrast("#8c8c8c", "#252526")).toBeGreaterThan(4.5);
    expect(contrast("#8c8c8c", "#252526")).toBeLessThan(4.6);
  });
});
