/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// [静的 / 単体] Spec: SPEC-0300-0021 AC-1506 + R-1585 (EVERY E2E and every CDP operation on the real app starts the app with `REFLEXFILES_CONFIG_DIR` and the E2E
//   scope, and EVERY `config.toml` it writes declares `external_apps` -- the test executable only, or `[]` -- because without it the default four are active and a
//   key press could start the USER's apps; no `explorer.exe` / `wt.exe` / `Code.exe` / `GitHubDesktop.exe` is ever registered; the ONE exception, decided 2026-10-17
//   (design question Q-3): a deliberately broken `config.toml` (current `theme.mjs` S8), guarded by (i) the page-side block of `external_app_launch`, (ii) the backend
//   scope check R-1584, (iii) THIS allow-list), R-1585 2 (the exception is listed here and nowhere else), SPEC-0400-0001 第6版 R-08-1.
// Architecture: SPEC-0200-0001 §3.16.10 (`lib/launch.mjs`: `DEFAULT_CONFIG_TOML = 'ui_theme = "light"\nexternal_apps = []\n'`, `assertExternalAppsDeclared(configToml)` is run
//   right before `config.toml` is written and aborts with `AbortRun`; `configToml: null` is NOT allowed; `lib/context.mjs`: `BLOCKED_COMMANDS` gains `external_app_launch`),
//   §3.16.15 MUST-143 (a) (ONE placement rule shared by the harness check and this test: there is a `[[external_apps]]` heading, OR an `external_apps =` line BEFORE the first
//   table header -- a line written after `[input_keymap_custom]` belongs to that table; the rule has a self-check with rejected examples; S9 is NOT in the allow-list, the allow-list
//   is S8 only), SHOULD-217 (c) (`attachApp` checks the kept folder's `config.toml` with the same rule before it connects).
//
// How the E2E tree is read: every `*.mjs` under `app/e2e/` is parsed (TypeScript's parser, JS mode). A "config literal" is the value of an object property named `configToml`
//   (a string, a template, an identifier of a top-level const, a concatenation, or a function returning one of those) or the initialiser of `DEFAULT_CONFIG_TOML`;
//   `${...}` that names a top-level const is inlined, `${externalAppsToml(...)}` counts as a `[[external_apps]]` heading, any other `${...}` is an unknown piece.
//
// Contract assumed (reported to the test-automation-engineer):
//   lib/launch.mjs exports:  DEFAULT_CONFIG_TOML (declares external_apps),  assertExternalAppsDeclared(configToml: string | null | undefined): void   // throws AbortRun
//   lib/probe.mjs (new) may export  externalAppsToml(apps): string    // used inside template literals; counted as a `[[external_apps]]` heading by this test
//   lib/context.mjs: the BLOCKED_COMMANDS array contains "external_app_launch".

const APP = resolve(__dirname, "..");
const E2E = join(APP, "e2e");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, out);
    } else if (name.endsWith(".mjs")) out.push(full);
  }
  return out;
}
const FILES = walk(E2E).sort();
const rel = (f: string): string => relative(E2E, f).split(sep).join("/");
const read = (f: string): string => readFileSync(f, "utf-8");

// ----------------------------------------------------------------------------------------------- the placement rule (MUST-143 (a))

const UNKNOWN = "\u0000";

/** `[[external_apps]]` heading anywhere, or an `external_apps =` line before the first table header / unknown piece at a line start. */
function declaresExternalApps(toml: string): boolean {
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[\[\s*external_apps\s*\]\]/.test(line)) return true;
    if (/^\[/.test(line)) return false; // the first table header (or an array-of-tables of another name): later lines belong to it
    if (/^external_apps\s*=/.test(line)) return true;
    if (line.startsWith(UNKNOWN)) return false; // an unknown piece at the start of a line may be a table header
  }
  return false;
}

