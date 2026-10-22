/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec/Architecture: SPEC-0200-0001 §3.14.12-2 (MUST-130: `routes/viewer/+page.svelte` stays <= 400 lines after Phase 13; the page may only gain
//   imports, state variables and one-line hand-overs, the rest moves to `routes/viewer/highlight-wiring.ts`, `image-interaction.ts`, `focus-wiring.ts`,
//   `_components/TextView.svelte`, `_components/ImageView.svelte`; each new file also <= 400), §3.14.1-6 (the main page gets ONE `<MenuBar ... />` element
//   and ONE `createMenuBarWiring(...)` call, `createMainKeydownHandler` receives `menuBar`; <= 400 lines, move the wiring to bootstrap-wiring.ts if
//   needed), §3.14.1-6 / SPEC-0300-0020 R-1300 (DOM order: the menu bar is the FIRST child of the screen container, above the path bar).
//   The generic 400-line check over every routes/** file is page-line-limit.test.ts (unchanged); this file adds the Phase 13 files by NAME, so that a
//   missing file is a failure and not a silent pass.
//

const ROUTES = resolve(__dirname, "routes");
const LIMIT = 400;
const lines = (file: string): number => {
  const l = readFileSync(file, "utf-8").split(/\r?\n/);
  if (l[l.length - 1] === "") l.pop();
  return l.length;
};

describe("the viewer page split (MUST-130)", () => {
  const FILES = [
    "viewer/+page.svelte",
    "viewer/highlight-wiring.ts",
    "viewer/image-interaction.ts",
    "viewer/focus-wiring.ts",
    "viewer/_components/TextView.svelte",
    "viewer/_components/ImageView.svelte",
  ];

  it.each(FILES)("%s exists and is at most 400 lines", (f) => {
    const p = join(ROUTES, f);
    expect(existsSync(p), f).toBe(true);
    expect(lines(p), f).toBeLessThanOrEqual(LIMIT);
  });

  it("the page delegates: it imports the two components and the three wiring modules", () => {
    const page = readFileSync(join(ROUTES, "viewer", "+page.svelte"), "utf-8");
    expect(page).toMatch(/import\s+TextView\s+from\s+["']\.\/_components\/TextView\.svelte["']/);
    expect(page).toMatch(/import\s+ImageView\s+from\s+["']\.\/_components\/ImageView\.svelte["']/);
    expect(page).toMatch(/["']\.\/highlight-wiring["']/);
    expect(page).toMatch(/["']\.\/image-interaction["']/);
    expect(page).toMatch(/["']\.\/focus-wiring["']/);
  });

  it("the page does not import highlight.js (only the Worker does, R-466-1)", () => {
    expect(readFileSync(join(ROUTES, "viewer", "+page.svelte"), "utf-8")).not.toContain("highlight.js");
  });
});

describe("the main page (R-1300, §3.14.1-6)", () => {
  const page = readFileSync(join(ROUTES, "+page.svelte"), "utf-8");
  const count = (re: RegExp): number => (page.match(re) ?? []).length;

  it("is still at most 400 lines", () => {
    expect(lines(join(ROUTES, "+page.svelte"))).toBeLessThanOrEqual(LIMIT);
  });

  it("has exactly one <MenuBar element and one createMenuBarWiring( call", () => {
    expect(count(/<MenuBar\b/g)).toBe(1);
    expect(count(/\bcreateMenuBarWiring\(/g)).toBe(1);
  });

  it("MenuBar comes from the menu-bar feature and the wiring from routes/menu-bar-wiring", () => {
    expect(page).toMatch(/import\s+MenuBar\s+from\s+["']\$lib\/features\/menu-bar\/MenuBar\.svelte["']/);
    expect(page).toMatch(/from\s+["']\.\/menu-bar-wiring(?:\.svelte)?["']/);
  });

  it("DOM order (R-1300 / R-1380): inside <main>, the menu bar is before the path bar", () => {
    const main = page.indexOf("<main");
    const bar = page.indexOf("<MenuBar");
    const path = page.indexOf("<PathBar");
    expect(main).toBeGreaterThanOrEqual(0);
    expect(bar).toBeGreaterThan(main);
    expect(path).toBeGreaterThan(bar);
  });

  it("the keydown handler is given the menu bar (createMainKeydownHandler({ ..., menuBar }))", () => {
    const wired = ["+page.svelte", "bootstrap-wiring.ts"].map((f) => readFileSync(join(ROUTES, f), "utf-8")).join("\n");
    expect(wired).toMatch(/createMainKeydownHandler\([\s\S]*?\bmenuBar\b/);
  });

  it("the stale comment `no menu bar (SPEC-0100-0005 R-08)` is gone (SPEC-0300-0009 第17版 R-10-11 releases that rule)", () => {
    expect(page).not.toMatch(/no menu bar/i);
  });
});

describe("the new routes modules exist and obey the 400-line rule", () => {
  // EXTERNAL-APPS (SPEC-0200-0001 §3.16.15 MUST-144): `external-apps-wiring.ts` joins the names (a missing file is a failure, not a silent pass).
  // SETTINGS-FILE (SPEC-0200-0001 §3.17.8 / §3.17.13): `config-evaluate.ts`, `settings-file-wiring.ts` and `entry-wiring.ts` join the names.
  it.each([
    "menu-bar-wiring.svelte.ts", "menu-bar-exec.ts", "menu-bar-shortcuts.ts", "external-apps-wiring.ts",
    "config-evaluate.ts", "settings-file-wiring.ts", "entry-wiring.ts",
  ])("%s", (f) => {
    const p = join(ROUTES, f);
    expect(existsSync(p), f).toBe(true);
    expect(lines(p), f).toBeLessThanOrEqual(LIMIT);
  });

  it("main-keydown-wiring.ts no longer hard-codes `isMenuBarActive: false` / `onMenuBarKey: () => false` (the menu bar is wired through deps.menuBar)", () => {
    const src = readFileSync(join(ROUTES, "main-keydown-wiring.ts"), "utf-8");
    expect(src).not.toMatch(/isMenuBarActive:\s*false/);
    expect(src).not.toMatch(/onMenuBarKey:\s*\(\)\s*=>\s*false/);
  });
});
