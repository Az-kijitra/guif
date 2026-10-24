import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1763 (the list heading `ファイル ({n} 件) [並び: {キー} {方向}]`, W-C0), R-1764 (the tree heading `ドライブ / ツリー`, W-C1),
//   R-1795 (the hidden-column markers are in the HEADING: `◀ ` in front, ` ▶` behind), R-1765 (display only), R-1804 (tree width = floor(body width x
//   tree_width_percent / 100)), AC-1760, AC-1761, AC-1762, AC-1804; SPEC-0300-0019 第6版 §4.10 W-C0 / W-C1 and the term table (`昇順` / `降順`).
// Architecture: SPEC-0200-0001 §3.18.7 / §3.18.8: `features/file-list/pane-layout.ts` (new, <= 90 lines; wording from `file-list/messages.ts`, the sort-key
//   names of W-06 are reused):
//   listHeadingText({ count, sortKey, sortOrder, hasLeft, hasRight }): string     // hasLeft = startCol > 0; hasRight = startCol + shown < totalCols
//   treeHeadingText(): string
//   treePanelWidthPx(bodyWidth: number, percent: number): number                  // floor(bodyWidth * percent / 100): an integer px (CSS % does not floor)
//
// Module under test (not yet implemented): ./pane-layout.ts

import { listHeadingText, treeHeadingText, treePanelWidthPx } from "./pane-layout";

const base = { hasLeft: false, hasRight: false } as const;

describe("listHeadingText (W-C0)", () => {
  it("AC-1760: 78 items sorted by type ascending -> `ファイル (78 件) [並び: 種類 昇順]`", () => {
    expect(listHeadingText({ count: 78, sortKey: "type", sortOrder: "asc", ...base })).toBe("ファイル (78 件) [並び: 種類 昇順]");
  });

  it("AC-1761: 12 items sorted by modified descending -> `ファイル (12 件) [並び: 更新日時 降順]`", () => {
    expect(listHeadingText({ count: 12, sortKey: "modified", sortOrder: "desc", ...base })).toBe("ファイル (12 件) [並び: 更新日時 降順]");
  });

  it.each([
    ["name", "名前"],
    ["size", "サイズ"],
    ["type", "種類"],
    ["modified", "更新日時"],
  ] as const)("the key %s is shown as %s (the W-06 names)", (sortKey, label) => {
    expect(listHeadingText({ count: 1, sortKey, sortOrder: "asc", ...base })).toBe(`ファイル (1 件) [並び: ${label} 昇順]`);
  });

  it("0 items is `0 件` (the empty list still has its heading)", () => {
    expect(listHeadingText({ count: 0, sortKey: "name", sortOrder: "asc", ...base })).toBe("ファイル (0 件) [並び: 名前 昇順]");
  });

  it("the count is written as a plain number (no thousands separator)", () => {
    expect(listHeadingText({ count: 12345, sortKey: "name", sortOrder: "asc", ...base })).toContain("(12345 件)");
  });

  it("AC-1762: hidden columns on the right -> a trailing ` ▶`; on the left -> a leading `◀ `; both; neither", () => {
    const h = "ファイル (100 件) [並び: 名前 昇順]";
    expect(listHeadingText({ count: 100, sortKey: "name", sortOrder: "asc", hasLeft: false, hasRight: true })).toBe(`${h} ▶`);
    expect(listHeadingText({ count: 100, sortKey: "name", sortOrder: "asc", hasLeft: true, hasRight: true })).toBe(`◀ ${h} ▶`);
    expect(listHeadingText({ count: 100, sortKey: "name", sortOrder: "asc", hasLeft: true, hasRight: false })).toBe(`◀ ${h}`);
    expect(listHeadingText({ count: 100, sortKey: "name", sortOrder: "asc", hasLeft: false, hasRight: false })).toBe(h);
  });
});

describe("treeHeadingText (W-C1)", () => {
  it("is `ドライブ / ツリー` with none of tuif's key hints (R-1764)", () => {
    expect(treeHeadingText()).toBe("ドライブ / ツリー");
  });
});

describe("treePanelWidthPx (R-1804 1, AC-1804)", () => {
  it("floor(body width x percent / 100): 996 x 24% = 239.04 -> 239 (inner width 1000 minus the 2 + 2 margin)", () => {
    expect(treePanelWidthPx(996, 24)).toBe(239);
  });

  it("an exact value is kept: 1000 x 24% = 240, 1000 x 40% = 400, 640 x 10% = 64", () => {
    expect(treePanelWidthPx(1000, 24)).toBe(240);
    expect(treePanelWidthPx(1000, 40)).toBe(400);
    expect(treePanelWidthPx(640, 10)).toBe(64);
  });

  it("the fraction is cut, never rounded up: 636 x 24% = 152.64 -> 152 (R-1754 note: about 152px at 640)", () => {
    expect(treePanelWidthPx(636, 24)).toBe(152);
    expect(treePanelWidthPx(999, 50)).toBe(499);
  });

  it("the result is an integer and never negative (a 0-wide body gives 0)", () => {
    expect(treePanelWidthPx(0, 24)).toBe(0);
    expect(Number.isInteger(treePanelWidthPx(1234, 33))).toBe(true);
    expect(treePanelWidthPx(1234, 33)).toBe(407);
  });

  it("the whole range 10..50 is accepted as given (range checking is the back end's)", () => {
    expect(treePanelWidthPx(1000, 10)).toBe(100);
    expect(treePanelWidthPx(1000, 50)).toBe(500);
  });
});
