import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0023 第2版 R-1753 (default font size 12px), R-1754 (row height round(12 x 1.32) = 16px), R-1791 (min_col_width default 24), R-1804
//   (tree_width_percent default 24), R-1792 (`ch` = the advance of `0` in the list font; the column math is in ch).
// Architecture: SPEC-0200-0001 §3.18.5 / §3.18.15 MINOR-6 (`startAppearanceLoad()` remembers the FIRST call's Promise; `+layout.ts` starts it at
//   module load for the main window only, `startup-wiring.ts` calls the same function, so the IPC runs ONCE), §3.18.6 (`ch` is measured with
//   canvas `measureText("0")` after `document.fonts.ready` and stored with `appearanceState.setCh(ch)`; before that it is the provisional
//   `font size x 0.6`), §3.18.12 (registered in traceability as a shared state; readers: routes/list-view-wiring.svelte.ts and
//   routes/_components/FileListBody.svelte; writers: routes/startup-wiring.ts (via applyAppearance) and FileListPanel (`ch` only)).
//
// Contract assumed (reported to the implementer):
//   export const appearanceState: {
//     readonly minColWidth: number;        // 24 until hydrated
//     readonly treeWidthPercent: number;   // 24
//     readonly fontSize: number;           // 12
//     readonly rowHeight: number;          // 16
//     readonly ch: number;                 // provisional fontSize * 0.6 until setCh()
//     hydrate(dto: AppearanceDto): void;   // minColWidth / treeWidthPercent / fontSize (= dto.fontSize) / rowHeight; ch back to the provisional value
//     setCh(ch: number): void;             // ignores a non-finite or non-positive value
//   };
//   export function startAppearanceLoad(): Promise<AppearanceDto>;   // the first call invokes appearanceLoad(); later calls return the SAME Promise
//
// Module under test (not yet implemented): ./appearance-state.svelte.ts
// Each test loads a fresh copy of the module (vi.resetModules) because the memo is module state.

const appearanceLoad = vi.fn();

beforeEach(() => {
  vi.resetModules();
  appearanceLoad.mockReset();
  vi.doMock("$lib/shared/ipc/appearance", () => ({ appearanceLoad }));
});

afterEach(() => {
  vi.doUnmock("$lib/shared/ipc/appearance");
});

const dto = (over: Record<string, unknown> = {}) => ({
  dark: true,
  bg: "#2e3440",
  uiVars: [],
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 12,
  rowHeight: 16,
  minColWidth: 24,
  treeWidthPercent: 24,
  problems: [],
  ...over,
});

async function load() {
  return await import("./appearance-state.svelte");
}

describe("appearanceState defaults (before the DTO arrives)", () => {
  it("R-1791 / R-1804 / R-1753 / R-1754 (第2版): min_col_width 24, tree_width_percent 24, 12px, row height 16", async () => {
    const { appearanceState: s } = await load();
    expect(s.minColWidth).toBe(24);
    expect(s.treeWidthPercent).toBe(24);
    expect(s.fontSize).toBe(12);
    expect(s.rowHeight).toBe(16);
  });

  it("§3.18.6: `ch` is the provisional font size x 0.6 until it is measured", async () => {
    const { appearanceState: s } = await load();
    expect(s.ch).toBeCloseTo(7.2, 10);
  });
});

describe("appearanceState.hydrate", () => {
  it("takes the four numbers from the DTO (fontSize -> fontSize)", async () => {
    const { appearanceState: s } = await load();
    s.hydrate(dto({ fontSize: 20, rowHeight: 26, minColWidth: 40, treeWidthPercent: 33 }) as never);
    expect([s.fontSize, s.rowHeight, s.minColWidth, s.treeWidthPercent]).toEqual([20, 26, 40, 33]);
  });

  it("the provisional `ch` follows the hydrated font size (13px -> 7.8)", async () => {
    const { appearanceState: s } = await load();
    s.hydrate(dto({ fontSize: 13, rowHeight: 17 }) as never);
    expect(s.ch).toBeCloseTo(7.8, 10);
  });
});

describe("appearanceState.setCh", () => {
  it("stores the measured advance (the column math uses it as px per ch)", async () => {
    const { appearanceState: s } = await load();
    s.setCh(9.59999);
    expect(s.ch).toBe(9.59999);
  });

  it("a measured value survives until the next hydrate", async () => {
    const { appearanceState: s } = await load();
    s.hydrate(dto() as never);
    s.setCh(9.375);
    expect(s.ch).toBe(9.375);
  });

  it("ignores NaN, Infinity, 0 and negative values (a failed measurement must not zero the layout)", async () => {
    const { appearanceState: s } = await load();
    s.setCh(9.5);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
      s.setCh(bad);
      expect(s.ch).toBe(9.5);
    }
  });
});

describe("startAppearanceLoad (§3.18.15 MINOR-6, Q-F)", () => {
  it("the first call invokes appearanceLoad() once and resolves with its DTO", async () => {
    const value = dto();
    appearanceLoad.mockResolvedValueOnce(value);
    const { startAppearanceLoad } = await load();
    await expect(startAppearanceLoad()).resolves.toBe(value);
    expect(appearanceLoad).toHaveBeenCalledTimes(1);
  });

  it("later calls return the SAME Promise and do not invoke again (the layout load and the start-up share one IPC)", async () => {
    appearanceLoad.mockResolvedValue(dto());
    const { startAppearanceLoad } = await load();
    const first = startAppearanceLoad();
    const second = startAppearanceLoad();
    expect(second).toBe(first);
    await first;
    expect(startAppearanceLoad()).toBe(first);
    expect(appearanceLoad).toHaveBeenCalledTimes(1);
  });

  it("a failure is remembered too: every caller sees the rejection and there is no second IPC", async () => {
    appearanceLoad.mockRejectedValue(new Error("no command"));
    const { startAppearanceLoad } = await load();
    const first = startAppearanceLoad();
    await expect(first).rejects.toThrow("no command");
    await expect(startAppearanceLoad()).rejects.toThrow("no command");
    expect(appearanceLoad).toHaveBeenCalledTimes(1);
  });

  it("loading the module alone does not call the IPC (only +layout.ts starts it, for the main window)", async () => {
    await load();
    expect(appearanceLoad).not.toHaveBeenCalled();
  });
});
