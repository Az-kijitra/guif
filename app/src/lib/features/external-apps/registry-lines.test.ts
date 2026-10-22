import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1642 (外部アプリの行: the key's line for the registered key, `external_apps`'s line for the type error, the heading / field
//   line for an invalid registration; the default four's keys have NO line), 【確定 T-14】, AC-1640 (the invalid registration's line), W-9C (the rejected
//   key carries the line of its `key`).
// Architecture: SPEC-0200-0001 §3.17.6 / §3.17.8: `ExternalAppDto.keyLine: number | null`, `InvalidRegistrationDto.line: number | null`,
//   `ExternalAppsDto.typeErrorLine: number | null` (the reading side returns them); `registry.ts`: `ExternalAppEntry.keyLine`, `Registry.typeErrorLine`,
//   `RejectedKey.line` (= the `keyLine` of the registration whose key was rejected; null for the default four and for a missing line).
//
// Module under test: ./registry.ts

import type { ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import { buildRegistry, type KeyRules } from "./registry";

type AppDto = ExternalAppsDto["apps"][number];
const app = (over: Partial<AppDto> & { index: number }): AppDto =>
  ({ defaultNo: null, name: "x", key: null, keyInvalid: false, keyLine: null, ...over }) as AppDto;
const dto = (apps: AppDto[], over: Partial<ExternalAppsDto> = {}): ExternalAppsDto =>
  ({ apps, invalid: [], typeError: false, typeErrorLine: null, ...over }) as ExternalAppsDto;

const GRAMMAR = /^((Ctrl|Alt|Shift|Meta)\+)*([A-Za-z0-9]|F\d{1,2}|Tab|Enter|Escape)$/;
const rules = (taken: string[] = []): KeyRules => ({ isValidKey: (e) => GRAMMAR.test(e), collides: (e) => taken.includes(e) });

describe("typeErrorLine (W-9B)", () => {
  it("is passed through from the DTO", () => {
    expect(buildRegistry(dto([], { typeError: true, typeErrorLine: 9 }), rules()).typeErrorLine).toBe(9);
  });

  it("is null when the DTO has none (the line could not be found, or there is no type error)", () => {
    expect(buildRegistry(dto([], { typeError: true, typeErrorLine: null }), rules()).typeErrorLine).toBeNull();
    expect(buildRegistry(dto([]), rules()).typeErrorLine).toBeNull();
  });
});

describe("invalid registrations keep their line (W-9A)", () => {
  it("the `invalid` entries (with their `line`) are passed through unchanged", () => {
    const invalid = [
      { position: 2, name: "bad", reason: "invalid" as const, line: 22 },
      { position: 21, name: null, reason: "limit" as const, line: 60 },
    ];
    expect(buildRegistry(dto([], { invalid } as never), rules()).invalid).toEqual(invalid);
  });
});

describe("keyLine of an entry (R-1642: the registration's `key` line)", () => {
  it("a user registration's keyLine is the DTO's", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "Mine", key: "Ctrl+Alt+M", keyLine: 25 })]), rules());
    expect(r.entries[0].keyLine).toBe(25);
  });

  it("the default four have no line (their keys are not in config.toml)", () => {
    const r = buildRegistry(dto([app({ index: 0, defaultNo: 1, name: null, key: "Ctrl+Alt+C", keyLine: null })]), rules());
    expect(r.entries[0].keyLine).toBeNull();
  });

  it("a missing keyLine in the DTO becomes null", () => {
    const a = app({ index: 0, key: "Ctrl+Alt+M" });
    delete (a as Partial<AppDto>).keyLine;
    expect(buildRegistry(dto([a]), rules()).entries[0].keyLine).toBeNull();
  });
});

describe("rejectedKeys carry the line of the registration's `key` (W-9C `ターミナルで開く: Ctrl+Alt+C(25 行目)`)", () => {
  it("a key from config.toml that collides is rejected WITH its line", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "Mine", key: "Ctrl+Alt+M", keyLine: 25 })]), rules(["Ctrl+Alt+M"]));
    expect(r.rejectedKeys).toEqual([{ label: "Mine", key: "Ctrl+Alt+M", line: 25 }]);
  });

  it("a bad grammar and a duplicate of an earlier registration both carry the line of the rejected registration", () => {
    const r = buildRegistry(
      dto([
        app({ index: 0, name: "A", key: "Ctrl+Alt+M", keyLine: 5 }),
        app({ index: 1, name: "B", key: "Ctrl+Alt+M", keyLine: 9 }),
        app({ index: 2, name: "C", key: "Ctrl+", keyLine: 13 }),
      ]),
      rules(),
    );
    expect(r.rejectedKeys).toEqual([
      { label: "B", key: "Ctrl+Alt+M", line: 9 },
      { label: "C", key: "Ctrl+", line: 13 },
    ]);
  });

  it("a non-string `key` (keyInvalid) is rejected with key null and the line", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "NoString", keyInvalid: true, keyLine: 31 })]), rules());
    expect(r.rejectedKeys).toEqual([{ label: "NoString", key: null, line: 31 }]);
  });

  it("a default registration's key that collides with the keymap is rejected with line null (no line is written for the default four)", () => {
    const r = buildRegistry(dto([app({ index: 0, defaultNo: 1, name: null, key: "Ctrl+Alt+C", keyLine: null })]), rules(["Ctrl+Alt+C"]));
    expect(r.rejectedKeys).toEqual([{ label: "ターミナルで開く", key: "Ctrl+Alt+C", line: null }]);
  });

  it("with a comma list only the rejected element is reported, with the same key line", () => {
    const r = buildRegistry(dto([app({ index: 0, name: "L", key: "Ctrl+Alt+M, Ctrl+Alt+N", keyLine: 7 })]), rules(["Ctrl+Alt+N"]));
    expect(r.entries[0].keys).toEqual(["Ctrl+Alt+M"]);
    expect(r.rejectedKeys).toEqual([{ label: "L", key: "Ctrl+Alt+N", line: 7 }]);
  });
});
