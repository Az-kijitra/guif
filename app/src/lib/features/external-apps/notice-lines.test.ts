import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1642 / R-1660 / R-1662 / 【確定 T-14】, SPEC-0300-0019 第5版 W-9A / W-9B / W-9C: the line is added to each item as
//   `3(VS Codeで開く、20 行目)`, `21(上限を超えています、60 行目)`, `ターミナルで開く: Ctrl+Alt+C(25 行目)`, and W-9B becomes
//   `config.toml の {N} 行目の external_apps が正しくないため、外部アプリは既定の登録を使います。`; a missing line keeps the current text; the W-9A and
//   W-9C lists are cut after 5 items (`ほか {m} 件`) with {n} the full count; AC-1640 (the 2nd registration's line), AC-1643 (the cut).
// Architecture: SPEC-0200-0001 §3.17.8: `NoticeInput` gains `invalid[].line?`, `typeErrorLine?`, `rejectedKeys[].line?` (all `number | null`, optional so that
//   the existing callers keep working); `shared/notice-list.ts::limitList` does the cut.
//
// Module under test: ./notice.ts

import { buildExternalAppsNotice } from "./notice";

const none = { invalid: [], typeError: false, rejectedKeys: [] };

describe("W-9A with lines (AC-1640)", () => {
  it("the line follows the name after `、`: 3(VS Codeで開く、20 行目)", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 3, name: "VS Codeで開く", reason: "invalid", line: 20 }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 3(VS Codeで開く、20 行目)。",
    );
  });

  it("an element over the limit: 21(上限を超えています、60 行目)", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 21, name: "y", reason: "limit", line: 60 }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 21(上限を超えています、60 行目)。",
    );
  });

  it("AC-1640: the second registration's program on line 22 -> `2(bad、22 行目)`", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 2, name: "bad", reason: "invalid", line: 22 }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 2(bad、22 行目)。",
    );
  });

  it("a registration without a line is listed as before, beside one with a line", () => {
    expect(
      buildExternalAppsNotice({
        ...none,
        invalid: [
          { position: 1, name: "a", reason: "invalid", line: null },
          { position: 2, name: "b", reason: "invalid", line: 8 },
        ],
      }),
    ).toBe("config.toml の外部アプリの登録 2 件を使いません: 1(a), 2(b、8 行目)。");
  });

  it("[open question, see the report] an unreadable name with a line: the number and the line only -> 1(20 行目)", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 1, name: null, reason: "invalid", line: 20 }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 1(20 行目)。",
    );
  });

  it("a `line` of undefined (an old caller) is the same as null", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 2, name: "bad", reason: "invalid" }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 2(bad)。",
    );
  });

  it("AC-1643 (R-1662): seven invalid registrations -> {n} is 7, the first five, then `ほか 2 件`", () => {
    const invalid = [1, 2, 3, 4, 5, 6, 7].map((p) => ({ position: p, name: `n${p}`, reason: "invalid" as const, line: p * 10 }));
    expect(buildExternalAppsNotice({ ...none, invalid })).toBe(
      "config.toml の外部アプリの登録 7 件を使いません: 1(n1、10 行目), 2(n2、20 行目), 3(n3、30 行目), 4(n4、40 行目), 5(n5、50 行目), ほか 2 件。",
    );
  });

  it("exactly five are not cut", () => {
    const invalid = [1, 2, 3, 4, 5].map((p) => ({ position: p, name: null, reason: "invalid" as const, line: null }));
    expect(buildExternalAppsNotice({ ...none, invalid })).toBe("config.toml の外部アプリの登録 5 件を使いません: 1, 2, 3, 4, 5。");
  });
});

describe("W-9B with the line", () => {
  it("`config.toml の {N} 行目の external_apps が正しくないため、外部アプリは既定の登録を使います。`", () => {
    expect(buildExternalAppsNotice({ ...none, typeError: true, typeErrorLine: 4 })).toBe(
      "config.toml の 4 行目の external_apps が正しくないため、外部アプリは既定の登録を使います。",
    );
  });

  it("a null / absent typeErrorLine keeps the current sentence", () => {
    const plain = "config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。";
    expect(buildExternalAppsNotice({ ...none, typeError: true, typeErrorLine: null })).toBe(plain);
    expect(buildExternalAppsNotice({ ...none, typeError: true })).toBe(plain);
  });

  it("the line is ignored when there is no type error", () => {
    expect(buildExternalAppsNotice({ ...none, typeError: false, typeErrorLine: 4 })).toBeNull();
  });
});

describe("W-9C with lines", () => {
  it("`ターミナルで開く: Ctrl+Alt+C(25 行目)` -- the key then the line; the default four's keys carry no line", () => {
    expect(
      buildExternalAppsNotice({
        ...none,
        rejectedKeys: [
          { label: "ターミナルで開く", key: "Ctrl+Alt+C", line: 25 },
          { label: "VS Codeで開く", key: "Ctrl+Alt+V", line: null },
        ],
      }),
    ).toBe("外部アプリのキー 2 件は使いません(正しくないか、他の操作と重なっています): ターミナルで開く: Ctrl+Alt+C(25 行目), VS Codeで開く: Ctrl+Alt+V。");
  });

  it("[open question, see the report] a non-string key with a line: the label then the line -> NoString(31 行目)", () => {
    expect(buildExternalAppsNotice({ ...none, rejectedKeys: [{ label: "NoString", key: null, line: 31 }] })).toBe(
      "外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): NoString(31 行目)。",
    );
  });

  it("AC-1643 (R-1662): six rejected keys -> {n} is 6, the first five, then `ほか 1 件`", () => {
    const rejectedKeys = [1, 2, 3, 4, 5, 6].map((i) => ({ label: `L${i}`, key: `K${i}`, line: i }));
    expect(buildExternalAppsNotice({ ...none, rejectedKeys })).toBe(
      "外部アプリのキー 6 件は使いません(正しくないか、他の操作と重なっています): L1: K1(1 行目), L2: K2(2 行目), L3: K3(3 行目), L4: K4(4 行目), L5: K5(5 行目), ほか 1 件。",
    );
  });
});

describe("the join and the order are unchanged (R-1661: W-9A -> W-9B -> W-9C, one half-width space)", () => {
  it("all three with lines", () => {
    expect(
      buildExternalAppsNotice({
        invalid: [{ position: 2, name: "bad", reason: "invalid", line: 22 }],
        typeError: true,
        typeErrorLine: 3,
        rejectedKeys: [{ label: "L", key: "K", line: 9 }],
      }),
    ).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 2(bad、22 行目)。" +
        " config.toml の 3 行目の external_apps が正しくないため、外部アプリは既定の登録を使います。" +
        " 外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): L: K(9 行目)。",
    );
  });
});
