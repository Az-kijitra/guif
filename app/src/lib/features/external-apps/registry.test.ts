import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0021 R-1510-1 (a default registration arrives as `defaultNo` + NO name: the screen takes the name from W-90〜W-93;
//   a user registration's `name` is used as it is), R-1550 (keys: comma separated, several allowed), R-1551 (a key is NOT used when it is a
//   fixed key, a key of the current keymap, or already used by an EARLIER registration; with a comma list only the colliding element is
//   dropped), R-1503-1 (a bad / non-string `key` loses the key only; the registration stays), R-1574 (what the start-up notice is built
//   from), R-1506 (order), AC-1500 (names), AC-1532, AC-1535 (the default keys are all usable and nothing is reported when nothing collides).
// Architecture: SPEC-0200-0001 §3.16.6 (`features/external-apps/registry.ts`; `keyRules = { isValidKey, collides }` is INJECTED because a
//   feature may not import another feature: `routes/` bridges it from `features/keyboard`), §3.16.3.
//
// Contract assumed (reported to the implementer):
//   interface KeyRules { isValidKey(element: string): boolean; collides(element: string): boolean }     // per comma element, already trimmed
//   interface ExternalAppEntry { index: number; label: string; keys: string[] }                          // `keys` = the USABLE elements, trimmed, as written
//   interface RejectedKey { label: string; key: string | null }                                          // null: `key` was not a string (R-1503-1)
//   interface Registry { entries: ExternalAppEntry[]; invalid: InvalidRegistrationDto[]; typeError: boolean; rejectedKeys: RejectedKey[] }
//   buildRegistry(dto: ExternalAppsDto, rules: KeyRules): Registry
//   - `index` of an entry = dto.apps[i].index; `label` = DEFAULT_APP_NAMES[defaultNo] when defaultNo !== null, else dto.name
//   - `invalid` / `typeError` are passed through as they are
//   - the order of `entries` and `rejectedKeys` is the order of dto.apps (then the order of the comma elements)
//
// Module under test (not yet implemented): ./registry.ts

import type { ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import { buildRegistry, type KeyRules } from "./registry";

type AppDto = ExternalAppsDto["apps"][number];

const app = (over: Partial<AppDto> & { index: number }): AppDto => ({ defaultNo: null, name: "x", key: null, keyInvalid: false, keyLine: null, ...over });
const dto = (apps: AppDto[], over: Partial<ExternalAppsDto> = {}): ExternalAppsDto => ({ apps, invalid: [], typeError: false, typeErrorLine: null, ...over });

const DEFAULTS: AppDto[] = [
  app({ index: 0, defaultNo: 1, name: null, key: "Ctrl+Alt+C" }),
  app({ index: 1, defaultNo: 2, name: null, key: "Ctrl+Alt+V" }),
  app({ index: 2, defaultNo: 3, name: null, key: "Ctrl+Alt+E" }),
  app({ index: 3, defaultNo: 4, name: null, key: "Ctrl+Alt+Shift+G" }),
];

// A simple grammar (modifiers + one key) and a small "taken" set, standing for features/keyboard's real rules.
const GRAMMAR = /^((Ctrl|Alt|Shift|Meta)\+)*([A-Za-z0-9]|F\d{1,2}|Tab|Enter|Escape)$/;
function rules(taken: string[] = []): KeyRules {
  return { isValidKey: (e) => GRAMMAR.test(e), collides: (e) => taken.includes(e) };
}

describe("labels (R-1510-1, AC-1500)", () => {
  it("a default registration's label comes from the number (W-90〜W-93), never from `name`", () => {
    const r = buildRegistry(dto(DEFAULTS), rules());
    expect(r.entries.map((e) => e.label)).toEqual(["ターミナルで開く", "VS Codeで開く", "エクスプローラーで開く", "GitHub Desktopで開く"]);
    expect(r.entries.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  });

  it("a user registration's label is its name as it is", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "My Tool (日本語)" }), app({ index: 1, name: "  padded  " })]), rules());
    expect(r.entries.map((e) => e.label)).toEqual(["My Tool (日本語)", "  padded  "]);
  });

  it("the order is the order of the DTO (config.toml order, R-1506)", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "c" }), app({ index: 1, name: "a" }), app({ index: 2, name: "b" })]), rules());
    expect(r.entries.map((e) => e.label)).toEqual(["c", "a", "b"]);
  });

  it("an empty registration list gives an empty registry (external_apps = [])", () => {
    const r = buildRegistry(dto([]), rules());
    expect(r).toEqual({ entries: [], invalid: [], typeError: false, typeErrorLine: null, rejectedKeys: [] });
  });
});

describe("the default four need no escape: AC-1535", () => {
  it("all four keys are usable and nothing is reported when nothing collides", () => {
    const r = buildRegistry(dto(DEFAULTS), rules());
    expect(r.entries.map((e) => e.keys)).toEqual([["Ctrl+Alt+C"], ["Ctrl+Alt+V"], ["Ctrl+Alt+E"], ["Ctrl+Alt+Shift+G"]]);
    expect(r.rejectedKeys).toEqual([]);
  });
});

