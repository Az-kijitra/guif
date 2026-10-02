// SPEC-0300-0017 §16.6 / §16.11: multi-column geometry, column scrolling, edge markers,
// narrow lists (AC-921 ... AC-926, AC-943, AC-944).
import { MOD } from "../lib/cdp.mjs";
import { openFiles, RGB } from "./_util.mjs";

const focusIndex = (ctx) => ctx.ev(`[...document.querySelectorAll('.file-list-row')].findIndex((r) => r.classList.contains('focused'))`);
const scrollLeft = (ctx) => ctx.ev(`document.querySelector('.file-list').scrollLeft`);
const listInfo = (ctx) =>
  ctx.ev(`(() => {
    const l = document.querySelector('.file-list');
    const s = getComputedStyle(l);
    return { clientWidth: l.clientWidth, clientHeight: l.clientHeight, scrollWidth: l.scrollWidth, scrollLeft: l.scrollLeft,
      colWidth: s.getPropertyValue('--list-col-width').trim(), height: s.height, width: s.width, padding: s.padding, columnGap: s.columnGap,
      rows: s.gridTemplateRows.split(' ').length, overflowX: s.overflowX, overflowY: s.overflowY };
  })()`);

/** Show `count` files with the given toggles in a list frame of exactly frameW x frameH. */
async function geometry(ctx, name, count, view, frameW = 760, frameH = 566) {
  await openFiles(ctx, name, count, view);
  await ctx.setFrameSize(frameW, frameH);
}

async function pressRight(ctx, n = 1) {
  for (let i = 0; i < n; i++) {
    await ctx.press.right();
    await ctx.settle(80);
  }
}

