/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0020 R-1350 2 / R-1350-1 / AC-1345, SPEC-0200-0001 §3.14.12-9 (c): the Alt / F10 preventDefault layer is the menu-bar
//   wiring's own window listeners (capture), and only they; the Alt tracker is fed by keydown, keyup and pointerdown; the activation is
//   withheld while an overlay shows or the path bar is edited.

const wiring = readFileSync(resolve(__dirname, "menu-bar-wiring.svelte.ts"), "utf-8");
const keydown = readFileSync(resolve(__dirname, "main-keydown-wiring.ts"), "utf-8");

describe("the Alt-alone listeners in menu-bar-wiring", () => {
  it.each([
    ["keydown", "onKeyDown"],
    ["keyup", "onKeyUp"],
    ["pointerdown", "onPointerDown"],
  ])("registers a capture %s listener and removes it", (type, handler) => {
    expect(wiring).toContain(`win.addEventListener("${type}", ${handler}, true);`);
    expect(wiring).toContain(`win.removeEventListener("${type}", ${handler}, true);`);
  });

  it("uses the tracker and the pure reducer, and resets the tracker on window blur", () => {
    expect(wiring).toContain("createAltTracker()");
    expect(wiring).toContain("reduceAltAlone(");
    expect(wiring).toContain("tracker.reset()");
  });

  it("withholds activation while an overlay shows or the path bar is edited (canActivate)", () => {
    expect(wiring).toContain("const canActivate = (): boolean => !isOverlayOpen() && !deps.pathEditing();");
  });

  it("the main keydown handler keeps its single generic preventDefault and knows nothing about the Alt key (one layer)", () => {
    expect(keydown.match(/preventDefault[(]/g)?.length).toBe(1);
    expect(keydown).not.toContain('"Alt"');
  });
});