describe("keys (R-1550 / R-1551)", () => {
  it("no key and an empty key are not an error: the entry has no keys and nothing is rejected", () => {
    const r = buildRegistry(dto([app({ index: 0, key: null }), app({ index: 1, key: "" })]), rules());
    expect(r.entries.map((e) => e.keys)).toEqual([[], []]);
    expect(r.rejectedKeys).toEqual([]);
  });

  it("a comma list gives one key per element, trimmed, in order", () => {
    const r = buildRegistry(dto([app({ index: 0, key: "Ctrl+Alt+T, F9 ,Ctrl+Alt+Y" })]), rules());
    expect(r.entries[0].keys).toEqual(["Ctrl+Alt+T", "F9", "Ctrl+Alt+Y"]);
  });

  it("a key that is not valid is rejected (the registration stays, R-1503-1)", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "Bad", key: "Hyper+Z" })]), rules());
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].keys).toEqual([]);
    expect(r.rejectedKeys).toEqual([{ label: "Bad", key: "Hyper+Z", line: null }]);
  });

  it("a key that is not a string (keyInvalid) loses only the key; the registration stays and is reported once", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "NoStr", key: null, keyInvalid: true })]), rules());
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].keys).toEqual([]);
    expect(r.rejectedKeys).toHaveLength(1);
    expect(r.rejectedKeys[0].label).toBe("NoStr");
    expect(r.rejectedKeys[0].key).toBeNull();
  });

  it("AC-1532: a fixed key / a key of the keymap (what `collides` says) is rejected: Ctrl+Q, Shift+S, Tab", () => {
    const taken = ["Ctrl+Q", "Shift+S", "Tab"];
    const r = buildRegistry(
      dto([app({ index: 0, name: "Q", key: "Ctrl+Q" }), app({ index: 1, name: "S", key: "Shift+S" }), app({ index: 2, name: "T", key: "Tab" })]),
      rules(taken),
    );
    expect(r.entries.map((e) => e.keys)).toEqual([[], [], []]);
    expect(r.rejectedKeys).toEqual([
      { label: "Q", key: "Ctrl+Q", line: null },
      { label: "S", key: "Shift+S", line: null },
      { label: "T", key: "Tab", line: null },
    ]);
  });

  it("AC-1532: of two registrations with the same key the EARLIER one keeps it, the later one loses it", () => {
    const r = buildRegistry(
      dto([app({ index: 0, name: "first", key: "Ctrl+Alt+T" }), app({ index: 1, name: "second", key: "Ctrl+Alt+T" }), app({ index: 2, name: "third", key: "Ctrl+Alt+T" })]),
      rules(),
    );
    expect(r.entries.map((e) => e.keys)).toEqual([["Ctrl+Alt+T"], [], []]);
    expect(r.rejectedKeys).toEqual([
      { label: "second", key: "Ctrl+Alt+T", line: null },
      { label: "third", key: "Ctrl+Alt+T", line: null },
    ]);
  });

  it("a key that is rejected (collides) does not reserve itself: the first USER of a free key wins", () => {
    // `Ctrl+Q` is taken; nobody can use it, and it must not matter for the others.
    const r = buildRegistry(dto([app({ index: 0, name: "a", key: "Ctrl+Q" }), app({ index: 1, name: "b", key: "F9" })]), rules(["Ctrl+Q"]));
    expect(r.entries.map((e) => e.keys)).toEqual([[], ["F9"]]);
  });

  it("with a comma list only the colliding element is dropped (R-1551)", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "multi", key: "Ctrl+Alt+T, Ctrl+Q, F9" })]), rules(["Ctrl+Q"]));
    expect(r.entries[0].keys).toEqual(["Ctrl+Alt+T", "F9"]);
    expect(r.rejectedKeys).toEqual([{ label: "multi", key: "Ctrl+Q", line: null }]);
  });

  it("the rules are asked per element (never for the whole comma string)", () => {
    const isValidKey = vi.fn((e: string) => GRAMMAR.test(e));
    const collides = vi.fn(() => false);
    buildRegistry(dto([app({ index: 0, key: "Ctrl+Alt+T,F9" })]), { isValidKey, collides });
    expect(isValidKey.mock.calls.map((c) => c[0])).toEqual(["Ctrl+Alt+T", "F9"]);
  });

  it("an invalid registration list does not touch the keys of the usable ones", () => {
    const r = buildRegistry(
      dto([app({ index: 0, name: "ok", key: "F9" })], { invalid: [{ position: 2, name: "bad", reason: "invalid", line: null }] }),
      rules(),
    );
    expect(r.entries[0].keys).toEqual(["F9"]);
  });
});

describe("pass-through (R-1574)", () => {
  it("invalid registrations and the type error are handed on unchanged", () => {
    const invalid: ExternalAppsDto["invalid"] = [
      { position: 2, name: "second", reason: "invalid", line: null },
      { position: 21, name: "twenty-first", reason: "limit", line: null },
    ];
    const r = buildRegistry(dto(DEFAULTS, { invalid, typeError: true }), rules());
    expect(r.invalid).toEqual(invalid);
    expect(r.typeError).toBe(true);
  });

  it("the result does not alias the input (the DTO may be frozen by the state)", () => {
    const input = dto(DEFAULTS);
    const r = buildRegistry(input, rules());
    r.entries.pop();
    expect(input.apps).toHaveLength(4);
  });
});
