import { describe, expect, it } from "vitest";
import {
  buildStatusItems,
  classifyFocusTarget,
  countVisibleSelected,
  focusAreaLabel,
  resolveFocusArea,
  type FocusArea,
  type FocusAreaInput,
  type StatusItemsInput,
} from "./status-bar-model";

// Spec: SPEC-0300-0017 R-970~R-976, AC-932~AC-936 (always-on status items).
//   R-971: #1 `フォーカス: {名前}` / #2 `並び替え: {キー} {↑|↓}` / #3 `選択: {n}`
//          (n = selected among the VISIBLE, i.e. search-filtered, entries; 0 is shown)
//          / #4 `隠し: オン|オフ` / #5 `絞り込み: {検索語}` ONLY while the search bar
//          is active AND the query is non-empty after trimming (E2).
//   R-972: focus-area priority 1..8.
//   R-976: wording is always Japanese.
// Design: SPEC-0200-0001 §3.8.8 (pure functions, DOM/Svelte independent).
// Module under test (stub, not yet implemented): ./status-bar-model.ts

const area = (over: Partial<FocusAreaInput> = {}) =>
  resolveFocusArea({
    modalOpen: false,
    historyOpen: false,
    historyMode: "history",
    sortMenuOpen: false,
    pathEditing: false,
    domArea: null,
    ...over,
  });

describe("resolveFocusArea: R-972 priority 1..8 (AC-935)", () => {
  it("8: nothing focused -> none (AC-935 ix)", () => {
    expect(area()).toBe("none");
  });

  it("7: list focus -> list (AC-935 viii)", () => {
    expect(area({ domArea: "list" })).toBe("list");
  });

  it("6: tree focus -> tree (AC-935 i)", () => {
    expect(area({ domArea: "tree" })).toBe("tree");
  });

  it("5: anywhere inside the search bar (input / buttons) -> search (AC-935 iii, iii-2)", () => {
    expect(area({ domArea: "search" })).toBe("search");
  });

  it("4: path bar editing -> path (AC-935 ii)", () => {
    expect(area({ pathEditing: true })).toBe("path");
  });

  it("3: sort menu open -> sort-menu (AC-935 vi)", () => {
    expect(area({ sortMenuOpen: true })).toBe("sort-menu");
  });

  it("2: history list open -> history; jump list open -> jump (AC-935 iv, v)", () => {
    expect(area({ historyOpen: true, historyMode: "history" })).toBe("history");
    expect(area({ historyOpen: true, historyMode: "jump" })).toBe("jump");
  });

  it("historyMode alone does not count while the list is closed", () => {
    expect(area({ historyOpen: false, historyMode: "jump", domArea: "list" })).toBe("list");
  });

  it("1: a dialog wins over everything (AC-935 vii)", () => {
    expect(
      area({ modalOpen: true, historyOpen: true, historyMode: "jump", sortMenuOpen: true, pathEditing: true, domArea: "search" }),
    ).toBe("dialog");
  });

  it("each level beats every lower level (strict chain)", () => {
    // Peel the higher conditions off one at a time.
    const all: FocusAreaInput = {
      modalOpen: true,
      historyOpen: true,
      historyMode: "history",
      sortMenuOpen: true,
      pathEditing: true,
      domArea: "search",
    };
    expect(resolveFocusArea(all)).toBe("dialog");
    expect(resolveFocusArea({ ...all, modalOpen: false })).toBe("history");
    expect(resolveFocusArea({ ...all, modalOpen: false, historyOpen: false })).toBe("sort-menu");
    expect(resolveFocusArea({ ...all, modalOpen: false, historyOpen: false, sortMenuOpen: false })).toBe("path");
    expect(resolveFocusArea({ ...all, modalOpen: false, historyOpen: false, sortMenuOpen: false, pathEditing: false })).toBe("search");
  });
});

describe("focusAreaLabel: R-972 names (Japanese, R-976)", () => {
  const table: [FocusArea, string][] = [
    ["dialog", "ダイアログ"],
    ["history", "履歴"],
    ["jump", "ジャンプリスト"],
    ["sort-menu", "並び替えメニュー"],
    ["path", "パス"],
    ["search", "検索"],
    ["tree", "ツリー"],
    ["list", "一覧"],
    ["none", "なし"],
  ];
  for (const [a, label] of table) {
    it(`${a} -> ${label}`, () => {
      expect(focusAreaLabel(a)).toBe(label);
    });
  }
});

const items = (over: Partial<StatusItemsInput> = {}) =>
  buildStatusItems({
    focusArea: "list",
    sortKey: "type",
    sortOrder: "asc",
    selectedVisibleCount: 3,
    showHidden: false,
    searchActive: false,
    query: "",
    ...over,
  });
const texts = (over: Partial<StatusItemsInput> = {}) => items(over).map((i) => i.text);

