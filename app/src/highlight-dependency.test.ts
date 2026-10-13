/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0015 第8版 R-466-1 (highlight.js, version 11.11.1, core + the language definitions imported one by one, never the
//   all-languages entry; loaded only when highlighting is first needed), SPEC-0300-0017 第8版 AC-905-1 (a) (no `highlight.js/styles` import or
//   `@import` anywhere in app/src) and the last clause (`highlight.js` is pinned at 11.11.1 in `dependencies`), SPEC-0300-0015 AC-528 (static part).
// Architecture: SPEC-0200-0001 §3.14.7 (`"highlight.js": "11.11.1"` with no `^` / `~` in `dependencies`, `package-lock.json` committed; the
//   imports happen ONLY in the Web Worker file `features/viewer/highlight/highlight.worker.ts`, so the main bundle and the viewer's first paint
//   never carry it; `new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" })`), §3.14.12-8 (MUST-138: dev-server
//   pre-bundling -- see vite-config-static.test.ts).
//

const SRC = resolve(__dirname);
const APP = resolve(__dirname, "..");
const LANGUAGES = ["c", "cpp", "rust", "javascript", "typescript", "python", "json", "markdown"];
const WORKER = "lib/features/viewer/highlight/highlight.worker.ts";

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
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const prod = (): { rel: string; text: string }[] =>
  walk(SRC)
    .filter((f) => /\.(ts|svelte|css)$/.test(f) && !/\.test\.ts$/.test(f) && !/\.d\.ts$/.test(f))
    .map((f) => ({ rel: relative(SRC, f).split(sep).join("/"), text: readFileSync(f, "utf-8") }));

describe("package.json / package-lock.json: highlight.js is pinned exactly (R-466-1, AC-905-1 last clause)", () => {
  const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("`dependencies` has highlight.js at exactly 11.11.1 (no ^, no ~, no range, no tag)", () => {
    expect(pkg.dependencies?.["highlight.js"]).toBe("11.11.1");
  });

  it("it is a runtime dependency, not a devDependency", () => {
    expect(pkg.devDependencies?.["highlight.js"]).toBeUndefined();
  });

  it("package-lock.json resolves it to 11.11.1 (the lock file is committed with the change)", () => {
    const lock = JSON.parse(readFileSync(join(APP, "package-lock.json"), "utf-8")) as { packages?: Record<string, { version?: string }> };
    expect(lock.packages?.["node_modules/highlight.js"]?.version).toBe("11.11.1");
  });

  it("no other highlighter or code-colouring package was added (Prism / shiki / lowlight / highlight-js wrappers)", () => {
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /prism|shiki|lowlight|refractor|codemirror|monaco|hljs/i.test(n))).toEqual([]);
  });
});

describe("AC-905-1 (a): the official stylesheets are never loaded", () => {
  it("no .ts / .svelte / .css file under app/src (tests excluded) mentions `highlight.js/styles`", () => {
    expect(prod().filter((f) => f.text.includes("highlight.js/styles")).map((f) => f.rel)).toEqual([]);
  });

  it("no CSS file has an @import of a highlight stylesheet", () => {
    const css = prod().filter((f) => f.rel.endsWith(".css"));
    expect(css.length).toBeGreaterThan(0);
    expect(css.filter((f) => /@import[^;]*highlight/i.test(f.text)).map((f) => f.rel)).toEqual([]);
  });
});

describe("R-466-1: the library is loaded only inside the Worker, core + 8 languages, one by one", () => {
  const importersOfHljs = (): { rel: string; specs: string[] }[] =>
    prod()
      .filter((f) => !f.rel.endsWith(".css"))
      .map((f) => ({
        rel: f.rel,
        specs: [...stripComments(f.text).matchAll(/(?:from|import)\s*\(?\s*["'](highlight\.js[^"']*)["']/g)].map((m) => m[1]),
      }))
      .filter((x) => x.specs.length > 0);

  it("the Worker file exists", () => {
    expect(existsSync(join(SRC, WORKER))).toBe(true);
  });

  it("the Worker file is the ONLY source that imports highlight.js (the viewer entry chunk carries none)", () => {
    expect(importersOfHljs().map((x) => x.rel)).toEqual([WORKER]);
  });

  it("it imports `highlight.js/lib/core` and the eight language definitions individually", () => {
    const specs = importersOfHljs().flatMap((x) => x.specs);
    expect(specs).toContain("highlight.js/lib/core");
    for (const l of LANGUAGES) expect(specs, l).toContain(`highlight.js/lib/languages/${l}`);
    expect(specs.length).toBe(1 + LANGUAGES.length);
  });

  it("never the all-languages entry: no bare `highlight.js`, no `highlight.js/lib/index`, no `lib/common`, no `lib/languages/*` beyond the eight", () => {
    for (const s of importersOfHljs().flatMap((x) => x.specs)) {
      expect(s).not.toBe("highlight.js");
      expect(s).not.toMatch(/lib\/(index|common)\b|\/es\/|\.min/);
    }
  });

  it("the Worker is created lazily with the Vite module-worker form somewhere in the viewer's code", () => {
    const hit = prod().filter((f) => /new Worker\(\s*new URL\(\s*["'][^"']*highlight\.worker(?:\.ts)?["']\s*,\s*import\.meta\.url\s*\)\s*,\s*\{\s*type:\s*["']module["']/.test(f.text));
    expect(hit.length).toBe(1);
    expect(hit[0].rel.startsWith("routes/viewer/") || hit[0].rel.startsWith("lib/features/viewer/")).toBe(true);
  });

  it("only the viewer creates Workers (the main window gets none)", () => {
    const creators = prod().filter((f) => /new Worker\(/.test(stripComments(f.text))).map((f) => f.rel);
    for (const r of creators) expect(r.startsWith("routes/viewer/") || r.startsWith("lib/features/viewer/"), r).toBe(true);
  });
});
