/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0017 R-991 (initial size 1000 x 700), R-991-1 (minimum inner
// size 640 x 480, ISS-0181 / P-21 approved), R-992 (window title `ReflexFiles`),
// R-993 / AC-946 (`productName` = `ReflexFiles`, `identifier` unchanged so the
// settings folder stays the same), R-958-1 (Ctrl+wheel zoom stays disabled).
// Design: SPEC-0200-0001 §3.8.10, §3.8.18 (minWidth/minHeight added, initial size kept).

type WindowConf = Record<string, unknown>;
interface TauriConf {
  productName?: string;
  identifier?: string;
  app?: { windows?: WindowConf[] };
}

const conf = JSON.parse(readFileSync(join(resolve(__dirname), "..", "src-tauri", "tauri.conf.json"), "utf-8")) as TauriConf;
const main = (conf.app?.windows ?? []).find((w) => w.label === "main") ?? (conf.app?.windows ?? [])[0] ?? {};

describe("tauri.conf.json: product and window (AC-946, R-991~R-993)", () => {
  it("AC-946: productName is ReflexFiles", () => {
    expect(conf.productName).toBe("ReflexFiles");
  });

  it("AC-946: identifier is unchanged (dev.reflexfiles.successor) so the settings folder does not move", () => {
    expect(conf.identifier).toBe("dev.reflexfiles.successor");
  });

  it("R-992: the main window title is ReflexFiles (same name as the product)", () => {
    expect(main.title).toBe("ReflexFiles");
    expect(main.title).toBe(conf.productName);
  });

  it("R-993: the old name `ReflexFiles Successor (Phase 1)` is gone from the config", () => {
    expect(JSON.stringify(conf)).not.toContain("Successor (Phase 1)");
  });

  it("R-991: initial size stays 1000 x 700", () => {
    expect(main.width).toBe(1000);
    expect(main.height).toBe(700);
  });

  it("R-991-1: minimum size is 640 x 480", () => {
    expect(main.minWidth).toBe(640);
    expect(main.minHeight).toBe(480);
  });

  it("R-958-1 / design §3.8.6: zoomHotkeysEnabled is explicitly false", () => {
    expect(main.zoomHotkeysEnabled).toBe(false);
  });
});

// Phase 12 (SPEC-0300-0017 R-919-1, SPEC-0200-0001 §3.11.5 / §3.11.12 (5)): the main window is created hidden
// so that Rust can set the theme background colour in `.setup` and only then `show()` it. Without this the
// default white WebView2 background would show first (a flash of the wrong theme beyond 0.2 s).
describe("tauri.conf.json: main window starts hidden (R-919-1, §3.11.5)", () => {
  it("the main window has `visible: false` (Rust shows it in .setup after the background colour is set)", () => {
    expect(main.visible).toBe(false);
  });

  it("R-991 / R-992 are untouched (size and title still set)", () => {
    expect(main.width).toBe(1000);
    expect(main.title).toBe("ReflexFiles");
  });
});
