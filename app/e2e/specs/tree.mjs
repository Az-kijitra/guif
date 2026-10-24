// SPEC-0300-0023 R-1800 .. R-1804 / AC-1800 / AC-1753 (the tuif look of the tree; replaces SPEC-0300-0017 §16.4 AC-911 ... AC-915 / AC-927, see the
// table "置き換えた受入基準" of SPEC-0300-0017 第11版 / 第12版). AC-912 / AC-913 (a leaf loses its mark, display names) are kept.
import { chOf, RGB, rowHeightOf } from "./_util.mjs";

const TREE_ROWS = `[...document.querySelectorAll('.tree-panel [role=treeitem]')].map((e) => {
  const caret = e.querySelector('.caret');
  const name = e.querySelector('.name');
  const s = getComputedStyle(e);
  return {
    id: e.id, level: Number(e.getAttribute('aria-level')), label: name.textContent, title: e.title,
    caret: caret.textContent.trim(), caretVisibility: getComputedStyle(caret).visibility, caretWidth: caret.getBoundingClientRect().width,
    padding: s.paddingLeft, height: e.getBoundingClientRect().height,
    selected: e.getAttribute('aria-selected'), expanded: e.getAttribute('aria-expanded'),
    nameLeft: name.getBoundingClientRect().left,
    color: s.color, background: s.backgroundColor, weight: s.fontWeight, outline: s.outlineStyle,
  };
})`;
const treeRows = (ctx) => ctx.ev(TREE_ROWS);

async function openTreeAt(ctx, ...segments) {
  const dir = ctx.fx.mkdir(...segments);
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ tree: true, size: true, time: false, hidden: false });
  await ctx.waitFor(`document.querySelectorAll('.tree-panel [role=treeitem]').length > 2`, { label: "the tree to show the path" });
  await ctx.settle();
  return dir;
}

const isBold = (weight) => Number(weight) >= 600 || weight === "bold";