export const tests = [
  {
    id: "AC-921",
    title: "W=760 H=560, 100 entries + size: rows 20, col 252, body 520 x 560, 2nd column +268, column gap 16",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: false });
      const info = await listInfo(ctx);
      t.eq(info.rows, 20, "rows");
      t.eq(info.colWidth, "252px", "--list-col-width (minCol)");
      t.eq(info.clientWidth, 520, "list body clientWidth");
      t.eq(info.height, "560px", "list body content height");
      t.eq(info.columnGap, "16px", "column-gap");
      t.eq(info.padding, "2px 0px 4px", "padding");
      t.eq(info.scrollWidth, 5 * 252 + 4 * 16, "scrollWidth (needed = 5 columns)");
      const first = await ctx.m.rect(".file-list-row", 0);
      const row21 = await ctx.m.rect(".file-list-row", 20);
      const row20 = await ctx.m.rect(".file-list-row", 19);
      t.approx(row21.left, first.left + 268, "21st row left = 1st + 268");
      t.approx(row21.top, first.top, "21st row top = 1st top");
      t.approx(row20.top, first.top + 532, "20th row top = 1st top + 532");
    },
  },
  {
    id: "AC-922",
    title: "same frame: 30 entries -> col 372 / body 760; 10 -> 720 / 720; 0 -> 720; no empty column",
    async run(t, ctx) {
      const cases = [
        { name: "(i) 30 entries", dir: "many30", count: 30, col: "372px", body: 760 },
        { name: "(ii) 10 entries", dir: "many10", count: 10, col: "720px", body: 720 },
        { name: "(iii) 0 entries", dir: "empty0", count: 0, col: "720px", body: undefined },
      ];
      for (const c of cases) {
        if (c.count === 0) ctx.fx.mkdir(c.dir);
        await geometry(ctx, c.dir, c.count, { size: true, time: false });
        const info = await listInfo(ctx);
        t.eq(info.colWidth, c.col, `${c.name}: --list-col-width`);
        if (c.body !== undefined) t.eq(info.clientWidth, c.body, `${c.name}: list body width`);
        t.eq(info.scrollWidth, info.clientWidth, `${c.name}: no empty column (scrollWidth = clientWidth)`);
        if (c.count === 0) t.eq(await ctx.rowCount(), 0, "(iii) no rows");
      }
    },
  },
  {
    id: "AC-923",
    title: "same frame, 100 entries: name only 172/736, time only 320/656, both 400/400 (column width / body width)",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: false, time: false });
      const cases = [
        { name: "(i) name only", size: false, time: false, col: 172, body: 736, maxFit: 4 },
        { name: "(ii) time only", size: false, time: true, col: 320, body: 656, maxFit: 2 },
        { name: "(iii) both", size: true, time: true, col: 400, body: 400, maxFit: 1 },
      ];
      for (const c of cases) {
        await ctx.ensureView({ size: c.size, time: c.time });
        await ctx.setFrameSize(760, 566);
        const info = await listInfo(ctx);
        t.eq(info.colWidth, `${c.col}px`, `${c.name}: column width (= minCol, needed > maxFit)`);
        t.eq(info.clientWidth, c.body, `${c.name}: list body width`);
        t.eq((c.body + 16) / (c.col + 16), c.maxFit, `${c.name}: visible columns = maxFit`);
      }
    },
  },
  {
    id: "AC-924",
    title: "→ moves the focus a column; scrollLeft follows in column steps (0, 0, 268, 536, 804 = max); wheel does nothing",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: false });
      await ctx.focusList();
      t.eq(await focusIndex(ctx), 0, "focus starts on the 1st entry");
      const info = await listInfo(ctx);
      t.eq([info.overflowX, info.overflowY], ["hidden", "hidden"], "list body overflow-x / overflow-y");
      const steps = [[20, 0], [40, 268], [60, 536], [80, 804]];
      for (const [index, expected] of steps) {
        await pressRight(ctx);
        t.eq(await focusIndex(ctx), index, `focus index after →`);
        t.eq(await scrollLeft(ctx), expected, `scrollLeft at the ${index + 1}th entry`);
      }
      const end = await listInfo(ctx);
      t.eq(end.scrollLeft, end.scrollWidth - end.clientWidth, "804 = scrollWidth - clientWidth (the last column is fully visible)");
      // Wheel gestures never scroll the list.
      const c = await ctx.m.center(".file-list");
      for (const [label, dx, dy, mods] of [["vertical wheel", 0, 120, 0], ["Shift + vertical wheel", 0, 120, MOD.Shift], ["horizontal wheel", 120, 0, 0]]) {
        await ctx.wheel(c.x, c.y, dx, dy, mods);
        await ctx.settle(200);
        t.eq(await scrollLeft(ctx), 804, `scrollLeft after ${label}`);
      }
    },
  },
  {
    id: "AC-924-1",
    title: "a stray scrollLeft is snapped to a pitch multiple (300 -> 268; both columns: 1000 -> 832); max is a pitch multiple",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: false });
      const setAndWait = async (value) => {
        await ctx.ev(`document.querySelector('.file-list').scrollLeft = ${value}; true`);
        await ctx.frames(3);
        await ctx.settle(100);
        return scrollLeft(ctx);
      };
      t.eq(await setAndWait(300), 268, "(i) scrollLeft 300 snaps to 268");
      await ctx.ev(`document.querySelector('.file-list').scrollLeft = 0; true`);
      await ctx.ensureView({ size: true, time: true });
      await ctx.setFrameSize(760, 566);
      t.eq(await setAndWait(1000), 832, "(ii) scrollLeft 1000 snaps to 832");
      const info = await listInfo(ctx);
      t.eq(info.scrollWidth - info.clientWidth, 1664, "(ii) scrollWidth - clientWidth = 2064 - 400 = 1664 = 4 x 416");
      t.eq(await setAndWait(100000), 1664, "(ii) the maximum stays 1664 after snapping");
    },
  },
  {
    id: "AC-924-2",
    title: "clicking the free space of the frame focuses the list (selection kept); also while the path bar is being edited",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: false });
      await ctx.clickSel(".file-list-row", 1); // select + focus the 2nd entry
      await ctx.settle();
      const frame = await ctx.m.rect(".file-list-frame");
      const fd = await ctx.m.dims(".file-list-frame");
      const body = await ctx.m.rect(".file-list");
      const spot = { x: body.right + (frame.left + fd.clientLeft + fd.clientWidth - body.right) / 2, y: frame.top + fd.clientTop + 100 };
      const selectedBefore = await ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r, i) => r.getAttribute('aria-selected') === 'true' ? i : -1).filter((i) => i >= 0)`);
      t.eq(selectedBefore, [1], "the 2nd entry is selected");

      // (i) click the free space.
      await ctx.click(spot.x, spot.y);
      await ctx.settle();
      t.eq((await ctx.m.active()).cls.includes("file-list"), true, "(i) keyboard focus is on the list body");
      t.eq(await focusIndex(ctx), 1, "(i) focus row unchanged");
      t.eq(await ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r, i) => r.getAttribute('aria-selected') === 'true' ? i : -1).filter((i) => i >= 0)`), [1], "(i) selection unchanged");

      // (ii) edit the path bar, then click the free space.
      const original = (await ctx.pathBarState()).value;
      await ctx.press.ctrlL();
      await ctx.waitFor(`document.activeElement === document.querySelector('.path-bar-row input')`, { label: "path bar editing" });
      await ctx.type("X:\\this\\is\\discarded");
      await ctx.click(spot.x, spot.y);
      await ctx.settle(300);
      const state = await ctx.pathBarState();
      t.eq(state.value, original, "(ii) the edited text was discarded (the current path is shown again)");
      const active = await ctx.m.active();
      t.ok(active && active.tag !== "BODY" && active.cls.includes("file-list"), "(ii) keyboard focus is on the list body, not document.body", JSON.stringify(active));
    },
  },
  {
    id: "AC-925",
    title: "edge markers: ▶ on the 21st entry at scrollLeft 0, ◀ on the 61st at 804; aria-hidden, muted colour",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: false });
      const markers = () => ctx.ev(`[...document.querySelectorAll('.file-list-row')].flatMap((r, i) => [...r.querySelectorAll('.marker')].map((m) => ({ index: i, text: m.textContent, ariaHidden: m.getAttribute('aria-hidden'), color: getComputedStyle(m).color, inName: !!m.closest('.name'), after: m.previousElementSibling?.className })))`);
      let m = await markers();
      t.eq(m.map((x) => [x.index, x.text]), [[20, "▶"]], "at scrollLeft 0: one ▶ on the 21st entry, no ◀");
      t.eq([m[0]?.ariaHidden, m[0]?.color, m[0]?.inName], ["true", RGB.muted, true], "marker aria-hidden / colour / inside the name cell");
      await ctx.ev(`document.querySelector('.file-list').scrollLeft = 804; true`);
      await ctx.settle(200);
      m = await markers();
      t.eq(m.map((x) => [x.index, x.text]), [[60, "◀"]], "at scrollLeft 804: one ◀ on the 61st entry, no ▶");
    },
  },
  {
    id: "AC-926",
    title: "page_down and move_right both move by rows (20); with a 565px frame rows = 19 and so is page_down",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: false });
      await ctx.focusList();
      await ctx.press.pageDown();
      await ctx.settle(100);
      t.eq(await focusIndex(ctx), 20, "page_down moves 20");
      await ctx.press.pageUp();
      await ctx.settle(100);
      t.eq(await focusIndex(ctx), 0, "page_up back to the 1st");
      await ctx.press.right();
      await ctx.settle(100);
      t.eq(await focusIndex(ctx), 20, "move_right moves 20");
      await ctx.press.left();
      await ctx.settle(100);
      await ctx.setFrameSize(760, 565);
      t.eq((await listInfo(ctx)).rows, 19, "rows with a 565px frame");
      await ctx.focusList();
      await ctx.press.pageDown();
      await ctx.settle(100);
      t.eq(await focusIndex(ctx), 19, "page_down moves 19");
    },
  },
  {
    id: "AC-943",
    title: "W=300 both columns (narrow list): col 300, grid 80/64/140, 316 pitch, scrollLeft 316 after one column; names still elide",
    async run(t, ctx) {
      await geometry(ctx, "many100", 100, { size: true, time: true }, 300, 566);
      const info = await listInfo(ctx);
      t.eq(info.colWidth, "300px", "--list-col-width");
      t.eq(info.clientWidth, 300, "list body width");
      t.eq(info.rows, 20, "rows");
      t.eq(info.scrollWidth, 5 * 300 + 4 * 16, "total columns = 5");
      t.eq((await ctx.m.cs(".file-list-row", ["grid-template-columns"]))["grid-template-columns"], "80px 64px 140px", "row grid");
      t.eq([await ctx.ev(`document.querySelector('.file-list-row .size').clientWidth`), await ctx.ev(`document.querySelector('.file-list-row .modified').clientWidth`)], [64, 140], "size / time cell widths");
      const first = await ctx.m.rect(".file-list-row", 0);
      const row21 = await ctx.m.rect(".file-list-row", 20);
      t.approx(row21.left, first.left + 316, "21st row left = 1st + 316");
      await ctx.focusList();
      await ctx.press.right();
      await ctx.settle(150);
      t.eq(await scrollLeft(ctx), 316, "scrollLeft after moving one column");

      // Long names still keep their extension where they fit, and the title has the full name.
      ctx.fx.files("names", 100, { prefix: "filler_" });
      ctx.fx.file("names", "averyveryveryverylongname_quarterly_report_final.xlsx");
      await ctx.nav(ctx.fx.at("names"));
      await ctx.setFrameSize(300, 566);
      const row = await ctx.ev(`(() => { const r = [...document.querySelectorAll('.file-list-row')].find((x) => x.querySelector('.name').title.startsWith('avery')); const n = r.querySelector('.name-text'); return { title: r.querySelector('.name').title, text: n.textContent, sw: n.scrollWidth, cw: n.clientWidth }; })()`);
      t.eq(row.title, "averyveryveryverylongname_quarterly_report_final.xlsx", "title = the full name");
      t.ok(row.text.slice(3).length < row.title.length, "the name is shortened to fit 80px", row.text);
      t.ok(row.text.endsWith(".xlsx") || row.text.endsWith("…"), "it ends with the extension or an ellipsis", row.text);
      t.ok(row.sw <= row.cw, "no CSS truncation", `${row.sw} > ${row.cw}`);
    },
  },
  {
    id: "AC-944",
    title: "W=200: col 200, name column 0 -> '…' only, 64/140 kept, row overflow hidden; size only: 122px",
    async run(t, ctx) {
      ctx.fx.files("names", 100, { prefix: "filler_" });
      ctx.fx.file("names", "averyveryveryverylongname_quarterly_report_final.xlsx");
      await openFiles(ctx, "names", 100, { size: true, time: true });
      await ctx.setFrameSize(200, 566);
      const info = await listInfo(ctx);
      t.eq(info.colWidth, "200px", "--list-col-width");
      t.eq((await ctx.m.cs(".file-list-row", ["grid-template-columns", "overflow"]))["grid-template-columns"], "0px 64px 140px", "row grid: name column 0px, 64px, 140px");
      t.eq((await ctx.m.cs(".file-list-row", ["overflow"])).overflow, "hidden", "row overflow");
      const row = await ctx.ev(`(() => { const r = [...document.querySelectorAll('.file-list-row')].find((x) => x.querySelector('.name').title.startsWith('avery')); return { title: r.querySelector('.name').title, text: r.querySelector('.name-text').textContent }; })()`);
      t.eq(row.title, "averyveryveryverylongname_quarterly_report_final.xlsx", "title = the full name");
      t.eq(row.text.slice(3), "…", "the name part is the ellipsis only (the icon + space are clipped by the 0px cell)");
      await ctx.ensureView({ size: true, time: false });
      await ctx.setFrameSize(200, 566);
      t.eq((await ctx.m.cs(".file-list-row", ["grid-template-columns"]))["grid-template-columns"], "122px 64px", "size only: name column = 200 - 12 - 2 - 64 = 122px");
    },
  },
];
