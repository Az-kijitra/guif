/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0010 第16版 R-14-5-4 (the menu items do NOT go through the key dispatch; the key-only suppressions R-15-1 / R-14-2 and
//   SPEC-0300-0014 R-306-1 stay as they are for KEYS), SPEC-0300-0020 R-1340-1, AC-94.
// Architecture: SPEC-0200-0001 §3.14.12-13 SHOULD-204 (a): "the key path (`key-dispatch.ts` / `main-keydown-wiring.ts`) passes no third argument to
//   `onListAction`" -- so the guard can only be lifted by the menu's own call, never by a key. (b)/(c) are behavioural, see
//   list-action-wiring-menu.test.ts and menu-bar-exec.test.ts.

const ROUTES = resolve(__dirname);
const KEYBOARD = resolve(__dirname, "..", "lib", "features", "keyboard");
const read = (p: string): string => readFileSync(p, "utf-8");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// top-level argument count of every `name(` call in `src`
function callArities(src: string, name: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(`${name}(`, from);
    if (at < 0) return out;
    let i = at + name.length + 1;
    let depth = 1;
    let args = 0;
    let sawToken = false;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if (ch === "," && depth === 1) args++;
      else if (!/\s/.test(ch)) sawToken = true;
      i++;
    }
    out.push(sawToken ? args + 1 : 0);
    from = i;
  }
}

describe("SHOULD-204 (a): the key path never passes a third argument to onListAction", () => {
  it("every `onListAction(` call in key-dispatch.ts has at most 2 arguments, and there is at least one", () => {
    const calls = callArities(stripComments(read(resolve(KEYBOARD, "key-dispatch.ts"))), "onListAction");
    expect(calls.length).toBeGreaterThan(0);
    for (const n of calls) expect(n).toBeLessThanOrEqual(2);
  });

  it("main-keydown-wiring.ts hands `deps.onListAction` over as is (no wrapper that could add { source: 'menu' })", () => {
    const src = stripComments(read(resolve(ROUTES, "main-keydown-wiring.ts")));
    expect(src).toMatch(/onListAction:\s*deps\.onListAction\b/);
    expect(src).not.toMatch(/\bsource\b/);
    expect(src).not.toMatch(/["']menu["']/);
  });

  it("key-dispatch.ts does not mention a source / 'menu' option for the list handler either", () => {
    const src = stripComments(read(resolve(KEYBOARD, "key-dispatch.ts")));
    expect(src).not.toMatch(/source\s*:\s*["']menu["']/);
  });

  it("the tree action handler (R-15) is not given a menu source", () => {
    expect(stripComments(read(resolve(ROUTES, "tree-action-wiring.ts")))).not.toMatch(/source\s*:\s*["']menu["']/);
  });
});

describe("the only place that understands source 'menu' is list-action-wiring.ts (the guard) and the menu's own execution table", () => {
  it("list-action-wiring.ts reads the option and still has the TREE_FOCUS_BLOCKED_ACTIONS guard (key path)", () => {
    const src = read(resolve(ROUTES, "list-action-wiring.ts"));
    expect(src).toMatch(/["']menu["']/);
    expect(src).toContain("TREE_FOCUS_BLOCKED_ACTIONS");
    expect(src).toMatch(/source/);
  });
});

describe("callArities self-check (the scanner itself)", () => {
  it("counts top-level arguments only", () => {
    expect(callArities("f(a, b)", "f")).toEqual([2]);
    expect(callArities("f(a, g(b, c), { x: 1, y: 2 })", "f")).toEqual([3]);
    expect(callArities("f()", "f")).toEqual([0]);
    expect(callArities("f(a)\nf(a, b, c)", "f")).toEqual([1, 3]);
  });
});
