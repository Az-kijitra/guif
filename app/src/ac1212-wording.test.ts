/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parse } from "svelte/compiler";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// [単体 / リポジトリ走査] Spec: SPEC-0300-0019 AC-1212 (forbidden English / old Japanese wording in the string
//   literals of the production code), R-1200 / R-1201 / R-1205 / R-1220 / R-1202 (`<html lang="ja">`, AC-1200 static part).
// Architecture: SPEC-0200-0001 §3.13.5 (the extraction by AST: `typescript` for .ts, `svelte/compiler` `parse(..,
//   { modern: true })` for .svelte; the matching rules), §3.13.14 H-3 / SHOULD-193 / SHOULD-194 (the added
//   "no Japanese literal outside messages.ts" rule, the scope of the exact-match rule, the attribute handling, the
//   skipped directories, the lower bounds of the scan). Stage B: the real-tree tests are RED until stage C replaces the
//   wording; the self-checks and the scan-size guards are green from stage A.
//
// Matching rules (case-sensitive):
//   R-EN-exact    value (trimmed) equals one of EN_EXACT. Scope: every `messages.ts` literal, and every `.svelte`
//                 markup text / aria-label|title|placeholder value / markup expression literal / `<script>` literal.
//                 EN_EXACT_PHRASES (multi-word or symbol-bearing, so they cannot collide with key names) also apply to
//                 the whole production `.ts` set (SHOULD-193). A static value of another attribute (class, role, type..)
//                 is NOT an exact-match target (SHOULD-194 (a)).
//   R-EN-prefix   value (leading blanks trimmed) starts with one of EN_PREFIXES. Scope: every extracted literal.
//   R-JA-part     value contains one of JA_PARTS, or matches BARE_FOLDER. Scope: every extracted literal.
//   R-CJK-outside value contains hiragana / katakana / kanji / full-width signs. Scope: every extracted literal of a
//                 production file that is NOT a `messages.ts` (H-3: the wording lives only in the messages modules).
// Scanned: `app/src` `*.ts` (not `*.test.ts`, not `*.d.ts`) and `*.svelte`; `node_modules` and `.svelte-kit` are skipped
//   at any depth. Comments and `<style>` are never read (the AST has no string literal for them). Not scanned: tests,
//   `app/e2e`, Rust.

const SRC = resolve(__dirname);

// ---------------------------------------------------------------------------------------------------------------
// The rule data (SPEC-0300-0019 AC-1212)

const EN_EXACT = [
  "Search", "Apply", "Clear", "Name", "Size", "Type", "Modified", "Current directory", "Visit history", "Jump list",
  "Collapse", "Expand", "Loading…", "No items", "No file selected", "OK",
];
const EN_EXACT_PHRASES = ["Current directory", "Visit history", "Jump list", "Loading…", "No items", "No file selected"];
const EN_PREFIXES = [
  "Remove ", "Error: ", "config.toml could not be read", "Ignored ", "Could not understand ui_theme",
  "Some folders could not be listed.", "Display settings were corrupted", "Navigation data was corrupted",
  "Failed to save navigation data.", "Failed to load data.", "Using the default keymap",
];
const JA_PARTS = [
  "カット", "ペースト", "解凍", "ZIPを作成", "ZIPの作成", "訪問履歴", "ゴミ箱", "名前変更", "リネーム", "ディレクトリ",
  "ソートメニュー", "並べ替え", "作成中", "...",
];
// `フォルダ` not followed by `ー` (`フォルダー` is the correct spelling).
const BARE_FOLDER = /フォルダ(?!ー)/;
// Hiragana, katakana (and the prolonged-sound mark), CJK ideographs, full-width forms. (U+3000-30FF, 3400-9FFF, FF00-FFEF)
const CJK = /[　-ヿ㐀-鿿＀-￯]/;
// Legitimate Japanese literals outside messages.ts, each with a reason (H-3). Empty on purpose: the wording lives in
// the messages modules; add an entry only for a literal that is data, not wording.
const CJK_ALLOWED: { file: string; text: string; reason: string }[] = [];

const ATTRS_FOR_EXACT = new Set(["aria-label", "title", "placeholder"]);

// ---------------------------------------------------------------------------------------------------------------
// Extraction

type Origin = "ts" | "markup-text" | "markup-expr" | "attr-static" | "attr-expr" | "script";
interface Lit {
  text: string;
  origin: Origin;
  attr?: string;
}

