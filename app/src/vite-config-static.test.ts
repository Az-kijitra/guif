/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0015 第8版 R-466-1 (the highlighter is loaded lazily), ISS-0203 (b) (a dependency discovered at first use makes the dev
//   server reload the page; the viewer would lose its one-shot pending file, R-430).
// Architecture: SPEC-0200-0001 §3.14.12-8 (MUST-138): `vite.config.ts` `optimizeDeps.include` gains `highlight.js/lib/core` and the eight language
//   entries `highlight.js/lib/languages/{c,cpp,rust,javascript,typescript,python,json,markdown}` -- only the Worker imports them, so without the
//   entry the first highlight would trigger "optimized dependencies changed. reloading".
//
// The runtime check (no page reload when the first `.rs` file is opened) is a [CDP]
// step on a real `tauri dev`, outside vitest.

const CONFIG = readFileSync(resolve(__dirname, "..", "vite.config.ts"), "utf-8");

function includeList(): string[] {
  const m = /optimizeDeps\s*:\s*\{[\s\S]*?include\s*:\s*\[([\s\S]*?)\]/.exec(CONFIG);
  expect(m, "vite.config.ts must keep an optimizeDeps.include array").not.toBeNull();
  return [...m![1].replace(/\/\/.*$/gm, "").matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

describe("vite.config.ts optimizeDeps.include (MUST-138)", () => {
  const list = includeList();

  it("keeps the five entries it had", () => {
    for (const e of ["@tauri-apps/api/core", "@tauri-apps/api/event", "@tauri-apps/api/window", "@tauri-apps/api/path", "markdown-it"]) {
      expect(list, e).toContain(e);
    }
  });

  it("has highlight.js/lib/core", () => {
    expect(list).toContain("highlight.js/lib/core");
  });

  it.each(["c", "cpp", "rust", "javascript", "typescript", "python", "json", "markdown"])("has highlight.js/lib/languages/%s", (l) => {
    expect(list).toContain(`highlight.js/lib/languages/${l}`);
  });

  it("does not use the all-languages entry", () => {
    expect(list).not.toContain("highlight.js");
    expect(list.filter((e) => /highlight\.js\/(lib\/index|lib\/common|styles)/.test(e))).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(list).size).toBe(list.length);
  });
});
