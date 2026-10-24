// SPEC-0300-0020 (menu bar) [CDP] acceptance criteria, plus the criteria of the other specs that the menu bar answers:
// SPEC-0300-0010 AC-90 ~ AC-94, SPEC-0300-0019 AC-1214, SPEC-0300-0012 AC-101, SPEC-0300-0013 AC-214-2,
// SPEC-0300-0009 AC-01 / AC-631. Design: SPEC-0200-0001 §3.14.1 / §3.14.12.
//
// Keys are sent with CDP (Input.dispatchKeyEvent) to the page. The OS-level path (AC-1348) is specs/os-input.mjs.
// Safety (SPEC-0400-0001 R-08 / R-09 / R-10): file-changing commands are refused by the page stubs, so delete / zip /
// rename / new only get as far as their dialogs, which are cancelled. Copy writes the OS clipboard, so every test that
// runs a copy or a cut does it inside ctx.withClipboardGuard.
//
// Not driven here (kept visible as notes in the report):
//   * (Alt pressed and released alone is covered: AC-1341-alt and the Alt part of AC-1345 / AC-92.)
//   * IME composition (AC-92 (vi)): cannot be produced through Input.dispatchKeyEvent; it is a unit test (AC-1347).
//   * Ctrl+Q ends the app and `exit = "Q"` does not: specs/menubar-keymap.mjs (its own app start with that key map).

import { MOD, sleep } from "../lib/cdp.mjs";
import { inspectClipboard, readFileDropForTest } from "../lib/clipboard.mjs";
import { Skip } from "../lib/report.mjs";
import { DEFAULT_FONT_FAMILY, openViewerWindow } from "./_util.mjs";
import {
  barState, clickItem, clickWith, closeBar, closeDialog, dialogInfo, dropdown, focusedName, focusRowByName, HEADINGS, itemById, items, MENU_NAMES,
  MENU_TABLE, openByClick, openByKeys, outline, prepMenu, row, rowOrder, runByKeys, runHighlighted, selectedNames, selectRows, SHARED, statusFocus,
  MENU_STYLE_PROBE, statusText, waitActive, waitDialog, waitDropdown, waitInactive, waitNoDropdown,
} from "./_menu.mjs";

const dlgOpen = (ctx) => ctx.ev(`!!document.querySelector('[role=dialog]')`);
const wait = (ctx, expr, label) => ctx.waitFor(expr, { label });

/** Opens every menu with the mouse and returns its dropdown (the bar is closed again each time). */
async function collectMenus(ctx) {
  const all = [];
  for (let i = 0; i < 4; i++) {
    await openByClick(ctx, i);
    all.push(await dropdown(ctx));
    await closeBar(ctx);
  }
  return all;
}