function extractTs(source: string): Lit[] {
  const sf = ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: Lit[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push({ text: node.text, origin: "ts" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const SKIP_KEYS = new Set(["loc", "start", "end", "name_loc", "leadingComments", "trailingComments", "metadata", "parent"]);

// Walks a Svelte modern AST (markup, attribute values, expressions, `<script>`); never enters `css` or comments.
function visitSvelte(node: unknown, ctx: { script: boolean; attr?: string }, out: Lit[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) visitSvelte(child, ctx, out);
    return;
  }
  const n = node as Record<string, unknown> & { type?: string };
  switch (n.type) {
    case "Comment":
      return;
    case "Text":
      if (typeof n.data === "string") out.push({ text: n.data, origin: "markup-text" });
      return;
    case "Literal":
      if (typeof n.value === "string") {
        out.push({ text: n.value, origin: ctx.script ? "script" : ctx.attr ? "attr-expr" : "markup-expr", attr: ctx.attr });
      }
      return;
    case "TemplateElement": {
      const cooked = (n.value as { cooked?: string | null } | undefined)?.cooked;
      if (typeof cooked === "string") {
        out.push({ text: cooked, origin: ctx.script ? "script" : ctx.attr ? "attr-expr" : "markup-expr", attr: ctx.attr });
      }
      return;
    }
    case "Attribute": {
      const name = String(n.name);
      const value = n.value;
      if (value === true) return;
      const parts = Array.isArray(value) ? value : [value];
      for (const part of parts) {
        if (part && typeof part === "object" && (part as { type?: string }).type === "Text") {
          out.push({ text: String((part as { data?: string }).data ?? ""), origin: "attr-static", attr: name });
        } else {
          visitSvelte(part, { script: false, attr: name }, out);
        }
      }
      return;
    }
    default:
      break;
  }
  for (const [key, child] of Object.entries(n)) {
    if (SKIP_KEYS.has(key) || key === "css") continue;
    if (child !== null && typeof child === "object") visitSvelte(child, ctx, out);
  }
}

function extractSvelte(source: string): Lit[] {
  const ast = parse(source, { modern: true }) as unknown as Record<string, unknown>;
  const out: Lit[] = [];
  visitSvelte(ast.fragment, { script: false }, out);
  const instance = ast.instance as { content?: unknown } | null | undefined;
  const moduleScript = ast.module as { content?: unknown } | null | undefined;
  if (instance?.content) visitSvelte(instance.content, { script: true }, out);
  if (moduleScript?.content) visitSvelte(moduleScript.content, { script: true }, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The rules

type Rule = "EN-exact" | "EN-prefix" | "JA-part" | "CJK-outside";
interface Violation {
  rule: Rule;
  text: string;
}

function exactTarget(kind: "ts" | "svelte", isMessages: boolean, lit: Lit): { all: boolean; phrases: boolean } {
  if (kind === "ts") return { all: isMessages, phrases: true };
  if (lit.origin === "attr-static") return { all: ATTRS_FOR_EXACT.has(lit.attr ?? ""), phrases: ATTRS_FOR_EXACT.has(lit.attr ?? "") };
  return { all: true, phrases: true };
}

function checkLits(kind: "ts" | "svelte", isMessages: boolean, lits: Lit[], relPath = ""): Violation[] {
  const found: Violation[] = [];
  for (const lit of lits) {
    const trimmed = lit.text.trim();
    const target = exactTarget(kind, isMessages, lit);
    if (target.all && EN_EXACT.includes(trimmed)) found.push({ rule: "EN-exact", text: lit.text });
    else if (target.phrases && EN_EXACT_PHRASES.includes(trimmed)) found.push({ rule: "EN-exact", text: lit.text });
    const head = lit.text.replace(/^\s+/, "");
    if (EN_PREFIXES.some((p) => head.startsWith(p))) found.push({ rule: "EN-prefix", text: lit.text });
    if (JA_PARTS.some((p) => lit.text.includes(p)) || BARE_FOLDER.test(lit.text)) found.push({ rule: "JA-part", text: lit.text });
    if (!isMessages && CJK.test(lit.text) && !CJK_ALLOWED.some((a) => a.file === relPath && a.text === lit.text)) {
      found.push({ rule: "CJK-outside", text: lit.text });
    }
  }
  return found;
}

function checkSource(kind: "ts" | "svelte", isMessages: boolean, source: string, relPath = ""): Violation[] {
  return checkLits(kind, isMessages, kind === "ts" ? extractTs(source) : extractSvelte(source), relPath);
}

// ---------------------------------------------------------------------------------------------------------------
// The scanned tree

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".svelte-kit") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

interface Prod {
  rel: string;
  kind: "ts" | "svelte";
  isMessages: boolean;
  source: string;
}

function productionFiles(): Prod[] {
  const files: Prod[] = [];
  for (const full of walk(SRC)) {
    const rel = relative(SRC, full).split(sep).join("/");
    const isSvelte = /\.svelte$/.test(rel);
    const isTs = /\.ts$/.test(rel) && !/\.test\.ts$/.test(rel) && !/\.d\.ts$/.test(rel);
    if (!isSvelte && !isTs) continue;
    files.push({ rel, kind: isSvelte ? "svelte" : "ts", isMessages: /(^|\/)messages\.ts$/.test(rel), source: readFileSync(full, "utf-8") });
  }
  return files;
}

const PROD = productionFiles();

function scan(rule: Rule): string[] {
  const out: string[] = [];
  for (const f of PROD) {
    for (const v of checkSource(f.kind, f.isMessages, f.source, f.rel)) {
      if (v.rule === rule) out.push(`${f.rel}: ${JSON.stringify(v.text)}`);
    }
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------------------------

describe("AC-1212: the real production tree", () => {
  it("R-EN-exact: no old English wording as a whole value (messages.ts literals, .svelte markup / attributes / script; the multi-word phrases in every .ts)", () => {
    expect(scan("EN-exact")).toEqual([]);
  });

  it("R-EN-prefix: no old English sentence (Remove / Error: / the old startup notices) starts any literal", () => {
    expect(scan("EN-prefix")).toEqual([]);
  });

  it("R-JA-part: no old Japanese term (カット, ペースト, 解凍, ZIPを作成, 訪問履歴, ゴミ箱, ..., bare フォルダ) in any literal", () => {
    expect(scan("JA-part")).toEqual([]);
  });

  it("R-CJK-outside (H-3): no Japanese string literal outside a messages.ts (the wording is collected, R-1201)", () => {
    expect(scan("CJK-outside")).toEqual([]);
  });
});

describe("AC-1200 (static part): app.html", () => {
  const html = readFileSync(join(SRC, "app.html"), "utf-8");

  it('has `<html lang="ja">`', () => {
    expect(html).toMatch(/<html[^>]*\blang="ja"/);
  });

  it('has no `lang="en"` anywhere (T-14: no per-element language marks either)', () => {
    expect(html).not.toMatch(/lang="en"/);
  });
});

describe("scan-size guards (SHOULD-194 (c): an empty scan must not pass)", () => {
  // PHASE 13 UPDATE (SPEC-0200-0001 §3.14.12-1 / MUST-129): features/menu-bar/messages.ts is added -> 12 (shared 1 + feature 10 + routes 1).
  // EXTERNAL-APPS UPDATE (SPEC-0300-0021 / SPEC-0200-0001 §3.16.6, §3.16.14): features/external-apps/messages.ts is added -> 13 (shared 1 + feature 11 + routes 1).
  // SETTINGS-FILE UPDATE (SPEC-0300-0022 / SPEC-0200-0001 §3.17.1, §3.17.8): features/settings-file/messages.ts is added -> 14 (shared 1 + feature 12 + routes 1).
  // APPEARANCE UPDATE (SPEC-0300-0023 / SPEC-0200-0001 §3.18.4): features/appearance/messages.ts is added -> 15 (shared 1 + feature 13 + routes 1).
  it("finds exactly 15 messages.ts (shared 1 + feature 13 + routes 1)", () => {
    expect(PROD.filter((f) => f.isMessages).map((f) => f.rel).sort()).toEqual([
      "lib/features/appearance/messages.ts",
      "lib/features/archive/messages.ts",
      "lib/features/context-menu/messages.ts",
      "lib/features/external-apps/messages.ts",
      "lib/features/file-list/messages.ts",
      "lib/features/file-ops/messages.ts",
      "lib/features/keyboard/messages.ts",
      "lib/features/menu-bar/messages.ts",
      "lib/features/navigation-history/messages.ts",
      "lib/features/path-bar/messages.ts",
      "lib/features/search/messages.ts",
      "lib/features/settings-file/messages.ts",
      "lib/features/viewer/messages.ts",
      "lib/shared/messages.ts",
      "routes/messages.ts",
    ]);
  });

  it("scans at least 15 .svelte files and many .ts files, none from node_modules / .svelte-kit, none a test or .d.ts", () => {
    expect(PROD.filter((f) => f.kind === "svelte").length).toBeGreaterThanOrEqual(15);
    expect(PROD.filter((f) => f.kind === "ts").length).toBeGreaterThan(50);
    for (const f of PROD) {
      expect(f.rel).not.toMatch(/node_modules|\.svelte-kit|\.test\.ts$|\.d\.ts$/);
    }
  });

  it("every .svelte file parses with svelte/compiler (modern AST) and the messages.ts files yield literals", () => {
    for (const f of PROD.filter((p) => p.kind === "svelte")) expect(() => extractSvelte(f.source), f.rel).not.toThrow();
    for (const f of PROD.filter((p) => p.isMessages)) expect(extractTs(f.source).length, f.rel).toBeGreaterThan(0);
  });

  it("the walk skips node_modules and .svelte-kit directories at any depth (SHOULD-194 (b))", () => {
    const rels = walk(SRC).map((f) => relative(SRC, f).split(sep).join("/"));
    expect(rels.filter((r) => /(^|\/)(node_modules|\.svelte-kit)(\/|$)/.test(r))).toEqual([]);
  });
});

describe("scanner self-check (the rules work on synthetic fragments)", () => {
  const rulesOf = (vs: Violation[]) => vs.map((v) => v.rule).sort();

  it("a forbidden word inside a comment is not picked up (.ts and .svelte)", () => {
    expect(checkSource("ts", false, '// カット Search Remove \n/* ペースト No items */ const a = 1;')).toEqual([]);
    expect(checkSource("svelte", false, "<!-- Search カット -->\n<p>x</p>")).toEqual([]);
    expect(checkSource("svelte", false, "<style>.a::after { content: 'Search カット'; }</style><p>x</p>")).toEqual([]);
  });

  it("a template literal: the static head `Remove ` is seen (.ts) and in an attribute expression (.svelte)", () => {
    expect(rulesOf(checkSource("ts", false, "const t = `Remove ${path}`;"))).toEqual(["EN-prefix"]);
    expect(rulesOf(checkSource("svelte", false, "<button aria-label={`Remove ${path}`}>x</button>"))).toEqual(["EN-prefix"]);
  });

  it("an expression in markup: `{row.expanded ? \"Collapse\" : \"Expand\"}` gives two exact hits", () => {
    expect(rulesOf(checkSource("svelte", false, '<span>{row.expanded ? "Collapse" : "Expand"}</span>'))).toEqual(["EN-exact", "EN-exact"]);
    expect(rulesOf(checkSource("svelte", false, '<span aria-label={a ? "Collapse" : "Expand"}>x</span>'))).toEqual(["EN-exact", "EN-exact"]);
    expect(rulesOf(checkSource("svelte", false, '{#if ok}<b>{x ? "Loading…" : y}</b>{/if}'))).toEqual(["EN-exact"]);
  });

  it("a text node starting with `Error: ` (`<p>Error: {error}</p>`) is a prefix hit", () => {
    expect(rulesOf(checkSource("svelte", false, "<p>Error: {error}</p>"))).toEqual(["EN-prefix"]);
  });

  it("`フォルダ` is a hit, `フォルダー` is not", () => {
    expect(rulesOf(checkSource("ts", true, 'const a = "フォルダ";'))).toEqual(["JA-part"]);
    expect(rulesOf(checkSource("ts", true, 'const a = "新しいフォルダ";'))).toEqual(["JA-part"]);
    expect(checkSource("ts", true, 'const a = "フォルダー";')).toEqual([]);
    expect(checkSource("ts", true, 'const a = "フォルダーには使えません";')).toEqual([]);
  });

  it("the old Japanese terms are hits in a messages.ts too (部分一致 applies everywhere)", () => {
    for (const word of ["カット", "ペースト", "ZIPを解凍", "ZIPを作成", "ZIPの作成", "訪問履歴", "ゴミ箱", "ソートメニュー", "作成中 x"]) {
      expect(rulesOf(checkSource("ts", true, `const a = ${JSON.stringify(word)};`)), word).toContain("JA-part");
    }
    expect(rulesOf(checkSource("ts", true, 'const a = "新規作成...";'))).toEqual(["JA-part"]);
  });

  it("the spread syntax `{...props}` / `...args` is not a `...` literal", () => {
    expect(checkSource("svelte", false, "<div {...props}>x</div>")).toEqual([]);
    expect(checkSource("ts", false, "function f(...args: number[]) { return [...args]; }")).toEqual([]);
  });

  it("attributes (SHOULD-194 (a)): class / type / role static values are not exact-match targets; aria-label / title / placeholder are", () => {
    expect(checkSource("svelte", true, '<input class="Search" type="Name" role="Size" aria-label="x">')).toEqual([]);
    expect(rulesOf(checkSource("svelte", false, '<button aria-label="Search">x</button>'))).toEqual(["EN-exact"]);
    expect(rulesOf(checkSource("svelte", false, '<button title="Apply">x</button>'))).toEqual(["EN-exact"]);
    expect(rulesOf(checkSource("svelte", false, '<input placeholder="Name">'))).toEqual(["EN-exact"]);
  });

  it("R-CJK-outside takes every attribute, but never a messages.ts", () => {
    expect(rulesOf(checkSource("svelte", false, '<div class="ラベル">x</div>'))).toEqual(["CJK-outside"]);
    expect(rulesOf(checkSource("svelte", false, '<div aria-label="右クリックメニュー">x</div>'))).toEqual(["CJK-outside"]);
    expect(rulesOf(checkSource("ts", false, 'const a = "保存";'))).toEqual(["CJK-outside"]);
    expect(checkSource("ts", true, 'export const A = "保存";')).toEqual([]);
    expect(rulesOf(checkSource("svelte", false, "<p>保存</p>"))).toEqual(["CJK-outside"]);
  });

  it("R-CJK-outside ignores the fixed display symbols (R-1203): × ✕ … ◀ ▶ ↑ ↓", () => {
    expect(checkSource("svelte", false, "<button>×</button><button>✕</button><span>◀ Prev</span><span>Next ▶</span><i>…</i><b>↑</b><b>↓</b>")).toEqual([]);
  });

  it("<script> literals count (SortMenu's old `LABELS`): `const LABELS = { name: \"Name\" }` is an exact hit in a .svelte", () => {
    const src = '<script lang="ts">\n  const LABELS = { name: "Name", size: "Size" };\n</script>\n<p>x</p>';
    expect(rulesOf(checkSource("svelte", false, src))).toEqual(["EN-exact", "EN-exact"]);
  });

  it("one-word exact values are not checked in a non-messages .ts (a key name such as `Clear` is legitimate), but the phrases are", () => {
    expect(checkSource("ts", false, 'const k = "Clear"; const s = "Search"; const t = "Name";')).toEqual([]);
    expect(rulesOf(checkSource("ts", false, 'const k = "No items";'))).toEqual(["EN-exact"]);
    expect(rulesOf(checkSource("ts", false, 'const k = "Loading…";'))).toEqual(["EN-exact"]);
    expect(rulesOf(checkSource("ts", true, 'export const A = "Clear";'))).toEqual(["EN-exact"]);
    expect(rulesOf(checkSource("ts", true, 'export const A = "OK";'))).toEqual(["EN-exact"]);
  });

  it("an exact value is compared whole (trimmed), a longer sentence containing the word is fine; prefixes are not whole-value", () => {
    expect(checkSource("ts", true, 'export const A = "Searching";')).toEqual([]);
    expect(checkSource("ts", true, 'export const A = "Search results";')).toEqual([]);
    expect(rulesOf(checkSource("ts", true, 'export const A = " Search ";'))).toEqual(["EN-exact"]);
    expect(rulesOf(checkSource("ts", true, 'export const A = "Error: boom";'))).toEqual(["EN-prefix"]);
    expect(rulesOf(checkSource("ts", true, 'export const A = "Ignored 1 invalid keymap override(s)";'))).toEqual(["EN-prefix"]);
    expect(rulesOf(checkSource("ts", true, 'export const A = "config.toml could not be read: x";'))).toEqual(["EN-prefix"]);
  });

  it("the old startup notices are prefix hits", () => {
    for (const s of [
      "Could not understand ui_theme in config.toml",
      "Some folders could not be listed.",
      "Display settings were corrupted and have been reset.",
      "Navigation data was corrupted",
      "Failed to save navigation data.",
      "Failed to load data. Changes will not be saved this session.",
      "Using the default keymap.",
    ]) {
      expect(rulesOf(checkSource("ts", true, `export const A = ${JSON.stringify(s)};`)), s).toEqual(["EN-prefix"]);
    }
  });
});
