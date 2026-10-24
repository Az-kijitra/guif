/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0020 R-1311 / AC-1302 (no item, action id, wording or disabled code for the excluded features), R-1380~R-1385 / AC-1364
//   (every colour through the R-910 variables, no colour literal; the measured sizes), R-1390~R-1392 / AC-1363 (roles and aria attributes; the
//   headings and items are not tab stops), R-1393 / T-04 (the access-key letter is underlined by CSS on `<span class="accel">`, not `<u>`).
// Architecture: SPEC-0200-0001 §3.14.0 / §3.14.1-1 (a new vertical slice `features/menu-bar/`, the shape of `context-menu`), §3.14.12-1 (MINOR-21:
//   it imports NO other feature; routes imports `MenuBar.svelte`; shared never imports it), §3.14.1-7 (look: `--ui-*` only; sizes from `main`).
//

const FEATURE = __dirname;
const SRC = resolve(__dirname, "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}
const prod = (): string[] => walk(FEATURE).filter((f) => /\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f));
const svelteSources = (): string => prod().filter((f) => f.endsWith(".svelte")).map((f) => readFileSync(f, "utf-8")).join("\n");
const stripJs = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const specifiers = (s: string): string[] => {
  const out: string[] = [];
  for (const re of [/\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\sfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripJs(s))) !== null) out.push(m[1]);
  }
  return out;
};

describe("the slice exists with the planned files", () => {
  it.each(["messages.ts", "menu-model.ts", "shortcut-format.ts", "menu-bar-keys.ts", "dropdown-position.ts", "MenuBar.svelte", "MenuDropdown.svelte"])("%s", (f) => {
    expect(existsSync(join(FEATURE, f)), f).toBe(true);
  });
});

