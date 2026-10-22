import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1662 / 【確定 T-14】 (each list of a start-up notice shows the FIRST 5 items and the rest as `ほか {m} 件`),
//   AC-1643 (8 invalid keymap entries -> the first 5 and `ほか 3 件`), SPEC-0300-0019 第5版 §4.3 / §4.8 (W-32 / W-9A / W-9C / W-AC lists).
// Architecture: SPEC-0200-0001 §3.17.8: `shared/notice-list.ts` -- `limitList(items: readonly string[], max = 5): string`: the first `max` items joined
//   by `, `, and when more remain `, ほか {m} 件` (m = how many were left out). A pure function; `shared/` imports no feature.
//
// Module under test (not yet implemented): ./notice-list.ts

import { limitList } from "./notice-list";

const items = (n: number): string[] => Array.from({ length: n }, (_, i) => `item${i + 1}`);

describe("limitList: up to five items are listed in full (R-1662)", () => {
  it("no items give an empty string", () => {
    expect(limitList([])).toBe("");
  });

  it("one item is the item itself, no separator", () => {
    expect(limitList(["copy(12 行目)"])).toBe("copy(12 行目)");
  });

  it.each([2, 3, 4, 5])("%i items are joined by `, ` with no `ほか`", (n) => {
    expect(limitList(items(n))).toBe(items(n).join(", "));
    expect(limitList(items(n))).not.toContain("ほか");
  });
});

describe("limitList: more than five are cut after the fifth (R-1662, AC-1643)", () => {
  it("six items: the first five, then `ほか 1 件`", () => {
    expect(limitList(items(6))).toBe("item1, item2, item3, item4, item5, ほか 1 件");
  });

  it("eight items (AC-1643): the first five, then `ほか 3 件`", () => {
    expect(limitList(items(8))).toBe("item1, item2, item3, item4, item5, ほか 3 件");
  });

  it("a hundred items: still five and `ほか 95 件`", () => {
    expect(limitList(items(100))).toBe("item1, item2, item3, item4, item5, ほか 95 件");
  });

  it("the items are kept as given (their own text, even with `, ` or parentheses inside) and in the given order", () => {
    const a = ["3(VS Codeで開く、20 行目)", "copy(12 行目)", "z", "y", "x", "w"];
    expect(limitList(a)).toBe("3(VS Codeで開く、20 行目), copy(12 行目), z, y, x, ほか 1 件");
  });

  it("does not change the input array", () => {
    const a = items(7);
    limitList(a);
    expect(a).toEqual(items(7));
  });
});

describe("limitList: the optional `max`", () => {
  it("max = 2 cuts after the second item", () => {
    expect(limitList(items(4), 2)).toBe("item1, item2, ほか 2 件");
  });

  it("exactly `max` items are not cut", () => {
    expect(limitList(items(2), 2)).toBe("item1, item2");
  });

  it("the default is 5 (same as passing 5)", () => {
    expect(limitList(items(9))).toBe(limitList(items(9), 5));
  });
});
