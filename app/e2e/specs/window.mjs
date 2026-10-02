// SPEC-0300-0017 §16.10 / §16.11: the window (AC-942, AC-945) and the manual-only items.
import { Skip } from "../lib/report.mjs";

export const tests = [
  {
    id: "AC-942",
    title: "initial window inner size is 1000 x 700 (no Emulation override; runs first)",
    async run(t, ctx) {
      // No setViewport has been sent yet: this is the real initial window (logical px).
      const size = await ctx.ev(`({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })`);
      ctx.log(`window.inner = ${size.w} x ${size.h} (devicePixelRatio ${size.dpr})`);
      t.eq(size.w, 1000, "innerWidth");
      t.eq(size.h, 700, "innerHeight");
    },
  },
  {
    id: "AC-942-title",
    title: "window title is ReflexFiles (title bar is not reachable over CDP)",
    async run() {
      throw new Skip("check the title bar by eye; tauri.conf.json is verified by the static test (AC-946)", true);
    },
  },
  {
    id: "AC-927-1",
    title: "Ctrl+wheel / Ctrl+= / Ctrl+- do not zoom",
    async run() {
      throw new Skip("[目視] spec marks this manual: devicePixelRatio and the list size must not change", true);
    },
  },
  {
    id: "AC-945",
    title: "640 x 480, tree + size + time, 100 entries: W = 411, column width = 400 (not a narrow list)",
    async run(t, ctx) {
      const dir = ctx.fx.files("many100", 100);
      await ctx.reload();
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      await ctx.setViewport(640, 480);
      const d = await ctx.m.dims(".file-list-frame");
      t.eq(d.clientWidth, 411, "W = frame clientWidth at 640 x 480");
      const colWidth = await ctx.m.cs(".file-list", ["--list-col-width"]);
      t.eq(colWidth["--list-col-width"].trim(), "400px", "--list-col-width (minCol 400)");
      const grid = await ctx.m.cs(".file-list-row", ["grid-template-columns"]);
      t.eq(grid["grid-template-columns"], "180px 64px 140px", "row grid is the normal (not narrow) one");
    },
  },
  {
    id: "AC-945-shrink",
    title: "dragging the window below 640 x 480 is refused",
    async run() {
      throw new Skip("[目視]: drag the window edge; minWidth/minHeight come from tauri.conf.json (static test AC-946)", true);
    },
  },
  {
    id: "AC-946-restore",
    title: "ui-state.toml saved by the previous version is restored after the productName change",
    async run() {
      throw new Skip("[目視]: needs a settings folder written by the previous build; identifier is unchanged (static test)", true);
    },
  },
];
