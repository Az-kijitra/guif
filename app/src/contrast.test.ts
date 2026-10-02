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
