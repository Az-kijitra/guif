// SPEC-0300-0019 (screen wording in Japanese) [CDP] acceptance criteria AC-1200 ... AC-1210, and the empty file
// list "項目なし" of SPEC-0300-0009 rev.16 (AC-646 ... AC-652). Design: SPEC-0200-0001 §3.13.9 / §3.13.15.
// AC-1213 is covered by re-running the updated existing specs (AC-935 / 958 / 959 / 1002 / 1020 ...).
//
// Safety (MUST-124 / R-08): nothing here changes a file outside the test folder. File-changing commands stay refused
// by the page stubs; the two archive stubs are only replaced by "wait, then refuse" versions and restored afterwards.
// The OS clipboard is not touched (the blank / row menus only open and close).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { MOD, sleep } from "../lib/cdp.mjs";
import { openFiles, openViewerWindow, RGB, setSort, waitViewerShows } from "./_util.mjs";

const statusItems = (ctx) => ctx.m.statusItems();
const selectedCount = async (ctx) => (await statusItems(ctx)).find((x) => x.startsWith("選択: "));
const statusMessage = (ctx) => ctx.ev(`document.querySelector('.status-bar [role=status]')?.textContent ?? ''`);
const emptyCount = (ctx) => ctx.m.count(".list-empty");

async function closeOverlay(ctx, selector) {
  await ctx.press.escape();
  await ctx.waitFor(`!document.querySelector(${JSON.stringify(selector)})`, { label: `${selector} to close` });
  await ctx.settle(100);
}

async function showFolder(ctx, name, fill) {
  if (!ctx.fx.exists(name)) {
    ctx.fx.mkdir(name);
    fill?.(ctx.fx.at(name));
  }
  const dir = ctx.fx.at(name);
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree: true });
  await ctx.settle(200);
  return dir;
}

