import { describe, expect, it } from "vitest";
import { createStatusBarModel, type StatusBarModelDeps } from "./status-bar-wiring.svelte";

// Spec: SPEC-0300-0017 R-971 / R-972; SPEC-0200-0001 §3.8.8, §3.8.17 SHOULD-148 / SHOULD-149.
// `createStatusBarModel.attach(doc, win)` tracks the keyboard-focus region from the DOM.
// It must NOT trust `relatedTarget`: after every focusin / focusout (and window focus /
// blur) it re-reads `doc.activeElement` in a microtask and classifies it.

type Listener = () => void;

function fakeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listeners,
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    fire(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

type Region = "tree" | "list" | "search" | "other";
function element(region: Region) {
  return {
    closest: () => (region === "other" ? null : { getAttribute: () => region }),
  };
}

function fakeDoc() {
  const target = fakeTarget();
  const doc = Object.assign(target, { activeElement: null as ReturnType<typeof element> | null });
  return doc;
}

const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

function deps(over: Partial<StatusBarModelDeps> = {}): StatusBarModelDeps {
  return {
    fileList: { sortKey: () => "name", sortOrder: () => "asc", showHidden: () => false, selected: new Set<string>() },
    search: { active: false, query: "" },
    history: { isOpen: false, mode: "history" },
    sortMenu: { isOpen: false },
    modal: { isOpen: false },
    pathEditing: () => false,
    filteredEntries: () => [],
    ...over,
  };
}

const focusText = (model: ReturnType<typeof createStatusBarModel>) => model.items[0].text;

describe("createStatusBarModel (SPEC-0300-0017 R-971, R-972)", () => {
  it("items follow the injected state: sort, selection among the visible entries, hidden, filter", () => {
    const model = createStatusBarModel(
      deps({
        fileList: { sortKey: () => "modified", sortOrder: () => "desc", showHidden: () => true, selected: new Set(["a", "z"]) },
        filteredEntries: () => [{ path: "a" }, { path: "b" }],
        search: { active: true, query: "rep" },
      }),
    );
    expect(model.items.map((i) => i.text)).toEqual([
      "フォーカス: なし",
      "並び替え: 更新日時 ↓",
      "選択: 1",
      "隠し: オン",
      "絞り込み: rep",
    ]);
  });

  it("dialog > history > sort menu > path editing win over the DOM focus area", () => {
    const doc = fakeDoc();
    doc.activeElement = element("list");
    const state = { modal: { isOpen: false }, history: { isOpen: false, mode: "history" as const } };
    const model = createStatusBarModel(deps({ modal: state.modal, history: state.history }));
    const off = model.attach(doc);
    expect(focusText(model)).toBe("フォーカス: 一覧");
    state.history = { isOpen: true, mode: "history" };
    const m2 = createStatusBarModel(deps({ history: state.history, modal: { isOpen: true } }));
    expect(focusText(m2)).toBe("フォーカス: ダイアログ");
    off();
  });
});

describe("attach: focus tracking (SHOULD-149)", () => {
  it("subscribes to focusin / focusout on the document and focus / blur on the window, and unsubscribes", () => {
    const doc = fakeDoc();
    const win = fakeTarget();
    const off = createStatusBarModel(deps()).attach(doc, win);
    expect([doc.count("focusin"), doc.count("focusout"), win.count("focus"), win.count("blur")]).toEqual([1, 1, 1, 1]);
    off();
    expect([doc.count("focusin"), doc.count("focusout"), win.count("focus"), win.count("blur")]).toEqual([0, 0, 0, 0]);
  });

  it("reads activeElement after a focusin (microtask), classifying tree / list / search", async () => {
    const doc = fakeDoc();
    const model = createStatusBarModel(deps());
    model.attach(doc);
    expect(model.domArea).toBeNull();
    for (const [region, text] of [["tree", "ツリー"], ["list", "一覧"], ["search", "検索"]] as const) {
      doc.activeElement = element(region);
      doc.fire("focusin");
      await flushMicrotasks();
      expect(model.domArea).toBe(region);
      expect(focusText(model)).toBe(`フォーカス: ${text}`);
    }
  });

  it("a focusout that leaves nothing focused (activeElement null / unmarked) -> なし, without any relatedTarget", async () => {
    const doc = fakeDoc();
    const model = createStatusBarModel(deps());
    model.attach(doc);
    doc.activeElement = element("list");
    doc.fire("focusin");
    await flushMicrotasks();
    expect(model.domArea).toBe("list");
    doc.activeElement = null;
    doc.fire("focusout");
    await flushMicrotasks();
    expect(model.domArea).toBeNull();
    expect(focusText(model)).toBe("フォーカス: なし");
    doc.activeElement = element("other"); // e.g. document.body
    doc.fire("focusout");
    await flushMicrotasks();
    expect(model.domArea).toBeNull();
  });

  it("an element removed from the DOM: the next focusout re-reads and no stale area remains", async () => {
    const doc = fakeDoc();
    const model = createStatusBarModel(deps());
    model.attach(doc);
    doc.activeElement = element("search");
    doc.fire("focusin");
    await flushMicrotasks();
    expect(model.domArea).toBe("search");
    doc.activeElement = element("other"); // the search bar was removed; focus fell to body
    doc.fire("focusout");
    await flushMicrotasks();
    expect(model.domArea).toBeNull();
  });

  it("window blur then focus: re-evaluated each time, ends on the element that is active again", async () => {
    const doc = fakeDoc();
    const win = fakeTarget();
    const model = createStatusBarModel(deps());
    model.attach(doc, win);
    doc.activeElement = element("list");
    win.fire("focus");
    await flushMicrotasks();
    expect(model.domArea).toBe("list");
    win.fire("blur");
    await flushMicrotasks();
    expect(model.domArea).toBe("list"); // the DOM still has its active element while the window is inactive
    doc.activeElement = element("tree");
    win.fire("focus");
    await flushMicrotasks();
    expect(model.domArea).toBe("tree");
  });

  it("the initial state is read on attach", () => {
    const doc = fakeDoc();
    doc.activeElement = element("tree");
    const model = createStatusBarModel(deps());
    model.attach(doc);
    expect(model.domArea).toBe("tree");
  });
});
