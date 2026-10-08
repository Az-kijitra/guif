// SPEC-0300-0017 AC-907 (i)/(ii as rewritten for the 5th edition): the main window's look must not reach the
// viewer window, and the viewer paints its own palette (R-913-1 / R-913-2). This file is the light-pinned
// (ui_theme = "light") run; the dark side is in theme.mjs. Also: the viewer must really show the file's content.
import fs from "node:fs";
import { fixedThemeNote } from "../lib/os-theme.mjs";
import { openViewerWindow, waitViewerShows } from "./_util.mjs";

/** The computed look of a viewer document (shared with theme.mjs through the same expression). */
export const VIEWER_LOOK = `(() => {
  const cs = (e) => getComputedStyle(e);
  const root = document.querySelector('.viewer');
  return {
    htmlBg: cs(document.documentElement).backgroundColor, bodyBg: cs(document.body).backgroundColor,
    margins: [cs(document.documentElement).margin, cs(document.body).margin],
    // R-913-3: the document itself never scrolls (scrollingElement = html in standards mode).
    fits: (() => { const d = document.scrollingElement; return [d.scrollHeight === d.clientHeight, d.scrollWidth === d.clientWidth, d.scrollHeight, d.clientHeight]; })(),
    overflow: [cs(document.documentElement).overflowX, cs(document.documentElement).overflowY, cs(document.body).overflowX, cs(document.body).overflowY],
    htmlScheme: cs(document.documentElement).colorScheme,
    rootColor: cs(root).color, rootFont: cs(root).fontFamily,
    uiBg: cs(document.documentElement).getPropertyValue('--ui-bg'),
    rowHeight: cs(document.documentElement).getPropertyValue('--list-row-height'),
    uiVars: ['--ui-bg','--ui-fg','--ui-surface','--ui-border','--ui-focused','--ui-error'].map((n) => cs(document.documentElement).getPropertyValue(n)).filter((v) => v !== ''),
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
  };
})()`;

export const tests = [
  {
    id: "AC-907",
    title: "viewer (light pinned): html/body #fff, text #111, html color-scheme light, margin 0 and no document scrollbar, overflow visible, no --ui-* variables; the file's content is shown",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("viewer");
      const file = ctx.fx.file("viewer", "note.txt");
      fs.writeFileSync(file, "viewer content line one\nsecond line\n");
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx); // Enter on the first (only) file
      if (viewer === undefined) return;
      try {
        // The content must appear (not just the frame): a one-off "No file selected" was seen once.
        if (!(await waitViewerShows(t, viewer, "note.txt", "text", { contains: "viewer content line one" }))) return;
        const body = await viewer.ev(`document.querySelector('.viewer-body .text-view')?.textContent ?? ''`);
        t.ok(body.includes("viewer content line one") && body.includes("second line"), "the viewer body shows the file's text", JSON.stringify(body.slice(0, 80)));
        t.eq(await viewer.ev(`!!document.querySelector('.viewer-body .placeholder')`), false, "no placeholder is left in the body");

        const s = await viewer.ev(VIEWER_LOOK);
        t.eq(s.htmlBg, "rgb(255, 255, 255)", "html background");
        t.eq(s.bodyBg, "rgb(255, 255, 255)", "body background");
        t.eq(s.margins, ["0px", "0px"], "html / body margin (R-913-3)");
        t.eq(s.fits.slice(0, 2), [true, true], "the document has no scrollbar (scrollHeight/Width = clientHeight/Width)", JSON.stringify(s.fits));
        t.eq(s.overflow, ["visible", "visible", "visible", "visible"], "html / body overflow");
        t.eq(s.htmlScheme, "light", "html color-scheme (R-913-2)");
        t.eq(s.rootColor, "rgb(17, 17, 17)", "viewer text colour");
        t.eq(s.rootFont, "sans-serif", "viewer root font-family");
        t.eq(s.uiBg, "", "--ui-bg is not defined in the viewer (app.css is not loaded)");
        t.eq(s.rowHeight, "", "--list-row-height is not defined in the viewer");
        t.eq(s.uiVars, [], "none of the R-911 variables is defined in the viewer");
        t.eq(s.prefersDark, false, "the viewer follows the pinned light theme (prefers-color-scheme: dark does not match)");
        const note = fixedThemeNote("light", ctx.osTheme ?? null);
        if (note !== null) t.note(note);
      } finally {
        viewer.close();
      }
    },
  },
];

