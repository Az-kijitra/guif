// SPEC-0300-0017 AC-907: the main window's look must not reach the viewer window.
import { Cdp, listTargets, sleep } from "../lib/cdp.mjs";

export const tests = [
  {
    id: "AC-907",
    title: "viewer window keeps its own dark look: html/body #1e1e1e, margin 8px, overflow visible, no color-scheme, no --ui-* variables",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("viewer");
      ctx.fx.file("viewer", "note.txt");
      await ctx.reload();
      await ctx.nav(dir);
      await ctx.focusList();
      await ctx.press.enter(); // open the focused file in the viewer window
      let target;
      for (let i = 0; i < 60 && target === undefined; i++) {
        const targets = await listTargets(ctx.port);
        target = targets.find((x) => x.type === "page" && x.url.includes("/viewer"));
        if (target === undefined) await sleep(500);
      }
      t.ok(target !== undefined, "the viewer page appears on the debug port");
      if (target === undefined) return;
      const viewer = await Cdp.connect(target.webSocketDebuggerUrl);
      try {
        for (let i = 0; i < 40; i++) {
          if (await viewer.ev(`!!document.querySelector('.viewer')`)) break;
          await sleep(250);
        }
        const s = await viewer.ev(`(() => {
          const cs = (e) => getComputedStyle(e);
          const root = document.querySelector('.viewer');
          return {
            htmlBg: cs(document.documentElement).backgroundColor, bodyBg: cs(document.body).backgroundColor,
            bodyMargin: cs(document.body).margin,
            overflow: [cs(document.documentElement).overflowX, cs(document.documentElement).overflowY, cs(document.body).overflowX, cs(document.body).overflowY],
            htmlScheme: cs(document.documentElement).colorScheme, bodyScheme: cs(document.body).colorScheme,
            rootColor: cs(root).color, rootFont: cs(root).fontFamily,
            uiBg: cs(document.documentElement).getPropertyValue('--ui-bg'),
            rowHeight: cs(document.documentElement).getPropertyValue('--list-row-height'),
          };
        })()`);
        t.eq(s.htmlBg, "rgb(30, 30, 30)", "html background");
        t.eq(s.bodyBg, "rgb(30, 30, 30)", "body background");
        t.eq(s.bodyMargin, "8px", "body margin (the WebView default)");
        t.eq(s.overflow, ["visible", "visible", "visible", "visible"], "html / body overflow");
        t.eq([s.htmlScheme, s.bodyScheme], ["normal", "normal"], "color-scheme");
        t.eq(s.rootColor, "rgb(221, 221, 221)", "viewer text colour");
        t.eq(s.rootFont, "sans-serif", "viewer root font-family");
        t.eq(s.uiBg, "", "--ui-bg is not defined in the viewer (app.css is not loaded)");
        t.eq(s.rowHeight, "", "--list-row-height is not defined in the viewer");
      } finally {
        viewer.close();
      }
    },
  },
];
