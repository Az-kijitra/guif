/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0022 AC-1652 (the check goes through the same functions as the start-up and writes no setting state), AC-1663 (`ACTION_IDS` stays 34,
//   no new operation id), AC-1662 (no entrance in the right-click menu / viewer), R-1651, R-1671 / R-1671-1 (the `Ctrl+,` pre-emption; closeMenus closes only what is
//   open), R-1606; SPEC-0300-0010 第18版 R-14 / AC-04 (【確定 T-27】: `isSettingsOpen` is removed), SPEC-0200-0001 §3.17.9 / §3.17.13 (`+page.svelte` ≤ 400 lines).
// Architecture: SPEC-0200-0001 §3.17.8 (new files), §3.17.9 (`onHardcodedShortcut(action, event)`, closeMenus guards, `menuBar.deactivate` exposed),
//   §4.1 (feature isolation: `features/settings-file/` imports no other feature; `shared/` imports no feature).
//
// Pure file reading; comments are stripped before searching so that an explanatory comment never makes a check pass or fail.

const SRC = resolve(__dirname);
const read = (rel: string): string => readFileSync(join(SRC, rel), "utf-8");
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (rel: string): string => strip(read(rel));
// Type-only imports (`import type`) are erased at build time, so they are no run-time dependency on a state or an IPC module.
const importsOf = (src: string): string[] =>
  [...strip(src).matchAll(/(?:import|export)(?!\s+type\s)\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit") continue;
      walk(full, out);
    } else if (/\.(svelte|ts)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}
const prod = walk(SRC).map((f) => relative(SRC, f).split(sep).join("/"));

describe("the new files exist (a missing file is a failure, not a silent pass)", () => {
  it.each([
    "routes/config-evaluate.ts",
    "routes/settings-file-wiring.ts",
    "routes/entry-wiring.ts",
    "lib/shared/ipc/settings-file.ts",
    "lib/shared/notice-list.ts",
    "lib/features/settings-file/messages.ts",
    "lib/features/settings-file/notice.ts",
    "lib/features/settings-file/open-result.ts",
  ])("%s", (rel) => {
    expect(existsSync(join(SRC, rel)), rel).toBe(true);
  });
});

describe("AC-1652: the check and the start-up share the pure evaluation; the check writes no setting state", () => {
  it("config-evaluate.ts imports no state (keymapState / externalAppsState / statusMessage) and no IPC", () => {
    const specs = importsOf(read("routes/config-evaluate.ts"));
    expect(specs.filter((s) => /state|status-message|\/ipc\//.test(s))).toEqual([]);
    expect(code("routes/config-evaluate.ts")).not.toMatch(/\$state|\$derived|\.hydrate\(|invoke\(/);
  });

  it("config-evaluate.ts calls the existing validation and sentence builders (no second implementation)", () => {
    const c = code("routes/config-evaluate.ts");
    for (const fn of [
      "validateKeymapEntries(", "keyRules(", "buildRegistry(", "buildKeymapLoadNotice(", "buildAppearanceNotice(", "buildUnusedNotice(", "buildExternalAppsNotice(", "buildUnknownSettingsNotice(",
    ]) {
      expect(c, fn).toContain(fn);
    }
  });

  it("settings-file-wiring.ts goes through evaluateConfig + buildCheckNotice and does not import keymapState / externalAppsState", () => {
    const c = code("routes/settings-file-wiring.ts");
    expect(c).toContain("evaluateConfig(");
    expect(c).toContain("buildCheckNotice(");
    expect(c).toContain("buildOpenResult(");
    expect(c).toContain("showPriority(");
    expect(importsOf(read("routes/settings-file-wiring.ts")).filter((s) => /keymap-state|external-apps-state/.test(s))).toEqual([]);
    expect(c).not.toMatch(/\.hydrate\(/);
  });

  it("startup-wiring.ts uses evaluateConfig too, and no longer builds the sentences itself", () => {
    const c = code("routes/startup-wiring.ts");
    expect(c).toContain("evaluateConfig(");
    expect(c).not.toMatch(/\bbuildKeymapLoadNotice\(|\bbuildAppearanceNotice\(|\bbuildExternalAppsNotice\(|\bvalidateKeymapEntries\(|\bbuildRegistry\(/);
  });

  it("startup-wiring.ts is the only writer of the settings state: hydrate is called there and nowhere in the check path", () => {
    const writers = prod.filter((f) => !f.startsWith("lib/features/") && /\b(keymapState|externalAppsState)\.hydrate\(/.test(code(f)));
    expect(writers).toEqual(["routes/startup-wiring.ts"]);
  });

  it("the start-up time comes from NOTICE_MS (15 s with a config.toml part, 6 s otherwise): no 6000 literal is left", () => {
    const c = code("routes/startup-wiring.ts");
    expect(c).toContain("NOTICE_MS");
    expect(c).not.toContain("STARTUP_NOTICE_DURATION_MS");
    expect(c).not.toMatch(/\b6000\b/);
  });
});

describe("AC-1663: no new operation id", () => {
  it("ACTION_IDS keeps its 34 ids and has no config_* id", async () => {
    const { ACTION_IDS } = await import("$lib/features/keyboard/keymap-defaults");
    expect(ACTION_IDS).toHaveLength(34);
    expect(ACTION_IDS.filter((id) => id.startsWith("config"))).toEqual([]);
    expect(ACTION_IDS).toContain("settings");
  });
});

describe("T-27: isSettingsOpen is removed (SPEC-0300-0010 第18版 R-14)", () => {
  it("no production file mentions isSettingsOpen (comments ignored)", () => {
    expect(prod.filter((f) => /isSettingsOpen/.test(code(f)))).toEqual([]);
  });
});

describe("the Ctrl+, entrance (R-1671, R-1606)", () => {
  it("DispatchContext.onHardcodedShortcut and MainKeydownWiringDeps.onHardcodedShortcut take the event", () => {
    for (const f of ["lib/features/keyboard/key-dispatch.ts", "routes/main-keydown-wiring.ts"]) {
      expect(code(f), f).toMatch(/onHardcodedShortcut:\s*\(\s*action:\s*"exit"\s*\|\s*"settings"\s*,\s*event:\s*KeydownLikeEvent\s*\)\s*=>\s*boolean/);
    }
    expect(code("lib/features/keyboard/key-dispatch.ts")).toMatch(/onHardcodedShortcut\(\s*hardcoded\s*,\s*event\s*\)/);
  });

  it("+page.svelte builds the entrances with createEntryWiring (one call), no longer calls createExternalAppsWiring itself, and hands settingsFile.onHardcoded to the keydown wiring", () => {
    const page = code("routes/+page.svelte");
    expect(page.match(/\bcreateEntryWiring\(/g) ?? []).toHaveLength(1);
    expect(page).not.toMatch(/\bcreateExternalAppsWiring\(/);
    expect(page).not.toMatch(/onHardcodedShortcut:\s*exitOnly/);
    expect(page).toMatch(/onHardcodedShortcut:\s*[\w.]*settingsFile[\w.]*onHardcoded/);
    expect(page).toMatch(/onExitAction:\s*exitOnly/);
  });

  it("+page.svelte closeMenus closes a menu only when it is open (contextMenu.state.isOpen / menuBar.keys.active) and restores the focus (deactivate(true))", () => {
    const page = code("routes/+page.svelte");
    expect(page).toMatch(/closeMenus/);
    expect(page).toMatch(/contextMenu\.state\.isOpen/);
    expect(page).toMatch(/menuBar\.keys\.active/);
    expect(page).toMatch(/menuBar\.deactivate\(\s*true\s*\)/);
    expect(page).toMatch(/contextMenu\.closeNow\(\)/);
  });

  it("menu-bar-wiring.svelte.ts exposes deactivate in its return value and passes settingsFile to the menu executor", () => {
    const c = code("routes/menu-bar-wiring.svelte.ts");
    expect(c).toMatch(/return\s*\{[\s\S]*\bdeactivate\b[\s\S]*\}/);
    expect(c).toContain("settingsFile");
  });

  it("list-action-wiring.ts runs `settings` through settingsFile.open and ignores event.repeat", () => {
    const c = code("routes/list-action-wiring.ts");
    expect(c).toMatch(/case\s+"settings"/);
    expect(c).toMatch(/settingsFile/);
    expect(c).toMatch(/repeat/);
  });

  it("menu-bar-exec.ts branches config_open / config_check to settingsFile", () => {
    const c = code("routes/menu-bar-exec.ts");
    expect(c).toContain("config_open");
    expect(c).toContain("config_check");
    expect(c).toMatch(/settingsFile/);
  });
});

describe("AC-1662 / R-1673: no entrance in the right-click menu or the viewer window", () => {
  it("their sources mention neither the settings-file wording nor its item ids", () => {
    const files = prod.filter((f) => f.startsWith("lib/features/context-menu/") || f.startsWith("lib/features/viewer/") || f.startsWith("routes/viewer/"));
    expect(files.length).toBeGreaterThan(5);
    const hits = files.filter((f) => /config_open|config_check|settingsFile|settings-file|設定ファイル/.test(code(f)));
    expect(hits).toEqual([]);
  });
});

describe("isolation (§4.1)", () => {
  it("features/settings-file imports only $lib/shared/* and its own files", () => {
    const files = prod.filter((f) => f.startsWith("lib/features/settings-file/"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    const bad: string[] = [];
    for (const f of files) {
      for (const s of importsOf(read(f))) {
        if (s.startsWith("./") || s.startsWith("$lib/shared/")) continue;
        bad.push(`${f} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("shared/notice-list.ts imports nothing from features or routes", () => {
    expect(importsOf(read("lib/shared/notice-list.ts")).filter((s) => /features|routes/.test(s))).toEqual([]);
  });

  it("the settings-file IPC wrapper has no business logic: it imports only the Tauri invoke", () => {
    expect(importsOf(read("lib/shared/ipc/settings-file.ts"))).toEqual(["@tauri-apps/api/core"]);
  });
});

describe("AC-1646 (the TypeScript part): there is one key validation", () => {
  it("the line-number work added no second grammar: only keymap-validate.ts / keymap-resolve.ts decide validity (routes and notices call them)", () => {
    const deciders = prod.filter((f) => /\bisValidBindingElement\(|\bisKnownKeyBody\(|\bcanonicalizeModifier\(/.test(code(f)));
    expect(deciders.filter((f) => !f.startsWith("lib/features/keyboard/"))).toEqual([]);
  });
});
