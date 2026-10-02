// SPEC-0300-0017 §16.4: the tree (AC-911 ... AC-915) and AC-927 (tree page movement).
import { FRAME_FOCUS, openFiles, RGB } from "./_util.mjs";

const TREE_ROWS = `[...document.querySelectorAll('.tree-panel [role=treeitem]')].map((e) => {
  const caret = e.querySelector('.caret');
  const name = e.querySelector('.name');
  return {
    id: e.id, level: Number(e.getAttribute('aria-level')), label: name.textContent, title: e.title,
    caret: caret.textContent.trim(), caretVisibility: getComputedStyle(caret).visibility,
    padding: getComputedStyle(e).paddingLeft, height: e.getBoundingClientRect().height,
    selected: e.getAttribute('aria-selected'), expanded: e.getAttribute('aria-expanded'),
    nameLeft: name.getBoundingClientRect().left,
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

export const tests = [
  {
    id: "AC-911",
    title: "tree nodes: height 28, indent 8 + 14 x level, carets, caret button size/colour, panel padding 0",
    async run(t, ctx) {
      ctx.fx.mkdir("A", "B");
      await openTreeAt(ctx, "A", "B");
      const rows = await treeRows(ctx);
      t.ok(rows.length >= 3, "the tree shows the path chain", String(rows.length));
      t.eq(rows[0].label, "C:", "first node is the drive");
      t.eq(rows[0].padding, "8px", "drive node padding-left (level 1)");
      for (const row of rows) {
        t.approx(row.height, 28, `node "${row.label}" height`);
        t.eq(row.padding, `${8 + 14 * (row.level - 1)}px`, `node "${row.label}" padding-left`);
      }
      const a = rows.find((r) => r.label === "A");
      const b = rows.find((r) => r.label === "B" && r.selected === "true");
      t.ok(a && b, "nodes A and B exist");
      t.eq(b.level - a.level, 1, "B is one level below A");
      for (const row of rows.filter((r) => r.expanded === "true")) t.eq(row.caret, "▼", `expanded node "${row.label}" caret`);
      t.eq(b.expanded, "false", "B is collapsed");
      t.eq(b.caret, "▶", "collapsed, unfetched B shows ▶");
      const caret = await ctx.m.cs(".tree-node .caret", ["width", "background-color", "color"], 0);
      t.eq(caret.width, "16px", "caret button width");
      t.eq(caret["background-color"], "rgba(0, 0, 0, 0)", "caret background");
      t.eq(caret.color, RGB.muted, "caret colour");
      t.eq((await ctx.m.cs(".tree-panel", ["padding"])).padding, "0px", "tree panel padding");
    },
  },
  {
    id: "AC-912",
    title: "a folder with no sub-folders loses its caret (hidden) but keeps the name position",
    async run(t, ctx) {
      ctx.fx.mkdir("A", "B");
      await openTreeAt(ctx, "A", "Leaf");
      let rows = await treeRows(ctx);
      const leafBefore = rows.find((r) => r.label === "Leaf" && r.selected === "true");
      t.ok(leafBefore, "Leaf is the current node");
      t.eq(leafBefore.caretVisibility, "visible", "caret visible while its children are unknown");
      const index = rows.findIndex((r) => r.id === leafBefore.id);
      await ctx.clickSel(".tree-node .caret", index);
      await ctx.waitFor(`(() => { const n = [...document.querySelectorAll('.tree-panel [role=treeitem]')].find((e) => e.getAttribute('aria-selected') === 'true'); return !!n && getComputedStyle(n.querySelector('.caret')).visibility === 'hidden'; })()`, {
        label: "the caret of the empty folder to hide",
      });
      rows = await treeRows(ctx);
      const leaf = rows.find((r) => r.label === "Leaf");
      const sibling = rows.find((r) => r.label === "B");
      t.eq(leaf.caretVisibility, "hidden", "Leaf caret visibility after the empty fetch");
      t.ok(sibling && sibling.caretVisibility === "visible", "sibling B (unfetched) still shows its caret");
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
    title: "tree focus: highlighted node background, focus-position outline + panel outline; both gone after Tab to the list",
    async run(t, ctx) {
      ctx.fx.mkdir("A", "B");
      await openTreeAt(ctx, "A", "B");
      await ctx.focusList();
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree to take focus" });
      await ctx.press.up(); // focus position moves to A; the current folder stays B
      await ctx.settle();
      const rows = await treeRows(ctx);
      const bIndex = rows.findIndex((r) => r.label === "B" && r.selected === "true");
      const aIndex = bIndex - 1;
      t.ok(bIndex > 0, "B is the current folder");
      t.eq(rows[aIndex].label, "A", "the row above B is A");
      t.eq((await ctx.m.cs(".tree-node", ["background-color"], bIndex))["background-color"], RGB.selected, "current folder background");
      const n = await ctx.m.outline(".tree-node", aIndex);
      t.eq([n.width, n.style, n.color, n.offset], [FRAME_FOCUS.width, FRAME_FOCUS.style, FRAME_FOCUS.color, FRAME_FOCUS.offset], "focus-position node outline");
      const p = await ctx.m.outline(".tree-panel");
      t.eq([p.width, p.style, p.color, p.offset], [FRAME_FOCUS.width, FRAME_FOCUS.style, FRAME_FOCUS.color, FRAME_FOCUS.offset], "tree panel outline");
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.file-list')`, { label: "the list to take focus" });
      t.eq((await ctx.m.outline(".tree-node", aIndex)).style, "none", "node outline after Tab");
      t.eq((await ctx.m.outline(".tree-panel")).style, "none", "panel outline after Tab");
      t.eq((await ctx.m.cs(".tree-node", ["background-color"], bIndex))["background-color"], RGB.selected, "current folder background unchanged");
    },
  },
  {
    id: "AC-915",
    title: "a long folder name is ellipsized in the tree, title = path, no scrollbar and no horizontal scroll",
    async run(t, ctx) {
      const longName = "a_very_long_folder_name_that_cannot_possibly_fit_inside_a_220px_tree_panel";
      const dir = await openTreeAt(ctx, "long", longName);
      const rows = await treeRows(ctx);
      const index = rows.findIndex((r) => r.label === longName);
      t.ok(index >= 0, "the long-named node is shown");
      const name = await ctx.ev(`(() => { const n = document.querySelectorAll('.tree-node')[${index}]; const e = n.querySelector('.name'); return { overflow: getComputedStyle(e).textOverflow, sw: e.scrollWidth, cw: e.clientWidth, title: n.title }; })()`);
      t.eq(name.overflow, "ellipsis", "name text-overflow");
      t.ok(name.sw > name.cw, "name scrollWidth > clientWidth", `${name.sw} vs ${name.cw}`);
      t.eq(name.title.toLowerCase(), dir.toLowerCase(), "node title is the folder path");
      const panel = await ctx.m.cs(".tree-panel", ["scrollbar-width"]);
      t.eq(panel["scrollbar-width"], "none", "tree panel scrollbar-width");
      const d = await ctx.m.dims(".tree-panel");
      t.eq(d.scrollWidth, d.clientWidth, "tree panel has no horizontal overflow");
    },
  },
  {
    id: "AC-927",
    title: "tree page_down moves floor(clientHeight / 28) - 1 = 9 rows, whatever the scroll position",
    async run(t, ctx) {
      for (let i = 1; i <= 40; i++) ctx.fx.mkdir("treebig", `d${String(i).padStart(2, "0")}`);
      const dir = await openTreeAt(ctx, "treebig");
      // Expand the current folder so there are plenty of rows below it.
      let rows = await treeRows(ctx);
      const current = rows.findIndex((r) => r.selected === "true");
      await ctx.clickSel(".tree-node .caret", current);
      await ctx.waitFor(`document.querySelectorAll('.tree-panel [role=treeitem]').length >= 40`, { label: "the sub-folders to appear" });
      // Make the tree panel's clientHeight exactly 300.
      await ctx.setViewport(1000, 700);
      const base = await ctx.m.dims(".tree-panel");
      await ctx.setViewport(1000, 700 + (300 - base.clientHeight));
      t.eq((await ctx.m.dims(".tree-panel")).clientHeight, 300, "tree panel clientHeight");
      for (const scrollTop of [0, 14]) {
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
        t.eq((await activeIndex()) - before, 9, `page_down distance with scrollTop ${scrollTop}`);
        await ctx.press.tab(); // back to the list for the next round
      }
      void dir;
      void rows;
    },
  },
];
