/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0021 AC-1534 (the front-end half: the four default NAMES are in the wording module and nothing branches on a default's name /
//   program / number; the default registrations are DATA), R-1510-1 (the screen takes the name from W-90..W-93 by number), AC-1524 (nothing in the screen can
//   name a program or arguments), AC-1526 / R-1581 (no shell plugin, no new npm dependency, no permission), R-1555 (the viewer has no entrance), R-1501 (the
//   state is written once, at start-up, from one place), MINOR-36 (the menu models know no external-apps type), R-1550 (key-dispatch injection),
//   R-1554, MUST-144 (the wirings are pass-throughs; `+page.svelte` stays <= 400 lines and `menu-bar-wiring.svelte.ts` grows by at most 3 lines).
// Architecture: SPEC-0200-0001 §3.16.6 / §3.16.8 / §3.16.15 (MUST-144, MINOR-33, MINOR-36), §4.1 (routes -> features -> shared; no feature-to-feature import).
//   The generic 400-line limit over every routes/** file is page-line-limit.test.ts (unchanged); the boundary rules are import-boundary.test.ts (unchanged);
//   this file adds what is specific to the external-app feature, BY NAME, so a missing file is a failure and not a silent pass.

const SRC = resolve(__dirname);
const APP = resolve(SRC, "..");
const FEATURE = join(SRC, "lib", "features", "external-apps");
const ROUTES = join(SRC, "routes");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit") continue;
      walk(full, out);
    } else if (/\.(ts|svelte)$/.test(name)) out.push(full);
  }
  return out;
}
const isTest = (f: string): boolean => /\.test\.ts$/.test(f);
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (f: string): string => readFileSync(f, "utf-8");
const lines = (f: string): number => {
  const l = read(f).split(/\r?\n/);
  if (l[l.length - 1] === "") l.pop();
  return l.length;
};
const rel = (f: string): string => relative(SRC, f).split(sep).join("/");
const specifiers = (code: string): string[] => {
  const out: string[] = [];
  for (const re of [/\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\sfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(strip(code))) !== null) out.push(m[1]);
  }
  return out;
};

describe("the feature exists with its parts", () => {
  const FILES = ["messages.ts", "registry.ts", "key-match.ts", "target.ts", "launch-flow.ts", "notice.ts", "external-apps-state.svelte.ts"];

  it.each(FILES)("lib/features/external-apps/%s", (f) => {
    expect(existsSync(join(FEATURE, f)), f).toBe(true);
  });

  it("shared/ipc/external-apps.ts and routes/external-apps-wiring.ts exist", () => {
    expect(existsSync(join(SRC, "lib", "shared", "ipc", "external-apps.ts"))).toBe(true);
    expect(existsSync(join(ROUTES, "external-apps-wiring.ts"))).toBe(true);
  });

  it("and the keyboard feature gained fixed-keys.ts and key-rules.ts", () => {
    for (const f of ["fixed-keys.ts", "key-rules.ts"]) expect(existsSync(join(SRC, "lib", "features", "keyboard", f)), f).toBe(true);
  });
});

