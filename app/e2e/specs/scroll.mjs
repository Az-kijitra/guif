// SPEC-0300-0023 R-1790 .. R-1796 / AC-1753 / AC-1790 / AC-1796 (the multi-column list of the tuif look: pages of columns, no scrolling; replaces
// SPEC-0300-0017 §16.6 / §16.11 AC-921 ... AC-926, AC-943, AC-944, see the table "置き換えた受入基準" of SPEC-0300-0017 第11版). The default config is used here
// (min_col_width 24, tree 24%); the 2-column pages of AC-1762 / AC-1792 / AC-1793 / AC-1796 are in appearance.mjs (R-1842: min_col_width written from the
// measured W and ch). The expected page is computed by an independent copy of the R-1792 formula from the MEASURED W, H, ch and row height.
import { MOD } from "../lib/cdp.mjs";
import { bodySize, drawn, expectedPage, fitBody, indexOfLabel, listHeading, minColPx, openList } from "./_list.mjs";
import { chOf, openFiles } from "./_util.mjs";

const cursorIndex = async (ctx) => indexOfLabel(await ctx.ev(`document.querySelector('.file-list-row:is(.cursor,.idle)')?.getAttribute('aria-label') ?? ''`));
const scrollLeft = (ctx) => ctx.ev(`document.querySelector('.file-list').scrollLeft`);

const H20 = 328; // R-1842 (1): the list's H for 20 rows of 16 px: 320 <= H < 336

/** Column widths of a page: the page shares W, the remainder goes 1 px each to the rightmost columns (R-1793). */
const sharedWidths = (W, shown) => {
  const base = Math.floor(W / shown);
  const rest = W - base * shown;
  return Array.from({ length: shown }, (_, i) => base + (i >= shown - rest ? 1 : 0));
};

