/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0200-0001 §3.14.1-2: `context-menu/menu-keys.ts` becomes a thin delegation to `shared/menu-navigation.ts`
//   (the navigation is shared; the evaluation and the model are NOT). The existing `menu-keys.test.ts` stays UNCHANGED and is the
//   regression detector; this file only pins the structural fact that the delegation really happened (no second copy of the loop).

describe("context-menu/menu-keys.ts delegates to shared/menu-navigation (SPEC-0200-0001 §3.14.1-2)", () => {
  const src = readFileSync(resolve(__dirname, "menu-keys.ts"), "utf-8");

  it("imports from $lib/shared/menu-navigation", () => {
    expect(src).toMatch(/from\s+["']\$lib\/shared\/menu-navigation["']/);
  });

  it("still exports the two functions its own test file uses (moveMenuHighlight, resolveEnterTarget) and resolveContextMenuKey", () => {
    expect(src).toMatch(/export\s+function\s+moveMenuHighlight\b/);
    expect(src).toMatch(/export\s+function\s+resolveEnterTarget\b/);
    expect(src).toMatch(/export\s+function\s+resolveContextMenuKey\b/);
  });

  it("no longer carries its own modulo-wrap loop (`% ids.length`)", () => {
    expect(src).not.toMatch(/%\s*ids\.length/);
  });
});