describe("AC-1534: no special treatment of a default (front-end half)", () => {
  const production = (): [string, string][] =>
    existsSync(FEATURE) ? walk(FEATURE).filter((f) => !isTest(f)).map((f) => [rel(f), read(f)]) : [];

  it("the four default names are in the wording module (W-90..W-93)", () => {
    const messages = read(join(FEATURE, "messages.ts"));
    for (const name of ["ターミナルで開く", "VS Codeで開く", "エクスプローラーで開く", "GitHub Desktopで開く"]) expect(messages).toContain(name);
  });

  it("no production file of the feature other than messages.ts names a default, its program, or its argument form", () => {
    const files = production().filter(([name]) => !name.endsWith("/messages.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const [name, code] of files) {
      const c = strip(code).toLowerCase();
      for (const word of ["wt.exe", "explorer", "code.exe", "githubdesktop", "github desktop", "/select", "vs code", "terminal", "ターミナル", "エクスプローラー"]) {
        expect(c.includes(word), `${name} mentions \`${word}\``).toBe(false);
      }
    }
  });

  it("only registry.ts looks at the default number (it picks the NAME); target / key-match / launch-flow / notice / state do not", () => {
    for (const [name, code] of production()) {
      const looks = /\bdefaultNo\b/.test(strip(code));
      if (name.endsWith("/registry.ts")) expect(looks, name).toBe(true);
      else if (/\/(target|key-match|launch-flow|notice|external-apps-state\.svelte)\.ts$/.test(name)) expect(looks, name).toBe(false);
    }
  });

  it("the routes layer does not branch on a default's name or number either", () => {
    const code = strip(read(join(ROUTES, "external-apps-wiring.ts")));
    expect(code).not.toMatch(/defaultNo|DEFAULT_APP_NAMES/);
    expect(code.toLowerCase()).not.toMatch(/explorer|wt\.exe|code\.exe|githubdesktop/);
  });
});

describe("AC-1524 / R-1581: nothing on the screen can name a program or arguments", () => {
  const sources = (): [string, string][] => [...walk(join(SRC, "lib")), ...walk(ROUTES)].filter((f) => !isTest(f)).map((f) => [rel(f), strip(read(f))]);

  it("the IPC is called only through shared/ipc/external-apps.ts and with three arguments", () => {
    for (const [name, code] of sources()) {
      if (name === "lib/shared/ipc/external-apps.ts") continue;
      // a call of Tauri's invoke() with the command name (a log line or a comment that names the command is not a call)
      expect(/invoke\s*(<[^>(]*>)?\s*\(\s*["'`]external_apps?_(launch|load)["'`]/.test(code), `${name} invokes the command directly`).toBe(false);
    }
    const calls = sources().flatMap(([name, code]) => [...code.matchAll(/externalAppLaunch\(([^)]*)\)/g)].map((m) => [name, m[1]] as const));
    for (const [name, args] of calls) {
      if (name === "lib/shared/ipc/external-apps.ts") continue;
      expect(args.split(",").length, `${name}: externalAppLaunch(${args})`).toBeLessThanOrEqual(3);
    }
  });

  it("no source of the external-apps feature, its IPC wrapper or its wiring builds or runs a command line", () => {
    const files = [...(existsSync(FEATURE) ? walk(FEATURE).filter((f) => !isTest(f)) : []), join(SRC, "lib", "shared", "ipc", "external-apps.ts"), join(ROUTES, "external-apps-wiring.ts")];
    for (const f of files) {
      expect(existsSync(f), rel(f)).toBe(true);
      expect(strip(read(f)), rel(f)).not.toMatch(/\bspawn\s*\(|\bexec\s*\(|child_process|plugin-shell|shell:execute|Command\.create|\bargs\b\s*:/);
    }
  });
});

describe("AC-1526: no new dependency, no shell plugin", () => {
  const pkg = JSON.parse(read(join(APP, "package.json"))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  it("package.json has exactly the dependencies it had before (SPEC-0200-0001 §3.16.0: no new npm package)", () => {
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(["@tauri-apps/api", "highlight.js", "markdown-it"]);
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      "@sveltejs/adapter-static", "@sveltejs/kit", "@sveltejs/vite-plugin-svelte", "@tauri-apps/cli", "@types/node", "svelte", "typescript", "vite", "vitest",
    ]);
  });

  it("no source imports a shell / process / opener plugin", () => {
    for (const f of [...walk(join(SRC, "lib")), ...walk(ROUTES)]) {
      for (const s of specifiers(read(f))) expect(s, rel(f)).not.toMatch(/plugin-shell|plugin-process|plugin-opener|child_process/);
    }
  });
});

describe("the boundaries of the new feature (SPEC-0200-0001 §4.1)", () => {
  it("features/external-apps/** imports only $lib/shared/** and its own files (never another feature, never routes)", () => {
    const bad: string[] = [];
    for (const f of walk(FEATURE)) {
      for (const s of specifiers(read(f))) {
        if (s.startsWith("$lib/shared/")) continue;
        if (s.startsWith("./")) continue;
        if (/^(vitest|svelte|node:)/.test(s) && isTest(f)) continue;
        bad.push(`${rel(f)} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("nothing outside routes/ and its own tests imports features/external-apps (key-dispatch and the menu models know none of its types: MINOR-36)", () => {
    const bad: string[] = [];
    for (const f of walk(join(SRC, "lib"))) {
      if (f.startsWith(FEATURE) || isTest(f)) continue;
      for (const s of specifiers(read(f))) if (/features\/external-apps|\.\.\/external-apps/.test(s)) bad.push(`${rel(f)} -> ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("the shared IPC module imports no feature", () => {
    const code = read(join(SRC, "lib", "shared", "ipc", "external-apps.ts"));
    for (const s of specifiers(code)) expect(s).not.toMatch(/features|routes/);
  });

  it("the registrations are written to the state from ONE place: routes/startup-wiring.ts (R-1501: read once)", () => {
    const writers = walk(ROUTES)
      .filter((f) => !isTest(f))
      .filter((f) => /externalAppsState\s*\.\s*hydrate\(/.test(strip(read(f))))
      .map(rel);
    expect(writers).toEqual(["routes/startup-wiring.ts"]);
    const lib = walk(join(SRC, "lib")).filter((f) => !isTest(f) && !f.endsWith("external-apps-state.svelte.ts") && /externalAppsState\s*\.\s*hydrate\(/.test(strip(read(f))));
    expect(lib.map(rel)).toEqual([]);
  });
});

describe("the wirings are pass-throughs (MUST-144)", () => {
  const wiringText = (f: string): string => strip(read(join(ROUTES, f)));

  it("routes/external-apps-wiring.ts is at most 400 lines, and the only caller of createExternalAppsWiring( is the page composition (once)", () => {
    expect(lines(join(ROUTES, "external-apps-wiring.ts"))).toBeLessThanOrEqual(400);
    const callers = walk(ROUTES)
      .filter((f) => !isTest(f) && !f.endsWith("external-apps-wiring.ts"))
      .map((f) => [rel(f), (strip(read(f)).match(/\bcreateExternalAppsWiring\(/g) ?? []).length] as const)
      .filter(([, n]) => n > 0);
    expect(callers.reduce((sum, [, n]) => sum + n, 0), JSON.stringify(callers)).toBe(1);
  });

  it("+page.svelte stays within 400 lines", () => {
    expect(lines(join(ROUTES, "+page.svelte"))).toBeLessThanOrEqual(400);
  });

  it("menu-bar-wiring.svelte.ts grows by at most 3 lines (391 -> 394): one dep passed through, the execution table lives in menu-bar-exec.ts", () => {
    const f = join(ROUTES, "menu-bar-wiring.svelte.ts");
    expect(lines(f)).toBeLessThanOrEqual(394);
    const code = wiringText("menu-bar-wiring.svelte.ts");
    expect(code).toMatch(/externalApps/);
    expect(code).toMatch(/barExtension\(\)/);
    expect(code).toMatch(/launchExternal/);
  });

  it("menu-bar-exec.ts routes /^ext:(\\d+)$/ to launchExternal", () => {
    const code = wiringText("menu-bar-exec.ts");
    expect(code).toMatch(/launchExternal/);
    expect(code).toMatch(/ext:/);
  });

  it("context-menu-wiring.svelte.ts: `run` handles an ext item FIRST (before planExecution / restoreDisplayedSelection) and launches after closing the menu", () => {
    const code = wiringText("context-menu-wiring.svelte.ts");
    const run = code.indexOf("function run(");
    expect(run).toBeGreaterThan(0);
    const body = code.slice(run, code.indexOf("async function onContextMenu"));
    const ext = body.search(/ext:|["']ext["']|startsWith\(/);
    const plan = body.indexOf("planExecution(");
    const restore = body.indexOf("restoreDisplayedSelection(");
    expect(ext).toBeGreaterThanOrEqual(0);
    expect(ext).toBeLessThan(plan);
    expect(ext).toBeLessThan(restore);
    const launch = body.indexOf("launchOnTarget(");
    expect(launch).toBeGreaterThan(ext);
    const close = body.indexOf("closeNow()");
    expect(close).toBeGreaterThanOrEqual(0);
    expect(close).toBeLessThan(launch);
  });

  it("main-keydown-wiring.ts fills `repeat` and passes the hook", () => {
    const code = wiringText("main-keydown-wiring.ts");
    expect(code).toMatch(/repeat:\s*ke\.repeat/);
    expect(code).toMatch(/onExternalAppKey/);
    expect(code).toMatch(/externalApps/);
  });

  it("startup-wiring.ts loads the registrations, builds the registry with the EFFECTIVE keymap, hydrates, and survives a failed load with one console.error", () => {
    const code = wiringText("startup-wiring.ts");
    expect(code).toMatch(/externalAppsLoad\(\)/);
    expect(code).toMatch(/buildRegistry\(/);
    expect(code).toMatch(/keyRules\(\s*validated\.effective\s*\)/);
    expect(code).toMatch(/buildExternalAppsNotice\(/);
    expect(code).toMatch(/catch/);
    expect(code).toMatch(/console\.error\(/);
  });

  it("the three entrances all receive the wiring in the page composition (key, menu bar, right-click menu)", () => {
    const composed = ["+page.svelte", "bootstrap-wiring.ts", "context-menu-main.svelte.ts"].map(wiringText).join("\n");
    expect(composed).toMatch(/createMainKeydownHandler\(/);
    expect(composed).toMatch(/createMenuBarWiring\(/);
    expect((composed.match(/externalApps/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("the viewer window has no entrance (R-1555): nothing under routes/viewer/ or features/viewer/ mentions the external apps", () => {
    for (const f of [...walk(join(ROUTES, "viewer")), ...walk(join(SRC, "lib", "features", "viewer"))].filter((x) => !isTest(x))) {
      expect(/external[-_ ]?app|externalApp/i.test(strip(read(f))), rel(f)).toBe(false);
    }
  });
});