describe("the placement rule: self-check (it must reject what it claims to reject)", () => {
  const OK: [string, string][] = [
    ["empty list", 'ui_theme = "light"\nexternal_apps = []\n'],
    ["no spaces", 'external_apps=[]\nui_theme = "light"\n'],
    ["indented", '  external_apps = []\n'],
    ["a registration", 'ui_theme = "light"\n[[external_apps]]\nname = "probe"\nprogram = \'C:\\t\\probe.exe\'\n'],
    ["before an inline-table keymap line", 'ui_theme = "light"\nexternal_apps = []\ninput_keymap_custom = { copy = "F9" }\n'],
    ["before a keymap table", 'ui_theme = "light"\nexternal_apps = []\n\n[input_keymap_custom]\ncopy = "F9"\n'],
    ["CRLF", 'ui_theme = "light"\r\nexternal_apps = []\r\n'],
    ["an unknown piece only AFTER the declaration", `ui_theme = "light"\nexternal_apps = []\n${UNKNOWN}\n`],
  ];
  const NG: [string, string][] = [
    ["nothing", ""],
    ["no external_apps", 'ui_theme = "light"\n'],
    ["after a table header (it becomes a key of that table)", 'ui_theme = "light"\n[input_keymap_custom]\nexternal_apps = []\n'],
    ["after an array-of-tables header of another name", 'ui_theme = "light"\n[[other]]\nexternal_apps = []\n'],
    ["only a comment", 'ui_theme = "light"\n# external_apps = []\n'],
    ["only inside a string value", 'x = "external_apps = []"\n'],
    ["a single table named like it", '[external_apps]\nname = "x"\n'],
    ["a longer key", 'external_apps_extra = []\n'],
    ["an unknown piece at a line start before the declaration", `ui_theme = "light"\n${UNKNOWN}\nexternal_apps = []\n`],
    ["a similarly named header", '[[external_apps_old]]\nname = "x"\n'],
  ];
  it.each(OK)("accepts: %s", (_t, toml) => {
    expect(declaresExternalApps(toml)).toBe(true);
  });
  it.each(NG)("rejects: %s", (_t, toml) => {
    expect(declaresExternalApps(toml)).toBe(false);
  });
});

// ----------------------------------------------------------------------------------------------- reading the E2E tree

const HELPERS = new Set(["externalAppsToml"]);

interface Config {
  file: string;
  /** where it was found: `configToml` of the scenario `id`, or DEFAULT_CONFIG_TOML */
  what: string;
  scenarioId: string | null;
  /** null = could not be analysed */
  text: string | null;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

function topLevelConsts(sf: ts.SourceFile): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer !== undefined) map.set(d.name.text, d.initializer);
  }
  return map;
}

function evalText(node: ts.Expression, consts: Map<string, ts.Expression>, depth = 0): string | null {
  if (depth > 8) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return evalText(node.expression, consts, depth + 1);
  if (ts.isIdentifier(node)) {
    const target = consts.get(node.text);
    return target === undefined ? null : evalText(target, consts, depth + 1);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = evalText(node.left, consts, depth + 1);
    const b = evalText(node.right, consts, depth + 1);
    return a === null || b === null ? null : a + b;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && HELPERS.has(node.expression.text)) return "[[external_apps]]\n";
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const e = span.expression;
      let piece: string | null = null;
      if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && HELPERS.has(e.expression.text)) piece = "[[external_apps]]\n";
      else if (ts.isIdentifier(e) && consts.has(e.text)) piece = evalText(e, consts, depth + 1);
      text += (piece ?? UNKNOWN) + span.literal.text;
    }
    return text;
  }
  return null;
}

/** The text(s) a `configToml` initialiser can produce; `null` entries could not be analysed. */
function configTexts(init: ts.Expression, consts: Map<string, ts.Expression>): (string | null)[] {
  if (init.kind === ts.SyntaxKind.NullKeyword) return ["<null>"];
  if (ts.isIdentifier(init) && (init.text === "undefined" || init.text === "configToml")) return []; // "use the default" / forwarding a parameter
  if (ts.isPropertyAccessExpression(init) && init.name.text === "configToml") return []; // run.mjs forwards `scenario.configToml`: checked where it is defined
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
    if (!ts.isBlock(init.body)) return configTexts(init.body, consts);
    const out: (string | null)[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && n.expression !== undefined) out.push(...configTexts(n.expression, consts));
      if (!ts.isFunctionLike(n) || n === init) ts.forEachChild(n, visit);
    };
    visit(init.body);
    return out.length > 0 ? out : [null];
  }
  if (ts.isConditionalExpression(init)) return [...configTexts(init.whenTrue, consts), ...configTexts(init.whenFalse, consts)];
  return [evalText(init, consts)];
}

function collectConfigs(): Config[] {
  const out: Config[] = [];
  for (const file of FILES) {
    const sf = parse(file);
    const consts = topLevelConsts(sf);
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "DEFAULT_CONFIG_TOML" && node.initializer !== undefined) {
        for (const text of configTexts(node.initializer, consts)) out.push({ file: rel(file), what: "DEFAULT_CONFIG_TOML", scenarioId: null, text });
      }
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "configToml") {
        let id: string | null = null;
        const owner = node.parent;
        if (ts.isObjectLiteralExpression(owner)) {
          for (const p of owner.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "id" && ts.isStringLiteral(p.initializer)) id = p.initializer.text;
          }
        }
        for (const text of configTexts(node.initializer, consts)) out.push({ file: rel(file), what: `configToml (${id ?? "no id"})`, scenarioId: id, text });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

