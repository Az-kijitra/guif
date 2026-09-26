/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Spec/Architecture: SPEC-0200-0001 §4.1 (dependency direction routes/ ->
//   features/ -> shared/; no feature-to-feature imports; features/ and
//   shared/ never import routes/), §3.3.12/§3.3.13-7 SHOULD-84(a) (machine
//   check of import boundaries by scanning `import` statements in Node),
//   §3.3.13-4 (shared/ never imports features/), SPEC-0300-0012 R-129
//   (search and file-list never import each other).
//
// Scans every .ts / .svelte file under app/src (test files included) for
// static `import ... from "..."`, `export ... from "..."`, side-effect
// `import "..."` and dynamic `import("...")` specifiers, including
// `import type` (type imports count: SHOULD-84). `$lib/...` and relative
// specifiers are resolved to a layer.

const SRC = resolve(__dirname);

type Layer = { kind: "routes" } | { kind: "feature"; name: string } | { kind: "shared" } | { kind: "other" };

function layerOf(absPath: string): Layer {
  const rel = relative(SRC, absPath).split(sep).join("/");
  if (rel.startsWith("routes/")) return { kind: "routes" };
  const m = /^lib\/features\/([^/]+)\//.exec(rel);
  if (m) return { kind: "feature", name: m[1] };
  if (rel.startsWith("lib/shared/")) return { kind: "shared" };
  return { kind: "other" };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit") continue;
      walk(full, out);
    } else if (/\.(ts|svelte)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function specifiersOf(code: string): string[] {
  const src = stripComments(code);
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\sfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
  }
  return out;
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("$lib/")) return join(SRC, "lib", spec.slice("$lib/".length));
  if (spec.startsWith(".")) return resolve(dirname(fromFile), spec);
  return null; // external package or other alias
}

interface Edge {
  from: string;
  to: string;
  spec: string;
  fromLayer: Layer;
  toLayer: Layer;
}

function collectEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const file of walk(SRC)) {
    const fromLayer = layerOf(file);
    for (const spec of specifiersOf(readFileSync(file, "utf-8"))) {
      const target = resolveSpecifier(file, spec);
      if (target === null) continue;
      edges.push({ from: relative(SRC, file), to: relative(SRC, target), spec, fromLayer, toLayer: layerOf(target) });
    }
  }
  return edges;
}

const fmt = (e: Edge) => `${e.from} -> ${e.spec}`;

describe("import boundaries (SPEC-0200-0001 §4.1, SHOULD-84(a))", () => {
  const edges = collectEdges();

  it("the scanner finds imports at all (guards against a silently empty scan)", () => {
    expect(edges.length).toBeGreaterThan(20);
    expect(edges.some((e) => e.fromLayer.kind === "routes" && e.toLayer.kind === "feature")).toBe(true);
  });

  it("no feature imports another feature (type imports included)", () => {
    const bad = edges.filter(
      (e) => e.fromLayer.kind === "feature" && e.toLayer.kind === "feature" && e.fromLayer.name !== e.toLayer.name,
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("no feature imports another feature's module even through a relative path that leaves its directory", () => {
    const bad = edges.filter(
      (e) => e.fromLayer.kind === "feature" && e.spec.startsWith(".") && e.toLayer.kind === "feature" && e.toLayer.name !== e.fromLayer.name,
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("shared/ never imports features/", () => {
    const bad = edges.filter((e) => e.fromLayer.kind === "shared" && e.toLayer.kind === "feature");
    expect(bad.map(fmt)).toEqual([]);
  });

  it("shared/ never imports routes/", () => {
    const bad = edges.filter((e) => e.fromLayer.kind === "shared" && e.toLayer.kind === "routes");
    expect(bad.map(fmt)).toEqual([]);
  });

  it("nothing outside routes/ references routes/ (features/ and shared/ included)", () => {
    const bad = edges.filter((e) => e.toLayer.kind === "routes" && e.fromLayer.kind !== "routes");
    expect(bad.map(fmt)).toEqual([]);
  });

  it("features/ may import shared/ but never routes/", () => {
    const bad = edges.filter((e) => e.fromLayer.kind === "feature" && e.toLayer.kind === "routes");
    expect(bad.map(fmt)).toEqual([]);
  });

  it("SPEC-0300-0012 R-129: features/search and features/file-list never import each other", () => {
    const bad = edges.filter(
      (e) =>
        e.fromLayer.kind === "feature" &&
        e.toLayer.kind === "feature" &&
        ((e.fromLayer.name === "search" && e.toLayer.name === "file-list") ||
          (e.fromLayer.name === "file-list" && e.toLayer.name === "search")),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("SPEC-0200-0001 §3.3.3: file-ops does not import keyboard, file-list, search or navigation-history (and vice versa)", () => {
    const bad = edges.filter(
      (e) =>
        e.fromLayer.kind === "feature" &&
        e.toLayer.kind === "feature" &&
        (e.fromLayer.name === "file-ops" || e.toLayer.name === "file-ops") &&
        e.fromLayer.name !== e.toLayer.name,
    );
    expect(bad.map(fmt)).toEqual([]);
  });
});

describe("scanner self-check (specifier extraction)", () => {
  it("extracts static, type-only, re-export, side-effect and dynamic imports; ignores comments", () => {
    const code = [
      'import { a } from "./a";',
      'import type { B } from "$lib/features/keyboard/key-dispatch";',
      'export * from "./c";',
      'import "./d";',
      'const x = await import("./e");',
      '// import { z } from "./commented";',
      '/* import { y } from "./blocked"; */',
    ].join("\n");
    expect(specifiersOf(code).sort()).toEqual(["$lib/features/keyboard/key-dispatch", "./a", "./c", "./d", "./e"].sort());
  });
});
