/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0017 AC-931 / R-916: the contrast ratio of `--ui-muted`
// against `--ui-surface` (WCAG 2.1 relative-luminance formula) is >= 4.5:1.
// The values are READ FROM app.css (the single source of truth, SPEC-0200-0001
// §3.8.7) -- they are not duplicated here. Per E4 the focus-frame colour
// `--ui-focused` (#7aa7ff, ~2.4:1) is deliberately NOT asserted (accepted by the
// owner), see R-916.
// `contrastRatio` is a TEST-FILE helper by design (§3.8.7): production code never
// needs it.

const APP_CSS = join(resolve(__dirname), "app.css");

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`unsupported colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function cssVar(css: string, name: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = new RegExp(`(?:^|[;{\\s])${name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;}]+)`).exec(stripped);
  if (!m) throw new Error(`${name} is not defined in app.css`);
  return m[1].trim();
}

describe("contrastRatio helper self-check (WCAG 2.1)", () => {
  it("black on white is 21:1, identical colours 1:1", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777", "#777")).toBeCloseTo(1, 5);
  });

  it("#666 on #fff is about 5.7:1 (as stated in R-916)", () => {
    expect(contrastRatio("#666", "#fff")).toBeGreaterThan(5.6);
    expect(contrastRatio("#666", "#fff")).toBeLessThan(5.8);
  });
});

describe("AC-931: --ui-muted on --ui-surface (R-916)", () => {
  it("app.css defines both variables", () => {
    const css = readFileSync(APP_CSS, "utf-8");
    expect(cssVar(css, "--ui-muted")).toMatch(/^#/);
    expect(cssVar(css, "--ui-surface")).toMatch(/^#/);
  });

  it("the contrast ratio is at least 4.5:1", () => {
    const css = readFileSync(APP_CSS, "utf-8");
    expect(contrastRatio(cssVar(css, "--ui-muted"), cssVar(css, "--ui-surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("--ui-muted also reads on the selected-row background (--ui-selected), where marker/size text sits", () => {
    const css = readFileSync(APP_CSS, "utf-8");
    expect(contrastRatio(cssVar(css, "--ui-muted"), cssVar(css, "--ui-selected"))).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// Phase 12 (SPEC-0300-0017 第5版) AC-956 / R-916-1: the DARK values, read from the
// `@media (prefers-color-scheme: dark)` block of app.css (never duplicated here).
// Design: SPEC-0200-0001 §3.11.12 (2). The light AC-931 tests above are unchanged
// (`cssVar` finds the first definition = the light `:root`).
// ---------------------------------------------------------------------------

function darkBlock(css: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/.exec(stripped);
  if (!m) throw new Error("app.css has no `@media (prefers-color-scheme: dark)` block");
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < stripped.length && depth > 0) {
    if (stripped[i] === "{") depth++;
    else if (stripped[i] === "}") depth--;
    i++;
  }
  return stripped.slice(start, i - 1);
}

function darkVar(name: string): string {
  return cssVar(darkBlock(readFileSync(APP_CSS, "utf-8")), name);
}

describe("AC-956 / R-916-1: dark theme contrast (WCAG 2.1)", () => {
  const AA_TEXT: [string, string][] = [
    ["--ui-fg", "--ui-bg"],
    ["--ui-fg", "--ui-surface"],
    ["--ui-muted", "--ui-surface"],
    ["--ui-muted", "--ui-selected"],
    ["--ui-error", "--ui-surface"],
  ];
  const AA_UI: [string, string][] = [
    ["--ui-focused", "--ui-surface"],
    ["--ui-focused", "--ui-selected"],
  ];

  it("the dark block defines every colour used below as a hex value", () => {
    for (const n of new Set([...AA_TEXT, ...AA_UI].flat())) expect(darkVar(n)).toMatch(/^#/);
  });

  for (const [fg, bg] of AA_TEXT) {
    it(`${fg} on ${bg} is at least 4.5:1`, () => {
      expect(contrastRatio(darkVar(fg), darkVar(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const [fg, bg] of AA_UI) {
    it(`${fg} on ${bg} is at least 3:1 (non-text focus frame)`, () => {
      expect(contrastRatio(darkVar(fg), darkVar(bg))).toBeGreaterThanOrEqual(3);
    });
  }

  it("R-916-1's stated approximations hold (fg/bg ~13:1, muted/surface ~8.8:1, muted/selected ~5.8:1, error/surface ~6.0:1)", () => {
    expect(contrastRatio(darkVar("--ui-fg"), darkVar("--ui-bg"))).toBeGreaterThan(12);
    expect(contrastRatio(darkVar("--ui-muted"), darkVar("--ui-surface"))).toBeGreaterThan(8.5);
    expect(contrastRatio(darkVar("--ui-muted"), darkVar("--ui-selected"))).toBeGreaterThan(5.5);
    expect(contrastRatio(darkVar("--ui-error"), darkVar("--ui-surface"))).toBeGreaterThan(5.8);
  });
});
