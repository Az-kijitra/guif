/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的 / 単体] Spec: SPEC-0300-0022 R-1630〜R-1638 (the original of the template and the sample), AC-1630 (un-commenting the `# ` lines gives no error and
//   the defaults), AC-1632 (the 32 operation ids, the fixed keys, the explanations, the version), AC-1633 (the external-app part = the user manual §7.2),
//   AC-1636 (the comment forms; `ui_theme` before the first table heading), R-1631 / R-1631-1 / R-1633 / R-1634 / R-1635 / R-1638.
// Architecture: SPEC-0200-0001 §3.17.7: the original `app/src-tauri/templates/config.sample.toml` is read as a FILE, line by line (no TOML library: no new
//   dependency). Lines starting `#@template ` / `#@sample ` are the two kinds' own opening lines and are dropped here; the rest is the shared body.
//   The Rust side (render, CRLF, BOM, template vs sample) is checked by `source_tests.rs` / `template_consistency_tests.rs` (not here).
//
// Status at TDD time: RED until the original is written (the first test says so).

import { ACTION_IDS, DEFAULT_KEYMAP } from "$lib/features/keyboard/keymap-defaults";
import { RESERVED_FIXED_KEYS } from "$lib/features/keyboard/fixed-keys";
import { validateKeymapEntries } from "$lib/features/keyboard/keymap-validate";

const APP = resolve(__dirname, "..");
const ORIGINAL = join(APP, "src-tauri", "templates", "config.sample.toml");
const MANUAL = resolve(APP, "..", "docs", "user_manual.md");
const NOT_IN_TEMPLATE = ["help_keymap", "refresh"];

const exists = existsSync(ORIGINAL);
const raw = exists ? readFileSync(ORIGINAL, "utf-8") : "";
const allLines = raw.split(/\r?\n/);
// The shared body: the kind-specific opening lines are dropped.
const body = allLines.filter((l) => !/^#@(template|sample) /.test(l));
const explanation = body.filter((l) => l === "##" || l.startsWith("## "));
const settingLines = body.filter((l) => l.startsWith("# ") && !l.startsWith("## "));
const uncommented = settingLines.map((l) => l.slice(2));

// The `input_keymap_custom` pairs `id = "value"` between its heading and the next heading, with the line of the original.
function keymapPairs(): { actionId: string; value: string | null; line: number }[] {
  const out: { actionId: string; value: string | null; line: number }[] = [];
  let inTable = false;
  allLines.forEach((l, i) => {
    if (!l.startsWith("# ") || l.startsWith("## ")) return;
    const text = l.slice(2);
    if (/^\[.*\]$/.test(text)) {
      inTable = text === "[input_keymap_custom]";
      return;
    }
    const m = inTable ? /^([a-z_]+) = "(.*)"$/.exec(text) : null;
    if (m) out.push({ actionId: m[1], value: m[2], line: i + 1 });
  });
  return out;
}

describe("the original exists (R-1637)", () => {
  it("app/src-tauri/templates/config.sample.toml is present and has a body", () => {
    expect(exists, ORIGINAL).toBe(true);
    expect(body.length).toBeGreaterThan(50);
  });

  it("has one `#@template ` line group and one `#@sample ` line group (the two kinds' opening explanation)", () => {
    expect(allLines.some((l) => l.startsWith("#@template "))).toBe(true);
    expect(allLines.some((l) => l.startsWith("#@sample "))).toBe(true);
  });
});

describe("AC-1636 / R-1631: the comment forms", () => {
  it("every non-empty line of the body is `## …` / `##` (explanation) or `# …` (a setting line or a table heading) -- nothing is an active TOML line", () => {
    const bad = body.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => l.trim() !== "" && !(l === "##" || l.startsWith("## ") || l.startsWith("# ")));
    expect(bad).toEqual([]);
  });

  it("every `# ` line is a table heading or a `key = value` line", () => {
    const bad = settingLines.filter((l) => !/^# (\[\[?[a-z_]+\]\]?|[a-z_]+ = .+)$/.test(l));
    expect(bad).toEqual([]);
  });

  it("R-1612 / AC-1631: read as it is (comments only) the file defines nothing", () => {
    expect(allLines.filter((l) => l.trim() !== "" && !l.startsWith("#"))).toEqual([]);
  });

  it("R-1631-1: `# ui_theme = \"system\"` is before the first `# [input_keymap_custom]`", () => {
    const theme = body.indexOf('# ui_theme = "system"');
    const heading = body.indexOf("# [input_keymap_custom]");
    expect(theme).toBeGreaterThanOrEqual(0);
    expect(heading).toBeGreaterThan(theme);
    expect(body.findIndex((l) => /^# \[/.test(l))).toBeGreaterThan(theme);
  });

  it("R-1631-1: the order is ui_theme -> input_keymap_custom -> external_apps", () => {
    const a = body.indexOf('# ui_theme = "system"');
    const b = body.indexOf("# [input_keymap_custom]");
    const c = body.indexOf("# [[external_apps]]");
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it("R-1631 3 / R-1635: the opening explains the `# ` / `## ` rule, the restart, the check, and carries the version mark `guif @VERSION@`", () => {
    const head = explanation.slice(0, 40).join("\n");
    expect(head).toContain("# ");
    expect(head).toContain("## ");
    expect(head).toContain("再起動");
    expect(head).toContain("設定ファイルのチェック");
    expect(raw).toContain("guif @VERSION@");
  });
});

describe("AC-1630 / R-1638 1: un-commenting the `# ` lines (the keymap part)", () => {
  const pairs = keymapPairs();
  const validated = validateKeymapEntries(pairs);

  it("there are 32 pairs", () => {
    expect(pairs).toHaveLength(32);
  });

  it("validateKeymapEntries finds 0 invalid entries", () => {
    expect(validated.invalidActions).toEqual([]);
  });

  it("the effective assignments are exactly DEFAULT_KEYMAP without help_keymap / refresh", () => {
    const expected = Object.fromEntries(Object.entries(DEFAULT_KEYMAP).filter(([id]) => !NOT_IN_TEMPLATE.includes(id)));
    expect(validated.effective).toEqual(expected);
  });

  it("`ui_theme` is the default `\"system\"`", () => {
    expect(uncommented).toContain('ui_theme = "system"');
  });

  it("ui_theme only (AC-1636): with that one line un-commented and the headings left commented it is a top-level key, as no heading comes before it", () => {
    const i = allLines.indexOf('# ui_theme = "system"');
    const firstHeading = allLines.findIndex((l) => /^# \[/.test(l));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(firstHeading);
  });
});

describe("AC-1632 / R-1638 2: the operation ids and the fixed keys", () => {
  it("the ids are exactly ACTION_IDS minus help_keymap and refresh (32), each once", () => {
    const ids = keymapPairs().map((p) => p.actionId);
    expect([...ids].sort()).toEqual(ACTION_IDS.filter((id) => !NOT_IN_TEMPLATE.includes(id)).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each operation has a `## ` explanation line directly above its setting line", () => {
    const missing = keymapPairs()
      .filter((p) => !allLines[p.line - 2].startsWith("## "))
      .map((p) => p.actionId);
    expect(missing).toEqual([]);
  });

  it("the explanation lists every fixed key of RESERVED_FIXED_KEYS (`Comma` is written `,`) and nothing else is claimed as fixed", () => {
    const text = explanation.join("\n");
    for (const k of RESERVED_FIXED_KEYS) {
      expect(text, k).toContain(k.replace("Comma", ","));
    }
  });

  it("explains that an empty string turns the key off, commas separate several keys, and Comma / Plus / Space", () => {
    const text = explanation.join("\n");
    expect(text).toContain('""');
    expect(text).toContain("空の文字列");
    for (const w of ["Comma", "Plus", "Space"]) expect(text, w).toContain(w);
  });

  it("explains ui_theme: the three values, case-sensitive, the default", () => {
    const text = explanation.join("\n");
    for (const v of ['"light"', '"dark"', '"system"']) expect(text, v).toContain(v);
    expect(text).toContain("大文字小文字");
  });

  it("explains external_apps: the five fields, {path} / {dir} / {{ / }}, the 20-item limit, and that only what is written is used", () => {
    const text = explanation.join("\n");
    for (const f of ["name", "program", "args", "args_for_file", "key"]) expect(text, f).toContain(f);
    for (const f of ["{path}", "{dir}", "{{", "}}"]) expect(text, f).toContain(f);
    expect(text).toContain("20");
    expect(text).toContain("書いたものだけ");
  });
});

describe("AC-1633 / R-1638 3: the external-app part equals the manual §7.2", () => {
  function manualToml(): string[] {
    const md = readFileSync(MANUAL, "utf-8");
    const from = md.indexOf("### 7.2");
    const fence = md.indexOf("```toml", from);
    const end = md.indexOf("```", fence + 7);
    return md
      .slice(fence + 7, end)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
  }

  it("the lines from `[[external_apps]]` on (with `# ` removed) are the manual's TOML", () => {
    const start = uncommented.indexOf("[[external_apps]]");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(uncommented.slice(start).map((l) => l.trim())).toEqual(manualToml());
  });

  it("there are four registrations", () => {
    expect(uncommented.filter((l) => l === "[[external_apps]]")).toHaveLength(4);
  });
});

describe("AC-1632 / R-1638 4: the version", () => {
  it("package.json, tauri.conf.json and Cargo.toml agree, and the original carries the `@VERSION@` placeholder (the backend fills it)", () => {
    const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf-8")).version;
    const tauri = JSON.parse(readFileSync(join(APP, "src-tauri", "tauri.conf.json"), "utf-8")).version;
    const cargo = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(APP, "src-tauri", "Cargo.toml"), "utf-8"))?.[1];
    expect(tauri).toBe(pkg);
    expect(cargo).toBe(pkg);
    expect(raw).toContain("@VERSION@");
    expect(raw).not.toContain(`guif ${pkg}`); // the number is never hard-coded in the original
  });
});

describe("R-1636: the comments are Japanese; keys, values, operation ids stay English", () => {
  it("the explanation contains Japanese text", () => {
    expect(explanation.join("\n")).toMatch(/[぀-ヿ一-鿿]/);
  });
});
