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
    title: "window title is guif (title bar is not reachable over CDP)",
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
    title: "640 x 480, tree + size + time, 100 entries (AC-1804 record): W is about 479, one column of W (a narrow list, R-1792 W < minCol is recorded)",
    async run(t, ctx) {
      const dir = ctx.fx.files("many100", 100);
      await ctx.reload();
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      await ctx.setViewport(640, 480);
      const d = await ctx.m.dims(".file-list-frame .pane-body");
      t.ok(d.clientWidth >= 470 && d.clientWidth <= 490, "W = the list's inner width at 640 x 480 is about 479 (tree 24%)", String(d.clientWidth));
      const info = await ctx.ev(`(() => { const rows = [...document.querySelectorAll('.file-list-row')]; const lefts = new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left))); return { columns: lefts.size, width: rows[0].getBoundingClientRect().width }; })()`);
      t.eq(info.columns, 1, "both columns shown: one column (W is below 2 x the minimum column)");
      t.approx(info.width, d.clientWidth, "that column is W wide", 1.5);
      t.note("AC-1804 record: at 640 x 480 with size + time the list is a narrow list (W < minCol 54ch)");
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
      throw new Skip("[目視]: needs a settings folder written by the previous build; checked inside the AC-1470 procedure (SPEC-0300-0017 AC-946 (iii)); identifier dev.guif.app is checked by the static test", true);
    },
  },
];
