// SPEC-0300-0017 §16.9: overlays and dialogs (AC-938 ... AC-941).
import { DEFAULT_FONT_FAMILY, openFiles, RGB } from "./_util.mjs";

const rowCount = (ctx) => ctx.ev(`document.querySelector('.file-list').style.gridTemplateRows.match(/repeat\\((\\d+)/)?.[1] * 1`);

export const tests = [
  {
    id: "AC-938",
    title: "search bar: 3px gaps, padding 6px 8px, surface colours, regex toggle + error colours, body height recomputed",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      await ctx.setViewport(1000, 700);
      const rowsClosed = await rowCount(ctx);
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.settle(200);
      const pathBar = await ctx.m.rect(".path-bar-row");
      const bar = await ctx.m.rect(".search-bar");
      const body = await ctx.m.rect(".app-shell > .body");
      t.approx(bar.top, pathBar.bottom + 3, "search bar top = path bar bottom + 3");
      t.approx(body.top, bar.bottom + 3, "body top = search bar bottom + 3");
      const b = await ctx.m.cs(".search-bar", ["padding", "background-color"]);
      t.eq(b.padding, "6px 8px", "search bar padding");
      t.eq(b["background-color"], RGB.surface2, "search bar background");
      const i = await ctx.m.cs(".search-bar input", ["border-radius", "background-color", "font-family"]);
      t.eq(i["border-radius"], "4px", "input border-radius");
      t.eq(i["background-color"], RGB.surface, "input background");
      t.eq(i["font-family"], DEFAULT_FONT_FAMILY, "input font-family is the [font] stack");
      const rowsOpen = await rowCount(ctx);
      t.ok(rowsOpen < rowsClosed, "rows were recomputed for the shorter body", `${rowsOpen} vs ${rowsClosed}`);

      // Regex mode + an invalid pattern.
      await ctx.clickSel(".search-bar .regex-toggle");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("[");
      await ctx.waitFor(`!!document.querySelector('.search-bar .search-error')`, { label: "the regex error text" });
      const e = await ctx.m.cs(".search-bar .search-error", ["color", "font-size"]);
      t.eq(e.color, RGB.error, "error colour");
      t.eq(e["font-size"], "12px", "error font-size");
      t.eq((await ctx.m.cs(".search-bar .regex-toggle", ["background-color"]))["background-color"], RGB.surface3, "pressed toggle background");

      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });
      await ctx.settle(200);
      const pathBar2 = await ctx.m.rect(".path-bar-row");
      const body2 = await ctx.m.rect(".app-shell > .body");
      t.approx(body2.top, pathBar2.bottom + 3, "closed: body top = path bar bottom + 3");
      t.eq(await rowCount(ctx), rowsClosed, "closed: rows are recomputed back");
    },
  },
  {
    id: "AC-939",
    title: "visit history: max-height 240, scrolls, highlighted row = hover colour, long path ellipsized with title, 📁 first, × last",
    async run(t, ctx) {
      const longName = "a_long_folder_name_".repeat(8); // 152 characters
      const dirs = [];
      for (let i = 1; i <= 20; i++) dirs.push(ctx.fx.mkdir("hist", `h${String(i).padStart(2, "0")}`));
      const longDir = ctx.fx.mkdir("hist", longName);
      dirs.splice(3, 0, longDir);
      await openFiles(ctx, "many100", 100);
      for (const dir of dirs) await ctx.nav(dir);
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the visit history" });
      await ctx.settle(200);
      const list = await ctx.ev(`(() => { const l = document.querySelector('.nav-history-list'); const s = getComputedStyle(l); return { maxHeight: s.maxHeight, overflowY: s.overflowY, sh: l.scrollHeight, ch: l.clientHeight }; })()`);
      t.eq(list.maxHeight, "240px", "max-height");
      t.eq(list.overflowY, "auto", "overflow-y");
      t.ok(list.sh > list.ch, "scrollHeight > clientHeight", `${list.sh} vs ${list.ch}`);
      const selected = await ctx.m.cs(".nav-history-row.selected", ["background-color"]);
      t.eq(selected["background-color"], RGB.hover, "highlighted row background");
      const rows = await ctx.ev(`[...document.querySelectorAll('.nav-history-row')].map((r) => { const p = r.querySelector('.path'); return { first: r.firstElementChild.textContent.trim(), last: r.lastElementChild.tagName + ':' + r.lastElementChild.textContent.trim(), title: p.title, overflow: getComputedStyle(p).textOverflow, sw: p.scrollWidth, cw: p.clientWidth }; })`);
      t.ok(rows.length >= 20, "at least 20 history rows", String(rows.length));
      t.ok(rows.every((r) => r.first === "📁"), "every row starts with 📁");
      t.ok(rows.every((r) => r.last === "BUTTON:×"), "every row ends with a × button");
      const long = rows.find((r) => r.title.endsWith(longName));
      t.ok(long, "the long path is listed");
      if (long) {
        t.eq(long.overflow, "ellipsis", "long path text-overflow");
        t.ok(long.sw > long.cw, "long path is truncated", `${long.sw} vs ${long.cw}`);
        t.ok(long.title.toLowerCase().includes(ctx.fx.root.toLowerCase()), "title carries the whole path");
      }
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the history to close" });
    },
  },
  {
    id: "AC-940",
    title: "sort menu: top-left on the list region's top-left, 4 items down, surface bg, border, shadow, highlight, 13px",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      await ctx.settle(150);
      const menu = await ctx.m.rect(".sort-menu");
      const region = await ctx.m.rect(".file-list-region");
      t.approx(menu.left, region.left, "menu left = region left");
      t.approx(menu.top, region.top, "menu top = region top");
      const tops = [];
      for (let i = 0; i < 4; i++) tops.push((await ctx.m.rect(".sort-menu-item", i)).top);
      t.eq(await ctx.m.count(".sort-menu-item"), 4, "four items");
      t.ok(tops.every((v, i) => i === 0 || v > tops[i - 1]), "item tops increase", JSON.stringify(tops));
      const s = await ctx.m.cs(".sort-menu", [
        "background-color", "box-shadow", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
        "border-top-style", "border-top-color", "border-left-color",
      ]);
      t.eq(s["background-color"], RGB.surface, "menu background");
      for (const side of ["top", "right", "bottom", "left"]) t.eq(s[`border-${side}-width`], "1px", `border-${side}-width`);
      t.eq([s["border-top-style"], s["border-top-color"], s["border-left-color"]], ["solid", RGB.borderActive, RGB.borderActive], "border style / colour (--ui-border-active, AC-1810)");
      t.eq(s["box-shadow"], "rgba(0, 0, 0, 0.4) 0px 8px 20px 0px", "box-shadow (--ui-shadow-1 of nord)");
      const h = await ctx.m.cs(".sort-menu-item.highlighted", ["background-color", "font-size"]);
      t.eq(h["background-color"], RGB.hover, "highlighted item background");
      t.eq(h["font-size"], "12px", "item font-size (12px everywhere, AC-1750)");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });
    },
  },
  {
    id: "AC-941",
    title: "dialog: fixed full-screen backdrop rgba(0,0,0,.35), 420px box centred, padding 16, radius 4, shadow, bold title, right-aligned buttons; 368px at 400 wide",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.setViewport(1000, 700);
      await ctx.focusList();
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the delete confirmation" });
      await ctx.settle(200);
      const backdrop = await ctx.m.cs(".backdrop", ["position", "background-color"]);
      const bRect = await ctx.m.rect(".backdrop");
      t.eq(backdrop.position, "fixed", "backdrop position");
      t.eq(backdrop["background-color"], RGB.backdrop, "backdrop background");
      t.eq([bRect.left, bRect.top, bRect.right, bRect.bottom], [0, 0, 1000, 700], "backdrop covers the whole window");
      const dialog = await ctx.m.rect(".ui-dialog");
      t.approx(dialog.width, 420, "dialog width");
      t.approx((dialog.left + dialog.right) / 2, 500, "dialog centre x", 1);
      t.approx((dialog.top + dialog.bottom) / 2, 350, "dialog centre y", 1);
      const d = await ctx.m.cs(".ui-dialog", ["padding", "border-radius", "box-shadow"]);
      t.eq([d.padding, d["border-radius"], d["box-shadow"]], ["16px", "0px", "rgba(0, 0, 0, 0.4) 0px 8px 20px 0px"], "padding / radius 0 (AC-1810) / shadow");
      t.eq((await ctx.m.cs(".ui-dialog h2", ["font-weight"]))["font-weight"], "600", "title font-weight");
      const buttons = await ctx.m.cs(".ui-dialog .buttons", ["justify-content", "column-gap"]);
      t.ok(["flex-end", "end"].includes(buttons["justify-content"]), "buttons justify-content", buttons["justify-content"]);
      t.eq(buttons["column-gap"], "8px", "buttons column-gap");
      await ctx.setViewport(400, 700);
      t.approx((await ctx.m.rect(".ui-dialog")).width, 368, "dialog width at 400 wide");
      await ctx.setViewport(1000, 700);
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });
    },
  },
];
