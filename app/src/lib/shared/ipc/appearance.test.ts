/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// [単体 / 静的] Spec: SPEC-0300-0023 R-1720 (the back end resolves the colours once at start-up and the screen receives the result),
//   R-1721 (the screen only sets the values it is given), R-1751 / R-1791 / R-1804 (font, min_col_width, tree_width_percent come with the DTO),
//   R-1820 (the problems are data; the sentences are built in the front end), SPEC-0300-0019 R-1201 2 (the back end sends no Japanese sentence).
// Architecture: SPEC-0200-0001 §3.18.3 (`AppearanceDto`, `ProblemDto`, command `appearance_load`: main window only, no arguments),
//   §3.18.5 (`shared/ipc/appearance.ts::appearanceLoad()` is a bare `invoke` wrapper that HOLDS NO STATE; the first call's Promise is
//   remembered by `shared/state/appearance-state.svelte.ts::startAppearanceLoad()`, §3.18.15 MINOR-6), §3.18.15 SHOULD-3 (the ProblemDto fields).
//
// Contract assumed (reported to the implementer):
//   type CssVarDto = [name: string, value: string];                       // Rust `Vec<(&str, String)>` is sent as [name, value] pairs
//   type ProblemDto =                                                     // camelCase on the wire; `line: number | null` when unknown
//     | { kind: "presetUnusable"; line: number | null; value: string; usable: string[] }          // W-B0
//     | { kind: "presetWrongType"; line: number | null; key: "preset" | "name" | "theme" }       // W-B1
//     | { kind: "colorsUnparsable"; items: { name: string; line: number | null }[] }              // W-B2
//     | { kind: "colorsNotTable"; line: number | null }                                           // W-B5
//     | { kind: "fontSize"; line: number | null; key: "size"; default: number; min: number; max: number }                          // W-B3
//     | { kind: "fontFamily"; line: number | null }                                               // W-B6
//     | { kind: "fontFamilyElements"; line: number | null; names: string[] }                      // W-B9 (names are RAW; "?" replacement is the front end's)
//     | { kind: "notTable"; line: number | null; key: "font" | "layout" }                         // W-B7
//     | { kind: "layoutValue"; line: number | null; key: "min_col_width" | "tree_width_percent"; default: number; min: number; max: number }  // W-B4
//     | { kind: "unused"; items: { table: string; name: string; line: number | null; used: string }[] };                          // W-B8
//   interface AppearanceDto { dark: boolean; bg: string; uiVars: CssVarDto[]; fontFamily: string; fontSize: number; rowHeight: number;
//                             minColWidth: number; treeWidthPercent: number; problems: ProblemDto[] }
//   appearanceLoad(): Promise<AppearanceDto>                              // invoke("appearance_load")  (no arguments)
//
// Module under test (not yet implemented): ./appearance.ts

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { appearanceLoad, type AppearanceDto } from "./appearance";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

const dto: AppearanceDto = {
  dark: true,
  bg: "#2e3440",
  uiVars: [
    ["--ui-bg", "#2e3440"],
    ["--ui-color-scheme", "dark"],
  ],
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 16,
  rowHeight: 21,
  minColWidth: 24,
  treeWidthPercent: 24,
  problems: [{ kind: "notTable", line: 4, key: "font" }],
};

describe("appearanceLoad (SPEC-0200-0001 §3.18.5)", () => {
  it("invokes `appearance_load` with NO arguments and returns the value untouched (R-1720)", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(dto);
    await expect(appearanceLoad()).resolves.toBe(dto);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("appearance_load");
  });

  it("holds no state: every call invokes again (the first-call Promise is remembered by appearance-state, not here)", async () => {
    vi.mocked(invoke).mockResolvedValue(dto);
    await appearanceLoad();
    await appearanceLoad();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("a rejected command rejects (the caller decides: console.error and carry on without colours)", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("boom"));
    await expect(appearanceLoad()).rejects.toThrow("boom");
  });
});

describe("shared/ipc/appearance.ts source (thin wrapper, §3.18.5 / MINOR-6)", () => {
  const source = readFileSync(resolve(__dirname, "appearance.ts"), "utf-8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("has no module-level mutable state (`let` / `$state` / a cached Promise): the state module owns the memo", () => {
    expect(code).not.toMatch(/^\s*let\s/m);
    expect(code).not.toMatch(/\$state|\$derived/);
    expect(code).not.toMatch(/\bnew Map\b|\bnew WeakMap\b/);
  });

  it("imports only the Tauri core (no feature, no state module, no routes)", () => {
    const specs = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.every((s) => s === "@tauri-apps/api/core")).toBe(true);
  });

  it("builds no Japanese sentence (SPEC-0300-0019 R-1201 2: the back end sends codes and values only)", () => {
    expect(code).not.toMatch(/[^\x00-\x7f]/);
  });
});
