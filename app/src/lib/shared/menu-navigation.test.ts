import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0020 R-1354 1 / 2 (up / down skip disabled items and separators and wrap; with no highlight, down = first
//   and up = last enabled; Home / End), R-1321 (a disabled item is never a move target), R-1312; SPEC-0300-0018 R-1081 (the same
//   rule for the context menu).
// Architecture: SPEC-0200-0001 §3.14.1-2 and §3.14.12-1 (MINOR-22): `shared/menu-navigation.ts` generalises
//   `context-menu/menu-keys.ts`'s `moveMenuHighlight` / `resolveEnterTarget`; `NavEntry<Id extends string>` keeps the caller's id
//   union; the context menu becomes a thin delegation and its EXISTING `menu-keys.test.ts` must pass UNCHANGED (the regression
//   detector -- that file is deliberately not touched in Phase 13).
//
// Contract assumed (reported to the implementer):
//   export type NavEntry<Id extends string = string> = { type: "item"; id: Id; enabled: boolean } | { type: "separator" };
//   nextEnabled<Id extends string>(entries: readonly NavEntry<Id>[], current: Id | null, dir: "up" | "down", wrap: boolean): Id | null
//     - no enabled item -> null
//     - current null, or not an ENABLED id of `entries` -> "down": first enabled, "up": last enabled (R-1354 1)
//     - wrap = true: past the end goes round; wrap = false: past the end STAYS on `current`
//   firstEnabled(entries): Id | null      lastEnabled(entries): Id | null
//
// Module under test (not yet implemented): ./menu-navigation.ts

import { firstEnabled, lastEnabled, nextEnabled, type NavEntry } from "./menu-navigation";

type Id = "a" | "b" | "c" | "d" | "e";
const item = (id: Id, enabled = true): NavEntry<Id> => ({ type: "item", id, enabled });
const sep: NavEntry<Id> = { type: "separator" };

// a, [b disabled], sep, c, d(disabled), e
const MIXED: NavEntry<Id>[] = [item("a"), item("b", false), sep, item("c"), item("d", false), item("e")];

describe("firstEnabled / lastEnabled (Home / End, R-1354 2)", () => {
  it("the first and last ENABLED item, skipping disabled items and separators", () => {
    expect(firstEnabled(MIXED)).toBe("a");
    expect(lastEnabled(MIXED)).toBe("e");
  });

  it("a leading disabled item and a trailing separator are skipped", () => {
    const es: NavEntry<Id>[] = [item("a", false), sep, item("b"), item("c"), sep];
    expect(firstEnabled(es)).toBe("b");
    expect(lastEnabled(es)).toBe("c");
  });

  it("no enabled item (or an empty list) -> null", () => {
    expect(firstEnabled([item("a", false), sep])).toBeNull();
    expect(lastEnabled([item("a", false), sep])).toBeNull();
    expect(firstEnabled([])).toBeNull();
    expect(lastEnabled([])).toBeNull();
  });
});

describe("nextEnabled with wrap (the dropdown, R-1354 1)", () => {
  it("down walks the enabled items only: a -> c -> e -> a", () => {
    expect(nextEnabled(MIXED, "a", "down", true)).toBe("c");
    expect(nextEnabled(MIXED, "c", "down", true)).toBe("e");
    expect(nextEnabled(MIXED, "e", "down", true)).toBe("a");
  });

  it("up walks backwards and wraps: a -> e -> c -> a", () => {
    expect(nextEnabled(MIXED, "a", "up", true)).toBe("e");
    expect(nextEnabled(MIXED, "e", "up", true)).toBe("c");
    expect(nextEnabled(MIXED, "c", "up", true)).toBe("a");
  });

  it("no highlight yet (null): down = first enabled, up = last enabled (R-1354 1, SPEC-0300-0018 R-1081)", () => {
    expect(nextEnabled(MIXED, null, "down", true)).toBe("a");
    expect(nextEnabled(MIXED, null, "up", true)).toBe("e");
  });

  it("a current id that is disabled or unknown behaves like null", () => {
    expect(nextEnabled(MIXED, "b", "down", true)).toBe("a");
    expect(nextEnabled(MIXED, "d", "up", true)).toBe("e");
    expect(nextEnabled(MIXED, "zzz" as Id, "down", true)).toBe("a");
  });

  it("a single enabled item is its own neighbour in both directions", () => {
    const one: NavEntry<Id>[] = [item("a", false), item("b"), sep];
    expect(nextEnabled(one, "b", "down", true)).toBe("b");
    expect(nextEnabled(one, "b", "up", true)).toBe("b");
  });

  it("no enabled item -> null for every input", () => {
    const none: NavEntry<Id>[] = [item("a", false), sep, item("b", false)];
    expect(nextEnabled(none, null, "down", true)).toBeNull();
    expect(nextEnabled(none, "a", "up", true)).toBeNull();
    expect(nextEnabled([], null, "down", true)).toBeNull();
  });

  it("the result is an item id of the list, never a separator marker", () => {
    let cur: Id | null = null;
    const seen = new Set<Id>();
    for (let i = 0; i < 12; i++) {
      cur = nextEnabled(MIXED, cur, "down", true);
      if (cur !== null) seen.add(cur);
    }
    expect([...seen].sort()).toEqual(["a", "c", "e"]);
  });
});

describe("nextEnabled without wrap (assumed: it stops at the ends)", () => {
  it("down at the last enabled item stays; up at the first stays", () => {
    expect(nextEnabled(MIXED, "e", "down", false)).toBe("e");
    expect(nextEnabled(MIXED, "a", "up", false)).toBe("a");
  });

  it("in the middle it moves like the wrapping version", () => {
    expect(nextEnabled(MIXED, "a", "down", false)).toBe("c");
    expect(nextEnabled(MIXED, "e", "up", false)).toBe("c");
  });
});

describe("type-level contract (MINOR-22): the id union of the caller is kept", () => {
  it("compiles with a literal union and returns a member of it (checked at runtime by value)", () => {
    const r: Id | null = nextEnabled(MIXED, "a", "down", true);
    expect(["a", "b", "c", "d", "e", null]).toContain(r);
  });
});
