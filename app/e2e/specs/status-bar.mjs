// SPEC-0300-0017 §16.8: the status bar (AC-932 ... AC-937).
import { openFiles, setSort } from "./_util.mjs";

const items = (ctx) => ctx.m.statusItems();

async function selectFirst(ctx, n) {
  await ctx.focusList();
  for (let i = 0; i < n; i++) await ctx.key(" ", 0, "Space"); // select_toggle selects and moves down
  await ctx.settle();
}

async function openSearch(ctx) {
  await ctx.focusList();
  await ctx.press.search();
  await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
}
async function closeSearch(ctx) {
  await ctx.press.escape();
  await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });
  await ctx.settle(100);
}

export const tests = [
  {
    id: "AC-932",
    title: "four permanent items: フォーカス: 一覧 / 並び替え: 種類 ↑ / 選択: 3 / 隠し: オフ; no F1; bar has height",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      await setSort(ctx, "type", "asc");
      await ctx.focusList();
      await selectFirst(ctx, 3);
      t.eq(await items(ctx), ["フォーカス: 一覧", "並び替え: 種類 ↑", "選択: 3", "隠し: オフ"], "status items");
      t.ok(!(await items(ctx)).some((x) => x.includes("F1")), "no F1 item");
      t.ok((await ctx.m.rect(".status-bar")).height > 0, "status bar height > 0");
    },
  },
  {
    id: "AC-933",
    title: "sort modified desc + hidden on -> '更新日時 ↓' / '隠し: オン'; name / size labels; sort menu mark",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      await setSort(ctx, "modified", "desc");
      await ctx.ensureView({ hidden: true });
      let list = await items(ctx);
      t.eq(list[1], "並び替え: 更新日時 ↓", "2nd item");
      t.eq(list[3], "隠し: オン", "4th item");
      // The sort menu marks the current key with the same arrow.
      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      const marks = await ctx.ev(`[...document.querySelectorAll('.sort-menu-item')].map((e) => [e.querySelector('.label').textContent, e.querySelector('.check').textContent])`);
      t.eq(marks.find((m) => m[0] === "更新日時")?.[1], "↓", "current key carries ↓ in the menu");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });
      await setSort(ctx, "name", "asc");
      t.eq((await items(ctx))[1], "並び替え: 名前 ↑", "name label");
      await setSort(ctx, "size", "asc");
      t.eq((await items(ctx))[1], "並び替え: サイズ ↑", "size label");
      await setSort(ctx, "name", "asc");
      await ctx.ensureView({ hidden: false });
    },
  },
  {
    id: "AC-934",
    title: "search filter item: absent for empty / blank query, '絞り込み: rep' + '選択: 2' while filtering, gone after closing",
    async run(t, ctx) {
      // 120 entries; 12 contain "rep"; the first five (two of them "rep") get selected.
      if (!ctx.fx.exists("many120")) {
        ctx.fx.mkdir("many120");
        for (const n of ["a_rep_01.txt", "a_rep_02.txt"]) ctx.fx.file("many120", n);
        for (let i = 1; i <= 108; i++) ctx.fx.file("many120", `b${String(i).padStart(3, "0")}.txt`);
        for (let i = 3; i <= 12; i++) ctx.fx.file("many120", `x_rep_${String(i).padStart(2, "0")}.txt`);
      }
      await ctx.reload();
      await ctx.nav(ctx.fx.at("many120"));
      await ctx.ensureView({ size: true, time: false, hidden: false });
      await setSort(ctx, "name", "asc");
      await selectFirst(ctx, 5);
      t.eq((await items(ctx))[2], "選択: 5", "five selected before searching");
      await openSearch(ctx);
      t.eq((await items(ctx)).length, 4, "(i) empty query: no 絞り込み");
      await ctx.type("  ");
      await ctx.settle(200);
      t.eq((await items(ctx)).length, 4, "(ii) blank query: no 絞り込み");
      await closeSearch(ctx);
      await openSearch(ctx);
      await ctx.type("rep");
      await ctx.settle(300);
      const list = await items(ctx);
      t.eq(await ctx.rowCount(), 12, "12 entries are shown");
      t.eq(list[2], "選択: 2", "(iii) 選択 counts the visible selected entries");
      t.eq(list[list.length - 1], "絞り込み: rep", "(iii) the filter item is last");
      await closeSearch(ctx);
      const after = await items(ctx);
      t.ok(!after.some((x) => x.startsWith("絞り込み")), "closing the search bar removes the filter item");
      t.eq(after[2], "選択: 5", "選択 is back to 5");
    },
  },
  {
    id: "AC-936",
    title: "one role=status in the bar at all times: holds the message while shown, empty (zero width) afterwards; items outside it",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      const live = () => ctx.ev(`(() => { const s = document.querySelectorAll('.status-bar [role=status]'); const e = s[0]; return { count: s.length, text: e?.textContent, width: e?.getBoundingClientRect().width, last: e === document.querySelector('.status-bar').lastElementChild }; })()`);
      let state = await live();
      t.eq(state.count, 1, "exactly one role=status in the status bar (no message)");
      t.eq(state.text, "", "empty without a message");
      t.eq(state.width, 0, "zero width while empty");
      t.ok(state.last, "it is the last element of the bar");
      // A message: a failing navigation (the stub supplies the text) reports it in the status bar.
      await ctx.stub("fs_list_dir", `async (args, pass) => (args.path.toLowerCase().indexOf("nowhere") >= 0 ? { error: { code: "other", message: "E2E status message" } } : pass())`);
      await ctx.press.ctrlL();
      await ctx.cdp.type(ctx.fx.at("nowhere"));
      await ctx.cdp.key("Enter");
      await ctx.waitFor(`document.querySelector('.status-bar [role=status]').textContent.length > 0`, { timeout: 6000, label: "a status message" });
      state = await live();
      t.eq(state.count, 1, "still exactly one role=status while a message shows");
      t.ok(state.text.includes("E2E status message"), "the message is inside the live region", state.text);
      t.ok(state.width > 0, "non-zero width while it shows");
      await ctx.waitFor(`document.querySelector('.status-bar [role=status]').textContent === ''`, { timeout: 8000, label: "the message to disappear" });
      state = await live();
      t.eq([state.count, state.text, state.width], [1, "", 0], "after it disappears: one empty zero-width role=status");
      await ctx.unstub("fs_list_dir");
      const wrong = await ctx.ev(`[...document.querySelectorAll('.status-bar .status-item')].filter((e) => e.closest('[role=status], [aria-live]')).length`);
      t.eq(wrong, 0, "permanent items have no role=status / aria-live ancestor");
      t.eq((await items(ctx)).length, 4, "the four permanent items remain");
      await ctx.focusList();
    },
  },
  {
    id: "AC-935",
    title: "focus item follows the focus: ツリー / パス / 検索 (input and button) / 履歴 / ジャンプリスト / 並び替えメニュー / ダイアログ / 一覧 / なし",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      const focus = async () => (await items(ctx))[0];
      await ctx.focusList();
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: 一覧", "(viii) list");

      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree" });
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: ツリー", "(i) tree");
      await ctx.press.tab();
      await ctx.settle(100);

      await ctx.press.ctrlL();
      await ctx.waitFor(`document.activeElement === document.querySelector('.path-bar-row input')`, { label: "the path bar" });
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: パス", "(ii) path bar editing");
      await ctx.press.escape();
      await ctx.settle(100);

      await openSearch(ctx);
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: 検索", "(iii) search input");
      // (iii-2) A button inside the search bar. Pressing the mouse on 適用 focuses the button; the
      // completed click is a "confirm", which hands the focus to the list (SPEC-0300-0012 AC-113-1),
      // so the literal wording "just after clicking 適用" is checked at the press, not after the release.
      await ctx.type("f0"); // a non-empty query keeps the bar open after the confirm
      await ctx.settle(150);
      const apply = await ctx.m.center(".search-bar .apply-button");
      await ctx.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: apply.x, y: apply.y });
      await ctx.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: apply.x, y: apply.y, button: "left", buttons: 1, clickCount: 1 });
      await ctx.settle(150);
      t.eq((await ctx.m.active())?.tag, "BUTTON", "(iii-2) the 適用 button holds the keyboard focus while pressed");
      t.eq(await focus(), "フォーカス: 検索", "(iii-2) mouse pressed on 適用");
      await ctx.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: apply.x, y: apply.y, button: "left", buttons: 0, clickCount: 1 });
      await ctx.settle(200);
      t.eq(await focus(), "フォーカス: 一覧", "(iii-2) after the completed 適用 click the list has the focus (SPEC-0300-0012 AC-113-1)");
      await ctx.waitFor(`!!document.querySelector('.search-bar')`, { label: "the search bar to stay open" });
      await ctx.clickSel(".search-bar .regex-toggle");
      await ctx.settle(150);
      t.eq((await ctx.m.active())?.tag, "BUTTON", "the .* toggle holds the focus after a click");
      t.eq(await focus(), "フォーカス: 検索", "(iii-2) after clicking the .* button");
      await closeSearch(ctx);
      await ctx.focusList();

      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list')`, { label: "the visit history" });
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: 履歴", "(iv) visit history");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the history to close" });

      await ctx.focusList();
      await ctx.key("J", 2 | 8, "KeyJ"); // jump_add: put the current folder on the jump list
      await ctx.settle(200);
      await ctx.press.jump();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list')`, { label: "the jump list" });
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: ジャンプリスト", "(v) jump list");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the jump list to close" });

      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: 並び替えメニュー", "(vi) sort menu");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });

      await ctx.focusList();
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the confirmation dialog" });
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: ダイアログ", "(vii) confirmation dialog");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });

      await ctx.focusList();
      await ctx.settle(100);
      t.eq(await focus(), "フォーカス: 一覧", "(viii) list again");
      await ctx.ev(`document.activeElement.blur(); true`);
      await ctx.settle(150);
      t.eq(await focus(), "フォーカス: なし", "(ix) nothing focused (document.body)");
    },
  },
  {
    id: "AC-937",
    title: "status bar style (flex, padding 3px 6px, gap 12px, 11px, nowrap); a 300-char message neither changes the height nor the rows",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      await ctx.setViewport(1000, 700);
      const s = await ctx.m.cs(".status-bar", ["display", "padding", "column-gap", "font-size", "flex-wrap"]);
      t.eq([s.display, s.padding, s["column-gap"], s["font-size"], s["flex-wrap"]], ["flex", "3px 6px", "12px", "11px", "nowrap"], "status bar style");
      const heightBefore = (await ctx.m.rect(".status-bar")).height;
      const rowsBefore = (await ctx.m.cs(".file-list", ["grid-template-rows"]))["grid-template-rows"].split(" ").length;
      // A 300-character message through a failing navigation (the stub supplies the text).
      const long = "m".repeat(300);
      await ctx.stub("fs_list_dir", `async (args, pass) => (args.path.toLowerCase().indexOf("nowhere") >= 0 ? { error: { code: "other", message: ${JSON.stringify(long)} } } : pass())`);
      await ctx.press.ctrlL();
      await ctx.cdp.type(ctx.fx.at("nowhere"));
      await ctx.cdp.key("Enter");
      await ctx.waitFor(`document.querySelector('.status-bar [role=status]').textContent.length > 0`, { timeout: 6000, label: "the long message" });
      const msg = await ctx.ev(`(() => { const e = document.querySelector('.status-bar [role=status]'); const cs = getComputedStyle(e); return { text: e.textContent, title: e.title, overflow: cs.textOverflow, sw: e.scrollWidth, cw: e.clientWidth }; })()`);
      t.eq(msg.text.length >= 300 || msg.text.includes("mmmm"), true, "the long text is shown", msg.text.slice(0, 40));
      t.eq(msg.overflow, "ellipsis", "message text-overflow");
      t.ok(msg.title.includes(long) || msg.title === msg.text, "title carries the whole message", msg.title.slice(0, 40));
      t.ok(msg.sw > msg.cw, "it is truncated by ellipsis (single line)", `${msg.sw} vs ${msg.cw}`);
      t.approx((await ctx.m.rect(".status-bar")).height, heightBefore, "status bar height unchanged");
      t.eq((await ctx.m.cs(".file-list", ["grid-template-rows"]))["grid-template-rows"].split(" ").length, rowsBefore, "list rows unchanged");
      const clipped = await ctx.ev(`[...document.querySelectorAll('.status-bar .status-item')].filter((e) => e.scrollWidth > e.clientWidth).length`);
      t.eq(clipped, 0, "permanent items are not truncated");
      await ctx.unstub("fs_list_dir");
      await ctx.focusList();
    },
  },
];