// The exceptions (SPEC-0300-0021 R-1585 2 note, SPEC-0400-0001 R-08-1 1 note, decision 2026-10-17): a deliberately broken config.toml (theme.mjs S8); and,
// since SPEC-0300-0022 R-1682 / AC-1680, the one E2E that starts WITHOUT a config.toml (AC-1645, settings-file.mjs F0: `configToml: null`). Nothing else.
// The same list is `UNDECLARED_EXTERNAL_APPS_SCENARIOS` in lib/launch.mjs (checked below).
const ALLOW_LIST: readonly { file: string; scenarioId: string }[] = [
  { file: "specs/theme.mjs", scenarioId: "S8" },
  { file: "specs/settings-file.mjs", scenarioId: "F0" },
];
const isAllowed = (c: Config): boolean => ALLOW_LIST.some((a) => a.file === c.file && a.scenarioId === c.scenarioId);

describe("AC-1506: the scan sees the E2E tree (an empty scan must not pass)", () => {
  it("finds the harness, the runner and the spec files", () => {
    const names = FILES.map(rel);
    for (const must of ["run.mjs", "lib/launch.mjs", "lib/context.mjs", "specs/theme.mjs", "specs/menubar-keymap.mjs", "specs/contextmenu.mjs"]) expect(names, must).toContain(must);
    expect(FILES.length).toBeGreaterThanOrEqual(25);
  });

  it("finds DEFAULT_CONFIG_TOML and at least the ten scenario configs of today (theme.mjs S1..S9 + menubar-keymap.mjs)", () => {
    const configs = collectConfigs();
    expect(configs.filter((c) => c.what === "DEFAULT_CONFIG_TOML").length).toBe(1);
    expect(configs.filter((c) => c.what.startsWith("configToml")).length).toBeGreaterThanOrEqual(10);
  });
});

describe("AC-1506: every config.toml the E2E writes declares external_apps (R-1585 2)", () => {
  const configs = collectConfigs();

  it("DEFAULT_CONFIG_TOML is the safe default: ui_theme light and external_apps = []", () => {
    const d = configs.find((c) => c.what === "DEFAULT_CONFIG_TOML")!;
    expect(d.text).not.toBeNull();
    expect(declaresExternalApps(d.text!), `DEFAULT_CONFIG_TOML = ${JSON.stringify(d.text)}`).toBe(true);
    expect(d.text).toContain('ui_theme = "light"');
  });

  it("no scenario asks for 'no config.toml' (`configToml: null`) -- without a file the default four would be active -- except the allow-listed F0 (AC-1645)", () => {
    expect(configs.filter((c) => c.text === "<null>" && !isAllowed(c)).map((c) => `${c.file}: ${c.what}`)).toEqual([]);
  });

  it("every configToml can be analysed and declares external_apps, except the allow-listed one", () => {
    const bad = configs
      .filter((c) => c.text !== "<null>" && !isAllowed(c))
      .filter((c) => c.text === null || !declaresExternalApps(c.text))
      .map((c) => `${c.file}: ${c.what}${c.text === null ? " (cannot be analysed: write the TOML as a literal / a top-level const / externalAppsToml(..))" : ` -> ${JSON.stringify(c.text)}`}`);
    expect(bad).toEqual([]);
  });

  it("the allow-list is exactly S8 of theme.mjs and F0 of settings-file.mjs, and both scenarios really exist (no stale permission)", () => {
    expect(ALLOW_LIST).toEqual([
      { file: "specs/theme.mjs", scenarioId: "S8" },
      { file: "specs/settings-file.mjs", scenarioId: "F0" },
    ]);
    for (const a of ALLOW_LIST) expect(configs.some((c) => c.file === a.file && c.scenarioId === a.scenarioId), `${a.file} ${a.scenarioId}`).toBe(true);
  });

  it("F0 (AC-1645) is the only scenario without a config.toml, and the harness list names the same two ids", async () => {
    expect(configs.filter((c) => c.text === "<null>").map((c) => `${c.file}:${c.scenarioId}`)).toEqual(["specs/settings-file.mjs:F0"]);
    // @ts-ignore -- plain JS module without declarations
    const { UNDECLARED_EXTERNAL_APPS_SCENARIOS } = (await import("../e2e/lib/launch.mjs")) as { UNDECLARED_EXTERNAL_APPS_SCENARIOS: string[] };
    expect([...UNDECLARED_EXTERNAL_APPS_SCENARIOS].sort()).toEqual(ALLOW_LIST.map((a) => a.scenarioId).sort());
  });

  it("S9 (`input_keymap_custom = \"Ctrl+X\"`, which leaves the rest readable) is NOT excused: it declares external_apps like the others", () => {
    const s9 = configs.filter((c) => c.file === "specs/theme.mjs" && c.scenarioId === "S9");
    expect(s9.length).toBe(1);
    expect(s9[0].text).not.toBeNull();
    expect(declaresExternalApps(s9[0].text!)).toBe(true);
  });

  it("S4..S7 (keymap block appended): external_apps sits on the TOP side, before the first table header (MUST-143 (a))", () => {
    for (const id of ["S4", "S5", "S6", "S7"]) {
      const c = configs.find((x) => x.file === "specs/theme.mjs" && x.scenarioId === id);
      expect(c, id).toBeDefined();
      expect(c!.text, id).not.toBeNull();
      expect(declaresExternalApps(c!.text!), `${id}: ${JSON.stringify(c!.text)}`).toBe(true);
    }
  });
});

