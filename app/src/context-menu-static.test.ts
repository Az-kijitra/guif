/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0018 R-1012 / R-1013 (one global guard, also in the
//   viewer window), R-1071 / R-1074 (colours via CSS variables, no border
//   radius), R-1110 + AC-1026 (no extra items / strings), R-1130 (pure
//   functions), SPEC-0300-0017 R-910 / AC-905 (no colour literals).
// Architecture: SPEC-0200-0001 §3.9.12 (import boundary cases (1)~(5)),
//   §3.9.11 (file size limits), §3.9.9 (`+layout.svelte` imports the guard and
//   never `app.css`), coordinator note: `menu-events.ts` is DOM-free too and
//   `shared/clipboard-text.ts` joins the "shared never imports features" set.
// This file complements (does not edit) import-boundary.test.ts,
//   page-line-limit.test.ts and ui-colors-static.test.ts, whose generic scans
//   already cover the new files once they exist.

const SRC = resolve(__dirname);
const CM = join(SRC, "lib", "features", "context-menu");
const SHARED = join(SRC, "lib", "shared");
const ROUTES = join(SRC, "routes");

function read(file: string): string {
  return readFileSync(file, "utf-8");
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function productionFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /\.(ts|svelte)$/.test(n) && !/\.test\.ts$/.test(n))
    .map((n) => join(dir, n));
}