export const tests = [
  {
    id: "AC-1300",
    title: "menu bar / path bar / body / status bar from the top: bar at top 2, left 2, right 998, 3px to the path bar; headings ファイル 編集 表示 移動, no ヘルプ (also AC-01 / AC-631)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.setViewport(1000, 700);
      const bar = await ctx.m.rect(".app-shell > .menubar");
      const path = await ctx.m.rect(".app-shell > .path-bar-row");
      const body = await ctx.m.rect(".app-shell > .body");
      const status = await ctx.m.rect(".app-shell > .status-bar");
      t.ok(bar && path && body && status, "menu bar, path bar, body and status bar exist");
      t.approx(bar.top, 2, "menu bar top");
      t.approx(bar.left, 2, "menu bar left");
      t.approx(bar.right, 998, "menu bar right");
      t.approx(path.top - bar.bottom, 3, "menu bar bottom -> path bar top");
      t.ok(bar.top < path.top && path.top < body.top && body.top < status.top, "order from the top: menu bar, path bar, body, status bar");
      t.eq(await ctx.m.texts(".menubar .heading"), HEADINGS, "heading texts, left to right (the access key in brackets)");
      t.ok(!(await ctx.ev(`document.querySelector('.menubar').textContent`)).includes("ヘルプ"), "there is no ヘルプ");
      // AC-01 / AC-631: the five blocks, nothing empty
      for (const sel of [".menubar", ".path-bar-row", ".tree-panel", ".file-list-frame", ".status-bar"]) t.eq(await ctx.m.count(sel), 1, `block ${sel}`);
      const menus = await collectMenus(ctx);
      t.ok(menus.every((m) => m !== null && items(m).length > 0), "every menu has items (no empty menu)");
    },
  },
  {
    id: "AC-1301",
    title: "each menu lists the items and separators of R-1310 in order; none of the R-1311 items exists (and AC-1214: wording W-60 ~ W-88, aria-label without brackets)",
    async run(t, ctx) {
      await prepMenu(ctx);
      const menus = await collectMenus(ctx);
      for (let i = 0; i < 4; i++) {
        const expected = MENU_TABLE[i].map((e) => (e === "---" ? "---" : e[0]));
        t.eq(outline(menus[i]), expected, `${MENU_NAMES[i]}: items and separators`);
        t.eq(menus[i].label, MENU_NAMES[i], `${MENU_NAMES[i]}: the dropdown's aria-label has no bracket`);
        t.eq(menus[i].role, "menu", `${MENU_NAMES[i]}: role=menu`);
      }
      const all = menus.flatMap((m) => items(m).map((e) => e.label));
      for (const banned of ["元に戻す", "やり直し", "複製", "プロパティ", "キー一覧", "マニュアル", "バージョン情報", "再読み込み", "テーマ", "完全に削除", "選択の切り替え"]) {
        t.ok(!all.some((l) => l.includes(banned)), `no item "${banned}" (R-1311)`);
      }
      // 第3版: 「設定ファイルを開く」「設定ファイルのチェック」(R-1310-2) are items; the R-1311 item 「設定」 (a settings screen) is still not (SPEC-0300-0010 第18版 R-14)
      for (const banned of ["設定", "設定画面", "設定…"]) t.ok(!all.includes(banned), `no item "${banned}" (R-1311, no settings screen)`);
      t.eq(await ctx.ev(`document.querySelector('.menubar').getAttribute('aria-label')`), "メニューバー", "menu bar aria-label (W-60)");
      t.eq(await ctx.ev(`[...document.querySelectorAll('.menubar .heading')].map((h) => h.getAttribute('aria-label'))`), MENU_NAMES, "heading aria-labels have no bracket");
    },
  },
  {
    id: "AC-1214",
    title: "wording: menu bar label, headings, item names (W-60 ~ W-88); F10 shows フォーカス: メニュー (W-89); every disabled reason is one of the shared sentences",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "d"); // folder: os_open and zip_extract are disabled with reasons
      const menus = await collectMenus(ctx);
      t.eq(menus.map((m) => items(m).map((e) => e.label)), MENU_TABLE.map((m) => m.filter((e) => e !== "---").map((e) => e[0])), "item names");
      const sentences = Object.values(SHARED);
      for (const m of menus) {
        for (const e of items(m)) if (e.reason !== null) t.ok(sentences.includes(e.reason), `reason of ${e.label} is a shared sentence`, e.reason);
      }
      await ctx.press.f10();
      await waitActive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: メニュー", "status bar focus item while the bar is active");
      await closeBar(ctx);
    },
  },
  {
    id: "AC-1303",
    title: "the viewer window has no menu bar (role=menubar absent)",
    async run(t, ctx) {
      ctx.fx.file("mb-view", "only.txt");
      await ctx.reload();
      await ctx.nav(ctx.fx.at("mb-view"));
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        await viewer.ev(`new Promise((r) => setTimeout(r, 800))`);
        t.eq(await viewer.ev(`document.querySelectorAll('[role=menubar], .menubar').length`), 0, "no menu bar in the viewer document");
      } finally {
        viewer.close();
      }
    },
  },

  // ------------------------------------------------------------------------------ enabled / disabled
  {
    id: "AC-1310",
    title: "file / edit menus: enabled / disabled and the reason follow R-1320 for (i) focus a.txt, (ii) focus d, (iii) a.txt + c.zip selected, (iv) c.zip selected, (v) empty folder",
    async run(t, ctx) {
      const all = { open: 0, os_open: 0, new_file: 0, new_folder: 0, rename: 0, delete: 0, zip_create: 0, zip_extract: 0, exit: 0, cut: 0, copy: 0, copy_path: 0, select_all: 0, clear_selection: 0, search: 0 };
      // expectation = every item enabled except the overrides ({ id: reason })
      const expectFor = (overrides) => Object.fromEntries(Object.keys(all).map((id) => [id, overrides[id] ?? null]));
      const states = [
        { name: "(i) no selection, focus a.txt", selected: 0, setup: (c) => focusRowByName(c, "a.txt"), disabled: { zip_extract: SHARED.notZip } },
        { name: "(ii) no selection, focus d", selected: 0, setup: (c) => focusRowByName(c, "d"), disabled: { os_open: SHARED.folderNotAllowed, zip_extract: SHARED.notZip } },
        { name: "(iii) a.txt + c.zip selected, focus c.zip", selected: 2, setup: (c) => selectRows(c, ["a.txt", "c.zip"]), disabled: { rename: SHARED.renameOne, zip_extract: SHARED.extractOne } },
        { name: "(iv) c.zip only", selected: 1, setup: (c) => selectRows(c, ["c.zip"]), disabled: {} },
        {
          name: "(v) empty folder",
          dir: "mb-empty",
          disabled: { open: SHARED.noSelection, os_open: SHARED.noSelection, rename: SHARED.noSelection, delete: SHARED.noSelection, zip_create: SHARED.noTarget, zip_extract: SHARED.noTarget, cut: SHARED.noSelection, copy: SHARED.noSelection, copy_path: SHARED.noSelection },
        },
      ];
      for (const s of states) {
        await prepMenu(ctx, s.dir ?? "mb", { empty: s.dir !== undefined });
        if (s.setup) await s.setup(ctx);
        const seen = {};
        for (const index of [0, 1]) {
          await openByClick(ctx, index);
          for (const e of items(await dropdown(ctx))) seen[e.id] = e.enabled ? null : e.reason;
          await closeBar(ctx);
        }
        for (const id of Object.keys(all)) {
          const want = expectFor(s.disabled)[id];
          t.eq(id in seen ? seen[id] : "(missing)", want, `${s.name}: ${id} ${want === null ? "enabled" : "disabled with the reason"}`);
        }
        if (s.dir === undefined) {
          const sel = await selectedNames(ctx);
          t.eq(sel.length, s.selected, `${s.name}: the setup left the expected selection`);
        }
      }
    },
  },
  {
    id: "AC-1311",
    title: "paste: disabled with 貼り付ける項目がありません when neither the app clipboard nor the OS clipboard holds files (the OS clipboard is only READ here)",
    async run(t, ctx) {
      await prepMenu(ctx);
      if (inspectClipboard().kind === "files") throw new Skip("the OS clipboard holds a file list now, so 'both empty' cannot be shown without touching it (the guarded AC-1311-files covers the filled case)");
      await openByClick(ctx, 1);
      const empty = itemById(await dropdown(ctx), "paste");
      t.eq([empty.enabled, empty.reason], [false, SHARED.noPaste], "no files on either clipboard: paste is disabled with its reason");
      await closeBar(ctx);
    },
  },
  {
    id: "AC-1311-files",
    title: "paste: enabled once the OS clipboard holds files (inside the clipboard guard; skipped when the user's clipboard cannot be restored)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await ctx.key("c", MOD.Ctrl, "KeyC");
        const deadline = Date.now() + 10000;
        while (readFileDropForTest() === null && Date.now() < deadline) await sleep(150);
        t.ok(readFileDropForTest() !== null, "Ctrl+C put a file list on the OS clipboard");
        await openByClick(ctx, 1);
        const filled = itemById(await dropdown(ctx), "paste");
        t.eq([filled.enabled, filled.reason], [true, null], "files on the clipboard: paste is enabled");
        await closeBar(ctx);
      });
    },
  },
  {
    id: "AC-1312",
    title: "search filter: the copy item counts the DISPLAYED targets only (a hidden selection does not count; a displayed one does)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await selectRows(ctx, ["b.txt"]);
      await ctx.press.search();
      await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("zzz");
      await wait(ctx, `document.querySelectorAll('.app-shell .file-list-row').length === 0`, "no row matches zzz");
      await ctx.press.f10();
      await waitActive(ctx);
      await ctx.press.right();
      await ctx.press.down();
      await waitDropdown(ctx);
      const hidden = itemById(await dropdown(ctx), "copy");
      t.eq([hidden.enabled, hidden.reason], [false, SHARED.noSelection], "b.txt is selected but hidden by the filter: copy is disabled");
      await closeBar(ctx);
      // widen the filter to b.txt: the selection is displayed again
      await ctx.ev(`(() => { const i = document.querySelector('.search-bar input'); i.focus(); i.select(); return true; })()`);
      await ctx.type("b");
      await wait(ctx, `[...document.querySelectorAll('.app-shell .file-list-row')].some((r) => r.getAttribute('aria-label') === 'b.txt')`, "b.txt matches b");
      await ctx.press.f10();
      await waitActive(ctx);
      await ctx.press.right();
      await ctx.press.down();
      await waitDropdown(ctx);
      const shown = itemById(await dropdown(ctx), "copy");
      t.eq([shown.enabled, shown.reason], [true, null], "b.txt is displayed and selected: copy is enabled");
      await closeBar(ctx);
      await ctx.press.escape(); // closes the search
    },
  },
  {
    id: "AC-1313",
    title: "view menu: ✓ and aria-checked follow tree / hidden / size / time; running ツリー and reopening shows the mark gone",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: true });
      await openByClick(ctx, 2);
      let dd = await dropdown(ctx);
      const mark = (id) => [itemById(dd, id).check, itemById(dd, id).ariaChecked, itemById(dd, id).role];
      t.eq(mark("toggle_tree"), ["✓", "true", "menuitemcheckbox"], "ツリー: ✓, aria-checked true");
      t.eq(mark("toggle_size"), ["✓", "true", "menuitemcheckbox"], "サイズの列: ✓");
      t.eq(mark("toggle_hidden"), ["", "false", "menuitemcheckbox"], "隠しファイル: no mark, false");
      t.eq(mark("toggle_time"), ["", "false", "menuitemcheckbox"], "更新日時の列: no mark, false");
      t.eq(itemById(dd, "sort_menu").ariaChecked, null, "並び替え… is not a checkbox item");
      await clickItem(ctx, "toggle_tree");
      await waitInactive(ctx);
      await ctx.settle(200);
      t.eq(await ctx.m.count(".tree-panel"), 0, "the tree panel is hidden after running ツリー");
      await openByClick(ctx, 2);
      dd = await dropdown(ctx);
      t.eq(mark("toggle_tree"), ["", "false", "menuitemcheckbox"], "reopened: the ツリー mark is gone");
      await closeBar(ctx);
      await ctx.ensureView({ tree: true });
    },
  },
  {
    id: "AC-1320",
    title: "shortcut text at the default key map (Esc for 選択の解除, Shift+Enter for OSの関連付けで開く, nothing for パスのコピー); AC-101 検索 shows /; AC-214-2 履歴 Ctrl+Y / ジャンプリスト Ctrl+J",
    async run(t, ctx) {
      await prepMenu(ctx);
      const menus = await collectMenus(ctx);
      for (let i = 0; i < 4; i++) {
        const expected = MENU_TABLE[i].filter((e) => e !== "---");
        t.eq(items(menus[i]).map((e) => [e.label, e.shortcut]), expected, `${MENU_NAMES[i]}: item names with their shortcut text`);
      }
      t.eq(itemById(menus[1], "clear_selection").shortcut, "Esc", "選択の解除 shows Esc");
      t.eq(itemById(menus[1], "copy_path").shortcut, "", "パスのコピー shows nothing");
      t.eq(itemById(menus[1], "search").shortcut, "/", "AC-101: 検索 shows /");
      t.eq([itemById(menus[3], "history").shortcut, itemById(menus[3], "history_jump_list").shortcut], ["Ctrl+Y", "Ctrl+J"], "AC-214-2: 履歴 / ジャンプリスト");
      t.eq(itemById(menus[0], "delete").ariaKeyshortcuts, "Delete", "aria-keyshortcuts of 削除");
      t.eq(itemById(menus[1], "copy").ariaKeyshortcuts, "Control+C", "aria-keyshortcuts uses Control");
    },
  },

  // ------------------------------------------------------------------------------ running items
  {
    id: "AC-1330",
    title: "ファイル -> 名前の変更 (click) closes the menu and opens the rename dialog as F2 does; closing the dialog returns the focus to the list",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "a.txt");
      await ctx.key("F2");
      await waitDialog(ctx, "the rename dialog (F2)");
      const viaKey = await dialogInfo(ctx);
      await closeDialog(ctx);
      await openByClick(ctx, 0);
      await clickItem(ctx, "rename");
      await waitDialog(ctx, "the rename dialog (menu)");
      const viaMenu = await dialogInfo(ctx);
      t.eq(await ctx.ev(`!document.querySelector('.menubar .dropdown')`), true, "the menu is closed");
      t.eq([viaMenu.title, viaMenu.inputs], [viaKey.title, viaKey.inputs], "same dialog, same name as with F2");
      t.ok(viaMenu.inputs.includes("a.txt"), "the dialog is for a.txt", JSON.stringify(viaMenu));
      await closeDialog(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "the focus is back on the list");
    },
  },
  {
    id: "AC-1331",
    title: "ファイル -> 削除 with Shift held still opens the trash confirmation (the same dialog as the Delete key, never a permanent delete)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await selectRows(ctx, ["a.txt"]);
      await ctx.press.del();
      await waitDialog(ctx, "the delete dialog (key)");
      const viaKey = await dialogInfo(ctx);
      await closeDialog(ctx);
      await openByClick(ctx, 0);
      await clickItem(ctx, "delete", MOD.Shift);
      await waitDialog(ctx, "the delete dialog (menu, Shift)");
      const viaMenu = await dialogInfo(ctx);
      t.eq(viaMenu.title, viaKey.title, "same title as the Delete key");
      t.ok(viaMenu.text.includes("a.txt"), "the dialog names a.txt", viaMenu.text.slice(0, 120));
      t.ok(!/完全|permanent/i.test(viaMenu.text), "not a permanent-delete dialog", viaMenu.text.slice(0, 160));
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1333",
    title: "a change of the folder while 編集 is open keeps the dropdown open (a file is added from outside while the menu is shown)",
    async run(t, ctx) {
      await prepMenu(ctx, "mb-watch");
      await selectRows(ctx, ["b.txt"]);
      await openByClick(ctx, 1);
      const before = await rowOrder(ctx);
      ctx.fx.file("mb-watch", "zz-new.txt"); // the folder changes while the menu is open
      await sleep(3000);
      const state = await barState(ctx);
      t.eq([state.open, state.hasDropdown], [1, true], "the 編集 dropdown is still open");
      const after = await rowOrder(ctx);
      t.note(after.length === before.length ? "ファイル監視による再読込は起きなかった(この環境では監視が働いていない)" : "フォルダーの変更が一覧に反映された");
      await closeBar(ctx);
    },
  },
  {
    id: "AC-1333-copy",
    title: "コピー run from the dropdown copies the targets as they are at that moment (inside the clipboard guard)",
    async run(t, ctx) {
      await prepMenu(ctx, "mb-watch");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["b.txt"]);
        await openByClick(ctx, 1);
        await clickItem(ctx, "copy");
        await waitInactive(ctx);
        await wait(ctx, `document.querySelector('.status-bar').textContent.includes('件をコピーしました')`, "the copy status message");
        t.ok((await statusText(ctx)).includes("1件をコピーしました"), "the status shows 1件をコピーしました");
        const os = readFileDropForTest();
        t.ok(os !== null && os.paths.length === 1 && os.paths[0].toLowerCase().endsWith("\\b.txt"), "b.txt is on the OS clipboard", JSON.stringify(os));
      });
    },
  },
  {
    id: "AC-1334",
    title: "移動 -> 履歴 / ジャンプリスト, 編集 -> 検索, 表示 -> 並び替え…, 移動 -> パス欄へ移動 reach their screens with the focus each spec gives (AC-214-2, AC-101)",
    async run(t, ctx) {
      await prepMenu(ctx);
      // history
      await openByClick(ctx, 3);
      await clickItem(ctx, "history");
      await wait(ctx, `!!document.querySelector('.nav-history-list')`, "the visit history");
      t.eq(await statusFocus(ctx), "フォーカス: 履歴", "history: the focus is in the history list");
      t.eq(await ctx.ev(`document.activeElement === document.querySelector('.nav-history-list')`), true, "history: the list itself has the keyboard focus");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.nav-history-list')`, "the history to close");
      // jump list (add the folder first so that the list has a row)
      await openByClick(ctx, 3);
      await clickItem(ctx, "jump_add");
      await waitInactive(ctx);
      await openByClick(ctx, 3);
      await clickItem(ctx, "history_jump_list");
      await wait(ctx, `!!document.querySelector('.nav-history-list')`, "the jump list");
      t.eq(await statusFocus(ctx), "フォーカス: ジャンプリスト", "jump list: the focus is in the jump list");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.nav-history-list')`, "the jump list to close");
      // search
      await openByClick(ctx, 1);
      await clickItem(ctx, "search");
      await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
      await ctx.settle(100);
      t.eq(await ctx.ev(`document.activeElement === document.querySelector('.search-bar input')`), true, "search: the input has the focus");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.search-bar')`, "the search bar to close");
      // sort menu
      await openByClick(ctx, 2);
      await clickItem(ctx, "sort_menu");
      await wait(ctx, `!!document.querySelector('.sort-menu')`, "the sort menu");
      t.eq(await statusFocus(ctx), "フォーカス: 並び替えメニュー", "sort menu: it has the focus");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.sort-menu')`, "the sort menu to close");
      // path bar
      await openByClick(ctx, 3);
      await clickItem(ctx, "focus_path");
      await ctx.settle(100);
      t.eq((await ctx.pathBarState()).focused, true, "path: the input is in the editing state");
      await ctx.press.escape();
      await ctx.settle(100);
    },
  },
  {
    id: "AC-1335",
    title: "MUST-1: with the tree focused, F10 -> ファイル -> 削除 / ZIPに圧縮 / 名前の変更 act on the FILE LIST targets; Delete / Ctrl+Alt+Z / F2 do nothing there (also AC-94)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await selectRows(ctx, ["a.txt", "b.txt"]);
      await ctx.press.tab(); // list -> tree
      await ctx.settle(150);
      t.eq(await statusFocus(ctx), "フォーカス: ツリー", "the tree has the focus");
      // the keys do nothing there (SPEC-0300-0010 R-15-1)
      await ctx.press.del();
      await ctx.key("z", MOD.Ctrl | MOD.Alt, "KeyZ");
      await ctx.key("F2");
      await ctx.settle(300);
      t.eq(await dlgOpen(ctx), false, "Delete / Ctrl+Alt+Z / F2 in the tree open no dialog");
      t.eq(await selectedNames(ctx), ["a.txt", "b.txt"], "the list selection is unchanged by the keys");
      // the menu works on the list's targets
      await runByKeys(ctx, 0, "削除");
      await waitDialog(ctx, "the delete dialog");
      let d = await dialogInfo(ctx);
      t.ok(d.text.includes("a.txt") && d.text.includes("b.txt"), "削除: the dialog is for a.txt and b.txt (not the tree node)", d.text.slice(0, 160));
      await closeDialog(ctx);
      await runByKeys(ctx, 0, "ZIPに圧縮");
      await waitDialog(ctx, "the zip create dialog");
      d = await dialogInfo(ctx);
      t.ok(d.text.includes("対象: 2件"), "ZIPに圧縮: the dialog is for the 2 list targets", JSON.stringify(d).slice(0, 200));
      await closeDialog(ctx);
      // rename needs exactly one target
      await selectRows(ctx, ["a.txt"]);
      await ctx.press.tab();
      await ctx.settle(150);
      await runByKeys(ctx, 0, "名前の変更");
      await waitDialog(ctx, "the rename dialog");
      d = await dialogInfo(ctx);
      t.ok(d.inputs.includes("a.txt"), "名前の変更: the dialog is for a.txt", JSON.stringify(d));
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1335-copy",
    title: "MUST-1: with the tree focused, Ctrl+C writes nothing and 編集 -> コピー copies the list selection (inside the clipboard guard)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt", "b.txt"]);
        await ctx.press.tab();
        await ctx.settle(150);
        t.eq(await statusFocus(ctx), "フォーカス: ツリー", "the tree has the focus");
        await ctx.key("c", MOD.Ctrl, "KeyC");
        await ctx.settle(400);
        t.eq(readFileDropForTest(), null, "Ctrl+C in the tree writes nothing to the clipboard");
        await runByKeys(ctx, 1, "コピー");
        await wait(ctx, `document.querySelector('.status-bar').textContent.includes('2件をコピーしました')`, "2件をコピーしました");
        const os = readFileDropForTest();
        t.eq(os?.paths.map((p) => p.split("\\").pop()), ["a.txt", "b.txt"], "コピー: a.txt and b.txt are on the OS clipboard");
      });
    },
  },
  {
    id: "AC-1336",
    title: "MUST-1: with the search input focused and a.txt selected, F10 -> ファイル -> ZIPに圧縮 opens for a.txt; the search bar and query stay; Ctrl+Alt+Z does not fire there",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.press.search();
      await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("a");
      await wait(ctx, `document.querySelectorAll('.app-shell .file-list-row').length >= 1 && [...document.querySelectorAll('.app-shell .file-list-row')].every((r) => /a/i.test(r.getAttribute('aria-label')))`, "the filter 'a'");
      const filtered = await rowOrder(ctx);
      await selectRows(ctx, ["a.txt"]);
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.key("z", MOD.Ctrl | MOD.Alt, "KeyZ");
      await ctx.settle(250);
      t.eq(await dlgOpen(ctx), false, "Ctrl+Alt+Z in the search input does not fire");
      await runByKeys(ctx, 0, "ZIPに圧縮");
      await waitDialog(ctx, "the zip create dialog");
      const zip = await dialogInfo(ctx);
      t.ok(zip.text.includes("対象: 1件") && zip.inputs.some((v) => v.toLowerCase().endsWith("a.txt.zip")), "ZIPに圧縮: the dialog is for the one target a.txt (a.txt.zip)", JSON.stringify(zip).slice(0, 200));
      await closeDialog(ctx);
      t.eq(await ctx.ev(`document.querySelector('.search-bar input')?.value ?? null`), "a", "the query is unchanged");
      t.eq(await rowOrder(ctx), filtered, "the filtered rows are unchanged");
      t.eq(await ctx.m.count(".search-bar"), 1, "the search bar is still shown");
      await ctx.press.escape();
    },
  },
  {
    id: "AC-1336-copy",
    title: "MUST-1: with the search input focused and a.txt selected, F10 -> 編集 -> コピー copies a.txt (inside the clipboard guard)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.withClipboardGuard(async () => {
        await ctx.press.search();
        await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
        await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
        await ctx.type("a");
        await wait(ctx, `document.querySelectorAll('.app-shell .file-list-row').length >= 1 && [...document.querySelectorAll('.app-shell .file-list-row')].every((r) => /a/i.test(r.getAttribute('aria-label')))`, "the filter 'a'");
        await selectRows(ctx, ["a.txt"]);
        await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
        await ctx.key("c", MOD.Ctrl, "KeyC");
        await ctx.settle(300);
        t.eq(readFileDropForTest(), null, "Ctrl+C in the search input does not copy the files");
        await runByKeys(ctx, 1, "コピー");
        await wait(ctx, `document.querySelector('.status-bar').textContent.includes('1件をコピーしました')`, "1件をコピーしました");
        const os = readFileDropForTest();
        t.eq(os?.paths.map((p) => p.split("\\").pop()), ["a.txt"], "コピー: a.txt is on the OS clipboard");
        t.eq(await ctx.ev(`document.querySelector('.search-bar input')?.value ?? null`), "a", "the query is unchanged");
        await ctx.press.escape();
      });
    },
  },

  // ------------------------------------------------------------------------------ keys
  {
    id: "AC-1340",
    title: "F10 lights ファイル (no dropdown, status フォーカス: メニュー); -> x2, <- x3 wraps; Down opens 移動 with the first enabled item lit; Esc returns to the list with the same focus row and selection",
    async run(t, ctx) {
      await prepMenu(ctx);
      await selectRows(ctx, ["b.txt"]);
      const before = [await focusedName(ctx), await selectedNames(ctx)];
      await ctx.press.f10();
      await waitActive(ctx);
      let s = await barState(ctx);
      t.eq([s.current, s.hasDropdown, s.activeIsHeading], [0, false, true], "ファイル is lit and has the focus, no dropdown");
      t.eq(s.focus, "フォーカス: メニュー", "status bar: フォーカス: メニュー");
      const seen = [];
      for (const key of ["right", "right", "left", "left", "left"]) {
        await ctx.press[key]();
        seen.push((await barState(ctx)).current);
      }
      t.eq(seen, [1, 2, 1, 0, 3], "the lit heading: 編集, 表示, 編集, ファイル, 移動 (wraps around)");
      await ctx.press.down();
      await waitDropdown(ctx);
      s = await barState(ctx);
      t.eq([s.open, s.highlight], [3, "親フォルダーへ"], "移動 opens with the first enabled item lit");
      await ctx.press.escape();
      await waitInactive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "Esc: the focus is on the list again");
      t.eq([await focusedName(ctx), await selectedNames(ctx)], before, "the focus row and the selection are as before");
    },
  },
  {
    id: "AC-1341",
    title: "Ctrl+Alt+Z (Alt down, other key, Alt up) does not activate the bar and opens the zip dialog (Alt alone: AC-1341-alt)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "a.txt");
      await ctx.altSequence([{ key: "z", modifiers: MOD.Ctrl, code: "KeyZ" }]);
      await waitDialog(ctx, "the zip create dialog");
      t.eq((await barState(ctx)).current, -1, "the menu bar did not become active");
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1341-alt",
    title: "Alt pressed and released alone activates the bar (list and tree) and a second Alt alone closes it and returns the focus; another key, a modifier key, Ctrl held first, or a mouse press in between does not activate",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "a.txt");
      const rowBefore = await focusedName(ctx);
      for (const [label, toTree, back] of [["list", false, "フォーカス: 一覧"], ["tree", true, "フォーカス: ツリー"]]) {
        await ctx.focusList();
        if (toTree) {
          await ctx.press.tab();
          await ctx.settle(150);
        }
        t.eq(await statusFocus(ctx), back, `${label}: the start focus`);
        await ctx.altSequence([]);
        await waitActive(ctx);
        let s = await barState(ctx);
        t.eq([s.current, s.hasDropdown, s.activeIsHeading, s.focus], [0, false, true, "フォーカス: メニュー"], `${label}: Alt alone lights ファイル, no dropdown, the heading has the focus, status フォーカス: メニュー`);
        await ctx.altSequence([]);
        await waitInactive(ctx);
        t.eq(await statusFocus(ctx), back, `${label}: a second Alt alone closes the bar and returns the focus`);
      }
      t.eq(await focusedName(ctx), rowBefore, "the focus row is unchanged");
      // with a dropdown open, Alt alone also closes
      await ctx.focusList();
      await openByKeys(ctx, 0);
      await ctx.altSequence([]);
      await waitInactive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "Alt alone with a dropdown open closes everything and returns the focus");
      // not an Alt-alone press
      const notActive = async (label) => {
        await ctx.settle(250);
        t.eq((await barState(ctx)).current, -1, `${label}: the bar did not become active`);
      };
      await ctx.altSequence([{ key: "a", code: "KeyA" }]);
      await notActive("another key between Alt down and up");
      const cdp = ctx.cdp;
      await cdp.keyDown("Alt", MOD.Alt, "AltLeft");
      await cdp.keyDown("Shift", MOD.Alt | MOD.Shift, "ShiftLeft");
      await cdp.keyUp("Shift", MOD.Alt, "ShiftLeft");
      await cdp.keyUp("Alt", 0, "AltLeft");
      await notActive("a modifier key between Alt down and up");
      await cdp.keyDown("Control", MOD.Ctrl, "ControlLeft");
      await cdp.keyDown("Alt", MOD.Ctrl | MOD.Alt, "AltLeft");
      await cdp.keyUp("Alt", MOD.Ctrl, "AltLeft");
      await cdp.keyUp("Control", 0, "ControlLeft");
      await notActive("Ctrl held first, then Alt alone");
      await cdp.keyDown("Alt", MOD.Alt, "AltLeft");
      const c = await ctx.m.center(row("b.txt"));
      await ctx.click(c.x, c.y, { modifiers: MOD.Alt });
      await cdp.keyUp("Alt", 0, "AltLeft");
      await notActive("a mouse press between Alt down and up");
    },
  },
  {
    id: "AC-1342",
    title: "dropdown keys: Down skips disabled items and separators and wraps; End / Home / Right / Left; Enter runs the lit item",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "d"); // OSの関連付けで開く and ZIPを展開 are disabled
      await openByKeys(ctx, 0);
      const lit = async () => (await barState(ctx)).highlight;
      const enabled = ["開く", "新規作成…", "新しいフォルダー…", "名前の変更", "削除", "ZIPに圧縮", "設定ファイルを開く", "設定ファイルのチェック", "終了"]; // 第3版: the two settings-file items are always enabled
      t.eq(await lit(), "開く", "first lit item");
      const walked = [];
      for (let i = 0; i < enabled.length; i++) {
        await ctx.press.down();
        walked.push(await lit());
      }
      t.eq(walked, [...enabled.slice(1), "開く"], "Down visits the enabled items only and wraps at the end");
      await ctx.press.end();
      t.eq(await lit(), "終了", "End: the last enabled item");
      await ctx.press.home();
      t.eq(await lit(), "開く", "Home: the first enabled item");
      await ctx.press.right();
      await ctx.waitFor(`!!document.querySelector('.menubar .item.highlighted')`, { label: "the first item of 編集 to be lit", timeout: 3000 }).catch(() => {});
      let s = await barState(ctx);
      t.eq([s.open, s.highlight], [1, "切り取り"], "Right: the 編集 dropdown with its first enabled item");
      await ctx.press.left();
      await ctx.waitFor(`!!document.querySelector('.menubar .item.highlighted')`, { label: "the first item of ファイル to be lit", timeout: 3000 }).catch(() => {});
      s = await barState(ctx);
      t.eq([s.open, s.highlight], [0, "開く"], "Left: back to ファイル");
      await ctx.press.down(); // 開く -> 新規作成… (OSの関連付けで開く is disabled)
      t.eq(await lit(), "新規作成…", "lit item before Enter");
      await ctx.press.enter();
      await waitDialog(ctx, "the new-entry dialog");
      await waitInactive(ctx);
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1343",
    title: "with a dropdown open Tab, a and Delete change nothing (menu stays, lit item stays, no dialog, selection kept) [Ctrl+C: AC-1343-copy; Ctrl+Q / exit = Q: menubar-keymap scenario]",
    async run(t, ctx) {
      await prepMenu(ctx);
      await selectRows(ctx, ["a.txt"]);
      await openByKeys(ctx, 0);
      const before = await barState(ctx);
      await ctx.press.tab();
      await ctx.key("a", 0, "KeyA");
      await ctx.press.del();
      await ctx.settle(300);
      const after = await barState(ctx);
      t.eq([after.open, after.highlight, after.hasDropdown], [before.open, before.highlight, true], "the dropdown is open and the lit item did not move");
      t.eq(await dlgOpen(ctx), false, "no delete confirmation");
      t.eq(await selectedNames(ctx), ["a.txt"], "the selection is unchanged");
      await closeBar(ctx);
    },
  },
  {
    id: "AC-1343-copy",
    title: "with a dropdown open Ctrl+C copies nothing (inside the clipboard guard)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await openByKeys(ctx, 0);
        await ctx.key("c", MOD.Ctrl, "KeyC");
        await ctx.settle(400);
        t.eq((await barState(ctx)).hasDropdown, true, "the dropdown is still open");
        t.eq(readFileDropForTest(), null, "Ctrl+C wrote nothing to the clipboard");
        await closeBar(ctx);
      });
    },
  },
  {
    id: "AC-1344",
    title: "search input focused with a filter: F10, Down, Esc closes the menu, the focus returns to the search input, the search bar / query / filter are unchanged",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.press.search();
      await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("a");
      await wait(ctx, `[...document.querySelectorAll('.app-shell .file-list-row')].every((r) => /a/i.test(r.getAttribute('aria-label')))`, "the filter");
      const rows = await rowOrder(ctx);
      await ctx.press.f10();
      await waitActive(ctx);
      await ctx.press.down();
      await waitDropdown(ctx);
      await ctx.press.escape();
      await waitInactive(ctx);
      t.eq(await ctx.ev(`document.activeElement === document.querySelector('.search-bar input')`), true, "the search input has the focus again");
      t.eq(await ctx.ev(`document.querySelector('.search-bar input')?.value ?? null`), "a", "the query is unchanged");
      t.eq(await rowOrder(ctx), rows, "the filtered rows are unchanged");
      t.eq(await ctx.m.count(".search-bar"), 1, "the search bar is still shown (the search was not cancelled)");
      await ctx.press.escape();
    },
  },
  {
    id: "AC-1345",
    title: "F10 does not activate the bar over a delete dialog, the history list, the sort menu, a right-click menu or while the path is edited; their own key handling stays (AC-92, R-1365)",
    async run(t, ctx) {
      await prepMenu(ctx);
      const activeElement = () => ctx.ev(`(() => { const a = document.activeElement; return a ? a.tagName + '.' + (a.className || '') + '#' + (a.id || '') : null; })()`);
      const inactive = async (label) => {
        const focusBefore = await activeElement();
        await ctx.press.f10();
        await ctx.settle(200);
        let s = await barState(ctx);
        t.eq([s.current, s.hasDropdown], [-1, false], `${label}: F10 does not activate the menu bar`);
        await ctx.altSequence([]); // Alt pressed and released alone
        await ctx.settle(200);
        s = await barState(ctx);
        t.eq([s.current, s.hasDropdown], [-1, false], `${label}: Alt alone does not activate the menu bar`);
        t.eq(await activeElement(), focusBefore, `${label}: the keyboard focus did not move (the default action is unchanged)`);
      };
      // (i) delete confirmation
      await selectRows(ctx, ["a.txt"]);
      await ctx.press.del();
      await waitDialog(ctx, "the delete dialog");
      await inactive("confirmation dialog");
      t.eq(await dlgOpen(ctx), true, "the dialog is still open");
      await closeDialog(ctx);
      // (ii) history list
      await ctx.focusList();
      await ctx.press.history();
      await wait(ctx, `!!document.querySelector('.nav-history-list')`, "the history list");
      await inactive("history list");
      t.eq(await ctx.m.count(".nav-history-list"), 1, "the history list is still open");
      const c = await ctx.m.center(".menubar .heading", 0);
      await ctx.click(c.x, c.y); // R-1365: a heading click over an overlay opens no dropdown
      await ctx.settle(200);
      t.eq((await barState(ctx)).hasDropdown, false, "a heading click over the history list opens no dropdown");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.nav-history-list')`, "the history list to close");
      // (iii) sort menu
      await ctx.focusList();
      await ctx.press.sortMenu();
      await wait(ctx, `!!document.querySelector('.sort-menu')`, "the sort menu");
      await inactive("sort menu");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.sort-menu')`, "the sort menu to close");
      // (iv) right-click menu
      await ctx.focusList();
      await ctx.rightClickSel(row("b.txt"));
      await wait(ctx, `!!document.querySelector('.ctx-menu')`, "the right-click menu");
      await inactive("right-click menu");
      t.eq(await ctx.m.count(".ctx-menu"), 1, "the right-click menu is still open");
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.ctx-menu')`, "the right-click menu to close");
      // (v) path bar editing
      await ctx.press.ctrlL();
      await ctx.settle(100);
      await inactive("path bar editing");
      t.eq((await ctx.pathBarState()).focused, true, "the path bar is still being edited");
      await ctx.press.escape();
      await ctx.settle(100);
    },
  },
  {
    id: "AC-1346",
    title: "Alt+E opens 編集 with the first enabled item lit; the heading reads 編集(E) with E underlined",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.focusList();
      await ctx.press.accessKey("E");
      await waitDropdown(ctx);
      const s = await barState(ctx);
      t.eq([s.open, s.highlight], [1, "切り取り"], "編集 is open with 切り取り lit");
      const head = await ctx.ev(`(() => { const h = document.querySelectorAll('.menubar .heading')[1]; const a = h.querySelector('.accel'); return { text: h.textContent, accel: a?.textContent, line: a ? getComputedStyle(a).textDecorationLine : null }; })()`);
      t.eq([head.text, head.accel, head.line], ["編集(E)", "E", "underline"], "heading text and underlined access key");
      await closeBar(ctx);
      for (const [letter, index] of [["F", 0], ["V", 2], ["G", 3]]) {
        await ctx.press.accessKey(letter);
        await waitDropdown(ctx);
        t.eq((await barState(ctx)).open, index, `Alt+${letter} opens ${MENU_NAMES[index]}`);
        await closeBar(ctx);
      }
    },
  },
  {
    id: "AC-1349",
    title: "F10 works with the focus on a search button or on document.body and Esc returns there (list for body); a click on a heading while the path is edited drops the edit and opens the menu",
    async run(t, ctx) {
      const dir = await prepMenu(ctx);
      await ctx.press.search();
      await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
      await ctx.ev(`document.querySelector('.search-bar .apply-button').focus(); true`);
      await ctx.press.f10();
      await waitActive(ctx);
      await ctx.press.escape();
      await waitInactive(ctx);
      t.eq(await ctx.ev(`document.activeElement === document.querySelector('.search-bar .apply-button')`), true, "(i) Esc returns to the 適用 button");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.press.escape();
      await wait(ctx, `!document.querySelector('.search-bar')`, "the search bar to close");
      // (ii) nothing focused
      await ctx.ev(`document.activeElement?.blur(); true`);
      t.eq(await ctx.ev(`document.activeElement === document.body`), true, "the focus is on document.body");
      await ctx.press.f10();
      await waitActive(ctx);
      await ctx.press.escape();
      await waitInactive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "(ii) Esc returns to the file list");
      t.eq(await ctx.ev(`document.activeElement === document.querySelector('.app-shell [role=listbox]')`), true, "the list element has the keyboard focus");
      // path bar editing -> heading click
      await ctx.press.ctrlL();
      await ctx.settle(100);
      await ctx.type("C:\\x");
      await openByClick(ctx, 0);
      const pb = await ctx.pathBarState();
      t.eq(pb.focused, false, "the path bar is no longer edited");
      const bare = (p) => p.replace(/[\\/]+$/, "").toLowerCase();
      t.eq(bare(pb.value), bare(dir), "the path bar shows the current path again (it did not navigate)");
      await ctx.press.escape();
      await waitInactive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "Esc returns to the file list");
    },
  },

  // ------------------------------------------------------------------------------ mouse
  {
    id: "AC-1350",
    title: "clicking ファイル opens it with no item lit; hovering 表示 switches to its dropdown; clicking 表示 again closes and returns the focus",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.focusList();
      await openByClick(ctx, 0);
      let s = await barState(ctx);
      t.eq([s.open, s.highlight], [0, null], "ファイル is open and no item is lit");
      const hover = await ctx.m.center(".menubar .heading", 2);
      await ctx.hover(hover.x, hover.y);
      await ctx.settle(150);
      s = await barState(ctx);
      t.eq(s.open, 2, "hovering 表示 switches to the 表示 dropdown");
      await ctx.click(hover.x, hover.y);
      await waitInactive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "the original focus (the list) is back");
      // a closed bar does not open by hovering
      const first = await ctx.m.center(".menubar .heading", 0);
      await ctx.hover(first.x, first.y);
      await ctx.settle(150);
      t.eq((await barState(ctx)).hasDropdown, false, "hovering while closed opens nothing (R-1361)");
    },
  },
  {
    id: "AC-1351",
    title: "a click on a list row only closes the menu (selection and focus row unchanged); a right-click on the list only closes it (no right-click menu)",
    async run(t, ctx) {
      await prepMenu(ctx);
      await selectRows(ctx, ["a.txt"]);
      const before = [await focusedName(ctx), await selectedNames(ctx)];
      await openByClick(ctx, 0);
      await clickWith(ctx, row("c.zip"));
      await waitInactive(ctx);
      t.eq([await focusedName(ctx), await selectedNames(ctx)], before, "the click was used to close the menu only");
      await openByClick(ctx, 0);
      await ctx.rightClickSel(row("c.zip"));
      await waitInactive(ctx);
      await ctx.settle(200);
      t.eq(await ctx.m.count(".ctx-menu"), 0, "no right-click menu opened");
      t.eq([await focusedName(ctx), await selectedNames(ctx)], before, "selection and focus row unchanged by the right click");
    },
  },
  {
    id: "AC-1352",
    title: "clicking a disabled item or a separator does nothing (menu stays open); hovering an item then Down lights the next enabled one",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "d");
      await openByClick(ctx, 0);
      await clickItem(ctx, "os_open"); // disabled: folderNotAllowed
      await ctx.settle(150);
      t.eq([(await barState(ctx)).open, await dlgOpen(ctx)], [0, false], "clicking the disabled OSの関連付けで開く does nothing");
      const sep = await ctx.m.center(".menubar .dropdown .sep", 0);
      await ctx.click(sep.x, sep.y);
      await ctx.settle(150);
      t.eq((await barState(ctx)).open, 0, "clicking a separator keeps the menu open");
      const target = await ctx.m.center("#menubar-item-new_file");
      await ctx.hover(target.x, target.y);
      await ctx.settle(150);
      t.eq((await barState(ctx)).highlight, "新規作成…", "hovering lights the item");
      await ctx.press.down();
      t.eq((await barState(ctx)).highlight, "新しいフォルダー…", "Down lights the next enabled item after the hovered one");
      await closeBar(ctx);
    },
  },
  {
    id: "AC-1353",
    title: "changing the window size while a dropdown is open closes it and returns the focus",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.focusList();
      await openByClick(ctx, 0);
      await ctx.setViewport(900, 650);
      await waitInactive(ctx);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "the focus is back on the list");
      await ctx.setViewport(1000, 700);
    },
  },

  // ------------------------------------------------------------------------------ look and accessibility
  {
    id: "AC-1360",
    title: "nord computed style (AC-1810): bar padding 3px 6px, no frame, status colours; heading 12px [font]; dropdown min-width 260, surface, active frame, item padding 6px 12px, 12px, shortcut / disabled / reason colours, lit background",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "d");
      await ctx.press.f10();
      await waitActive(ctx);
      await ctx.press.down();
      await waitDropdown(ctx);
      const s = await ctx.ev(MENU_STYLE_PROBE);
      t.eq(s.bar.padding, "3px 6px", "menu bar padding");
      t.eq(s.bar["border-top-width"], "0px", "menu bar has no frame (AC-1760 / R-1810)");
      t.eq(s.bar["background-color"], "rgb(59, 66, 82)", "menu bar background = status_bar_bg (R-1810)");
      t.eq(s.head["font-size"], "12px", "heading font-size");
      t.eq(s.head["font-family"], DEFAULT_FONT_FAMILY, "heading font-family is the [font] stack");
      t.eq(s.dropdown["min-width"], "260px", "dropdown min-width");
      t.eq(s.dropdown["background-color"], "rgb(46, 52, 64)", "dropdown background = surface");
      t.eq([s.ddBorder1px, s.dropdown["border-top-color"]], [true, "rgb(136, 192, 208)"], "dropdown border 1px solid --ui-border-active (R-1812)");
      t.eq(s.item.padding, "6px 12px", "item padding");
      t.eq(s.item["font-size"], "12px", "item font-size");
      t.eq(s.shortcut.color, "rgb(46, 52, 64)", "shortcut of the lit first item: cursor_fg");
      t.eq(s.disabledLabel, "rgb(141, 146, 154)", "disabled item name colour = --ui-muted-2");
      t.eq([s.disabledReason?.["font-size"], s.disabledReason?.color], ["12px", "rgb(179, 183, 190)"], "reason: 12px, --ui-muted");
      t.eq(s.highlighted?.["background-color"], "rgb(143, 188, 187)", "lit item background = --ui-hover (cursor_bg)");
      await closeBar(ctx);
    },
  },
  {
    id: "AC-1362",
    title: "640 x 480: menu bar, path bar, body and status bar are all inside the window and the document has no scroll bar",
    async run(t, ctx) {
      await prepMenu(ctx);
      await ctx.setViewport(640, 480);
      try {
        for (const sel of [".app-shell > .menubar", ".app-shell > .path-bar-row", ".app-shell > .body", ".app-shell > .status-bar"]) {
          const r = await ctx.m.rect(sel);
          t.ok(r !== null && r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= 640 && r.bottom <= 480, `${sel} is shown inside 640 x 480`, JSON.stringify(r));
        }
        const doc = await ctx.ev(`({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
        t.eq([doc.sh, doc.sw], [doc.ch, doc.cw], "the document has no scroll bar");
      } finally {
        await ctx.setViewport(1000, 700);
      }
    },
  },
  {
    id: "AC-1363",
    title: "ARIA: menubar / menuitem + aria-haspopup + aria-expanded / menu + aria-label / aria-disabled + aria-describedby; Tab never enters the headings while the bar is inactive",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "d");
      const bar = await ctx.ev(`(() => { const b = document.querySelector('.menubar'); return [b.getAttribute('role'), b.getAttribute('aria-label')]; })()`);
      t.eq(bar, ["menubar", "メニューバー"], "menu bar role and label");
      await openByClick(ctx, 0);
      const heads = await ctx.ev(`[...document.querySelectorAll('.menubar .heading')].map((h) => [h.getAttribute('role'), h.getAttribute('aria-haspopup'), h.getAttribute('aria-expanded'), h.getAttribute('tabindex')])`);
      t.eq(heads, [["menuitem", "menu", "true", "-1"], ["menuitem", "menu", "false", "-1"], ["menuitem", "menu", "false", "-1"], ["menuitem", "menu", "false", "-1"]], "headings: role, haspopup, expanded (only ファイル is true), not a tab stop");
      const dd = await dropdown(ctx);
      t.eq([dd.role, dd.label], ["menu", "ファイル"], "dropdown role and aria-label");
      const disabled = itemById(dd, "os_open");
      t.eq(disabled.ariaDisabled, "true", "the disabled item has aria-disabled=true");
      t.ok(disabled.describedby !== null && disabled.describedby === disabled.reasonId, "the reason element is tied to the item with aria-describedby", JSON.stringify([disabled.describedby, disabled.reasonId]));
      t.eq(disabled.reason, SHARED.folderNotAllowed, "the reason text");
      t.eq(itemById(dd, "open").ariaDisabled, null, "an enabled item has no aria-disabled");
      await closeBar(ctx);
      await ctx.focusList();
      for (let i = 0; i < 6; i++) {
        await ctx.press.tab();
        t.eq(await ctx.ev(`!!document.activeElement?.closest('.menubar')`), false, `Tab #${i + 1} does not land in the menu bar`);
      }
      await ctx.focusList();
    },
  },

  // ------------------------------------------------------------------------------ SPEC-0300-0010 AC-90 ~ AC-92
  {
    id: "AC-90",
    title: "F10 activates the bar from the list, the tree and the search input (no keymap action fires; nothing is typed); Ctrl+Alt+Z does not activate and fires zip_create",
    async run(t, ctx) {
      await prepMenu(ctx);
      await focusRowByName(ctx, "a.txt");
      for (const [label, focus, back] of [
        ["list", () => ctx.focusList(), "フォーカス: 一覧"],
        ["tree", async () => { await ctx.focusList(); await ctx.press.tab(); await ctx.settle(150); }, "フォーカス: ツリー"],
      ]) {
        await focus();
        await ctx.press.f10();
        await waitActive(ctx);
        const s = await barState(ctx);
        t.eq([s.current, s.focus], [0, "フォーカス: メニュー"], `${label}: F10 activates the bar`);
        await ctx.press.escape();
        await waitInactive(ctx);
        t.eq(await statusFocus(ctx), back, `${label}: Esc returns to ${label}`);
      }
      await ctx.focusList();
      await ctx.press.search();
      await wait(ctx, `!!document.querySelector('.search-bar input')`, "the search bar");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("a");
      await ctx.press.f10();
      await waitActive(ctx);
      t.eq(await ctx.ev(`document.querySelector('.search-bar input').value`), "a", "search input: F10 typed nothing");
      await ctx.press.escape();
      await waitInactive(ctx);
      await ctx.press.escape(); // close the search
      await wait(ctx, `!document.querySelector('.search-bar')`, "the search bar to close");
      await focusRowByName(ctx, "a.txt");
      await ctx.altSequence([{ key: "z", modifiers: MOD.Ctrl, code: "KeyZ" }]);
      await waitDialog(ctx, "the zip create dialog");
      t.eq((await barState(ctx)).current, -1, "Ctrl+Alt+Z did not activate the bar");
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-91",
    title: "while the bar is active (heading only, and dropdown open) Delete / F2 / S / / / Backspace / a / Tab fire nothing and the focus stays in the bar",
    async run(t, ctx) {
      const dir = await prepMenu(ctx);
      await selectRows(ctx, ["a.txt"]);
      const probe = async (label) => {
        for (const [key, code] of [["Delete", "Delete"], ["F2", "F2"], ["s", "KeyS"], ["/", "Slash"], ["Backspace", "Backspace"], ["a", "KeyA"], ["Tab", "Tab"]]) await ctx.key(key, 0, code);
        await ctx.settle(250);
        const s = await barState(ctx);
        t.eq([s.current >= 0, s.activeIsHeading, await dlgOpen(ctx)], [true, true, false], `${label}: still in the bar, no dialog`);
        t.eq([await ctx.m.count(".sort-menu"), await ctx.m.count(".search-bar"), (await ctx.pathBarState()).value.toLowerCase()], [0, 0, dir.toLowerCase()], `${label}: no sort menu, no search bar, the folder did not change`);
      };
      await ctx.press.f10();
      await waitActive(ctx);
      await probe("heading only");
      await ctx.press.down();
      await waitDropdown(ctx);
      await probe("dropdown open");
      await closeBar(ctx);
      t.eq(await selectedNames(ctx), ["a.txt"], "the selection is unchanged");
    },
  },
  {
    id: "AC-92",
    title: "F10 does not activate the bar over a confirmation, the history list, the sort menu, a right-click menu or path editing (the same checks as AC-1345)",
    async run(t, ctx) {
      await tests.find((x) => x.id === "AC-1345").run(t, ctx);
    },
  },
];