const dialogInfo = (ctx) =>
  ctx.ev(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null;
    return { title: d.querySelector('h2')?.textContent ?? '', buttons: [...d.querySelectorAll('.buttons button')].map((b) => b.textContent.trim()) }; })()`);

async function expectDialog(t, ctx, title, buttons, label) {
  await ctx.waitFor(`!!document.querySelector('[role=dialog]')`, { label: `the ${label} dialog` });
  await ctx.settle(100);
  const d = await dialogInfo(ctx);
  t.eq(d?.title, title, `${label}: title`);
  if (buttons !== null) t.eq(d?.buttons, buttons, `${label}: buttons`);
  return d;
}

async function closeDialog(ctx) {
  await ctx.press.escape();
  await ctx.waitFor(`!document.querySelector('[role=dialog]')`, { label: "the dialog to close" });
  await ctx.settle(100);
}

const fillViewer = (d) => {
  fs.writeFileSync(`${d}\\a.txt`, "wording viewer one\n");
  fs.writeFileSync(`${d}\\b.txt`, "wording viewer two\n");
};

const rowSel = (name) => `.app-shell .file-list-row[aria-label=${JSON.stringify(name)}]`;

export const tests = [
  // ------------------------------------------------------------------ empty file list (SPEC-0300-0009 R-26)
  {
    id: "AC-646",
    title: "empty folder: exactly one 項目なし, no option, no loading / error notice, 選択: 0, no status message",
    async run(t, ctx) {
      await showFolder(ctx, "w-empty");
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 1`, { label: "項目なし" });
      t.eq(await emptyCount(ctx), 1, "one .list-empty");
      t.eq(await ctx.ev(`document.querySelector('.list-empty')?.textContent`), "項目なし", "text");
      t.eq(await ctx.rowCount(), 0, "no role=option");
      t.eq(await ctx.m.count(".list-notice"), 0, "no loading / error notice");
      t.eq(await selectedCount(ctx), "選択: 0", "選択: 0");
      t.eq(await statusMessage(ctx), "", "no status message");
    },
  },
  {
    id: "AC-647",
    title: "search with no match shows 項目なし (no special wording); emptying the query removes it and shows both rows",
    async run(t, ctx) {
      await showFolder(ctx, "w-two", (d) => {
        fs.writeFileSync(`${d}\\a.txt`, "x");
        fs.writeFileSync(`${d}\\b.txt`, "x");
      });
      t.eq(await emptyCount(ctx), 0, "none while rows exist");
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.type("zzz");
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 1`, { label: "項目なし after zzz" });
      t.eq(await ctx.ev(`document.querySelector('.list-empty').textContent`), "項目なし", "text");
      t.eq(await ctx.rowCount(), 0, "no rows");
      for (let i = 0; i < 3; i++) await ctx.key("Backspace");
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 0`, { label: "項目なし to disappear" });
      t.eq(await ctx.rowCount(), 2, "two rows again");
      await closeOverlay(ctx, ".search-bar");
    },
  },
  {
    id: "AC-648",
    title: "folder with only a hidden-attribute file: 項目なし; after toggle_hidden it disappears and the row shows",
    async run(t, ctx) {
      await showFolder(ctx, "w-hidden", (d) => {
        const f = `${d}\\.h`;
        fs.writeFileSync(f, "x");
        spawnSync("attrib", ["+H", f], { stdio: "ignore" });
      });
      await ctx.ensureView({ hidden: false });
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 1`, { label: "項目なし (hidden off)" });
      t.eq(await ctx.rowCount(), 0, "no rows while hidden files are off");
      await ctx.focusList();
      await ctx.press.toggleHidden();
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 0 && document.querySelectorAll('.app-shell [role=option]').length === 1`, { label: "the .h row" });
      t.ok((await ctx.ev(`document.querySelector('.file-list-row')?.getAttribute('aria-label') ?? ''`)).includes(".h"), "the row is .h");
      await ctx.ensureView({ hidden: false });
    },
  },
  {
    id: "AC-650",
    title: "項目なし is not an item: no role / aria-live, describedby, no selection by Space / Ctrl+A / rename, click goes through to the list, right click opens the blank menu",
    async run(t, ctx) {
      await showFolder(ctx, "w-empty");
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 1`, { label: "項目なし" });
      const attrs = await ctx.ev(`(() => { const e = document.querySelector('.list-empty'); const l = document.querySelector('.app-shell [role=listbox]');
        return { role: e.getAttribute('role'), id: e.id, live: !!e.closest('[role=status], [aria-live]') || e.hasAttribute('aria-live'),
                 active: l.getAttribute('aria-activedescendant'), described: l.getAttribute('aria-describedby') }; })()`);
      t.eq(attrs.role, null, "no role on 項目なし");
      t.eq(attrs.live, false, "no role=status / aria-live on it or its ancestors");
      t.eq(attrs.active, null, "no aria-activedescendant");
      t.eq(attrs.described, "file-list-empty", "aria-describedby");
      t.eq(attrs.id, "file-list-empty", "id");
      await ctx.focusList();
      await ctx.key(" ", 0, "Space");
      await ctx.key("a", MOD.Ctrl, "KeyA");
      await ctx.key("F2");
      await ctx.settle(300);
      t.eq(await selectedCount(ctx), "選択: 0", "still 選択: 0");
      t.eq(await ctx.m.count("[role=dialog]"), 0, "rename opens no dialog");
      // click (the keyboard focus is moved away first)
      const c = await ctx.m.center(".list-empty");
      await ctx.ev(`document.activeElement && document.activeElement.blur(); true`);
      t.eq(await ctx.ev(`document.elementFromPoint(${c.x}, ${c.y})?.id !== 'file-list-empty'`), true, "the click passes through 項目なし");
      await ctx.click(c.x, c.y);
      await ctx.settle(150);
      t.eq(await ctx.ev(`document.activeElement === document.querySelector('.app-shell [role=listbox]')`), true, "keyboard focus is on the list after the click");
      await ctx.rightClickAt(c.x, c.y);
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the blank menu" });
      const labels = await ctx.ev(`[...document.querySelectorAll('.ctx-menu > *')].map((e) => e.getAttribute('role') === 'separator' ? '---' : e.querySelector('.ctx-label').textContent)`);
      t.eq(labels, ["新規作成…", "---", "貼り付け"], "blank menu");
      await closeOverlay(ctx, ".ctx-menu");
    },
  },
  {
    id: "AC-651",
    title: "項目なし look (AC-1783): --ui-border colour, plain text (no background, no frame), 12px, pointer-events none, on the first row after the 2ch mark column; list body size unchanged",
    async run(t, ctx) {
      await showFolder(ctx, "w-empty");
      await ctx.setViewport(1000, 700);
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 1`, { label: "項目なし" });
      const s = await ctx.m.cs(".list-empty", ["color", "background-color", "border-top-width", "border-top-style", "border-top-color", "padding", "font-size", "pointer-events", "position"]);
      t.eq(s.color, RGB.border, "colour = --ui-border (border_inactive)");
      t.eq(s["background-color"], "rgba(0, 0, 0, 0)", "no background");
      t.eq([s["border-top-width"], s["border-top-style"], s["border-top-color"]], ["0px", "none", RGB.border], "no frame");
      t.eq(s.padding, "0px", "padding");
      t.eq(s["font-size"], "12px", "font-size");
      t.eq(s["pointer-events"], "none", "pointer-events");
      const e = await ctx.m.rect(".list-empty");
      const inner = await ctx.m.rect(".file-list-frame .pane-body");
      const ch = await ctx.ev(`(() => { const c = document.createElement("canvas").getContext("2d"); c.font = getComputedStyle(document.querySelector(".file-list")).font; return c.measureText("0").width; })()`);
      t.approx(e.left, inner.left + 2 * ch, "left = inner body left + 2ch (after the mark column)", 0.6);
      t.approx(e.top, inner.top, "top = the first row");
      const emptyBody = await ctx.m.dims(".file-list");
      await showFolder(ctx, "w-many", (d) => {
        for (let i = 1; i <= 5; i++) fs.writeFileSync(`${d}\\f${i}.txt`, "x");
      });
      await ctx.setViewport(1000, 700);
      const filledBody = await ctx.m.dims(".file-list");
      t.eq([emptyBody.clientWidth, emptyBody.clientHeight], [filledBody.clientWidth, filledBody.clientHeight], "list body size = that of a folder with entries");
    },
  },
  {
    id: "AC-652",
    title: "a file created next to an empty list appears after the reload and 項目なし disappears",
    async run(t, ctx) {
      const dir = await showFolder(ctx, "w-grow");
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 1`, { label: "項目なし" });
      fs.writeFileSync(`${dir}\\n.txt`, "x"); // inside the test folder only
      let seen = true;
      try {
        await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 0`, { timeout: 3000, label: "the file watcher reload" });
      } catch {
        seen = false;
      }
      if (!seen) {
        // no watcher reload: reload the folder by leaving it and coming back
        await ctx.nav(ctx.fx.mkdir("w-away"));
        await ctx.nav(dir);
      }
      await ctx.waitFor(`document.querySelectorAll('.list-empty').length === 0 && document.querySelectorAll('.app-shell [role=option]').length === 1`, { label: "n.txt" });
      t.ok((await ctx.ev(`document.querySelector('.file-list-row')?.getAttribute('aria-label') ?? ''`)).includes("n.txt"), "the row is n.txt");
      t.note(seen ? "reflected by the file watcher" : "reflected by re-listing the folder");
    },
  },

  // ------------------------------------------------------------------ AC-1200 ... AC-1210
  {
    id: "AC-1200",
    title: "<html lang> is ja in the main window and in the viewer window",
    async run(t, ctx) {
      t.eq(await ctx.ev(`document.documentElement.lang`), "ja", "main window lang");
      await showFolder(ctx, "w-viewer", fillViewer);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "wording viewer one" }))) return;
        t.eq(await viewer.ev(`document.documentElement.lang`), "ja", "viewer window lang");
      } finally {
        viewer.close();
      }
    },
  },
  {
    id: "AC-1201",
    title: "search bar: aria-labels 検索 / 正規表現, buttons .* 適用 クリア; 適用 confirms, クリア cancels",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      t.eq(await ctx.ev(`document.querySelector('.search-bar input').getAttribute('aria-label')`), "検索", "input aria-label");
      t.eq(await ctx.ev(`document.querySelector('.search-bar .regex-toggle').getAttribute('aria-label')`), "正規表現", "toggle aria-label");
      t.eq(await ctx.ev(`[...document.querySelectorAll('.search-bar button')].map((b) => b.textContent.trim())`), [".*", "適用", "クリア"], "button texts");
      await ctx.type("f00");
      await ctx.settle(200);
      await ctx.clickSel(".search-bar .apply-button");
      await ctx.settle(250);
      t.eq(await ctx.ev(`!!document.querySelector('.search-bar')`), true, "the bar stays open after 適用 with a query");
      t.eq((await statusItems(ctx))[0], "フォーカス: 一覧", "適用 hands the focus to the list");
      await ctx.clickSel(".search-bar .clear-button");
      await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "クリア to close the bar" });
    },
  },
  {
    id: "AC-1202",
    title: "sort menu: aria-label 並び替えメニュー, items 名前 / サイズ / 種類 / 更新日時, ↑ at 名前, status フォーカス: 並び替えメニュー",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false });
      await setSort(ctx, "name", "asc");
      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      await ctx.settle(100);
      t.eq(await ctx.ev(`document.querySelector('.sort-menu').getAttribute('aria-label')`), "並び替えメニュー", "aria-label");
      t.eq(await ctx.ev(`[...document.querySelectorAll('.sort-menu-item .label')].map((e) => e.textContent)`), ["名前", "サイズ", "種類", "更新日時"], "items");
      t.eq(await ctx.ev(`document.querySelector('.sort-menu-item .check').textContent.trim()`), "↑", "↑ at 名前");
      const items = await statusItems(ctx);
      t.eq(items[0], "フォーカス: 並び替えメニュー", "focus item");
      t.ok(items.includes("並び替え: 名前 ↑"), "sort status item", JSON.stringify(items));
      await closeOverlay(ctx, ".sort-menu");
    },
  },
  {
    id: "AC-1203",
    title: "path bar: label PATH, input aria-label パス",
    async run(t, ctx) {
      t.eq(await ctx.ev(`document.querySelector('.path-label')?.textContent`), "PATH", "label");
      t.eq(await ctx.ev(`document.querySelector('.path-bar-row input').getAttribute('aria-label')`), "パス", "input aria-label");
    },
  },
  {
    id: "AC-1204",
    title: "visit history / jump list: aria-labels 履歴 / ジャンプリスト, remove buttons, focus names, empty message 項目なし",
    async run(t, ctx) {
      const a = ctx.fx.mkdir("w-hist", "h1");
      const b = ctx.fx.mkdir("w-hist", "h2");
      await ctx.reload();
      await ctx.nav(a);
      await ctx.nav(b);
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: true });
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the visit history" });
      await ctx.settle(100);
      t.eq(await ctx.ev(`document.querySelector('.nav-history-list').getAttribute('aria-label')`), "履歴", "history aria-label");
      const removes = await ctx.ev(`[...document.querySelectorAll('.nav-history-row')].map((r) => [r.querySelector('.path').textContent, r.querySelector('.remove').getAttribute('aria-label'), r.querySelector('.remove').textContent.trim()])`);
      t.ok(removes.length >= 2, "at least two history rows", JSON.stringify(removes));
      for (const [p, label, text] of removes) {
        t.eq(label, `${p} を一覧から削除`, `remove aria-label of ${p}`);
        t.eq(text, "×", "visible × unchanged");
      }
      t.eq((await statusItems(ctx))[0], "フォーカス: 履歴", "focus item (history)");
      await closeOverlay(ctx, ".nav-history-list");
      await ctx.focusList();
      await ctx.key("J", MOD.Ctrl | MOD.Shift, "KeyJ"); // jump_add
      await ctx.settle(200);
      await ctx.press.jump();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the jump list" });
      await ctx.settle(100);
      t.eq(await ctx.ev(`document.querySelector('.nav-history-list').getAttribute('aria-label')`), "ジャンプリスト", "jump list aria-label");
      t.eq((await statusItems(ctx))[0], "フォーカス: ジャンプリスト", "focus item (jump list)");
      // empty both lists (the app's own throw-away navigation data), then `history` shows only the message
      const drain = async () => {
        for (let i = 0; i < 60 && (await ctx.m.count(".nav-history-row .remove")) > 0; i++) {
          await ctx.clickSel(".nav-history-row .remove");
          await ctx.settle(60);
        }
      };
      await drain();
      if (await ctx.m.count(".nav-history-list")) await closeOverlay(ctx, ".nav-history-list");
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the visit history again" });
      await drain();
      if (await ctx.m.count(".nav-history-list")) await closeOverlay(ctx, ".nav-history-list");
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`(document.querySelector('.status-bar [role=status]')?.textContent ?? '') === '項目なし'`, { timeout: 4000, label: "the empty message" });
      t.eq(await ctx.m.count(".nav-history-list"), 0, "no list opens when both are empty");
    },
  },
  {
    id: "AC-1205",
    title: "tree caret: aria-label 展開 before, 折りたたみ after pressing it",
    async run(t, ctx) {
      ctx.fx.mkdir("w-tree", "Sub");
      const dir = ctx.fx.at("w-tree");
      await ctx.reload();
      await ctx.nav(dir);
      await ctx.ensureView({ tree: true, size: true, time: false, hidden: false });
      await ctx.waitFor(`document.querySelectorAll('.tree-panel [role=treeitem]').length > 2`, { label: "the tree" });
      const idx = await ctx.ev(`[...document.querySelectorAll('.tree-panel [role=treeitem]')].findIndex((e) => e.getAttribute('aria-selected') === 'true')`);
      t.ok(idx >= 0, "the current folder node exists");
      const label = () => ctx.ev(`document.querySelectorAll('.tree-node .caret')[${idx}].getAttribute('aria-label')`);
      t.eq(await label(), "展開", "before");
      await ctx.clickSel(".tree-node .caret", idx);
      await ctx.waitFor(`document.querySelectorAll('.tree-node .caret')[${idx}].getAttribute('aria-label') === '折りたたみ'`, { label: "折りたたみ" });
      t.eq(await label(), "折りたたみ", "after");
    },
  },
  {
    id: "AC-1206",
    title: "list notices: 読み込み中… while loading; エラー: 対象が見つかりません。 for a known code; エラー: Some OS error for other",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      const target = ctx.fx.files("many10", 10);
      const key = JSON.stringify(target.toLowerCase().replace(/[\\/]+$/, ""));
      const only = `args.path.toLowerCase().replace(/\\\\+$/, "") === ${key}`;
      await ctx.stub("fs_list_dir", `async (args, pass) => { if (${only}) await new Promise((r) => setTimeout(r, 2500)); return pass(); }`);
      await ctx.press.ctrlL();
      await ctx.type(target);
      await ctx.key("Enter");
      await ctx.waitFor(`!!document.querySelector('.list-notice')`, { timeout: 5000, label: "the loading notice" });
      t.eq(await ctx.ev(`document.querySelector('.list-notice').textContent`), "読み込み中…", "loading text");
      await ctx.waitFor(`!document.querySelector('.list-notice')`, { timeout: 8000, label: "the loading notice to go" });
      for (const [code, message, expected] of [
        ["not_found", "E2E stub failure", "エラー: 対象が見つかりません。"],
        ["other", "Some OS error", "エラー: Some OS error"],
      ]) {
        await ctx.stub("fs_list_dir", `async (args, pass) => { if (${only}) return { error: { code: ${JSON.stringify(code)}, message: ${JSON.stringify(message)} } }; return pass(); }`);
        await ctx.focusList();
        await ctx.press.toggleHidden(); // re-lists the current folder
        await ctx.waitFor(`!!document.querySelector('.list-notice.error')`, { timeout: 5000, label: `the error notice (${code})` });
        t.eq(await ctx.ev(`document.querySelector('.list-notice.error').textContent`), expected, `error text (${code})`);
        t.eq(await emptyCount(ctx), 0, `no 項目なし next to the error (${code})`);
        await ctx.unstub("fs_list_dir");
        await ctx.focusList();
        await ctx.press.toggleHidden();
        await ctx.waitFor(`!document.querySelector('.list-notice')`, { timeout: 8000, label: "the error to clear" });
      }
      await ctx.ensureView({ hidden: false });
    },
  },
  {
    id: "AC-1207",
    title: "menus: row menu items (切り取り / 貼り付け / ZIPに圧縮 / ZIPを展開), blank menu (新規作成… / 貼り付け), folder reason フォルダーには使えません",
    async run(t, ctx) {
      await showFolder(ctx, "w-menu", (d) => {
        fs.writeFileSync(`${d}\\a.txt`, "x");
        fs.mkdirSync(`${d}\\d`);
      });
      const items = () =>
        ctx.ev(`[...document.querySelectorAll('.ctx-menu > *')].map((e) => e.getAttribute('role') === 'separator'
          ? { sep: true } : { label: e.querySelector('.ctx-label').textContent, reason: e.querySelector('.ctx-reason')?.textContent ?? null })`);
      await ctx.rightClickSel(rowSel("a.txt"));
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the row menu" });
      t.eq((await items()).map((i) => (i.sep ? "---" : i.label)),
        ["開く", "OSの関連付けで開く", "---", "コピー", "切り取り", "貼り付け", "パスのコピー", "---", "削除", "名前の変更", "---", "ZIPに圧縮", "ZIPを展開"], "row menu");
      await closeOverlay(ctx, ".ctx-menu");
      await ctx.rightClickSel(rowSel("d"));
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the folder menu" });
      const os = (await items()).find((i) => i.label === "OSの関連付けで開く");
      t.eq(os?.reason, "フォルダーには使えません", "reason for a folder");
      await closeOverlay(ctx, ".ctx-menu");
      const f = await ctx.m.rect(".file-list-frame");
      await ctx.rightClickAt(f.left + 40, f.bottom - 25);
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the blank menu" });
      t.eq((await items()).map((i) => (i.sep ? "---" : i.label)), ["新規作成…", "---", "貼り付け"], "blank menu");
      await closeOverlay(ctx, ".ctx-menu");
    },
  },
  {
    id: "AC-1208",
    title: "dialogs: 名前の変更 (変更 / キャンセル), ZIPに圧縮 (圧縮 / キャンセル) + progress ZIPに圧縮, ZIPを展開 (展開 / キャンセル) + progress ZIPを展開",
    async run(t, ctx) {
      await showFolder(ctx, "w-dlg", (d) => {
        fs.writeFileSync(`${d}\\a.txt`, "x");
        // a real zip made on the test side inside the test folder (extraction itself stays refused by the page stub)
        spawnSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -LiteralPath '${d}\\a.txt' -DestinationPath '${d}\\c.zip'`], { stdio: "ignore" });
      });
      const clickRow = async (name) => {
        const c = await ctx.m.center(rowSel(name));
        await ctx.click(c.x, c.y);
        await ctx.settle(100);
      };
      await clickRow("a.txt");
      await ctx.key("F2");
      await expectDialog(t, ctx, "名前の変更", ["変更", "キャンセル"], "rename");
      await closeDialog(ctx);

      const REFUSE = `() => ({ error: { code: "other", message: "E2E: blocked command" } })`;
      const SLOW_REFUSE = `async () => { await new Promise((r) => setTimeout(r, 2500)); return { error: { code: "other", message: "E2E: blocked command" } }; }`;
      try {
        await ctx.focusList();
        await clickRow("a.txt");
        await ctx.key("z", MOD.Ctrl | MOD.Alt, "KeyZ");
        await expectDialog(t, ctx, "ZIPに圧縮", ["圧縮", "キャンセル"], "zip create");
        await ctx.stub("archive_create", SLOW_REFUSE); // still refuses; it only waits first so the progress dialog can be seen
        await ctx.clickSel("[role=dialog] .buttons button", 0);
        await ctx.waitFor(`(document.querySelector('[role=dialog] h2')?.textContent ?? '') === 'ZIPに圧縮' && document.querySelectorAll('[role=dialog] .buttons button').length === 1`, { timeout: 5000, label: "the progress dialog" });
        t.eq(await ctx.ev(`document.querySelector('[role=dialog] h2').textContent`), "ZIPに圧縮", "zip create progress title");
        await ctx.waitFor(`(document.querySelector('[role=dialog] h2')?.textContent ?? '') !== 'ZIPに圧縮' || !document.querySelector('[role=dialog]')`, { timeout: 8000, label: "the progress dialog to end" });
        const after = await dialogInfo(ctx);
        t.note(`after the refused create: ${JSON.stringify(after)}`);
        if (after) await closeDialog(ctx);
        await ctx.stub("archive_create", REFUSE);

        await ctx.focusList();
        await clickRow("c.zip");
        await ctx.key("x", MOD.Ctrl | MOD.Alt, "KeyX");
        await expectDialog(t, ctx, "ZIPを展開", ["展開", "キャンセル"], "zip extract");
        await ctx.stub("archive_extract", SLOW_REFUSE);
        await ctx.clickSel("[role=dialog] .buttons button", 0);
        await ctx.waitFor(`(document.querySelector('[role=dialog] h2')?.textContent ?? '') === 'ZIPを展開' && document.querySelectorAll('[role=dialog] .buttons button').length === 1`, { timeout: 5000, label: "the extract progress dialog" });
        t.eq(await ctx.ev(`document.querySelector('[role=dialog] h2').textContent`), "ZIPを展開", "zip extract progress title");
        await ctx.waitFor(`(document.querySelector('[role=dialog] h2')?.textContent ?? '') !== 'ZIPを展開' || !document.querySelector('[role=dialog]')`, { timeout: 8000, label: "the progress dialog to end" });
        const after2 = await dialogInfo(ctx);
        t.note(`after the refused extract: ${JSON.stringify(after2)}`);
        if (after2) await closeDialog(ctx);
      } finally {
        await ctx.stub("archive_create", REFUSE);
        await ctx.stub("archive_extract", REFUSE);
        await ctx.verifyStubs();
      }
    },
  },
  {
    id: "AC-1210",
    title: "viewer: loading body 読み込み中…, close button aria-label 閉じる, header buttons unchanged (◀ Prev / Next ▶)",
    async run(t, ctx) {
      await showFolder(ctx, "w-viewer", fillViewer);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "wording viewer one" }))) return;
        t.eq(await viewer.ev(`document.querySelector('.viewer-header button[aria-label]')?.getAttribute('aria-label')`), "閉じる", "close aria-label");
        t.eq(await viewer.ev(`[...document.querySelectorAll('.viewer-header button')].filter((b) => !b.hasAttribute('aria-label')).map((b) => b.textContent.trim())`), ["◀ Prev", "Next ▶"], "other header buttons");
        t.eq(await viewer.ev(`[...document.querySelectorAll('.viewer-header button')].at(-1).textContent.trim()`), "✕", "visible ✕");
        // (i) / (ii): reload the viewer page with a ONE-TIME delay on the read-only viewer_read_text command
        // (everything else is passed on unchanged). After the reload the page has no file yet (i); opening the
        // file again from the main window then shows the loading body while the read is slow (ii).
        const added = await viewer.send("Page.addScriptToEvaluateOnNewDocument", {
          source: `(() => { const orig = window.fetch; let delayed = false; window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : (input?.url ?? String(input));
            if (!delayed && url.includes('viewer_read_text')) { delayed = true; await new Promise((r) => setTimeout(r, 3000)); }
            return orig.call(window, input, init); }; })()`,
        });
        try {
          await viewer.send("Page.reload", { ignoreCache: true });
          const poll = async (wanted, ms) => {
            const deadline = Date.now() + ms;
            let last = null;
            while (Date.now() < deadline) {
              last = await viewer.ev(`document.querySelector('.viewer-body .placeholder')?.textContent ?? null`).catch(() => null);
              if (last === wanted) return last;
              await sleep(100);
            }
            return last;
          };
          t.eq(await poll("ファイルが選択されていません", 15000), "ファイルが選択されていません", "(i) body before a file is handed over");
          await ctx.focusList();
          await ctx.press.enter();
          // R-512 / R-514: once a file was handed over (loader onTaken) the body says 読み込み中… until the content
          // arrives. This used to be unreachable (fileName only arrives with the content); found by this test.
          t.eq(await poll("読み込み中…", 3000), "読み込み中…", "(ii) loading body while the read is slow");
          await waitViewerShows(t, viewer, "a.txt", "text", { contains: "wording viewer one", timeout: 15000 });
        } finally {
          await viewer.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: added.identifier }).catch(() => {});
        }
      } finally {
        viewer.close();
      }
    },
  },
];