describe("buildStatusItems: the four permanent items (R-971, AC-932, AC-933)", () => {
  it("AC-932: exactly フォーカス / 並び替え / 選択 / 隠し in this order, no F1 item", () => {
    expect(texts()).toEqual(["フォーカス: 一覧", "並び替え: 種類 ↑", "選択: 3", "隠し: オフ"]);
    expect(texts().some((t) => t.includes("F1"))).toBe(false);
    expect(items().map((i) => i.id)).toEqual(["focus", "sort", "selected", "hidden"]);
  });

  it("AC-933: modified descending + hidden shown", () => {
    expect(texts({ sortKey: "modified", sortOrder: "desc", showHidden: true })).toEqual([
      "フォーカス: 一覧",
      "並び替え: 更新日時 ↓",
      "選択: 3",
      "隠し: オン",
    ]);
  });

  it("AC-933: name / size labels", () => {
    expect(texts({ sortKey: "name" })[1]).toBe("並び替え: 名前 ↑");
    expect(texts({ sortKey: "size", sortOrder: "desc" })[1]).toBe("並び替え: サイズ ↓");
  });

  it("the focus item follows the focus area (R-972)", () => {
    expect(texts({ focusArea: "tree" })[0]).toBe("フォーカス: ツリー");
    expect(texts({ focusArea: "none" })[0]).toBe("フォーカス: なし");
    expect(texts({ focusArea: "sort-menu" })[0]).toBe("フォーカス: 並び替えメニュー");
  });

  it("選択 is shown for zero too (P-12)", () => {
    expect(texts({ selectedVisibleCount: 0 })[2]).toBe("選択: 0");
  });
});

describe("buildStatusItems: the conditional 絞り込み item (R-971 #5, E2, AC-934)", () => {
  it("AC-934 (iii): search active with a query -> 5th item `絞り込み: rep`, last of the permanent items", () => {
    const r = items({ searchActive: true, query: "rep", selectedVisibleCount: 2 });
    expect(r.map((i) => i.text)).toEqual(["フォーカス: 一覧", "並び替え: 種類 ↑", "選択: 2", "隠し: オフ", "絞り込み: rep"]);
    expect(r[4].id).toBe("filter");
  });

  it("AC-934 (i): empty query -> no 絞り込み", () => {
    expect(texts({ searchActive: true, query: "" })).toHaveLength(4);
  });

  it("AC-934 (ii): whitespace-only query -> no 絞り込み (SPEC-0300-0012 R-111)", () => {
    expect(texts({ searchActive: true, query: "  " })).toHaveLength(4);
    expect(texts({ searchActive: true, query: "\t 　" })).toHaveLength(4);
  });

  it("search bar closed (inactive) -> no 絞り込み even if a query string remains", () => {
    expect(texts({ searchActive: false, query: "rep" })).toHaveLength(4);
  });

  it("the query is shown as typed (not trimmed)", () => {
    const filter = items({ searchActive: true, query: " rep " })[4];
    expect(filter.text).toBe("絞り込み:  rep ");
  });

  it("R-970: the filter item carries the full text in title (long queries are ellipsized by CSS)", () => {
    const long = "x".repeat(200);
    const filter = items({ searchActive: true, query: long })[4];
    expect(filter.title).toBeDefined();
    expect(filter.title!.includes(long)).toBe(true);
  });
});

describe("countVisibleSelected (R-971 #3, P-12)", () => {
  const visible = [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }];

  it("counts only selected paths that are among the visible entries", () => {
    expect(countVisibleSelected(visible, new Set(["a", "c", "zzz"]))).toBe(2);
  });

  it("AC-934: 5 selected overall, 2 of them visible after filtering -> 2", () => {
    const filtered = [{ path: "p1" }, { path: "p2" }, { path: "p9" }];
    expect(countVisibleSelected(filtered, new Set(["p1", "p2", "p3", "p4", "p5"]))).toBe(2);
  });

  it("nothing selected / nothing visible -> 0", () => {
    expect(countVisibleSelected(visible, new Set())).toBe(0);
    expect(countVisibleSelected([], new Set(["a"]))).toBe(0);
  });

  it("everything selected -> the number of visible entries", () => {
    expect(countVisibleSelected(visible, new Set(["a", "b", "c", "d", "e"]))).toBe(4);
  });
});

describe("classifyFocusTarget: reads data-focus-area through closest() (design §3.8.8)", () => {
  const el = (value: string | null) => ({
    closest: (sel: string) => {
      expect(sel).toContain("data-focus-area");
      return value === null ? null : { getAttribute: (_n: string) => value };
    },
  });

  it("maps the three focusable regions", () => {
    expect(classifyFocusTarget(el("tree"))).toBe("tree");
    expect(classifyFocusTarget(el("list"))).toBe("list");
    expect(classifyFocusTarget(el("search"))).toBe("search");
  });

  it("no marked ancestor -> null", () => {
    expect(classifyFocusTarget(el(null))).toBeNull();
  });

  it("null element (focus fell to nothing) -> null", () => {
    expect(classifyFocusTarget(null)).toBeNull();
  });

  it("an unknown attribute value -> null", () => {
    expect(classifyFocusTarget(el("sidebar"))).toBeNull();
  });
});
