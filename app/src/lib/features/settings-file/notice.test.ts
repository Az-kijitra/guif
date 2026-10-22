import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1643 / R-1643-1 / 【確定 T-16】 (W-AC: unknown settings, in the order of the lines, null lines last in the found order, cut at 5),
//   R-1654 / 【確定 T-18】 (W-A9 + the config.toml part / W-AA / W-AB), R-1663-1 / 【確定 T-21 / T-29】 (the time: problems 15 s, quiet 2.5 s),
//   R-1663 (the start-up time 6 s / 15 s), AC-1642, AC-1653 (i)(ii)(iii), AC-1656, SPEC-0300-0019 第5版 W-A9 / W-AA / W-AB / W-AC.
// Architecture: SPEC-0200-0001 §3.17.8: `features/settings-file/notice.ts`:
//   buildUnknownSettingsNotice(unknown: readonly { kind: "key" | "appField"; name: string; position?: number; line: number | null }[]): string | null
//   buildCheckNotice({ present: boolean; configNotice: string | null }): { text: string; durationMs: number }
//   NOTICE_MS = { quiet: 2500, startup: 6000, problem: 15000 }
//
// Module under test (not yet implemented): ./notice.ts

import { buildCheckNotice, buildUnknownSettingsNotice, NOTICE_MS } from "./notice";

const key = (name: string, line: number | null) => ({ kind: "key" as const, name, line });
const field = (position: number, name: string, line: number | null) => ({ kind: "appField" as const, name, position, line });

describe("NOTICE_MS", () => {
  it("quiet 2.5 s, startup 6 s (SHOULD-119), problem 15 s (R-1663)", () => {
    expect(NOTICE_MS).toEqual({ quiet: 2500, startup: 6000, problem: 15000 });
  });
});

describe("buildUnknownSettingsNotice: W-AC (R-1643)", () => {
  it("no unknown settings -> null", () => {
    expect(buildUnknownSettingsNotice([])).toBeNull();
  });

  it("AC-1642: three in line order -> `config.toml の不明な設定 3 件を無視しました: ui_them(2 行目), ui_show_hidden(3 行目), external_apps の 2 番目の agrs(18 行目)。`", () => {
    expect(buildUnknownSettingsNotice([key("ui_them", 2), key("ui_show_hidden", 3), field(2, "agrs", 18)])).toBe(
      "config.toml の不明な設定 3 件を無視しました: ui_them(2 行目), ui_show_hidden(3 行目), external_apps の 2 番目の agrs(18 行目)。",
    );
  });

  it("R-1643-1: the list is sorted by line even when given in another order (the reading side's order is the key order)", () => {
    expect(buildUnknownSettingsNotice([field(2, "agrs", 18), key("ui_them", 2), key("ui_show_hidden", 3)])).toBe(
      "config.toml の不明な設定 3 件を無視しました: ui_them(2 行目), ui_show_hidden(3 行目), external_apps の 2 番目の agrs(18 行目)。",
    );
  });

  it("R-1643-1: items without a line come after the ones with a line, in the order they were given; they have no parentheses", () => {
    expect(buildUnknownSettingsNotice([key("zzz", null), key("late", 30), field(1, "agrs", null), key("early", 4), key("aaa", null)])).toBe(
      "config.toml の不明な設定 5 件を無視しました: early(4 行目), late(30 行目), zzz, external_apps の 1 番目の agrs, aaa。",
    );
  });

  it("items on the same line keep the given order (stable)", () => {
    expect(buildUnknownSettingsNotice([key("b", 5), key("a", 5)])).toBe("config.toml の不明な設定 2 件を無視しました: b(5 行目), a(5 行目)。");
  });

  it("R-1662: more than five -> {n} is the full count, the list is the first five (in line order) and `ほか {m} 件`", () => {
    const unknown = [7, 6, 5, 4, 3, 2, 1].map((n) => key(`k${n}`, n));
    expect(buildUnknownSettingsNotice(unknown)).toBe(
      "config.toml の不明な設定 7 件を無視しました: k1(1 行目), k2(2 行目), k3(3 行目), k4(4 行目), k5(5 行目), ほか 2 件。",
    );
  });

  it("does not modify the input array", () => {
    const unknown = [key("b", 9), key("a", 1)];
    buildUnknownSettingsNotice(unknown);
    expect(unknown.map((u) => u.name)).toEqual(["b", "a"]);
  });
});

const W_A9 = "設定ファイルのチェック(次の起動での扱い): ";

describe("buildCheckNotice (R-1654, R-1663-1, AC-1653, AC-1656)", () => {
  it("W-A9 is the prefix with its trailing half-width space", () => {
    expect(buildCheckNotice({ present: false, configNotice: null }).text.startsWith(W_A9)).toBe(true);
  });

  it("config.toml is missing -> W-A9 + W-AB, 2.5 s (even if a notice were given, a missing file has none to show)", () => {
    expect(buildCheckNotice({ present: false, configNotice: null })).toEqual({
      text: `${W_A9}config.toml がないため、既定の設定を使います。`,
      durationMs: 2500,
    });
  });

  it("no problem -> W-A9 + W-AA, 2.5 s", () => {
    expect(buildCheckNotice({ present: true, configNotice: null })).toEqual({
      text: `${W_A9}問題はありません。変更は再起動で反映されます`,
      durationMs: 2500,
    });
  });

  it("an error or unknown settings -> W-A9 + the config.toml part as it is, 15 s", () => {
    const part = "config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。";
    expect(buildCheckNotice({ present: true, configNotice: part })).toEqual({ text: `${W_A9}${part}`, durationMs: 15000 });
  });

  it("an unreadable file (W-31 with a line) -> 15 s", () => {
    const w31 = "config.toml の 2 行目を読み込めなかったため、既定のキー割り当て、テーマ(OS の設定に従う)、外部アプリの既定の登録を使います。 詳細: x";
    const r = buildCheckNotice({ present: true, configNotice: w31 });
    expect(r.text).toBe(`${W_A9}${w31}`);
    expect(r.durationMs).toBe(15000);
  });

  it("durations are taken from NOTICE_MS", () => {
    expect(buildCheckNotice({ present: true, configNotice: null }).durationMs).toBe(NOTICE_MS.quiet);
    expect(buildCheckNotice({ present: true, configNotice: "x" }).durationMs).toBe(NOTICE_MS.problem);
  });
});
