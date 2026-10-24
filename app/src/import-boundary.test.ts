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

// SPEC-0300-0014 R-310 / §0.4 / SPEC-0200-0001 §3.4.1, §3.4.6, §3.4.7, §3.4.10:
// features/archive must not depend on features/file-ops (or any feature) and
// vice versa; everything they share goes through shared/. Explicit checks so
// that a silently missing module (RED until Phase 5 is implemented) is visible
// instead of the generic scans passing on an empty directory.
describe("Phase 5 archive boundaries (SPEC-0300-0014 R-310, SPEC-0200-0001 §3.4)", () => {
  const edges = collectEdges();
  // Production modules only (test files also count in the generic scans above).
  const archiveEdges = edges.filter(
    (e) => e.fromLayer.kind === "feature" && e.fromLayer.name === "archive" && !/\.test\.ts$/.test(e.from),
  );
  const exists = (rel: string): boolean => {
    try {
      return statSync(join(SRC, rel)).isFile();
    } catch {
      return false;
    }
  };

  it("§3.4.6: the planned modules exist (feature files, shared/ipc, shared/conflict-session, routes wiring)", () => {
    const planned = [
      "lib/features/archive/archive-controller.ts",
      "lib/features/archive/target-rules.ts",
      "lib/features/archive/dialog-specs.ts",
      "lib/features/archive/result-report.ts",
      "lib/features/archive/error-format.ts",
      "lib/features/archive/path-util.ts",
      "lib/shared/ipc/archive.ts",
      "lib/shared/conflict-session.ts",
      "routes/archive-ipc.ts",
      "routes/operations-wiring.ts",
    ];
    expect(planned.filter((f) => !exists(f))).toEqual([]);
  });

  it("the scanner sees features/archive PRODUCTION modules at all (guards against an empty scan)", () => {
    expect(archiveEdges.length).toBeGreaterThan(0);
  });

  it("features/archive never imports another feature (file-ops in particular), type imports and relative escapes included", () => {
    const bad = edges.filter(
      (e) => e.fromLayer.kind === "feature" && e.fromLayer.name === "archive" && e.toLayer.kind === "feature" && e.toLayer.name !== "archive",
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("no other feature imports features/archive (the only route is routes/ composition, §4.1 path 2)", () => {
    const bad = edges.filter(
      (e) => e.fromLayer.kind === "feature" && e.toLayer.kind === "feature" && e.toLayer.name === "archive" && e.fromLayer.name !== "archive",
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("features/archive never imports routes/ (and shared/ never imports features/ or routes/: re-checked for the new shared modules)", () => {
    expect(archiveEdges.filter((e) => e.toLayer.kind === "routes").map(fmt)).toEqual([]);
    const sharedBad = edges.filter(
      (e) => e.fromLayer.kind === "shared" && (e.toLayer.kind === "feature" || e.toLayer.kind === "routes"),
    );
    expect(sharedBad.map(fmt)).toEqual([]);
  });

  it("R-377 / §3.4.1: ONE conflict-session implementation - features/archive uses shared/conflict-session, and file-ops re-exports it", () => {
    expect(
      archiveEdges.some((e) => e.spec === "$lib/shared/conflict-session" || /conflict-session$/.test(e.spec)),
    ).toBe(true);
    const flow = edges.filter((e) => e.from === "lib/features/file-ops/conflict-flow.ts".split("/").join(sep));
    expect(flow.some((e) => /shared\/conflict-session$/.test(e.spec))).toBe(true);
  });

  it("§3.4.6 / R-386: features/archive reaches the backend only through injection (no direct import of shared/ipc/archive's wrappers is required; if imported it is shared/, never Tauri directly)", () => {
    const tauriDirect = readdirSync(join(SRC, "lib", "features", "archive"), { withFileTypes: true })
      .filter((d) => d.isFile() && /\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name))
      .filter((d) => /@tauri-apps\//.test(readFileSync(join(SRC, "lib", "features", "archive", d.name), "utf-8")));
    expect(tauriDirect.map((d) => d.name)).toEqual([]);
  });

  // Test fix (code-generator, 2026-09-27, SPEC-0300-0015 §3.5.3/§3.5.7): this
  // Phase 5 assertion pre-dates Phase 6's `open-decision.ts` judgment, which
  // `list-action-wiring.ts`'s "open" case now deliberately imports (the
  // keyboard `open`/`Shift+Enter` path and the file list's double-click
  // handler must share ONE decision, SHOULD-110). The "Phase 6 viewer
  // boundaries" describe block below documents and enforces this exact
  // exception ("only routes/ ... may import BOTH features/viewer and another
  // feature"). Narrowing this check to exclude `features/viewer` keeps its
  // original intent (SPEC-0300-0010 R-17: no OTHER feature's logic leaks into
  // the generic action switch) fully enforced.
  //
  // Test fix (code-reviewer minor item, 2026-09-29, SPEC-0200-0001 §3.6.6):
  // `features/file-list` is ALSO now exempted, for the exact same reason as
  // `viewer` above (SHOULD-110-style shared judgment, not a new coupling):
  // `list-action-wiring.ts`'s `toggle_tree` case reuses
  // `features/file-list/aria.ts::computeTreeFocusReassignment` (R-14/AC-09)
  // instead of re-implementing the same "hiding the tree while it had focus
  // reassigns focus to the file list" decision a second time inline. `aria.ts`
  // is a pure, DOM-independent, dependency-free module (no feature-to-feature
  // coupling risk); the exempted set stays a explicit, narrow allow-list of
  // shared PURE judgments, not a general relaxation.
  it("§3.4.7: routes/list-action-wiring.ts imports no feature module other than features/viewer or features/file-list (SPEC-0300-0010 R-17, SPEC-0300-0015 §3.5.3, SPEC-0200-0001 §3.6.6)", () => {
    const bad = edges.filter(
      (e) =>
        e.from === "routes" + sep + "list-action-wiring.ts" &&
        e.toLayer.kind === "feature" &&
        e.toLayer.name !== "viewer" &&
        e.toLayer.name !== "file-list",
    );
    expect(bad.map(fmt)).toEqual([]);
  });
});

// SPEC-0300-0015 (Phase 6, ReflexViewer): `features/viewer/` must depend on
// `shared/` only (never on `file-list`/`keyboard`/`search`/`file-ops`/
// `archive`/`navigation-history`, and never on `routes/`); only `routes/`
// (list-action-wiring.ts + the file-list row's dblclick handler + the
// `/viewer` route itself) may import BOTH `features/viewer` and another
// feature, per §4.1 path 2 (the same pattern as `operations-wiring.ts`
// composing `file-ops`/`archive`). SPEC-0200-0001 §3.5.7.
describe("Phase 6 viewer boundaries (SPEC-0300-0015, SPEC-0200-0001 §3.5.7)", () => {
  const edges = collectEdges();
  const viewerEdges = edges.filter(
    (e) => e.fromLayer.kind === "feature" && e.fromLayer.name === "viewer" && !/\.test\.ts$/.test(e.from),
  );
  const exists = (rel: string): boolean => {
    try {
      return statSync(join(SRC, rel)).isFile();
    } catch {
      return false;
    }
  };

  it("§3.5.7: the planned modules exist (feature files, shared/ipc, the /viewer route)", () => {
    const planned = [
      "lib/features/viewer/open-decision.ts",
      "lib/features/viewer/viewer-controller.ts",
      "lib/features/viewer/viewer-keys.ts",
      "lib/features/viewer/error-format.ts",
      "lib/features/viewer/markdown-render.ts",
      "lib/features/viewer/request-sequencer.ts",
      "lib/features/viewer/window-guard.ts",
      "lib/shared/ipc/viewer.ts",
      "routes/viewer/+page.svelte",
      "routes/viewer/viewer-wiring.ts",
      "routes/+layout.svelte",
    ];
    expect(planned.filter((f) => !exists(f))).toEqual([]);
  });

  it("the scanner sees features/viewer PRODUCTION modules at all (guards against an empty scan)", () => {
    expect(viewerEdges.length).toBeGreaterThan(0);
  });

  it("features/viewer never imports another feature module, type imports and relative escapes included", () => {
    const bad = edges.filter(
      (e) => e.fromLayer.kind === "feature" && e.fromLayer.name === "viewer" && e.toLayer.kind === "feature" && e.toLayer.name !== "viewer",
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("no other feature imports features/viewer (only routes/ composition, §4.1 path 2)", () => {
    const bad = edges.filter(
      (e) => e.fromLayer.kind === "feature" && e.toLayer.kind === "feature" && e.toLayer.name === "viewer" && e.fromLayer.name !== "viewer",
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("features/viewer never imports routes/", () => {
    expect(viewerEdges.filter((e) => e.toLayer.kind === "routes").map(fmt)).toEqual([]);
  });

  it("§3.5.8: features/viewer never imports features/keyboard (R-500, the fixed key table is not keymap-driven)", () => {
    const bad = edges.filter(
      (e) =>
        e.fromLayer.kind === "feature" &&
        e.fromLayer.name === "viewer" &&
        e.toLayer.kind === "feature" &&
        e.toLayer.name === "keyboard",
    );
    expect(bad.map(fmt)).toEqual([]);
  });
});

// Phase 7 (SPEC-0300-0009/0010; SPEC-0200-0001 §3.6.11.3/.4/.11 MUST-86/87/
// 94, SHOULD-123/129/130): new intra-feature and shared-module boundaries
// the generic cross-feature scans above do not cover (list-state.svelte.ts
// and tree-state.svelte.ts are BOTH in features/file-list/, so the generic
// "no feature imports another feature" check cannot see a cycle between
// them; likewise shared/persistence-coordinator.ts's constraint is
// shared-to-shared, not shared-to-feature).
describe("Phase 7 boundaries (SPEC-0200-0001 §3.6.11.4(f) MUST-94, §3.6.11.11 SHOULD-123/130)", () => {
  const edges = collectEdges();
  const fileListEdges = edges.filter((e) => e.fromLayer.kind === "feature" && e.fromLayer.name === "file-list" && !/\.test\.ts$/.test(e.from));
  const exists = (rel: string): boolean => {
    try {
      return statSync(join(SRC, rel)).isFile();
    } catch {
      return false;
    }
  };

  it("§3.6 the planned Phase 7 modules exist (feature files, routes wiring, shared)", () => {
    const planned = [
      "lib/features/file-list/tree-state.svelte.ts",
      "lib/features/file-list/format.ts",
      "lib/features/file-list/sort-menu-state.svelte.ts",
      "lib/features/file-list/sort-menu-keys.ts",
      "lib/features/keyboard/keymap-state.svelte.ts",
      "routes/startup-wiring.ts",
      "routes/focus-wiring.ts",
      "routes/tree-action-wiring.ts",
      "routes/sort-menu-wiring.ts",
      "lib/shared/path-key.ts",
      "lib/shared/persistence-coordinator.ts",
    ];
    expect(planned.filter((f) => !exists(f))).toEqual([]);
  });

  it("MUST-94: list-state.svelte.ts never imports tree-state.svelte.ts", () => {
    const bad = fileListEdges.filter(
      (e) => /list-state\.svelte\.ts$/.test(e.from) && /tree-state(\.svelte)?(\.ts)?$/.test(e.spec),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("MUST-94/MUST-87(f): tree-state.svelte.ts never imports list-state.svelte.ts", () => {
    const bad = fileListEdges.filter(
      (e) => /tree-state\.svelte\.ts$/.test(e.from) && /list-state(\.svelte)?(\.ts)?$/.test(e.spec),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("SHOULD-123: sort-menu-keys.ts never imports features/keyboard (a local structural event type is used instead)", () => {
    const bad = edges.filter(
      (e) => /sort-menu-keys\.ts$/.test(e.from) && (e.toLayer.kind === "feature" ? e.toLayer.name === "keyboard" : /features\/keyboard/.test(e.spec)),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("SHOULD-130 condition 1: shared/persistence-coordinator.ts never imports shared/ipc/config or shared/state/status-message directly (load/save/onSaveError are injected)", () => {
    const bad = edges.filter(
      (e) => /lib\/shared\/persistence-coordinator\.ts$/.test(e.from) && (/shared\/ipc\/config/.test(e.spec) || /status-message/.test(e.spec)),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("SHOULD-129 condition 2: shared/path-key.ts stays a leaf -- it imports neither features/ nor routes/", () => {
    const bad = edges.filter(
      (e) => /lib\/shared\/path-key\.ts$/.test(e.from) && (e.toLayer.kind === "feature" || e.toLayer.kind === "routes"),
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

// Phase 8 (SPEC-0300-0016; SPEC-0200-0001 §3.7.4, §3.7.10.2 MUST-98, §3.7.10.9
// SHOULD-136): features/path-bar is a new vertical slice; it must not import
// any other feature (NavigateResult / pathComparisonKey / translateErrorCode
// live in shared/), and must never create Map/Set (nothing to touch()).
describe("Phase 8 path-bar boundaries (SPEC-0200-0001 §3.7.4, MUST-98, SHOULD-136)", () => {
  const edges = collectEdges();
  const exists = (rel: string): boolean => {
    try {
      return statSync(join(SRC, rel)).isFile();
    } catch {
      return false;
    }
  };

  it("§3.7.4/§3.7.10.2: the planned modules exist", () => {
    const planned = [
      "lib/features/path-bar/normalize.ts",
      "lib/features/path-bar/completion.ts",
      "lib/features/path-bar/path-bar-state.svelte.ts",
      "lib/features/path-bar/PathBar.svelte",
      "lib/shared/navigation-result.ts",
      "lib/shared/error-text.ts",
      "routes/path-bar-wiring.ts",
    ];
    expect(planned.filter((f) => !exists(f))).toEqual([]);
  });

  it("features/path-bar never imports another feature or routes (type imports included); nobody else imports path-bar", () => {
    const own = edges.filter((e) => e.fromLayer.kind === "feature" && e.fromLayer.name === "path-bar");
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((e) => e.toLayer.kind === "routes" || (e.toLayer.kind === "feature" && e.toLayer.name !== "path-bar")).map(fmt)).toEqual([]);
    const into = edges.filter((e) => e.toLayer.kind === "feature" && e.toLayer.name === "path-bar" && !(e.fromLayer.kind === "feature" && e.fromLayer.name === "path-bar") && e.fromLayer.kind !== "routes");
    expect(into.map(fmt)).toEqual([]);
  });

  it("SHOULD-136: no `new Map/Set/WeakMap/WeakSet`, SvelteMap or SvelteSet anywhere in features/path-bar production sources (not only top level)", () => {
    const dir = join(SRC, "lib", "features", "path-bar");
    const files = walk(dir).filter((f) => !/\.test\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const bad = files.filter((f) => /\bnew\s+(Map|Set|WeakMap|WeakSet)\b|SvelteMap|SvelteSet/.test(stripComments(readFileSync(f, "utf-8"))));
    expect(bad.map((f) => relative(SRC, f))).toEqual([]);
  });
});

// Phase 9 (SPEC-0300-0017 R-913; SPEC-0200-0001 §3.8.1, §3.8.12 (1)-(4), §3.8.13
// DI rule, §3.8.17 SHOULD-157/158): the stylesheet reaches ONLY the main window
// (so the viewer's computed styles never change), and the new pure modules stay
// DOM/Svelte independent and feature-isolated.
describe("Phase 9 visual-design boundaries (SPEC-0300-0017 R-913, SPEC-0200-0001 §3.8.12)", () => {
  const edges = collectEdges();
  const exists = (rel: string): boolean => {
    try {
      return statSync(join(SRC, rel)).isFile();
    } catch {
      return false;
    }
  };
  const read = (rel: string): string => stripComments(readFileSync(join(SRC, rel), "utf-8"));

  it("§3.8.1: the planned Phase 9 artefacts exist (app.css, name-ellipsis, status-bar-model)", () => {
    const planned = ["app.css", "lib/features/file-list/name-ellipsis.ts", "routes/status-bar-model.ts"];
    expect(planned.filter((f) => !exists(f))).toEqual([]);
  });

  // Phase 12 (SPEC-0200-0001 §3.11.11 / §3.11.12 (6)): the viewer's own stylesheet is a planned artefact, it is
  // imported by the viewer page only, and the viewer still never reaches app.css (checked just below).
  it("§3.11.7: routes/viewer/viewer-theme.css exists and is imported by routes/viewer/+page.svelte and by nothing else", () => {
    expect(exists("routes/viewer/viewer-theme.css")).toBe(true);
    const importers = edges.filter((e) => e.to.endsWith("viewer-theme.css")).map((e) => e.from.split(sep).join("/"));
    expect(importers).toEqual(["routes/viewer/+page.svelte"]);
  });

  it("(4) app.css is imported by routes/+page.svelte and by nothing else", () => {
    const importers = edges.filter((e) => e.to === "app.css").map((e) => e.from.split(sep).join("/"));
    expect(importers).toEqual(["routes/+page.svelte"]);
  });

  it("(4) routes/+layout.svelte, routes/+layout.ts and everything under routes/viewer/ never mention app.css (R-913)", () => {
    const targets = walk(join(SRC, "routes")).filter(
      (f) => /routes[\\/]\+layout\.(svelte|ts)$/.test(f) || /routes[\\/]viewer[\\/]/.test(f),
    );
    expect(targets.length).toBeGreaterThan(0);
    const bad = targets.filter((f) => /app\.css/.test(stripComments(readFileSync(f, "utf-8"))));
    expect(bad.map((f) => relative(SRC, f))).toEqual([]);
  });

  it("(1) the pure file-list modules import no other feature (search / navigation-history / path-bar / keyboard)", () => {
    const pure = ["name-ellipsis", "pane-layout", "list-layout"].map((n) => `lib/features/file-list/${n}.ts`);
    const present = pure.filter(exists);
    expect(present).toContain("lib/features/file-list/list-layout.ts");
    expect(present).toContain("lib/features/file-list/name-ellipsis.ts");
    const bad = edges.filter(
      (e) =>
        present.map((p) => p.split("/").join(sep)).includes(e.from) &&
        (/\$lib\/features\/(search|navigation-history|path-bar|keyboard)\//.test(e.spec) ||
          (e.toLayer.kind === "feature" && e.toLayer.name !== "file-list")),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("(2) any text-measure module (canvas-backed MeasureText factory) imports no feature (placed under shared/ or file-list/ per SHOULD-157)", () => {
    const found = walk(join(SRC, "lib")).filter((f) => /text-measure\.ts$/.test(f));
    const bad = edges.filter(
      (e) => found.some((f) => relative(SRC, f) === e.from) && /\$lib\/features\//.test(e.spec) && !/\/file-list\//.test(e.spec),
    );
    expect(bad.map(fmt)).toEqual([]);
  });

  it("(3) routes/status-bar-model.ts imports no .svelte file and no $app/ module", () => {
    const own = edges.filter((e) => e.from === "routes" + sep + "status-bar-model.ts");
    expect(own.filter((e) => /\.svelte$/.test(e.spec) || /^\$app\//.test(e.spec)).map(fmt)).toEqual([]);
    expect(/\$app\//.test(read("routes/status-bar-model.ts"))).toBe(false);
  });

  it("§3.8.13 DI rule: the pure modules reference no DOM globals and no runes", () => {
    const pure = ["lib/features/file-list/name-ellipsis.ts", "lib/features/file-list/list-layout.ts", "routes/status-bar-model.ts"];
    const bad = pure.filter(
      (f) => /\b(document|window|getComputedStyle|requestAnimationFrame|OffscreenCanvas)\b|\$state\b|\$derived\b|\$effect\b/.test(read(f)),
    );
    expect(bad).toEqual([]);
  });
});

describe("Phase 11 OS clipboard boundaries (SPEC-0200-0001 §3.10.12 / §3.10.15, SPEC-0300-0011 R-17-3)", () => {
  const prod = (rel: string) => join(SRC, rel);
  const FILE_OPS = "lib/features/file-ops";
  const NEW_MODULES = [
    `${FILE_OPS}/os-clipboard-port.ts`,
    `${FILE_OPS}/clipboard-source.ts`,
    `${FILE_OPS}/clipboard-messages.ts`,
    "lib/shared/ipc/clipboard.ts",
    "routes/clipboard-ipc.ts",
  ];

  it("the planned modules exist", () => {
    for (const rel of NEW_MODULES) {
      expect(() => statSync(prod(rel)), rel).not.toThrow();
    }
  });

  it("os-clipboard-port / clipboard-source / clipboard-messages import neither @tauri-apps/* nor shared/ipc (the IPC is injected)", () => {
    for (const name of ["os-clipboard-port", "clipboard-source", "clipboard-messages"]) {
      const specs = specifiersOf(readFileSync(prod(`${FILE_OPS}/${name}.ts`), "utf8"));
      const bad = specs.filter((s) => s.startsWith("@tauri-apps/") || s.includes("shared/ipc"));
      expect(bad, name).toEqual([]);
    }
  });

  it("features/file-ops production files import no other feature and no routes (re-checked with the new modules)", () => {
    const dir = prod(FILE_OPS);
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const specs = specifiersOf(readFileSync(join(dir, file), "utf8"));
      const bad = specs.filter((s) => /(^|\/)features\/(?!file-ops)/.test(s) || s.includes("routes/") || s.startsWith("@tauri-apps/"));
      expect(bad, file).toEqual([]);
    }
  });

  it("R-17-3: features/file-ops reads no text from the clipboard (navigator.clipboard.read / readText)", () => {
    const dir = prod(FILE_OPS);
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const code = stripComments(readFileSync(join(dir, file), "utf8"));
      expect(/navigator\s*\.\s*clipboard\s*\.\s*read/.test(code), file).toBe(false);
    }
  });

  it("shared/ipc/clipboard.ts imports no feature and no routes", () => {
    const specs = specifiersOf(readFileSync(prod("lib/shared/ipc/clipboard.ts"), "utf8"));
    expect(specs.filter((s) => s.includes("features/") || s.includes("routes/"))).toEqual([]);
  });

  it("the context-menu feature stays independent: it does not import file-ops (the menu receives hasItems from routes/)", () => {
    const dir = prod("lib/features/context-menu");
    for (const file of readdirSync(dir).filter((n) => /\.(ts|svelte)$/.test(n) && !n.endsWith(".test.ts"))) {
      const specs = specifiersOf(readFileSync(join(dir, file), "utf8"));
      expect(specs.filter((s) => s.includes("file-ops")), file).toEqual([]);
    }
  });
});

// SPEC-0200-0001 §3.13.2 / §3.13.5 (the new describe "文言の置き場所"), §3.13.14 H-1: the wording modules.
//   shared/messages.ts is a LEAF (imports nothing); every feature's messages.ts and routes/messages.ts import
//   only `$lib/shared/messages` (so another feature's messages.ts can never be imported: §4.1 still holds); and all
//   of them are pure data / template functions (no runes, no DOM). SPEC-0300-0019 R-1201.
describe("文言の置き場所 (SPEC-0200-0001 §3.13.2: messages.ts modules, SPEC-0300-0019 R-1201)", () => {
  const FEATURES_WITH_MESSAGES = [
    "appearance", // APPEARANCE (SPEC-0300-0023 / SPEC-0200-0001 §3.18.4): the 13th feature with a messages.ts (total 15)
    "archive",
    "context-menu",
    "external-apps", // EXTERNAL-APPS (SPEC-0300-0021 / SPEC-0200-0001 §3.16.6, §3.16.14): the 11th feature with a messages.ts
    "file-list",
    "file-ops",
    "keyboard",
    "menu-bar", // PHASE 13 (SPEC-0200-0001 §3.14.12-1 / MUST-129): the 10th feature with a messages.ts
    "navigation-history",
    "path-bar",
    "search",
    "settings-file", // SETTINGS-FILE (SPEC-0300-0022 / SPEC-0200-0001 §3.17.8): the 12th feature with a messages.ts
    "viewer",
  ];
  const SHARED_MESSAGES = "lib/shared/messages.ts";
  const ROUTES_MESSAGES = "routes/messages.ts";
  const FEATURE_MESSAGES = FEATURES_WITH_MESSAGES.map((f) => `lib/features/${f}/messages.ts`);
  const ALL_MESSAGES = [SHARED_MESSAGES, ...FEATURE_MESSAGES, ROUTES_MESSAGES];
  const abs = (rel: string) => join(SRC, rel);

  it("the planned modules exist: shared (1) + feature (13) + routes (1) = 15, and no other messages.ts is hiding elsewhere", () => {
    for (const rel of ALL_MESSAGES) expect(() => statSync(abs(rel)), rel).not.toThrow();
    const found = walk(SRC)
      .filter((f) => /(^|[\\/])messages\.ts$/.test(f))
      .map((f) => relative(SRC, f).split(sep).join("/"))
      .sort();
    expect(found).toEqual([...ALL_MESSAGES].sort());
  });

  it("shared/messages.ts is a leaf: it imports nothing (not even a type)", () => {
    expect(specifiersOf(readFileSync(abs(SHARED_MESSAGES), "utf-8"))).toEqual([]);
  });

  it("a feature's messages.ts and routes/messages.ts import only `$lib/shared/messages` (never another feature's messages.ts, a sibling or routes)", () => {
    const bad: string[] = [];
    for (const rel of [...FEATURE_MESSAGES, ROUTES_MESSAGES]) {
      for (const spec of specifiersOf(readFileSync(abs(rel), "utf-8"))) {
        if (spec !== "$lib/shared/messages") bad.push(`${rel} -> ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every messages.ts is pure data / template functions: no runes, no DOM globals (comments are ignored)", () => {
    const bad = ALL_MESSAGES.filter((rel) =>
      /\$state\b|\$derived\b|\$effect\b|\b(document|window|localStorage|navigator)\b/.test(stripComments(readFileSync(abs(rel), "utf-8"))),
    );
    expect(bad).toEqual([]);
  });

  it("every messages.ts stays within the 400-line limit (SPEC-0200-0001 §7.1)", () => {
    const tooLong = ALL_MESSAGES.filter((rel) => readFileSync(abs(rel), "utf-8").split("\n").length > 400);
    expect(tooLong).toEqual([]);
  });

  it("shared/messages.ts may be imported from anywhere, but a feature's messages.ts only from inside that feature (§3.13.14: routes import none today)", () => {
    const bad = collectEdges().filter((e) => {
      const m = /^lib\/features\/([^/]+)\/messages\.ts$/.exec(e.to.split(sep).join("/"));
      if (m === null) return false;
      if (e.from.endsWith(".test.ts")) return false; // a test may import the module it covers
      return !(e.fromLayer.kind === "feature" && e.fromLayer.name === m[1]);
    });
    expect(bad.map(fmt)).toEqual([]);
  });
});
