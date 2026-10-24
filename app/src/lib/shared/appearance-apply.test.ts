import { beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1721 (the colours are CSS variables set on the document root; no colour is written in a component and none is
//   computed here), R-1751 5 / 【確定 T-44】 (the font family is set as a DOM style VALUE through setProperty, never by concatenating CSS text),
//   R-1753 / R-1754 (`--ui-font-size` / `--list-row-height` in px), R-1742 (set BEFORE the first paint), R-1749 (the viewer reads the values
//   once; they never change while it runs).
// Architecture: SPEC-0200-0001 §3.18.5: `shared/appearance-apply.ts::applyAppearance(dto)` sets, on `document.documentElement`, every pair of
//   `uiVars`, then `--ui-font` (= fontFamily), `--ui-font-size` (`${fontSize}px`) and `--list-row-height` (`${rowHeight}px`), and puts
//   `minColWidth` etc. into `appearanceState`. The viewer reads `window.__GUIF_APPEARANCE__ = { vars: [[name, value], ...] }` (an initialization
//   script of the viewer window, placed before the document exists) SYNCHRONOUSLY in `+layout.ts`'s `load`; no IPC. The CHECK ("設定ファイルの
//   チェック") never calls this module (§3.18.4; the static part is in appearance-static.test.ts).
//
// Contract assumed (reported to the implementer):
//   export type CssVarPair = readonly [name: string, value: string];
//   export interface StyleTarget { style: { setProperty(name: string, value: string): void } }
//   applyCssVars(vars: readonly CssVarPair[], root?: StyleTarget): void          // root defaults to document.documentElement; order kept
//   applyAppearance(dto: AppearanceDto, root?: StyleTarget): void                // applyCssVars(uiVars) + the three list variables + appearanceState.hydrate(dto)
//   readViewerInitVars(win?: { __GUIF_APPEARANCE__?: unknown }): CssVarPair[] | null   // null when missing or malformed (the caller logs console.error)
//
// Module under test (not yet implemented): ./appearance-apply.ts

const hydrate = vi.fn();
vi.mock("$lib/shared/state/appearance-state.svelte", () => ({ appearanceState: { hydrate: (d: unknown) => hydrate(d) } }));

import { applyAppearance, applyCssVars, readViewerInitVars } from "./appearance-apply";

function fakeRoot() {
  const calls: [string, string][] = [];
  return { calls, root: { style: { setProperty: (n: string, v: string) => void calls.push([n, v]) } } };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({
    dark: true,
    bg: "#2e3440",
    uiVars: [
      ["--ui-bg", "#2e3440"],
      ["--ui-fg", "#eceff4"],
      ["--ui-color-scheme", "dark"],
    ],
    fontFamily: '"JetBrains Mono", "Cascadia Mono", monospace',
    fontSize: 16,
    rowHeight: 21,
    minColWidth: 24,
    treeWidthPercent: 24,
    problems: [],
    ...over,
  }) as never;

beforeEach(() => {
  hydrate.mockReset();
});

describe("applyCssVars", () => {
  it("sets every [name, value] pair with setProperty, in order, values untouched", () => {
    const { calls, root } = fakeRoot();
    applyCssVars(
      [
        ["--vw-bg", "#2e3440"],
        ["--vw-shadow", "rgba(0,0,0,.4)"],
      ],
      root,
    );
    expect(calls).toEqual([
      ["--vw-bg", "#2e3440"],
      ["--vw-shadow", "rgba(0,0,0,.4)"],
    ]);
  });

  it("an empty list sets nothing", () => {
    const { calls, root } = fakeRoot();
    applyCssVars([], root);
    expect(calls).toEqual([]);
  });
});

describe("applyAppearance (main window)", () => {
  it("R-1721: every uiVars pair is set first, in the order the back end gave", () => {
    const { calls, root } = fakeRoot();
    applyAppearance(dto(), root);
    expect(calls.slice(0, 3)).toEqual([
      ["--ui-bg", "#2e3440"],
      ["--ui-fg", "#eceff4"],
      ["--ui-color-scheme", "dark"],
    ]);
  });

  it("R-1751 5 / T-44: --ui-font is the back end's already-quoted value, set as a value (not concatenated into a style string)", () => {
    const { calls, root } = fakeRoot();
    applyAppearance(dto({ fontFamily: '"A\\"B", "Cascadia Mono", monospace' }), root);
    expect(calls).toContainEqual(["--ui-font", '"A\\"B", "Cascadia Mono", monospace']);
  });

  it("R-1753 / R-1754: --ui-font-size and --list-row-height are px strings", () => {
    const { calls, root } = fakeRoot();
    applyAppearance(dto({ fontSize: 13, rowHeight: 17 }), root);
    expect(calls).toContainEqual(["--ui-font-size", "13px"]);
    expect(calls).toContainEqual(["--list-row-height", "17px"]);
  });

  it("sets exactly the uiVars plus the five font variables (nothing else, e.g. no colour computed here)", () => {
    const { calls, root } = fakeRoot();
    applyAppearance(dto(), root);
    expect(calls.map(([n]) => n).sort()).toEqual(["--list-row-height", "--ui-bg", "--ui-color-scheme", "--ui-fg", "--ui-font", "--ui-font-mono", "--ui-font-size", "--ui-line-height"]);
  });

  it("puts the dto into appearanceState (min_col_width, tree width, font size, row height) exactly once", () => {
    const { root } = fakeRoot();
    const d = dto({ minColWidth: 30, treeWidthPercent: 40 });
    applyAppearance(d, root);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledWith(d);
  });
});

describe("readViewerInitVars (viewer window, R-1749)", () => {
  it("returns the [name, value] pairs of window.__GUIF_APPEARANCE__.vars", () => {
    const vars = [
      ["--vw-bg", "#2e3440"],
      ["--vw-color-scheme", "dark"],
    ];
    expect(readViewerInitVars({ __GUIF_APPEARANCE__: { vars } })).toEqual(vars);
  });

  it("null when the initialization script did not run (undefined / null / no vars / vars not an array)", () => {
    expect(readViewerInitVars({})).toBeNull();
    expect(readViewerInitVars({ __GUIF_APPEARANCE__: null })).toBeNull();
    expect(readViewerInitVars({ __GUIF_APPEARANCE__: {} })).toBeNull();
    expect(readViewerInitVars({ __GUIF_APPEARANCE__: { vars: "x" } })).toBeNull();
  });

  it("null when an entry is not a [string, string] pair (a half-applied palette is worse than none)", () => {
    expect(readViewerInitVars({ __GUIF_APPEARANCE__: { vars: [["--vw-bg", "#000"], ["--vw-fg"]] } })).toBeNull();
    expect(readViewerInitVars({ __GUIF_APPEARANCE__: { vars: [["--vw-bg", 1]] } })).toBeNull();
  });
});
