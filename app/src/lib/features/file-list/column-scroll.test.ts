import { describe, expect, it } from "vitest";
import { columnScroll, type ColumnScrollParams } from "./column-scroll";

// Spec: SPEC-0300-0017 R-958 (auto column scroll that follows the focus row; a scroll-event
// snap to a pitch multiple on the next animation frame) / SPEC-0200-0001 §3.8.6 (raf is injected).

function fakeNode() {
  const listeners = new Map<string, () => void>();
  return {
    scrollLeft: 0,
    addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
    removeEventListener: (type: string) => void listeners.delete(type),
    fire: (type: string) => listeners.get(type)?.(),
    hasListener: (type: string) => listeners.has(type),
  };
}

function fakeRaf() {
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    raf: (cb: () => void) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    cancelRaf: (id: number) => void queue.delete(id),
    flush() {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((cb) => cb());
    },
    pending: () => queue.size,
  };
}

// AC-921 geometry: rows 20, 2 visible columns, pitch 268, 5 columns in total.
const base: Omit<ColumnScrollParams, "focusIndex" | "onScroll"> = { rows: 20, cols: 2, pitch: 268, needed: 5 };

function setup(focusIndex = 0) {
  const node = fakeNode();
  const loop = fakeRaf();
  const seen: number[] = [];
  const params = (index: number): ColumnScrollParams => ({ ...base, focusIndex: index, onScroll: (v) => seen.push(v) });
  const action = columnScroll(node as unknown as HTMLElement, params(focusIndex), loop);
  return { node, loop, seen, action, params };
}

describe("columnScroll: follows the focus row (R-958)", () => {
  it("moving the focus to a column outside the view scrolls to a pitch multiple (AC-924 values)", () => {
    const { node, action, params } = setup();
    action.update(params(20));
    expect(node.scrollLeft).toBe(0);
    action.update(params(40));
    expect(node.scrollLeft).toBe(268);
    action.update(params(60));
    expect(node.scrollLeft).toBe(536);
    action.update(params(80));
    expect(node.scrollLeft).toBe(804);
  });

  it("a visible column does not move the scroll position", () => {
    const { node, action, params } = setup();
    node.scrollLeft = 268;
    action.update(params(40));
    expect(node.scrollLeft).toBe(268);
  });

  it("reports the scroll position to the callback (feeds the edge markers)", () => {
    const { seen, action, params } = setup();
    action.update(params(40));
    expect(seen.at(-1)).toBe(268);
  });

  it("an unshown focus row (index -1) keeps the position but clamps it to the maximum", () => {
    const { node, action, params } = setup();
    node.scrollLeft = 5000;
    action.update(params(-1));
    expect(node.scrollLeft).toBe(804);
  });
});

describe("columnScroll: snap (R-958 safety net)", () => {
  it("a scroll event schedules a snap to the nearest pitch multiple on the next frame (AC-924-1)", () => {
    const { node, loop } = setup();
    node.scrollLeft = 300;
    node.fire("scroll");
    expect(node.scrollLeft).toBe(300); // not before the frame
    loop.flush();
    expect(node.scrollLeft).toBe(268);
  });

  it("repeated scroll events keep only the latest snap request", () => {
    const { node, loop } = setup();
    node.fire("scroll");
    node.fire("scroll");
    expect(loop.pending()).toBe(1);
  });

  it("destroy removes the listener and cancels pending frames", () => {
    const { node, loop, action } = setup();
    node.fire("scroll");
    action.destroy();
    expect(node.hasListener("scroll")).toBe(false);
    expect(loop.pending()).toBe(0);
  });
});