function specifiers(code: string): string[] {
  const src = stripComments(code);
  const out: string[] = [];
  for (const re of [
    /\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\sfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
  }
  return out;
}

const PURE_MODULES = [
  "menu-model.ts",
  "menu-position.ts",
  "menu-keys.ts",
  "contextmenu-origin.ts",
  "copy-path-text.ts",
  "target-classify.ts",
  "outside-click-shield.ts",
  "menu-events.ts",
];

describe("features/context-menu: planned files exist (§3.9.1, §3.9.17.4)", () => {
  it("the feature modules and the two Svelte files exist", () => {
    const planned = [
      ...PURE_MODULES.map((f) => join(CM, f)),
      join(CM, "menu-state.svelte.ts"),
      join(CM, "ContextMenu.svelte"),
      join(SHARED, "contextmenu-guard.ts"),
      join(SHARED, "clipboard-text.ts"),
      join(ROUTES, "context-menu-wiring.svelte.ts"),
      join(ROUTES, "_components", "ContextMenuHost.svelte"),
    ];
    expect(planned.filter((f) => !existsSync(f)).map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});

describe("import boundary (§3.9.12 (1)(2)(3)(5))", () => {
  it("(1) features/context-menu imports no other feature, no $app/, no @tauri-apps/ (svelte files included)", () => {
    const files = productionFiles(CM);
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of files) {
      for (const s of specifiers(read(f))) {
        if (/^\$lib\/features\/(?!context-menu\b)/.test(s) || /^\$app\//.test(s) || /^@tauri-apps\//.test(s)) {
          bad.push(`${f.slice(SRC.length + 1)} -> ${s}`);
        }
        // relative escape out of the directory into another feature
        if (s.startsWith("..")) bad.push(`${f.slice(SRC.length + 1)} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("(1b) features/context-menu never imports routes/", () => {
    const bad: string[] = [];
    for (const f of productionFiles(CM)) {
      for (const s of specifiers(read(f))) if (/routes\//.test(s)) bad.push(`${f} -> ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("(2) the pure modules (incl. menu-events.ts) import no .svelte and never reference document / window / navigator", () => {
    const bad: string[] = [];
    for (const name of PURE_MODULES) {
      const file = join(CM, name);
      if (!existsSync(file)) {
        bad.push(`${name}: missing`);
        continue;
      }
      const code = stripComments(read(file));
      if (specifiers(read(file)).some((s) => /\.svelte(\.ts)?$/.test(s) && !/menu-state/.test(s))) bad.push(`${name}: imports a .svelte file`);
      if (/\b(document|window|navigator|globalThis)\b/.test(code)) bad.push(`${name}: touches a DOM / global`);
    }
    expect(bad).toEqual([]);
  });

  it("(3) shared/contextmenu-guard.ts and shared/clipboard-text.ts never import features/ (nor routes/, nor Tauri)", () => {
    const bad: string[] = [];
    for (const name of ["contextmenu-guard.ts", "clipboard-text.ts"]) {
      const file = join(SHARED, name);
      if (!existsSync(file)) {
        bad.push(`${name}: missing`);
        continue;
      }
      for (const s of specifiers(read(file))) {
        if (/features\//.test(s) || /routes\//.test(s) || /^@tauri-apps\//.test(s)) bad.push(`${name} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("(5) features/file-list does not import features/context-menu, and the reverse", () => {
    const bad: string[] = [];
    for (const f of productionFiles(join(SRC, "lib", "features", "file-list"))) {
      for (const s of specifiers(read(f))) if (/context-menu/.test(s)) bad.push(`${f} -> ${s}`);
    }
    expect(bad).toEqual([]);
    for (const f of productionFiles(CM)) {
      for (const s of specifiers(read(f))) if (/features\/file-list/.test(s)) bad.push(`${f} -> ${s}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("(4) routes/+layout.svelte: the global guard (R-1012, R-1013, §3.9.9)", () => {
  const layout = join(ROUTES, "+layout.svelte");

  it("imports shared/contextmenu-guard (it wraps the main window AND the viewer)", () => {
    expect(specifiers(read(layout)).some((s) => /shared\/contextmenu-guard$/.test(s))).toBe(true);
  });

  it("calls attachContextMenuGuard", () => {
    expect(stripComments(read(layout))).toMatch(/attachContextMenuGuard\s*\(/);
  });

  it("does not import app.css (R-913)", () => {
    expect(specifiers(read(layout)).some((s) => /app\.css$/.test(s))).toBe(false);
  });
});

describe("Svelte files: size and colours (§3.9.11, R-1071, R-1074)", () => {
  const files = [join(CM, "ContextMenu.svelte"), join(ROUTES, "_components", "ContextMenuHost.svelte")];
  const lines = (f: string) => {
    const l = read(f).split(/\r?\n/);
    if (l[l.length - 1] === "") l.pop();
    return l.length;
  };

  it("ContextMenu.svelte / ContextMenuHost.svelte exist and are at most 400 lines", () => {
    for (const f of files) {
      expect(existsSync(f), f).toBe(true);
      expect(lines(f), f).toBeLessThanOrEqual(400);
    }
  });

  it("no colour literals (hex / rgb() / hsl()); colours only through var(--ui-*)", () => {
    for (const f of files) {
      const code = stripComments(read(f));
      expect(code, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code, f).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
    }
  });

  it("ContextMenu.svelte uses the reserved variables and has no border radius (R-1071, R-1072)", () => {
    const f = join(CM, "ContextMenu.svelte");
    expect(existsSync(f)).toBe(true);
    const code = read(f);
    for (const v of ["--ui-surface", "--ui-border-strong", "--ui-shadow-2", "--ui-muted-2", "--ui-muted", "--ui-hover", "--ui-border"]) {
      expect(code, v).toContain(`var(${v})`);
    }
    expect(code).not.toMatch(/border-radius/);
  });

  it("the menu carries the accessibility attributes (R-1085, R-1111, R-1112)", () => {
    const f = join(CM, "ContextMenu.svelte");
    expect(existsSync(f)).toBe(true);
    const code = read(f);
    for (const needle of ['role="menu"', 'role="menuitem"', 'role="separator"', "aria-disabled", "aria-describedby", "aria-activedescendant", 'aria-label="右クリックメニュー"', 'lang="ja"']) {
      expect(code, needle).toContain(needle);
    }
  });
});

describe("AC-1026 / R-1110: no item, code or string for the excluded features", () => {
  // Assembled at run time so this file does not contain the words itself.
  const WORDS = [
    ["親フォル", "ダ"].join(""),
    ["外部ア", "プリ"].join(""),
    ["複", "製"].join(""),
    ["日付", "接頭辞"].join(""),
    ["プロ", "パティ"].join(""),
    ["完全", "削除"].join(""),
    ["perm", "anent"].join(""),
    ["dupl", "icate"].join(""),
    ["prop", "erties"].join(""),
    ["open_", "parent"].join(""),
    ["reveal_in", "_explorer"].join(""),
  ];

  it("the feature's production sources (comments excluded) contain none of the excluded words", () => {
    const files = productionFiles(CM);
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const code = stripComments(read(f));
      for (const w of WORDS) if (code.includes(w)) hits.push(`${f.slice(SRC.length + 1)}: ${w}`);
    }
    expect(hits).toEqual([]);
  });
});