export const tests = [
  {
    id: "AC-911",
    title: "tree nodes (AC-1800 / AC-1753): row height 16, indent 2ch per depth, marks ▾ / ▸ in a 2ch column, no caret background, panel padding 0, heading ドライブ / ツリー",
    async run(t, ctx) {
      ctx.fx.mkdir("A", "B");
      await openTreeAt(ctx, "A", "B");
      const rows = await treeRows(ctx);
      const ch = await chOf(ctx, ".tree-panel");
      const rowHeight = await rowHeightOf(ctx);
      t.eq(rowHeight, 16, "--list-row-height is 16px (12px font, R-1754)");
      t.ok(rows.length >= 3, "the tree shows the path chain", String(rows.length));
      t.eq(rows[0].label, "C:", "first node is the drive (名前は C:)");
      t.eq(rows[0].padding, "0px", "drive node padding-left (level 1) is 0");
      for (const row of rows) {
        t.approx(row.height, rowHeight, `node "${row.label}" height`);
        t.approx(Number.parseFloat(row.padding), 2 * ch * (row.level - 1), `node "${row.label}" padding-left = 2ch x depth`, 0.6);
        t.approx(row.caretWidth, 2 * ch, `node "${row.label}" mark column is 2ch wide`, 0.6);
      }
      const a = rows.find((r) => r.label === "A");
      const b = rows.find((r) => r.label === "B" && r.selected === "true");
      t.ok(a && b, "nodes A and B exist");
      t.eq(b.level - a.level, 1, "B is one level below A");
      for (const row of rows.filter((r) => r.expanded === "true")) t.eq(row.caret, "▾", `expanded node "${row.label}" mark`);
      t.eq(b.expanded, "false", "B is collapsed");
      t.eq(b.caret, "▸", "collapsed, unfetched B shows ▸");
      const caret = await ctx.m.cs(".tree-node .caret", ["background-color"], 0);
      t.eq(caret["background-color"], "rgba(0, 0, 0, 0)", "mark background");
      t.eq((await ctx.m.cs(".tree-panel", ["padding"])).padding, "0px", "tree panel padding");
      t.eq(await ctx.ev(`document.querySelector('.tree-pane .pane-title').textContent`), "ドライブ / ツリー", "tree heading (AC-1760)");
    },
  },
  {
    id: "AC-912",
    title: "a folder with no sub-folders loses its mark (hidden) but keeps the name position",
    async run(t, ctx) {
      ctx.fx.mkdir("A", "B");
      await openTreeAt(ctx, "A", "Leaf");
      let rows = await treeRows(ctx);
      const leafBefore = rows.find((r) => r.label === "Leaf" && r.selected === "true");
      t.ok(leafBefore, "Leaf is the current node");
      t.eq(leafBefore.caretVisibility, "visible", "mark visible while its children are unknown");
      const index = rows.findIndex((r) => r.id === leafBefore.id);
      await ctx.clickSel(".tree-node .caret", index);
      await ctx.waitFor(`(() => { const n = [...document.querySelectorAll('.tree-panel [role=treeitem]')].find((e) => e.getAttribute('aria-selected') === 'true'); return !!n && getComputedStyle(n.querySelector('.caret')).visibility === 'hidden'; })()`, {
        label: "the mark of the empty folder to hide",
      });
      rows = await treeRows(ctx);
      const leaf = rows.find((r) => r.label === "Leaf");
      const sibling = rows.find((r) => r.label === "B");
      t.eq(leaf.caretVisibility, "hidden", "Leaf mark visibility after the empty fetch");
      t.ok(sibling && sibling.caretVisibility === "visible", "sibling B (unfetched) still shows its mark");
      t.approx(leaf.nameLeft, sibling.nameLeft, "Leaf name left = B name left");
    },
  },
  {
    id: "AC-913",
    title: "drive / share / single-node display names and titles (drive enumeration + listings stubbed)",
    async run(t, ctx) {
      const dir = await openTreeAt(ctx, "A", "B");
      if (ctx.stubStatus !== "ok") throw new Error("invoke cannot be stubbed");
      await ctx.stub("fs_list_drives", `() => ["C:\\\\", "D:\\\\"]`);
      const root = JSON.stringify(ctx.fx.root.toLowerCase());
      // Anything outside the fixture folder lists as an empty folder; the fixture itself stays real.
      await ctx.stub("fs_list_dir", `async (args, pass) => (args.path.toLowerCase().startsWith(${root}) ? pass() : [])`);
      // Two tree toggles re-enumerate the drives (SPEC-0300-0016 R-44).
      await ctx.focusList();
      await ctx.press.toggleTree();
      await ctx.press.toggleTree();
      await ctx.settle();

      const GUID = "{12345678-1234-1234-1234-123456789abc}";
      const cases = [
        { name: "(i) C:\\A", path: "C:\\A", labels: ["C:", "D:"], titles: { "C:": "C:\\" } },
        { name: "(ii) \\\\server\\share\\X", path: "\\\\server\\share\\X", labels: ["C:", "D:", "\\\\server\\share"], titles: { "\\\\server\\share": "\\\\server\\share\\" } },
        { name: "(iii) \\\\?\\C:\\A", path: "\\\\?\\C:\\A", labels: ["C:", "D:"], titles: { "C:": "C:\\" } },
        { name: "(iv) \\\\?\\Volume{GUID}\\X", path: `\\\\?\\Volume${GUID}\\X`, labels: ["C:", "D:", "X"], titles: { X: `\\\\?\\Volume${GUID}\\X` } },
        { name: "(v) \\\\.\\C:\\", path: "\\\\.\\C:\\", labels: ["C:", "D:", "\\\\.\\C:"], titles: { "\\\\.\\C:": "\\\\.\\C:\\" } },
      ];
      ctx.fakeFs = true; // from here the listings are stubbed: no real file system access
      for (const c of cases) {
        await ctx.press.ctrlL();
        await ctx.cdp.type(c.path);
        await ctx.cdp.key("Enter");
        try {
          await ctx.waitFor(`(() => { const i = document.querySelector('.path-bar-row input'); return document.activeElement !== i && !document.querySelector('.list-notice') && i.value.length > 0 && document.querySelectorAll('.tree-panel [role=treeitem][aria-level="1"]').length >= 2; })()`, { timeout: 6000, label: "the navigation" });
        } catch {
          /* the checks below report what the screen shows */
        }
        await ctx.settle(300);
        const tops = await ctx.ev(`[...document.querySelectorAll('.tree-panel [role=treeitem][aria-level="1"]')].map((e) => ({ label: e.querySelector('.name').textContent, title: e.title }))`);
        t.eq(tops.map((x) => x.label), c.labels, `${c.name}: top-level labels`);
        for (const [label, title] of Object.entries(c.titles)) {
          t.eq(tops.find((x) => x.label === label)?.title, title, `${c.name}: title of "${label}"`);
        }
        t.ok(!tops.some((x) => /^\\\\\?\\/.test(x.label) && !/Volume/.test(x.label)), `${c.name}: no \\\\?\\ prefix in labels`);
        t.ok(!tops.some((x) => x.label !== "C:" && x.label !== "D:" && /^[A-Z]:\\$/.test(x.label)), `${c.name}: no trailing backslash on drive labels`);
        if (c.name.startsWith("(i)")) {
          const driveIndex = tops.findIndex((x) => x.label === "C:");
          await ctx.clickSel('.tree-panel [role=treeitem][aria-level="1"]', driveIndex);
          await ctx.waitFor(`document.querySelector('.path-bar-row input').value === 'C:\\\\'`, { timeout: 5000, label: "the path bar to show C:\\" }).catch(() => {});
          t.eq((await ctx.pathBarState()).value, "C:\\", "(i) selecting the C: node shows C:\\ in the path bar");
        }
      }
      void dir;
    },
  },
  {
    id: "AC-914",
    title: "tree focus (AC-1800 / AC-1723): focus position = cursor_bg / cursor_fg / bold; current folder = tree_current bold no background; after Tab the focus position is tree_cursor; frame colours",
    async run(t, ctx) {
      ctx.fx.mkdir("A", "B");
      ctx.fx.mkdir("A", "Leaf");
      await openTreeAt(ctx, "A", "B");
      await ctx.focusList();
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree to take focus" });
      await ctx.press.up(); // focus position moves to A; the current folder stays B
      await ctx.settle();
      let rows = await treeRows(ctx);
      const bIndex = rows.findIndex((r) => r.label === "B" && r.selected === "true");
      const aIndex = bIndex - 1;
      t.ok(bIndex > 0, "B is the current folder");
      t.eq(rows[aIndex].label, "A", "the row above B is A");
      const a = rows[aIndex];
      const b = rows[bIndex];
      t.eq([a.background, a.color, isBold(a.weight)], [RGB.cursorBg, RGB.cursorFg, true], "focus position A (tree focused): cursor_bg / cursor_fg / bold");
      t.eq([b.background, b.color, isBold(b.weight)], ["rgba(0, 0, 0, 0)", RGB.treeCurrent, true], "current folder B: tree_current, bold, no background");
      t.eq(a.caret, "▾", "A (expanded) shows ▾");
      t.eq(b.caret, "▸", "B (collapsed) shows ▸");
      t.eq(a.outline, "none", "no outline on the focus position (the colour carries it)");
      const frame = (sel) => ctx.m.cs(sel, ["border-top-color"], 0);
      t.eq((await ctx.m.cs(".tree-pane", ["--ui-border-active"]))["--ui-border-active"]?.trim().toLowerCase(), "#88c0d0", "--ui-border-active is nord's border");
      const treeFrame = await ctx.ev(`getComputedStyle(document.querySelector('.tree-pane'), '::before').borderTopColor`);
      const listFrame = await ctx.ev(`getComputedStyle(document.querySelector('.file-list-frame'), '::before').borderTopColor`);
      t.eq(treeFrame, RGB.borderActive, "tree frame colour (tree focused) = border");
      t.eq(listFrame, RGB.border, "list frame colour (list not focused) = border_inactive");
      void frame;

      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.file-list')`, { label: "the list to take focus" });
      rows = await treeRows(ctx);
      t.eq([rows[aIndex].background, rows[aIndex].color], ["rgba(0, 0, 0, 0)", RGB.treeCursor], "after Tab: focus position A = tree_cursor, no background");
      t.eq([rows[bIndex].background, rows[bIndex].color, isBold(rows[bIndex].weight)], ["rgba(0, 0, 0, 0)", RGB.treeCurrent, true], "after Tab: current folder B unchanged");
      t.eq(await ctx.ev(`getComputedStyle(document.querySelector('.tree-pane'), '::before').borderTopColor`), RGB.border, "tree frame colour after Tab = border_inactive");
      t.eq(await ctx.ev(`getComputedStyle(document.querySelector('.file-list-frame'), '::before').borderTopColor`), RGB.borderActive, "list frame colour after Tab = border");
    },
  },
  {
    id: "AC-915",
    title: "a long folder name is cut at the tree's edge (no ellipsis, no scrollbar, no horizontal scroll); title = path",
    async run(t, ctx) {
      const longName = "a_very_long_folder_name_that_cannot_possibly_fit_inside_a_narrow_tree_panel_at_all";
      const dir = await openTreeAt(ctx, "long", longName);
      const rows = await treeRows(ctx);
      const index = rows.findIndex((r) => r.label === longName);
      t.ok(index >= 0, "the long-named node is shown");
      const name = await ctx.ev(`(() => { const n = document.querySelectorAll('.tree-node')[${index}]; const e = n.querySelector('.name'); return { overflow: getComputedStyle(e).overflow, sw: e.scrollWidth, cw: e.clientWidth, title: n.title }; })()`);
      t.eq(name.overflow, "hidden", "name overflow is hidden");
      t.ok(name.sw >= name.cw, "name scrollWidth >= clientWidth", `${name.sw} vs ${name.cw}`);
      t.eq(name.title.toLowerCase(), dir.toLowerCase(), "node title is the folder path");
      const panel = await ctx.m.cs(".tree-panel", ["scrollbar-width"]);
      t.eq(panel["scrollbar-width"], "none", "tree panel scrollbar-width");
      const d = await ctx.m.dims(".tree-panel");
      t.eq(d.scrollWidth, d.clientWidth, "tree panel has no horizontal overflow");
    },
  },
  {
    id: "AC-927",
    title: "tree page_down moves floor(clientHeight / 16) - 1 rows (AC-1753), whatever the scroll position",
    async run(t, ctx) {
      for (let i = 1; i <= 60; i++) ctx.fx.mkdir("treebig", `d${String(i).padStart(2, "0")}`);
      const dir = await openTreeAt(ctx, "treebig");
      // Expand the current folder so there are plenty of rows below it.
      let rows = await treeRows(ctx);
      const current = rows.findIndex((r) => r.selected === "true");
      await ctx.clickSel(".tree-node .caret", current);
      await ctx.waitFor(`document.querySelectorAll('.tree-panel [role=treeitem]').length >= 60`, { label: "the sub-folders to appear" });
      // Make the tree panel's clientHeight about 300 px, and compute the expected distance from the measured height.
      await ctx.setViewport(1000, 700);
      const base = await ctx.m.dims(".tree-panel");
      await ctx.setViewport(1000, 700 + (300 - base.clientHeight));
      const height = (await ctx.m.dims(".tree-panel")).clientHeight;
      const rowHeight = await rowHeightOf(ctx);
      const expected = Math.floor(height / rowHeight) - 1;
      t.eq(height, 300, "tree panel clientHeight");
      t.eq(expected, 17, "floor(300 / 16) - 1 = 17");
      for (const scrollTop of [0, 7]) {
        await ctx.focusList();
        await ctx.press.tab();
        await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree to take focus" });
        await ctx.ev(`document.querySelector('.tree-panel').scrollTop = ${scrollTop}; true`);
        const activeIndex = () =>
          ctx.ev(`(() => { const id = document.querySelector('.tree-panel').getAttribute('aria-activedescendant'); return [...document.querySelectorAll('.tree-panel [role=treeitem]')].findIndex((e) => e.id === id); })()`);
        // Start from the same row each time: the current folder's node.
        while ((await activeIndex()) > current) await ctx.press.up();
        const before = await activeIndex();
        await ctx.press.pageDown();
        await ctx.settle();
        t.eq((await activeIndex()) - before, expected, `page_down distance with scrollTop ${scrollTop}`);
        await ctx.press.tab(); // back to the list for the next round
      }
      void dir;
      void rows;
    },
  },
];
