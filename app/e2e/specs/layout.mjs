// SPEC-0300-0017 §16.1: overall layout (AC-900 ... AC-903).
import { BORDER_SIDES, borders, expectedBorders, openFiles, RGB } from "./_util.mjs";

export const tests = [
  {
    id: "AC-900",
    title: "menu bar / path bar / body / status bar stack in order, 2px outer margin, 3px gaps (SPEC-0300-0020 AC-1300), page does not scroll",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.setViewport(1000, 700);
      const menuBar = await ctx.m.rect(".app-shell > .menubar");
      const pathBar = await ctx.m.rect(".app-shell > .path-bar-row");
      const body = await ctx.m.rect(".app-shell > .body");
      const status = await ctx.m.rect(".app-shell > .status-bar");
      t.ok(menuBar && pathBar && body && status, "menu bar, path bar, body and status bar exist");
      t.ok(menuBar.top < pathBar.top && pathBar.top < body.top && body.top < status.top, "top increases: menu bar < path bar < body < status bar");
      t.approx(menuBar.top, 2, "menu bar top");
      t.approx(menuBar.left, 2, "menu bar left");
      t.approx(menuBar.right, 998, "menu bar right");
      t.approx(pathBar.top - menuBar.bottom, 3, "gap menu bar -> path bar");
      t.approx(pathBar.left, 2, "path bar left");
      t.approx(pathBar.right, 998, "path bar right");
      t.approx(status.bottom, 698, "status bar bottom");
      t.approx(body.top - pathBar.bottom, 3, "gap path bar -> body");
      t.approx(status.top - body.bottom, 3, "gap body -> status bar");
      t.eq(await ctx.m.count('[role=menubar]'), 1, "exactly one menu bar element (role=menubar)");
      t.eq(await ctx.m.count('[role=menu]'), 0, "no dropdown is open at the start");
      const doc = await ctx.ev(`({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
      t.eq(doc.sh, doc.ch, "document scrollHeight = clientHeight");
      t.eq(doc.sw, doc.cw, "document scrollWidth = clientWidth");
    },
  },
  {
    id: "AC-901",
    title: "tree panel 220px, list frame fills the rest (3px gap), tree toggle, wider window",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.setViewport(1000, 700);
      const tree = await ctx.m.rect(".tree-panel");
      let frame = await ctx.m.rect(".file-list-frame");
      const body = await ctx.m.rect(".app-shell > .body");
      t.approx(tree.width, 220, "tree panel width");
      t.approx(tree.left, 2, "tree panel left");
      t.approx(frame.left, tree.right + 3, "list frame left = tree right + 3");
      t.approx(frame.right, 998, "list frame right");
      t.approx(tree.top, body.top, "tree top = body top");
      t.approx(tree.bottom, body.bottom, "tree bottom = body bottom");
      t.approx(frame.top, body.top, "frame top = body top");
      t.approx(frame.bottom, body.bottom, "frame bottom = body bottom");

      await ctx.press.toggleTree();
      await ctx.settle();
      frame = await ctx.m.rect(".file-list-frame");
      t.eq(await ctx.m.count(".tree-panel"), 0, "tree hidden");
      t.approx(frame.left, 2, "list frame left without the tree");
      t.approx(frame.right, 998, "list frame right without the tree");
      await ctx.press.toggleTree();
      await ctx.settle();

      await ctx.setViewport(1200, 700);
      const wide = await ctx.m.rect(".file-list-frame");
      const wideTree = await ctx.m.rect(".tree-panel");
      t.approx(wide.right, 1198, "list frame right at 1200 wide");
      t.approx(wideTree.width, 220, "tree panel width stays 220");
    },
  },
  {
    id: "AC-902",
    title: "computed styles: margins, overflow, container flex/padding/gap/height, frames, backgrounds",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.setViewport(1000, 700);
      for (const sel of ["html", "body"]) {
        const s = await ctx.m.cs(sel, ["margin-top", "margin-right", "margin-bottom", "margin-left", "overflow-x", "overflow-y", "background-color"]);
        for (const side of BORDER_SIDES) t.eq(s[`margin-${side}`], "0px", `${sel} margin-${side}`);
        t.eq(s["overflow-x"], "hidden", `${sel} overflow-x`);
        t.eq(s["overflow-y"], "hidden", `${sel} overflow-y`);
      }
      t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], RGB.bg, "body background");
      const shell = await ctx.m.cs(".app-shell", ["display", "flex-direction", "padding", "row-gap", "height", "background-color"]);
      t.eq(shell.display, "flex", "container display");
      t.eq(shell["flex-direction"], "column", "container flex-direction");
      t.eq(shell.padding, "2px", "container padding");
      t.eq(shell["row-gap"], "3px", "container row-gap");
      t.eq(shell.height, "700px", "container height");
      t.eq(shell["background-color"], RGB.bg, "container background");

      const frames = [
        [".path-bar-row", RGB.surface2],
        [".tree-panel", RGB.surface],
        [".file-list-frame", RGB.surface],
        [".status-bar", RGB.surface2],
      ];
      for (const [sel, bg] of frames) {
        const b = await borders(ctx, sel);
        const expected = expectedBorders(RGB.border);
        for (const key of Object.keys(expected)) t.eq(b[key], expected[key], `${sel} ${key}`);
        t.eq((await ctx.m.cs(sel, ["background-color"]))["background-color"], bg, `${sel} background`);
      }
    },
  },
  {
    id: "AC-903",
    title: "loading / error notice overlays the frame's top-left without changing the list size",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      const target = ctx.fx.files("many10", 10);
      if (ctx.stubStatus !== "ok") throw new Error("invoke cannot be stubbed");
      await ctx.setViewport(1000, 700);
      const bodyBefore = await ctx.m.dims(".file-list");
      const rowsBefore = (await ctx.m.cs(".file-list", ["grid-template-rows"]))["grid-template-rows"].split(" ").length;

      // Loading: delay only the target folder's listing.
      const delayed = JSON.stringify(target);
      await ctx.stub("fs_list_dir", `async (args, pass) => { if (args.path.toLowerCase().replace(/\\\\+$/, "") === ${delayed}.toLowerCase().replace(/\\\\+$/, "")) await new Promise((r) => setTimeout(r, 2500)); return pass(); }`);
      await ctx.press.ctrlL();
      await ctx.cdp.type(target);
      await ctx.cdp.key("Enter");
      await ctx.waitFor(`!!document.querySelector('.list-notice')`, { timeout: 5000, label: "the loading notice" });
      const notice = await ctx.m.rect(".list-notice");
      const frame = await ctx.m.rect(".file-list-frame");
      const fd = await ctx.m.dims(".file-list-frame");
      t.approx(notice.left, frame.left + fd.clientLeft + 4, "notice left = frame inner left + 4");
      t.approx(notice.top, frame.top + fd.clientTop + 4, "notice top = frame inner top + 4");
      const ns = await ctx.m.cs(".list-notice", ["position", "pointer-events", "font-size"]);
      t.eq(ns.position, "absolute", "notice position");
      t.eq(ns["pointer-events"], "none", "notice pointer-events");
      t.eq(ns["font-size"], "12px", "notice font-size");
      const bodyDuring = await ctx.m.dims(".file-list");
      t.eq([bodyDuring.clientWidth, bodyDuring.clientHeight], [bodyBefore.clientWidth, bodyBefore.clientHeight], "list body size while loading");
      t.eq((await ctx.m.cs(".file-list", ["grid-template-rows"]))["grid-template-rows"].split(" ").length, rowsBefore, "rows while loading");
      // The rows stay clickable under the notice.
      const rowCount = await ctx.rowCount();
      if (rowCount > 0) {
        await ctx.clickSel(".file-list-row", 2);
        t.eq(await ctx.ev(`document.querySelectorAll('.file-list-row')[2]?.getAttribute('aria-selected')`), "true", "a row clicked while the notice shows is selected");
      } else {
        t.fail("no rows are shown while loading, so the click-through cannot be exercised");
      }
      await ctx.waitFor(`!document.querySelector('.list-notice')`, { timeout: 8000, label: "the loading notice to disappear" });
      await ctx.ev(`window.__e2e.stubs.fs_list_dir && (delete window.__e2e.stubs.fs_list_dir); true`);
      t.eq(await ctx.m.count(".list-notice"), 0, "loading notice removed after the load");

      // Error: the banner is written by a failed reload of the current folder (Ctrl+H re-lists with
      // the new hidden-files setting); a user navigation reports failures elsewhere (R-726).
      await ctx.stub("fs_list_dir", `async (args, pass) => { if (args.path.toLowerCase().indexOf("many10") >= 0 && args.path.toLowerCase().indexOf("many100") < 0) return { error: { code: "other", message: "E2E stub failure" } }; return pass(); }`);
      await ctx.focusList();
      const bodyBeforeError = await ctx.m.dims(".file-list");
      const rowsBeforeError = (await ctx.m.cs(".file-list", ["grid-template-rows"]))["grid-template-rows"].split(" ").length;
      await ctx.press.toggleHidden();
      await ctx.waitFor(`!!document.querySelector('.list-notice.error')`, { timeout: 5000, label: "the error notice" });
      const es = await ctx.m.cs(".list-notice.error", ["color", "font-size", "position"]);
      t.eq(es.color, RGB.error, "error colour");
      t.eq(es["font-size"], "12px", "error font-size");
      const bodyErr = await ctx.m.dims(".file-list");
      t.eq([bodyErr.clientWidth, bodyErr.clientHeight], [bodyBeforeError.clientWidth, bodyBeforeError.clientHeight], "list body size with the error");
      t.eq((await ctx.m.cs(".file-list", ["grid-template-rows"]))["grid-template-rows"].split(" ").length, rowsBeforeError, "rows with the error");
      // Next successful load clears it.
      await ctx.unstub("fs_list_dir");
      await ctx.focusList();
      await ctx.press.toggleHidden();
      await ctx.waitFor(`!document.querySelector('.list-notice')`, { timeout: 8000, label: "the error notice to disappear" });
      t.eq(await ctx.m.count(".list-notice"), 0, "error notice removed by the next successful load");
    },
  },
];
