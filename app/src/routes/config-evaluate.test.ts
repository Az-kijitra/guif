import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1651 (start-up and check share the reading result's interpretation and the sentence building: the same input gives the
//   same config.toml part), R-1661 第2版 / SPEC-0300-0023 R-1820 (the order keymap -> appearance W-B* -> external apps W-9A -> W-9B -> W-9C -> W-B8 -> W-AC, one half-width space), R-1642 / R-1643 / R-1662,
//   R-1656 (the key judgement uses the effective keymap built from the same input), AC-1640 / AC-1641 / AC-1642 / AC-1643 / AC-1651 (the sentences of every
//   input), AC-1657 (unit part: an invalid registration is reported from the snapshot).
// Architecture: SPEC-0200-0001 §3.17.2 (f) / §3.17.8: `routes/config-evaluate.ts`:
//   evaluateConfig(snapshot: { keymap: KeymapLoadResultDto; externalApps: ExternalAppsDto; appearance: AppearanceDto }): { validated: ValidatedKeymap; registry: Registry; notice: string | null }
//   A PURE function: no state, no IPC (AC-1652 is checked by settings-file-static.test.ts).
//
// Module under test (not yet implemented): ./config-evaluate.ts

import { evaluateConfig } from "./config-evaluate";
import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
import { externalAppsState } from "$lib/features/external-apps/external-apps-state.svelte";

const keymap = (over: Record<string, unknown> = {}) =>
  ({ entries: [], parseError: null, present: true, unknownSettings: [], ...over }) as never;
const ext = (over: Record<string, unknown> = {}) => ({ apps: [], invalid: [], typeError: false, typeErrorLine: null, ...over }) as never;
const appr = (problems: unknown[] = []) => ({ dark: true, bg: "#2e3440", uiVars: [], fontFamily: "monospace", fontSize: 16, rowHeight: 21, minColWidth: 24, treeWidthPercent: 24, problems }) as never;
const run = (k: Record<string, unknown> = {}, e: Record<string, unknown> = {}, problems: unknown[] = []) => evaluateConfig({ keymap: keymap(k), externalApps: ext(e), appearance: appr(problems) });

// W-33 is abolished (SPEC-0300-0023 R-1748); the appearance sentences replace the theme position.
const WB0 = (n: number): string => `config.toml の ${n} 行目の配色 "dracula" は使えないため、nord を使います(使える値: default、nord、monokai、catppuccin、solarized、light)。`;
const P_B0 = (line: number) => ({ kind: "presetUnusable", line, value: "dracula", usable: ["default", "nord", "monokai", "catppuccin", "solarized", "light"] });
const P_B4 = { kind: "layoutValue", line: 8, key: "min_col_width", default: 24, min: 10, max: 80 };
const P_UNUSED = { kind: "unused", items: [{ table: "theme", name: "name", line: 3, used: "preset" }] };

describe("nothing to report", () => {
  it("a plain snapshot has no notice; the result carries the validated keymap and the registry", () => {
    const r = run();
    expect(r.notice).toBeNull();
    expect(r.validated).toEqual({ effective: {}, invalidActions: [], invalidActionLines: [] });
    expect(r.registry.entries).toEqual([]);
  });

  it("R-1644: present false (no config.toml) is also null (the check adds its own sentence)", () => {
    expect(run({ present: false }).notice).toBeNull();
  });
});

describe("AC-1640: the sentences with lines, in order", () => {
  const k = {
    entries: [
      { actionId: "copy", value: "Ctrl+", line: 12 },
      { actionId: "toggle_time", value: "Ctrl+Alt+T", line: 13 },
    ],
  };
  const e = {
    apps: [{ index: 0, defaultNo: null, name: "ok", key: null, keyInvalid: false, keyLine: null }],
    invalid: [{ position: 2, name: "bad", reason: "invalid", line: 22 }],
  };

  it("keymap -> appearance -> external apps, joined by one half-width space", () => {
    expect(run(k, e, [P_B0(3)]).notice).toBe(
      `config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。 ${WB0(3)} config.toml の外部アプリの登録 1 件を使いません: 2(bad、22 行目)。`,
    );
  });

  it("validated.effective holds the valid override only; the registry keeps the usable registration", () => {
    const r = run(k, e);
    expect(r.validated.effective).toEqual({ toggle_time: "Ctrl+Alt+T" });
    expect(r.validated.invalidActions).toEqual(["copy"]);
    expect(r.registry.entries.map((x) => x.label)).toEqual(["ok"]);
  });
});

describe("AC-1641: a file that cannot be read", () => {
  it("W-31 with the line (第6版: `配色(nord)`), no setting item; no appearance sentence is added (the closing sentence covers it)", () => {
    const r = run({ parseError: { message: "bad toml", line: 2, wholeFile: true } });
    expect(r.notice).toBe(
      "config.toml の 2 行目を読み込めなかったため、既定のキー割り当て、配色(nord)、外部アプリの既定の登録を使います。 詳細: bad toml",
    );
  });
});

describe("W-30-2 with a line, W-9B with a line", () => {
  it("input_keymap_custom of the wrong type on line 7", () => {
    expect(run({ parseError: { message: "x", line: 7, wholeFile: false } }).notice).toBe(
      "config.toml の 7 行目の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。",
    );
  });

  it("external_apps of the wrong type on line 4", () => {
    expect(run({}, { typeError: true, typeErrorLine: 4 }).notice).toBe(
      "config.toml の 4 行目の external_apps が正しくないため、外部アプリは既定の登録を使います。",
    );
  });
});

describe("AC-1642 / R-1643: W-AC is last", () => {
  it("unknown settings after an appearance error", () => {
    const r = run({ unknownSettings: [{ kind: "key", name: "ui_them", line: 2 }] }, {}, [P_B0(9)]);
    expect(r.notice).toBe(`${WB0(9)} config.toml の不明な設定 1 件を無視しました: ui_them(2 行目)。`);
  });
});

describe("SPEC-0300-0023 R-1820 / AC-1748 / AC-1709: the whole order and ui_theme", () => {
  const WB4 = "config.toml の 8 行目の min_col_width を解釈できないため、既定の 24 を使います(10〜80 の整数)。";
  const WB8 = "config.toml の使われない設定 1 件があります: name(3 行目、preset を使います)。";
  const WAC = "config.toml の不明な設定 1 件を無視しました: mode(4 行目)。";
  const APP9A = { invalid: [{ position: 2, name: "bad", reason: "invalid", line: 22 }] };
  const KEYERR = { entries: [{ actionId: "copy", value: "Ctrl+", line: 12 }], unknownSettings: [{ kind: "tableKey", table: "theme", name: "mode", line: 4 }] };
  const W32 = "config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。";

  it("keymap -> W-B0 -> W-B4 -> external apps -> W-B8 -> W-AC", () => {
    const r = run(KEYERR, APP9A, [P_UNUSED, P_B4, P_B0(2)]);
    expect(r.notice).toBe(`${W32} ${WB0(2)} ${WB4} config.toml の外部アプリの登録 1 件を使いません: 2(bad、22 行目)。 ${WB8} config.toml の不明な設定 1 件を無視しました: [theme] の mode(4 行目)。`);
  });

  it("W-B8 alone is a notice of its own (buildUnusedNotice), and an unused-only snapshot gives exactly it", () => {
    expect(run({}, {}, [P_UNUSED]).notice).toBe(WB8);
  });

  it("AC-1748: a top-level ui_theme is a plain unknown setting (W-AC) and no W-33 sentence exists", () => {
    const r = run({ unknownSettings: [{ kind: "key", name: "ui_theme", line: 2 }] });
    expect(r.notice).toBe("config.toml の不明な設定 1 件を無視しました: ui_theme(2 行目)。");
    expect(r.notice).not.toContain("OS のテーマ設定");
  });

  it("the appearance problems with no kind to report give no notice at all", () => {
    expect(run({}, {}, []).notice).toBeNull();
  });
});

describe("R-1656 / R-1551: the key judgement uses the effective keymap of the same snapshot", () => {
  it("an app key equal to a key the user's keymap took is unusable and reported with its line", () => {
    const r = run(
      { entries: [{ actionId: "copy", value: "Ctrl+Alt+M", line: 5 }] },
      { apps: [{ index: 0, defaultNo: null, name: "Mine", key: "Ctrl+Alt+M", keyInvalid: false, keyLine: 25 }] },
    );
    expect(r.registry.entries[0].keys).toEqual([]);
    expect(r.notice).toBe("外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): Mine: Ctrl+Alt+M(25 行目)。");
  });

  it("a fixed key (Ctrl+Q) is unusable", () => {
    const r = run({}, { apps: [{ index: 0, defaultNo: null, name: "Mine", key: "Ctrl+Q", keyInvalid: false, keyLine: 6 }] });
    expect(r.notice).toBe("外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): Mine: Ctrl+Q(6 行目)。");
  });

  it("the default four with the default keymap collide with nothing (AC-1535): no notice", () => {
    const four = [
      ["Ctrl+Alt+C", 1],
      ["Ctrl+Alt+V", 2],
      ["Ctrl+Alt+E", 3],
      ["Ctrl+Alt+Shift+G", 4],
    ].map(([key, no], index) => ({ index, defaultNo: no, name: null, key, keyInvalid: false, keyLine: null }));
    expect(run({}, { apps: four }).notice).toBeNull();
  });
});

describe("AC-1651: the same input gives the same result every time, and touches no state", () => {
  it("deterministic", () => {
    const k = { entries: [{ actionId: "bogus", value: "x", line: 1 }] };
    expect(run(k).notice).toBe(run(k).notice);
  });

  it("does not hydrate the keymap or the external-app state, and does not modify its input", () => {
    const before = { overrides: { ...keymapState.customOverrides }, entries: [...externalAppsState.entries] };
    const snapshot = { keymap: keymap({ entries: [{ actionId: "toggle_time", value: "Ctrl+Alt+T", line: 3 }] }), externalApps: ext(), appearance: appr() };
    const copy = JSON.stringify(snapshot);
    evaluateConfig(snapshot);
    expect({ ...keymapState.customOverrides }).toEqual(before.overrides);
    expect([...externalAppsState.entries]).toEqual(before.entries);
    expect(JSON.stringify(snapshot)).toBe(copy);
  });
});
