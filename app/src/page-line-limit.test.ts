/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec/Architecture: SPEC-0200-0001 §3.8.11 (the Phase 9 extraction plan keeps
// `routes/+page.svelte` <= 400 lines), §3.8.17 SHOULD-158 (the limit applies to
// EVERY production file under `routes/**` -- .svelte and .ts, tests excluded,
// `routes/viewer/+page.svelte` included), §4.1 / §7.1 (400-line guideline for the
// composition layer). features/ files above 400 lines (tree-state.svelte.ts,
// list-state.svelte.ts) are intentionally NOT covered (SHOULD-158).

const SRC = resolve(__dirname);
const ROUTES = join(SRC, "routes");
const LIMIT = 400;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit") continue;
      walk(full, out);
    } else if (/\.(svelte|ts)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function lineCount(file: string): number {
  const text = readFileSync(file, "utf-8");
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop(); // trailing newline is not a line
  return lines.length;
}

describe("routes/** line limit (SHOULD-158, §3.8.11)", () => {
  const files = walk(ROUTES);

  it("the scan sees the routes production files (guards against an empty scan)", () => {
    const rels = files.map((f) => relative(SRC, f).split(sep).join("/"));
    expect(rels).toContain("routes/+page.svelte");
    expect(rels).toContain("routes/viewer/+page.svelte");
    expect(rels.some((r) => r.startsWith("routes/_components/"))).toBe(true);
    expect(rels.every((r) => !r.endsWith(".test.ts"))).toBe(true);
  });

  it(`routes/+page.svelte is at most ${LIMIT} lines`, () => {
    expect(lineCount(join(ROUTES, "+page.svelte"))).toBeLessThanOrEqual(LIMIT);
  });

  it(`every .svelte / .ts file under routes/ is at most ${LIMIT} lines`, () => {
    const over = files
      .map((f) => ({ f: relative(SRC, f).split(sep).join("/"), n: lineCount(f) }))
      .filter((x) => x.n > LIMIT)
      .map((x) => `${x.f}: ${x.n} lines`);
    expect(over).toEqual([]);
  });
});
