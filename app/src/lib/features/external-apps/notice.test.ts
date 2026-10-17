import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1574 (ONE start-up notice for the invalid registrations -> the type error -> the unusable keys, in this
//   order, joined by one half-width space (W-39); the list formats), R-1503 / R-1505 (what is reported), R-1503-1 / R-1551 (the unusable keys),
//   SPEC-0300-0019 第3版 W-9A / W-9B / W-9C and the `{一覧}` note (MINOR-4): `3(VS Codeで開く)` (the number counts from 1, the name when it can
//   be read), `21(上限を超えています)` (over the limit, with its reason), `ターミナルで開く: Ctrl+Alt+C` for keys, everything joined by `, `;
//   `{n}` is the number of items of the list; AC-1502, AC-1504, AC-1505, AC-1508 (the external part).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/notice.ts`: the sentences W-9A -> W-9B -> W-9C, 0 items -> null).
//
// Contract assumed (reported to the implementer):
//   buildExternalAppsNotice(registry: {
//     invalid: readonly { position: number; name: string | null; reason: "invalid" | "limit" }[];
//     typeError: boolean;
//     rejectedKeys: readonly { label: string; key: string | null }[];
//   }): string | null         // null when there is nothing to say
//
// Module under test (not yet implemented): ./notice.ts

import { buildExternalAppsNotice } from "./notice";

const none = { invalid: [], typeError: false, rejectedKeys: [] };

describe("nothing to report", () => {
  it("is null (no notice at all)", () => {
    expect(buildExternalAppsNotice(none)).toBeNull();
  });
});

describe("W-9A: invalid registrations (AC-1502, AC-1505)", () => {
  it("lists number and name, separated by `, `, with the count", () => {
    expect(
      buildExternalAppsNotice({
        ...none,
        invalid: [
          { position: 2, name: "bad", reason: "invalid" },
          { position: 3, name: "VS Codeで開く", reason: "invalid" },
        ],
      }),
    ).toBe("config.toml の外部アプリの登録 2 件を使いません: 2(bad), 3(VS Codeで開く)。");
  });

  it("an unreadable name leaves just the number", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 1, name: null, reason: "invalid" }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 1。",
    );
  });

  it("AC-1505: an element over the limit carries its reason instead of a name", () => {
    expect(buildExternalAppsNotice({ ...none, invalid: [{ position: 21, name: "twenty-first", reason: "limit" }] })).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 21(上限を超えています)。",
    );
  });

  it("a mix keeps the order it was given", () => {
    expect(
      buildExternalAppsNotice({
        ...none,
        invalid: [
          { position: 1, name: null, reason: "invalid" },
          { position: 4, name: "x", reason: "invalid" },
          { position: 21, name: "y", reason: "limit" },
          { position: 22, name: "z", reason: "limit" },
        ],
      }),
    ).toBe("config.toml の外部アプリの登録 4 件を使いません: 1, 4(x), 21(上限を超えています), 22(上限を超えています)。");
  });
});

describe("W-9B: type error (AC-1504)", () => {
  it("is the fixed sentence", () => {
    expect(buildExternalAppsNotice({ ...none, typeError: true })).toBe("config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。");
  });
});

describe("W-9C: unusable keys (R-1551)", () => {
  it("lists `name: key` joined by `, `, with the count", () => {
    expect(
      buildExternalAppsNotice({
        ...none,
        rejectedKeys: [
          { label: "ターミナルで開く", key: "Ctrl+Alt+C" },
          { label: "Mine", key: "Ctrl+Q" },
        ],
      }),
    ).toBe("外部アプリのキー 2 件は使いません(正しくないか、他の操作と重なっています): ターミナルで開く: Ctrl+Alt+C, Mine: Ctrl+Q。");
  });

  it("a key that was not a string still counts as one unusable key (R-1503-1)", () => {
    const text = buildExternalAppsNotice({ ...none, rejectedKeys: [{ label: "NoString", key: null }] });
    expect(text).not.toBeNull();
    expect(text).toContain("外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): ");
    expect(text).toContain("NoString");
    expect(text!.endsWith("。")).toBe(true);
  });
});

describe("the order and the join (R-1574, W-39)", () => {
  it("registrations -> type error -> keys, one half-width space between the sentences", () => {
    const text = buildExternalAppsNotice({
      invalid: [{ position: 2, name: "bad", reason: "invalid" }],
      typeError: true,
      rejectedKeys: [{ label: "L", key: "K" }],
    });
    expect(text).toBe(
      "config.toml の外部アプリの登録 1 件を使いません: 2(bad)。" +
        " config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。" +
        " 外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): L: K。",
    );
  });

  it("the type error and the keys of the default four (a collision with the keymap) go together", () => {
    const text = buildExternalAppsNotice({ ...none, typeError: true, rejectedKeys: [{ label: "ターミナルで開く", key: "Ctrl+Alt+C" }] });
    expect(text).toBe(
      "config.toml の external_apps が正しくないため、外部アプリは既定の登録を使います。 外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): ターミナルで開く: Ctrl+Alt+C。",
    );
  });

  it("registrations and keys without the type error", () => {
    const text = buildExternalAppsNotice({ invalid: [{ position: 3, name: null, reason: "invalid" }], typeError: false, rejectedKeys: [{ label: "L", key: "K" }] });
    expect(text).toBe("config.toml の外部アプリの登録 1 件を使いません: 3。 外部アプリのキー 1 件は使いません(正しくないか、他の操作と重なっています): L: K。");
  });

  it("no double spaces and no trailing space", () => {
    const text = buildExternalAppsNotice({ invalid: [{ position: 1, name: "a", reason: "invalid" }], typeError: true, rejectedKeys: [{ label: "L", key: "K" }] })!;
    expect(text).not.toMatch(/ {2}/);
    expect(text).toBe(text.trim());
  });
});