describe("AC-1506: every start passes the config folder and the E2E scope (R-1585 1)", () => {
  it("the harness spawns the app with REFLEXFILES_CONFIG_DIR and REFLEXFILES_E2E_FS_SCOPE", () => {
    const launch = read(join(E2E, "lib", "launch.mjs"));
    expect(launch).toMatch(/REFLEXFILES_CONFIG_DIR:\s*cfgDir/);
    expect(launch).toMatch(/REFLEXFILES_E2E_FS_SCOPE:\s*scopeRoot/);
  });

  it("every call of launchApp(..) in the tree passes an `fsScope` (the harness refuses to start without a usable scope folder)", () => {
    const calls: string[] = [];
    const bad: string[] = [];
    for (const file of FILES) {
      const sf = parse(file);
      const consts = topLevelConsts(sf);
      const objectFor = (arg: ts.Expression | undefined): ts.ObjectLiteralExpression | null => {
        if (arg === undefined) return null;
        if (ts.isObjectLiteralExpression(arg)) return arg;
        if (ts.isIdentifier(arg)) {
          // a local `const x = { ... }` anywhere in the file
          let found: ts.ObjectLiteralExpression | null = null;
          const visit = (n: ts.Node): void => {
            if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === arg.text && n.initializer !== undefined && ts.isObjectLiteralExpression(n.initializer)) found = n.initializer;
            ts.forEachChild(n, visit);
          };
          visit(sf);
          const resolved = consts.get(arg.text);
          return found ?? (resolved !== undefined && ts.isObjectLiteralExpression(resolved) ? resolved : null);
        }
        return null;
      };
      const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "launchApp") {
          calls.push(rel(file));
          const obj = objectFor(n.arguments[0]);
          const has = obj !== null && obj.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && p.name.text === "fsScope");
          if (!has) bad.push(`${rel(file)}: ${n.getText(sf).slice(0, 80)}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(calls.length).toBeGreaterThanOrEqual(4); // run.mjs x2, keymenu-probe.mjs, perf-viewer.mjs
    expect(bad).toEqual([]);
  });

  it("the page-side stub blocks the launch command (the first of the three guards of the allow-listed scenario)", () => {
    const context = read(join(E2E, "lib", "context.mjs"));
    const m = /const BLOCKED_COMMANDS\s*=\s*\[([\s\S]*?)\]/.exec(context);
    expect(m, "BLOCKED_COMMANDS").not.toBeNull();
    expect(m![1]).toContain('"external_app_launch"');
    expect(m![1], "SPEC-0300-0022 R-1681: the command that opens VS Code / the associated app").toContain('"settings_file_open"');
  });
});

describe("AC-1506: the harness itself refuses a config without external_apps (the same rule, at run time)", () => {
  const launch = read(join(E2E, "lib", "launch.mjs"));

  function body(name: string): string {
    const at = launch.search(new RegExp(`function ${name}\\s*\\(`));
    expect(at, `function ${name}`).toBeGreaterThanOrEqual(0);
    const open = launch.indexOf("{", launch.indexOf(")", at));
    let depth = 0;
    for (let i = open; i < launch.length; i++) {
      if (launch[i] === "{") depth++;
      else if (launch[i] === "}" && --depth === 0) return launch.slice(open, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
  }

  it("assertExternalAppsDeclared exists and is exported", () => {
    expect(launch).toMatch(/export function assertExternalAppsDeclared\s*\(/);
  });

  it("launchApp runs it BEFORE it writes config.toml", () => {
    const b = body("launchApp");
    const check = b.indexOf("assertExternalAppsDeclared(");
    const write = b.indexOf('"config.toml"');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(write);
  });

  it("attachApp checks the kept folder's config.toml with the same function before it connects (SHOULD-217 (c))", () => {
    expect(body("attachApp")).toContain("assertExternalAppsDeclared(");
  });

  it("behaviour: it accepts a declaration, and aborts (AbortRun) for none, a late one, a comment, null and undefined", async () => {
    // @ts-ignore -- plain JS module without declarations
    const mod = (await import("../e2e/lib/launch.mjs")) as {
      assertExternalAppsDeclared: (t: string | null | undefined) => void;
      AbortRun: new (m?: string) => Error;
      DEFAULT_CONFIG_TOML: string;
    };
    const { assertExternalAppsDeclared, AbortRun, DEFAULT_CONFIG_TOML } = mod;
    expect(() => assertExternalAppsDeclared(DEFAULT_CONFIG_TOML)).not.toThrow();
    expect(() => assertExternalAppsDeclared('ui_theme = "light"\nexternal_apps = []\n')).not.toThrow();
    expect(() => assertExternalAppsDeclared('ui_theme = "light"\n[[external_apps]]\nname = "p"\nprogram = \'C:\\t\\p.exe\'\n')).not.toThrow();
    for (const bad of ['ui_theme = "light"\n', '[input_keymap_custom]\nexternal_apps = []\n', '# external_apps = []\n', "", null, undefined]) {
      let thrown: unknown;
      try {
        assertExternalAppsDeclared(bad);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, JSON.stringify(bad)).toBeInstanceOf(AbortRun);
    }
  });

  it("DEFAULT_CONFIG_TOML (imported) is the safe default", async () => {
    // @ts-ignore -- plain JS module without declarations
    const { DEFAULT_CONFIG_TOML } = (await import("../e2e/lib/launch.mjs")) as { DEFAULT_CONFIG_TOML: string };
    expect(DEFAULT_CONFIG_TOML).toBe('ui_theme = "light"\nexternal_apps = []\n');
  });
});

describe("AC-1506: no user executable is ever registered by the E2E", () => {
  const USER_EXES = ["explorer", "wt", "code", "githubdesktop", "cmd", "powershell", "pwsh", "msedge", "chrome", "notepad"];
  const base = (v: string): string => (v.split(/[\\/]/).pop() ?? "").replace(/['"]/g, "").trim().toLowerCase().replace(/\.exe$/, "");

  it("no `program = ...` in any TOML text and no `program: ...` property of the tree names one", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      const sf = parse(file);
      const consts = topLevelConsts(sf);
      const visit = (n: ts.Node): void => {
        if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
          const text = ts.isTemplateExpression(n) ? evalText(n, consts) ?? "" : n.text;
          for (const m of text.matchAll(/\bprogram\s*=\s*(?:'([^'\n]*)'|"((?:[^"\\\n]|\\.)*)"|([^\s#\n]+))/g)) {
            const value = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\\\\/g, "\\");
            if (USER_EXES.includes(base(value))) hits.push(`${rel(file)}: program = ${value}`);
          }
        }
        if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "program" && (ts.isStringLiteralLike(n.initializer))) {
          if (USER_EXES.includes(base(n.initializer.text))) hits.push(`${rel(file)}: program: ${n.initializer.text}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(hits).toEqual([]);
  });

  it("the self-check of this scan: it does see a bad registration when one is written", () => {
    for (const bad of ["program = 'C:\\Windows\\explorer.exe'", 'program = "wt.exe"', "program = Code.exe", "program = '%LOCALAPPDATA%\\GitHubDesktop\\GitHubDesktop.exe'"]) {
      const m = /\bprogram\s*=\s*(?:'([^'\n]*)'|"((?:[^"\\\n]|\\.)*)"|([^\s#\n]+))/.exec(bad)!;
      expect(USER_EXES.includes(base(m[1] ?? m[2] ?? m[3] ?? "")), bad).toBe(true);
    }
    expect(USER_EXES.includes(base("C:\\t\\rf_launch_probe.exe"))).toBe(false);
  });

  it("the probe executable is the only thing a registration may point at (a bare sanity check on the helper's presence once it exists)", () => {
    const probe = join(E2E, "lib", "probe.mjs");
    if (!existsSync(probe)) return; // written by the test-automation-engineer
    expect(read(probe)).toContain("rf_launch_probe");
  });
});