describe("boundaries (MINOR-21)", () => {
  it("features/menu-bar imports no other feature, no routes, no $app; only $lib/shared, svelte and its own files", () => {
    const bad: string[] = [];
    for (const f of prod()) {
      for (const spec of specifiers(readFileSync(f, "utf-8"))) {
        const ok = spec.startsWith("./") || spec.startsWith("$lib/shared/") || spec === "svelte" || spec.startsWith("svelte/");
        if (!ok) bad.push(`${relative(SRC, f)} -> ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no other feature and nothing in shared imports features/menu-bar (only routes may)", () => {
    const bad: string[] = [];
    for (const f of walk(join(SRC, "lib")).filter((x) => /\.(ts|svelte)$/.test(x))) {
      const rel = relative(SRC, f).split(sep).join("/");
      if (rel.startsWith("lib/features/menu-bar/")) continue;
      for (const spec of specifiers(readFileSync(f, "utf-8"))) if (/features\/menu-bar/.test(spec)) bad.push(`${rel} -> ${spec}`);
    }
    expect(bad).toEqual([]);
  });

  it("menu-model.ts, menu-bar-keys.ts and shortcut-format.ts are DOM-free and rune-free (pure)", () => {
    for (const f of ["menu-model.ts", "menu-bar-keys.ts", "shortcut-format.ts"]) {
      const src = stripJs(readFileSync(join(FEATURE, f), "utf-8"));
      expect(src, f).not.toMatch(/\$state\b|\$derived\b|\$effect\b|\b(document|window|localStorage|navigator|HTMLElement)\b/);
    }
  });
});

describe("R-1311 / AC-1302: nothing for the excluded features is defined in the menu code", () => {
  const FORBIDDEN_WORDS = [
    "元に戻す", "やり直し", "複製", "日付プレフィックス", "プロパティ", "外部ツール", "ジャンプ追加(URL", "テーマ", "設定", "キー一覧", "マニュアル",
    "バージョン情報", "再読み込み", "ヘルプ", "完全に削除", "完全削除", "選択の切り替え", "Undo", "Redo", "Duplicate", "Properties", "Settings", "About",
  ];
  const FORBIDDEN_IDS = [
    "undo", "redo", "duplicate", "prefix_date", "properties", "open_explorer", "open_cmd", "open_terminal", "open_vscode", "open_git_client",
    "jump_add_url", "refresh", "settings", "help_keymap", "select_toggle", "delete_permanent", "toggle_theme",
  ];

  it("no forbidden word in any non-test file of the slice (comments excluded)", () => {
    const hits: string[] = [];
    for (const f of prod()) {
      const raw = f.endsWith(".ts") ? stripJs(readFileSync(f, "utf-8")) : readFileSync(f, "utf-8").replace(/<!--[\s\S]*?-->/g, "");
      // SPEC-0300-0022 R-1670 / SPEC-0300-0020 第3版 R-1311: the two 設定ファイル items (W-A0 / W-A1) and `formatSettingsShortcut` are not the excluded 設定画面.
      const text = raw.replace(/設定ファイル(を開く|のチェック)|formatSettingsShortcut/g, "");
      for (const w of FORBIDDEN_WORDS) if (text.includes(w)) hits.push(`${relative(FEATURE, f)}: ${w}`);
    }
    expect(hits).toEqual([]);
  });

  it("no forbidden action id as a quoted literal in the slice", () => {
    const hits: string[] = [];
    for (const f of prod().filter((x) => x.endsWith(".ts"))) {
      const text = stripJs(readFileSync(f, "utf-8"));
      for (const id of FORBIDDEN_IDS) if (new RegExp(`["'\`]${id}["'\`]`).test(text)) hits.push(`${relative(FEATURE, f)}: ${id}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("R-1390~R-1393 / AC-1363: roles and ARIA in the markup", () => {
  it("the markup carries the roles and attributes of R-1390", () => {
    const s = svelteSources();
    for (const needle of [
      'role="menubar"', "menuitemcheckbox", 'role="menu"', 'role="separator"', "aria-haspopup", "aria-expanded", "aria-checked",
      "aria-disabled", "aria-describedby", "aria-keyshortcuts", "aria-label",
    ]) {
      expect(s, needle).toContain(needle);
    }
    expect(s).toMatch(/role=(?:"menuitem"|\{)/);
  });

  it("headings and items are not tab stops: tabindex is only ever -1 (R-1392, AC-1363 last clause)", () => {
    const s = svelteSources();
    const values = [...s.matchAll(/tabindex=\{?["']?(-?\d+)["']?\}?/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toBe("-1");
  });

  it("T-04: the access key letter is underlined with CSS on <span class=\"accel\"> -- there is no <u> element", () => {
    const s = svelteSources();
    expect(s).toMatch(/class="accel"/);
    expect(s).toMatch(/\.accel\s*\{[^}]*text-decoration\s*:\s*underline/);
    expect(s).not.toMatch(/<u[\s>]/);
  });
});

describe("R-1380~R-1385 / AC-1364: the look", () => {
  it("every colour is a var(--ui-*) reference: no hex / rgb() / hsl() / named-colour literal in the slice's styles", () => {
    const styles = [...svelteSources().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    expect(styles.length).toBeGreaterThan(0);
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styles).not.toMatch(/\b(?:rgba?|hsla?)\(/);
    expect(styles).toMatch(/var\(--ui-/);
    for (const v of [...styles.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])) expect(v.startsWith("--ui-"), v).toBe(true);
  });

  it("the measured sizes: bar padding 3px 6px, heading var(--ui-font-size), dropdown min-width 260px / padding 4px 0 / max-height 70vh / z-index 20, item padding 6px 12px; sizes from --ui-font-size (SPEC-0300-0023 R-1752)", () => {
    const styles = [...svelteSources().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n").replace(/\s+/g, " ");
    expect(styles).toMatch(/padding:\s*3px 6px/);
    expect(styles).toMatch(/font-size:\s*var\(--ui-font-size\)/);
    expect(styles).not.toMatch(/font-size:\s*\d+px/);
    expect(styles).toMatch(/min-width:\s*260px/);
    expect(styles).toMatch(/padding:\s*4px 0/);
    expect(styles).toMatch(/max-height:\s*70vh/);
    expect(styles).toMatch(/z-index:\s*20\b/);
    expect(styles).toMatch(/padding:\s*6px 12px/);
  });

  it("the dropdown does not get clipped by the scrolling body: position fixed (or absolute) is declared", () => {
    expect(svelteSources()).toMatch(/position:\s*(?:fixed|absolute)/);
  });
});