export const tests = [
  {
    id: "AC-921",
    title: "100 entries + size, H for 20 rows (AC-1753 / AC-1790): rows = floor(H/16) = 20, the page has the columns R-1792 says and shares the whole W; the 21st row sits at the top of column 2",
    async run(t, ctx) {
      const { ch, rowHeight } = await openList(ctx, "many100", 100, { size: true, time: false });
      const { W, H } = await fitBody(ctx, null, H20);
      t.ok(H >= 20 * rowHeight && H < 21 * rowHeight, "H is in [320, 336)", String(H));
      const exp = expectedPage({ W, H, rowHeight, ch, count: 100, showSize: true, showTime: false, minColWidth: 24, focusIndex: 0 });
      const d = await drawn(ctx);
      t.eq(exp.rows, 20, "rows = 20");
      t.eq(d.gridRows, 20, "the list's grid has 20 rows");
      t.eq(d.listHeight, 20 * rowHeight, "list body height = rows x 16");
      t.eq(d.columns.length, exp.shown, `shown columns (maxFit = floor(${W} / ${minColPx(24, true, false, ch).toFixed(1)}) = ${exp.cols}, total ${exp.totalCols})`);
      t.ok(exp.cols >= 2, "at least 2 columns fit at 1000 wide (so that the page switching is exercised)", String(exp.cols));
      t.eq(d.columns.map((c) => c.width), sharedWidths(W, exp.shown), "the columns share the whole W (remainder 1px to the rightmost)");
      t.eq(d.columns.reduce((n, c) => n + c.width, 0), W, "sum of the column widths = W (no gaps)");
      t.eq(d.columns[0].count, 20, "column 1 has 20 rows");
      t.eq(d.columns[0].labels[0], "f001.txt", "column 1 starts with the 1st entry");
      t.eq(d.columns[1].labels[0], "f021.txt", "column 2 starts with the 21st entry");
      t.approx(d.columns[1].left, d.columns[0].width, "column 2 starts where column 1 ends (no column gap)");
      const first = await ctx.m.rect(".file-list-row", 0);
      const row20 = await ctx.m.rect(".file-list-row", 19);
      const row21 = await ctx.m.rect(".file-list-row", 20);
      t.approx(row21.top, first.top, "21st row top = 1st top");
      t.approx(row20.top, first.top + 19 * rowHeight, "20th row top = 1st top + 19 x 16");
      const heading = await listHeading(ctx);
      t.eq(heading.endsWith(" ▶"), exp.startCol + exp.shown < exp.totalCols, "the heading ends with ' ▶' exactly when columns are hidden on the right");
    },
  },
  {
    id: "AC-922",
    title: "30 / 10 / 0 entries: no empty column; the shown columns share W; with one column it is W wide",
    async run(t, ctx) {
      const cases = [
        { name: "(i) 30 entries", dir: "many30", count: 30 },
        { name: "(ii) 10 entries", dir: "many10", count: 10 },
        { name: "(iii) 0 entries", dir: "empty0", count: 0 },
      ];
      for (const c of cases) {
        if (c.count === 0) ctx.fx.mkdir(c.dir);
        const { ch, rowHeight } = await openList(ctx, c.dir, c.count, { size: true, time: false });
        const { W, H } = await fitBody(ctx, null, H20);
        const d = await drawn(ctx);
        if (c.count === 0) {
          t.eq(d.rowCount, 0, `${c.name}: no rows`);
          t.eq(d.columns, [], `${c.name}: no column at all`);
          continue;
        }
        const exp = expectedPage({ W, H, rowHeight, ch, count: c.count, showSize: true, showTime: false, minColWidth: 24, focusIndex: 0 });
        t.eq(d.columns.length, Math.ceil(c.count / 20), `${c.name}: exactly the needed columns (${Math.ceil(c.count / 20)})`);
        t.eq(d.columns.map((x) => x.width), sharedWidths(W, exp.shown), `${c.name}: the columns share W`);
        t.eq(d.columns.reduce((n, x) => n + x.count, 0), c.count, `${c.name}: every entry is drawn`);
      }
    },
  },
  {
    id: "AC-923",
    title: "100 entries: the number of columns follows min_col_width + 10 (size) + 20 (time): name only / size / time / both (R-1792)",
    async run(t, ctx) {
      const { ch, rowHeight } = await openList(ctx, "many100", 100, { size: false, time: false });
      const cases = [
        { name: "(i) name only", size: false, time: false },
        { name: "(ii) size", size: true, time: false },
        { name: "(iii) time", size: false, time: true },
        { name: "(iv) both", size: true, time: true },
      ];
      for (const c of cases) {
        await ctx.ensureView({ size: c.size, time: c.time });
        const { W, H } = await fitBody(ctx, null, H20);
        const exp = expectedPage({ W, H, rowHeight, ch, count: 100, showSize: c.size, showTime: c.time, minColWidth: 24, focusIndex: 0 });
        const d = await drawn(ctx);
        t.eq(d.columns.length, exp.shown, `${c.name}: shown columns (floor(${W} / ${minColPx(24, c.size, c.time, ch).toFixed(1)}) = ${exp.cols})`);
        t.eq(d.columns.map((x) => x.width), sharedWidths(W, exp.shown), `${c.name}: the columns share W`);
      }
      // The order of the minimum widths is fixed by the formula: name only < size < time < both (24 / 34 / 44 / 54 ch).
      t.ok(minColPx(24, false, false, ch) < minColPx(24, true, false, ch) && minColPx(24, true, false, ch) < minColPx(24, false, true, ch) && minColPx(24, false, true, ch) < minColPx(24, true, true, ch), "24 < 34 < 44 < 54 ch");
    },
  },
  {
    id: "AC-924",
    title: "→ moves the cursor one column (rows entries) and the page follows; the wheel never scrolls; the body is overflow hidden",
    async run(t, ctx) {
      const { ch, rowHeight } = await openList(ctx, "many100", 100, { size: true, time: false });
      const { W, H } = await fitBody(ctx, null, H20);
      await ctx.focusList();
      t.eq(await cursorIndex(ctx), 0, "cursor starts on the 1st entry");
      const style = await ctx.m.cs(".file-list", ["overflow-x", "overflow-y"]);
      t.eq([style["overflow-x"], style["overflow-y"]], ["hidden", "hidden"], "list body overflow-x / overflow-y");
      for (const expectedIndex of [20, 40, 60, 80]) {
        await ctx.press.right();
        await ctx.settle(100);
        t.eq(await cursorIndex(ctx), expectedIndex, `cursor index after → is ${expectedIndex}`);
        const exp = expectedPage({ W, H, rowHeight, ch, count: 100, showSize: true, showTime: false, minColWidth: 24, focusIndex: expectedIndex });
        const d = await drawn(ctx);
        t.eq(d.columns[0].labels[0], `f${String(exp.first + 1).padStart(3, "0")}.txt`, `the page starts with entry ${exp.first + 1} (cursor ${expectedIndex + 1})`);
        t.eq(d.columns.length, exp.shown, `page at the ${expectedIndex + 1}th entry: shown columns`);
      }
      const before = await drawn(ctx);
      const c = await ctx.m.center(".file-list");
      for (const [label, dx, dy, mods] of [["vertical wheel", 0, 120, 0], ["Shift + vertical wheel", 0, 120, MOD.Shift], ["horizontal wheel", 120, 0, 0]]) {
        await ctx.wheel(c.x, c.y, dx, dy, mods);
        await ctx.settle(200);
        t.eq(await scrollLeft(ctx), 0, `scrollLeft after ${label}`);
        t.eq((await drawn(ctx)).columns.map((x) => x.labels[0]), before.columns.map((x) => x.labels[0]), `the page after ${label} is unchanged`);
      }
    },
  },
  {
    id: "AC-924-1",
    title: "a stray scrollLeft does not move the list (no scrolling; the columns are exactly W wide)",
    async run(t, ctx) {
      await openList(ctx, "many100", 100, { size: true, time: false });
      const { W } = await fitBody(ctx, null, H20);
      await ctx.ev(`document.querySelector('.file-list').scrollLeft = 300; true`);
      await ctx.frames(3);
      await ctx.settle(100);
      t.eq(await scrollLeft(ctx), 0, "scrollLeft 300 is not kept");
      const info = await ctx.m.dims(".file-list");
      t.eq([info.scrollWidth, info.clientWidth], [W, W], "scrollWidth = clientWidth = W (the page is not wider than the body)");
    },
  },
  {
    id: "AC-924-2",
    title: "clicking the free space of the frame (the heading band, below the rows) focuses the list (selection kept); also while the path bar is being edited",
    async run(t, ctx) {
      await openList(ctx, "many100", 100, { size: true, time: false });
      await fitBody(ctx, null, H20);
      await ctx.clickSel(".file-list-row", 1); // select + focus the 2nd entry
      await ctx.settle();
      const body = await ctx.m.rect(".file-list-frame .pane-body");
      const list = await ctx.m.rect(".file-list");
      const title = await ctx.m.rect(".file-list-frame .pane-title");
      // The free space: below the last row inside the body (H - rows x 16 = 8 px), and the heading band.
      const spots = [
        { name: "below the rows", x: body.left + body.width / 2, y: list.bottom + (body.bottom - list.bottom) / 2 },
        { name: "heading band", x: title.left + title.width / 2, y: title.top + title.height / 2 },
      ];
      const selected = () => ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r, i) => r.getAttribute('aria-selected') === 'true' ? i : -1).filter((i) => i >= 0)`);
      t.eq(await selected(), [1], "the 2nd entry is selected");
      t.ok(body.bottom - list.bottom >= 2, "there is free space below the rows", String(body.bottom - list.bottom));

      for (const spot of spots) {
        await ctx.focusList();
        await ctx.press.tab(); // move the keyboard focus away (to the tree) so that the click has something to change
        await ctx.click(spot.x, spot.y);
        await ctx.settle();
        t.ok((await ctx.m.active()).cls.includes("file-list"), `(i) ${spot.name}: keyboard focus is on the list body`);
        t.eq(await cursorIndex(ctx), 1, `(i) ${spot.name}: cursor row unchanged`);
        t.eq(await selected(), [1], `(i) ${spot.name}: selection unchanged`);
      }

      // (ii) edit the path bar, then click the free space.
      const original = (await ctx.pathBarState()).value;
      await ctx.press.ctrlL();
      await ctx.waitFor(`document.activeElement === document.querySelector('.path-bar-row input')`, { label: "path bar editing" });
      await ctx.type("X:\\this\\is\\discarded");
      await ctx.click(spots[1].x, spots[1].y);
      await ctx.settle(300);
      const state = await ctx.pathBarState();
      t.eq(state.value, original, "(ii) the edited text was discarded (the current path is shown again)");
      const active = await ctx.m.active();
      t.ok(active && active.tag !== "BODY" && active.cls.includes("file-list"), "(ii) keyboard focus is on the list body, not document.body", JSON.stringify(active));
    },
  },
  {
    id: "AC-926",
    title: "page_down and → both move by rows (20); with H for 19 rows page_down moves 19 (AC-1753)",
    async run(t, ctx) {
      await openList(ctx, "many100", 100, { size: true, time: false });
      await fitBody(ctx, null, H20);
      await ctx.focusList();
      await ctx.press.pageDown();
      await ctx.settle(100);
      t.eq(await cursorIndex(ctx), 20, "page_down moves 20");
      await ctx.press.pageUp();
      await ctx.settle(100);
      t.eq(await cursorIndex(ctx), 0, "page_up back to the 1st");
      await ctx.press.right();
      await ctx.settle(100);
      t.eq(await cursorIndex(ctx), 20, "→ moves 20");
      await ctx.press.left();
      await ctx.settle(100);
      t.eq(await cursorIndex(ctx), 0, "← moves back");
      await fitBody(ctx, null, H20 - 16); // 19 rows: 304 <= H < 320
      t.eq((await drawn(ctx)).gridRows, 19, "rows with H = 312");
      await ctx.focusList();
      await ctx.press.pageDown();
      await ctx.settle(100);
      t.eq(await cursorIndex(ctx), 19, "page_down moves 19");
    },
  },
  {
    id: "AC-943",
    title: "a narrow list (W about 300, size + time): one column of W, the name cell takes what is left of the 2ch / 10ch / 16ch cells, long names are shortened, title = full name",
    async run(t, ctx) {
      ctx.fx.files("names", 100, { prefix: "filler_" });
      ctx.fx.file("names", "averyveryveryverylongname_quarterly_report_final.xlsx");
      const { ch, rowHeight } = await openList(ctx, "names", 100, { size: true, time: true });
      const { W, H } = await fitBody(ctx, 300, H20);
      const exp = expectedPage({ W, H, rowHeight, ch, count: 101, showSize: true, showTime: true, minColWidth: 24, focusIndex: 0 });
      t.eq(exp.cols, 1, `W (${W}) is below the minimum column (54ch = ${minColPx(24, true, true, ch).toFixed(1)}px): one column`);
      const d = await drawn(ctx);
      t.eq([d.columns.length, d.columns[0].width], [1, W], "one column, W wide");
      t.eq(d.gridRows, 20, "rows");
      const grid = (await ctx.m.cs(".file-list-row", ["grid-template-columns"]))["grid-template-columns"].split(" ").map(Number.parseFloat);
      t.approx(grid[0], 2 * ch, "mark track 2ch", 0.6);
      t.approx(grid[2], 10 * ch, "size track 10ch", 0.6);
      t.approx(grid[3], 16 * ch, "time track 16ch", 0.6);
      // Bring the long name onto the page and look at it.
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.type("quarterly");
      await ctx.settle(300);
      const row = await ctx.ev(`(() => { const r = [...document.querySelectorAll('.file-list-row')].find((x) => x.querySelector('.name').title.startsWith('avery')); const n = r.querySelector('.name'); return { title: n.title, text: n.textContent, sw: n.scrollWidth, cw: n.clientWidth }; })()`);
      t.eq(row.title, "averyveryveryverylongname_quarterly_report_final.xlsx", "title = the full name");
      t.ok(row.text.length < row.title.length, "the name is shortened to fit", row.text);
      t.ok(row.text.endsWith(".xlsx") || row.text.endsWith("…"), "it ends with the extension or an ellipsis", row.text);
      t.ok(row.sw <= row.cw, "no CSS truncation", `${row.sw} > ${row.cw}`);
      await ctx.press.escape();
    },
  },
  {
    id: "AC-944",
    title: "a very narrow list (W about 200, size + time): the name cell is 0 wide and shows '…' only; the size and time cells keep their width",
    async run(t, ctx) {
      ctx.fx.files("names", 100, { prefix: "filler_" });
      ctx.fx.file("names", "averyveryveryverylongname_quarterly_report_final.xlsx");
      await openFiles(ctx, "names", 100, { size: true, time: true });
      const ch = await chOf(ctx, ".file-list");
      const { W } = await fitBody(ctx, 200, H20);
      t.ok(W <= 201 && W >= 199, "W is about 200", String(W));
      const fixed = (2 + 10 + 16 + 3) * ch;
      t.ok(fixed > W, `the fixed cells (31ch = ${fixed.toFixed(1)}px) do not fit in W: the name cell has nothing left`);
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.type("quarterly");
      await ctx.settle(300);
      const row = await ctx.ev(`(() => { const r = [...document.querySelectorAll('.file-list-row')].find((x) => x.querySelector('.name').title.startsWith('avery')); const n = r.querySelector('.name'); const g = getComputedStyle(r); return { title: n.title, text: (n.querySelector('.name-text') ?? n).textContent, grid: g.gridTemplateColumns, overflow: g.overflow, size: r.querySelector('.size').getBoundingClientRect().width, time: r.querySelector('.modified').getBoundingClientRect().width }; })()`);
      t.eq(row.title, "averyveryveryverylongname_quarterly_report_final.xlsx", "title = the full name");
      t.eq(row.text, "…", "the name part is the ellipsis only");
      t.eq(row.overflow, "hidden", "row overflow");
      t.approx(row.size, 10 * ch, "size cell keeps 10ch", 0.6);
      t.approx(row.time, 16 * ch, "time cell keeps 16ch", 0.6);
      await ctx.press.escape();
    },
  },
];