// ------------------------------------------------------------- AC-955 palette (shared with theme.mjs)

/** R-913-1 as getComputedStyle prints it. */
export const VIEWER_PALETTE = {
  light: { header: "rgb(240, 240, 240)", border: "rgb(208, 208, 208)", bannerBg: "rgb(255, 244, 206)", bannerFg: "rgb(92, 68, 0)", error: "rgb(176, 0, 32)", lineno: "rgb(102, 102, 102)" },
  dark: { header: "rgb(42, 42, 42)", border: "rgb(68, 68, 68)", bannerBg: "rgb(74, 59, 0)", bannerFg: "rgb(255, 216, 102)", error: "rgb(255, 128, 128)", lineno: "rgb(119, 119, 119)" },
};

const SIZE_OVER_LIMIT = 2.5 * 1024 * 1024; // "2 MiB を超える" -> the truncation banner

/**
 * AC-955: opens a short text file, a file over 2 MiB (truncation banner) and a file that is deleted after the
 * list was shown (error display) in the viewer and measures the header / banner / error / line number colours.
 */
export async function checkViewerPalette(t, ctx, p) {
  const name = "viewer-palette";
  if (!ctx.fx.exists(name)) {
    ctx.fx.file(name, "a-note.txt");
    fs.writeFileSync(ctx.fx.at(name, "a-note.txt"), "palette line one\npalette line two\n");
    const big = ctx.fx.file(name, "b-big.txt");
    fs.writeFileSync(big, "0123456789abcdef\n".repeat(Math.ceil(SIZE_OVER_LIMIT / 17)));
    ctx.fx.file(name, "c-gone.txt");
  }
  const dir = ctx.fx.at(name);
  await ctx.reload();
  await ctx.nav(dir);
  let viewer = await openViewerWindow(t, ctx, { downs: 0 });
  if (viewer === undefined) return;
  try {
    const look = (sel, props) => viewer.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const s = getComputedStyle(e); return ${JSON.stringify(props)}.map((k) => s.getPropertyValue(k)); })()`);
    if (!(await waitViewerShows(t, viewer, "a-note.txt", "text", { contains: "palette line one" }))) return;
    // The viewer now holds the 3-file list; delete c-gone.txt (inside the test folder only) so reaching it is an error.
    fs.rmSync(ctx.fx.at(name, "c-gone.txt"), { force: true });
    t.eq(await look(".viewer-header", ["background-color", "border-bottom-color"]), [p.header, p.border], "header background / bottom border");
    t.eq((await look(".viewer-body .lineno", ["color"]))?.[0], p.lineno, "line number colour");

    // the viewer's own Next button moves through the list the main window handed over (c-gone.txt is in it)
    const next = () => viewer.ev(`(() => { const b = [...document.querySelectorAll('.viewer-header button')].find((x) => x.textContent.includes('Next')); if (!b || b.disabled) return false; b.click(); return true; })()`);
    t.eq(await next(), true, "the viewer's Next button is usable");
    if (!(await waitViewerShows(t, viewer, "b-big.txt", "text"))) return;
    t.eq(await look(".truncation-banner", ["background-color", "color"]), [p.bannerBg, p.bannerFg], "truncation banner background / text");

    t.eq(await next(), true, "Next again");
    if (!(await waitViewerShows(t, viewer, "c-gone.txt", "error"))) return;
    t.eq((await look(".placeholder.error", ["color"]))?.[0], p.error, "error display colour");
  } finally {
    viewer.close();
    viewer = undefined;
  }
}

tests.push({
  id: "AC-955",
  title: "viewer palette (light pinned): header, truncation banner, error and line numbers use the R-913-1 light values",
  async run(t, ctx) {
    await checkViewerPalette(t, ctx, VIEWER_PALETTE.light);
  },
});
