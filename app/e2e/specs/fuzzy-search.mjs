// SPEC-0300-0024 (ファイル検索 / fuzzy search) -- the [CDP] acceptance criteria of §9: AC-2403, AC-2405, AC-2406, AC-2407, AC-2414,
// plus the hidden-file rule (R-2432 3: dot-named entries only while the list shows hidden files) and Ctrl+, while the box is shown
// (R-2423: the pre-empted keys; settings_file_open is passed to the backend only inside ctx.withSettingsFileOpen and refused there by the
// E2E scope, `[e2e] settings-file launch: refused`, as in settings-file.mjs). Nothing here changes a file: the search only reads, and
// choosing a result only navigates. Every folder used is inside the test folder (ctx.fx).
//
// DOM contract (features/fuzzy-search/FuzzySearchModal.svelte):
//   .fuzzy-backdrop > .fuzzy-palette[role=dialog] > .fuzzy-input-wrapper > input.fuzzy-input (+ .spinner while loading)
//                                                 > .fuzzy-list[role=listbox] > .fuzzy-row[role=option][aria-selected][data-index]
//                                                     > .entry-icon, .entry-name (> .match-highlight), .dir-prefix[title=relativePath]
//                                                 | .empty-notice
// The input is debounced (150 ms, R-2431): every check waits for the result instead of reading right after typing.

import fs from "node:fs";
import path from "node:path";
import { MOD, sleep } from "../lib/cdp.mjs";
import { barState, focusedName, openByKeys, runHighlighted, selectedNames, waitInactive } from "./_menu.mjs";

const W_EMPTY = "一致するファイルはありません";
const W_A7 = "config.toml を開けませんでした。テスト用の範囲の外です。";
const RUST_ICON = "\ue7a8"; // R-1780-1 (shared/file-icons.ts ICONS.rust)

const norm = (p) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();

// ------------------------------------------------------------------------------------------- helpers

/** Creates the fixture tree `files` (paths relative to the folder `name`, a trailing "/" = a folder) once, then shows `name` with the list focused. */
async function prep(ctx, name, files, { hidden = false } = {}) {
  if (!ctx.fx.exists(name)) {
    ctx.fx.mkdir(name);
    for (const rel of files) {
      const full = ctx.fx.at(name, ...rel.replace(/\/$/, "").split("/"));
      if (rel.endsWith("/")) fs.mkdirSync(full, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, "x");
      }
    }
  }
  const dir = ctx.fx.at(name);
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ size: false, time: false, hidden, tree: false });
  await ctx.focusList();
  await ctx.settle(150);
  return dir;
}

const isOpen = (ctx) => ctx.ev(`!!document.querySelector('.fuzzy-palette')`);
const inputFocused = (ctx) => ctx.ev(`document.activeElement === document.querySelector('.fuzzy-input')`);
const inputValue = (ctx) => ctx.ev(`document.querySelector('.fuzzy-input')?.value ?? null`);
const activeIsList = (ctx) => ctx.ev(`document.activeElement === document.querySelector('.app-shell [role=listbox]')`);
const statusMessage = (ctx) => ctx.ev(`document.querySelector('.status-message')?.textContent ?? ''`);

/** The rows of the result: name, relative path (dir-prefix title, or the name for a depth-0 entry), icon, highlighted text, prefix, selected. */
const rows = (ctx) =>
  ctx.ev(`[...document.querySelectorAll('.fuzzy-row')].map((r) => {
    const prefix = r.querySelector('.dir-prefix');
    const name = r.querySelector('.entry-name').textContent;
    return { name, rel: prefix ? prefix.title : name, prefix: prefix ? prefix.textContent.trim() : '',
      icon: r.querySelector('.entry-icon').textContent, hl: [...r.querySelectorAll('.match-highlight')].map((e) => e.textContent).join(''),
      selected: r.getAttribute('aria-selected') === 'true' };
  })`);
const selectedIndex = (ctx) => ctx.ev(`[...document.querySelectorAll('.fuzzy-row')].findIndex((r) => r.getAttribute('aria-selected') === 'true')`);

/**
 * Waits until the search has settled (no spinner, past the 150 ms debounce) and `pred(rows, notice)` holds; returns { rows, notice }.
 * `pred` defaults to "settled" only. The caller judges the returned value when the time ran out.
 */
async function settled(ctx, pred = () => true, timeout = 10000) {
  const end = Date.now() + timeout;
  await sleep(250); // longer than the debounce: a search for the latest input has been started
  for (;;) {
    const loading = await ctx.ev(`!!document.querySelector('.fuzzy-input-wrapper .spinner')`);
    const r = await rows(ctx);
    const notice = await ctx.ev(`document.querySelector('.fuzzy-list .empty-notice')?.textContent.trim() ?? null`);
    if ((!loading && pred(r, notice)) || Date.now() > end) return { rows: r, notice };
    await sleep(60);
  }
}

/** Ctrl+P from the list; waits for the box and its first (empty-input) result. */
async function openBox(ctx) {
  await ctx.focusList();
  await ctx.key("p", MOD.Ctrl, "KeyP");
  await ctx.waitFor(`!!document.querySelector('.fuzzy-palette')`, { label: "the fuzzy search box" });
  await ctx.waitFor(`document.activeElement === document.querySelector('.fuzzy-input')`, { label: "the focus in the fuzzy input" });
}

/** Replaces the input text (select all + insert) and waits for the settled result. */
async function query(ctx, text, pred) {
  await ctx.ev(`document.querySelector('.fuzzy-input').select(); true`);
  if (text === "") await ctx.key("Backspace");
  else await ctx.type(text);
  return settled(ctx, pred);
}

async function closeIfOpen(ctx) {
  if (await isOpen(ctx)) {
    await ctx.press.escape();
    await ctx.waitFor(`!document.querySelector('.fuzzy-palette')`, { label: "the box to close" });
  }
}

/** Moves the selection with ArrowDown until the row named `name` is selected (at most 20 presses). */
async function selectRow(ctx, name) {
  for (let i = 0; i < 20; i++) {
    const r = await rows(ctx);
    if (r.find((x) => x.selected)?.name === name) return;
    await ctx.press.down();
    await ctx.settle(30);
  }
  throw new Error(`could not select the result row ${name}`);
}

const depth = (rel) => rel.split("/").length - 1;

async function waitStatus(ctx, pred, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) {
    const text = await statusMessage(ctx);
    if (pred(text) || Date.now() > end) return text;
    await sleep(40);
  }
}

// ------------------------------------------------------------------------------------------- fixtures

const TREE = ["a.txt", "b.txt", "sub/", "sub/c.txt", "sub/deep/d.txt", "src/lib/main.rs", "src/other.ts"];
const THREE = ["one.txt", "two.txt", "three.txt"];
const SEL = ["top.txt", "sub/", "sub/a.txt", "sub/b.txt", "sub/c.txt"];
const HID = ["visible.txt", ".env", ".hidden/x.txt"];

// ------------------------------------------------------------------------------------------- tests

export const tests = [
  {
    id: "AC-2403",
    title: "Ctrl+P on the list: the box opens with the focus in its input; the result of the empty input lists shallow entries first",
    async run(t, ctx) {
      await prep(ctx, "fz-tree", TREE);
      await openBox(ctx);
      t.eq(await isOpen(ctx), true, "the box is shown");
      t.eq(await inputFocused(ctx), true, "the input has the focus");
      t.eq(await inputValue(ctx), "", "the input is empty");
      const { rows: r } = await settled(ctx, (x) => x.length >= 10);
      const rels = r.map((x) => x.rel);
      t.eq([...rels].sort(), ["a.txt", "b.txt", "src", "src/lib", "src/lib/main.rs", "src/other.ts", "sub", "sub/c.txt", "sub/deep", "sub/deep/d.txt"].sort(), "every entry below the folder is listed (files and folders)", JSON.stringify(rels));
      const depths = rels.map(depth);
      t.ok(depths.every((d, i) => i === 0 || depths[i - 1] <= d), "shallow entries come first (R-2432 7)", JSON.stringify(rels));
      await closeIfOpen(ctx);
    },
  },
  {
    id: "AC-2403-menu",
    title: "F10 -> 移動 -> ファイル検索…: the box opens, the menu bar is inactive, the input has the focus",
    async run(t, ctx) {
      await prep(ctx, "fz-tree", TREE);
      await openByKeys(ctx, 3);
      await runHighlighted(ctx, "ファイル検索…");
      await ctx.waitFor(`!!document.querySelector('.fuzzy-palette')`, { label: "the fuzzy search box" });
      await waitInactive(ctx);
      await ctx.waitFor(`document.activeElement === document.querySelector('.fuzzy-input')`, { label: "the focus in the fuzzy input" });
      t.eq((await barState(ctx)).hasDropdown, false, "the dropdown is closed");
      t.eq(await inputFocused(ctx), true, "the input has the focus");
      t.note("the right-click-menu half of AC-2403 is not reachable through the real UI (the menu bar does not open over a right-click menu, R-1365); closeMenus is covered by the unit tests");
      await closeIfOpen(ctx);
    },
  },
  {
    id: "AC-2405",
    title: "3 results: ArrowDown / Ctrl+N / ArrowUp / Ctrl+P move the selection with wrap-around (aria-selected); s and Delete go to the input; IME Enter / Escape do nothing; Escape closes and the list has the focus",
    async run(t, ctx) {
      const dir = await prep(ctx, "fz-three", THREE);
      await openBox(ctx);
      const first = await settled(ctx, (x) => x.length === 3);
      t.eq(first.rows.length, 3, "three results", JSON.stringify(first.rows.map((x) => x.rel)));
      t.eq(await selectedIndex(ctx), 0, "the first row is selected at the start");
      const seq = [];
      for (const [key, mods, code] of [["ArrowDown", 0, "ArrowDown"], ["n", MOD.Ctrl, "KeyN"], ["n", MOD.Ctrl, "KeyN"], ["ArrowUp", 0, "ArrowUp"], ["p", MOD.Ctrl, "KeyP"]]) {
        await ctx.key(key, mods, code);
        await ctx.settle(40);
        seq.push(await selectedIndex(ctx));
      }
      t.eq(seq, [1, 2, 0, 2, 1], "Down 1, Ctrl+N 2, Ctrl+N wraps to 0, Up wraps to 2, Ctrl+P 1");
      t.eq(await ctx.ev(`document.querySelectorAll('.fuzzy-row[aria-selected=true]').length`), 1, "exactly one row is aria-selected");
      t.eq(await isOpen(ctx), true, "Ctrl+P inside the box did not close or reopen it");
      // s and Delete: into the input, no sort menu, no delete dialog
      await ctx.key("s", 0, "KeyS");
      await ctx.key("Delete");
      await ctx.settle(200);
      t.eq(await inputValue(ctx), "s", "s went into the input (Delete at the end of the text deletes nothing)");
      t.eq(await ctx.ev(`!!document.querySelector('.sort-menu')`), false, "no sort menu");
      t.eq(await ctx.ev(`[...document.querySelectorAll('[role=dialog], .ui-dialog')].filter((d) => !d.classList.contains('fuzzy-palette')).length`), 0, "no delete dialog");
      t.eq(THREE.every((n) => fs.existsSync(path.join(dir, n))), true, "the files are still there");
      // IME: a composing Enter / Escape is the IME's (R-2421)
      await settled(ctx);
      for (const key of ["Enter", "Escape"]) {
        await ctx.ev(`document.querySelector('.fuzzy-input').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, isComposing: true, bubbles: true, cancelable: true })); true`);
      }
      await ctx.settle(150);
      t.eq([await isOpen(ctx), norm((await ctx.pathBarState()).value)], [true, norm(dir)], "a composing Enter / Escape neither chose a result nor closed the box (synthetic keydown with isComposing)");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.fuzzy-palette')`, { label: "the box to close" });
      await ctx.settle(100);
      t.eq(await activeIsList(ctx), true, "Escape closed the box and the file list has the focus");
      t.eq(norm((await ctx.pathBarState()).value), norm(dir), "the folder did not change");
    },
  },
  {
    id: "AC-2405-settings",
    title: "Ctrl+, while the box is shown: 「設定ファイルを開く」 runs (pre-empted key; refused by the E2E scope, W-A7)",
    async run(t, ctx) {
      await prep(ctx, "fz-three", THREE);
      await waitStatus(ctx, (s) => s === "", 20000);
      await openBox(ctx);
      await ctx.type("tw");
      await settled(ctx);
      const before = ctx.readLaunchLog().length;
      const text = await ctx.withSettingsFileOpen(async () => {
        await ctx.key(",", MOD.Ctrl, "Comma");
        const end = Date.now() + 8000;
        while (ctx.readLaunchLog().length < before + 1 && Date.now() < end) await sleep(60);
        return await waitStatus(ctx, (s) => s.includes("config.toml"));
      });
      const launched = ctx.readLaunchLog().slice(before);
      t.eq(launched, ["refused"], "the launch record has one `refused` line (the backend decided the opening; nothing was started)");
      t.eq(text, W_A7, "the status bar shows W-A7");
      t.note(`after Ctrl+, the box is ${(await isOpen(ctx)) ? "still shown" : "closed"} (input: ${JSON.stringify(await inputValue(ctx))})`);
      await closeIfOpen(ctx);
      t.note("Ctrl+Q (the other pre-empted key) would end the app: unit test main-keydown-wiring-settings.test.ts");
    },
  },
  {
    id: "AC-2406",
    title: "a click on the backdrop closes the box (the list gets the focus); a click on the input inside the frame does not",
    async run(t, ctx) {
      await prep(ctx, "fz-three", THREE);
      await openBox(ctx);
      await settled(ctx);
      await ctx.clickSel(".fuzzy-input");
      await ctx.settle(150);
      t.eq(await isOpen(ctx), true, "(ii) a click on the input does not close the box");
      const palette = await ctx.m.rect(".fuzzy-palette");
      await ctx.click(Math.max(5, palette.left - 40), palette.bottom + 60); // left of and below the frame: the backdrop
      await ctx.settle(200);
      t.eq(await isOpen(ctx), false, "(i) a click on the backdrop closes the box");
      t.eq(await activeIsList(ctx), true, "the file list has the focus after the close");
    },
  },
  {
    id: "AC-2407",
    title: "`main` finds src/lib/main.rs: Rust icon, `main` highlighted, `src/lib` on the right; a word without match shows 一致するファイルはありません",
    async run(t, ctx) {
      await prep(ctx, "fz-tree", TREE);
      await openBox(ctx);
      await settled(ctx);
      const { rows: r } = await query(ctx, "main", (x) => x.some((y) => y.name === "main.rs"));
      const row = r.find((x) => x.name === "main.rs");
      t.ok(row !== undefined, "a row for main.rs", JSON.stringify(r));
      if (row) {
        t.eq(row.icon, RUST_ICON, "the icon is the Rust symbol of R-1780-1 (U+E7A8)");
        t.eq(row.hl, "main", "the four letters `main` of the name are highlighted");
        t.eq(row.prefix, "src/lib", "src/lib is shown on the right");
        t.eq(row.rel, "src/lib/main.rs", "the title of the prefix is the relative path");
      }
      const none = await query(ctx, "zqxjv", (x, notice) => x.length === 0 && notice === W_EMPTY);
      t.eq([none.rows.length, none.notice], [0, W_EMPTY], "no row, the empty notice (W-C6)");
      await closeIfOpen(ctx);
    },
  },
  {
    id: "AC-2407-hidden",
    title: "dot-named entries (.env, .hidden and what is in it) are listed only while the list shows hidden files",
    async run(t, ctx) {
      await prep(ctx, "fz-hid", HID, { hidden: false });
      await openBox(ctx);
      const off = await settled(ctx, (x) => x.length >= 1);
      t.eq(off.rows.map((x) => x.rel).sort(), ["visible.txt"], "hidden files off: only visible.txt", JSON.stringify(off.rows.map((x) => x.rel)));
      await closeIfOpen(ctx);
      await ctx.ensureView({ hidden: true });
      t.eq((await ctx.viewState()).hidden, true, "the list shows hidden files now");
      await openBox(ctx);
      const on = await settled(ctx, (x) => x.length >= 4);
      t.eq(on.rows.map((x) => x.rel).sort(), [".env", ".hidden", ".hidden/x.txt", "visible.txt"], "hidden files on: .env, .hidden and .hidden/x.txt too", JSON.stringify(on.rows.map((x) => x.rel)));
      await closeIfOpen(ctx);
      await ctx.ensureView({ hidden: false });
    },
  },
  {
    id: "AC-2414",
    title: "choosing results (regression of the C:/… invalid_path refusal): the folder sub -> moved into it, recorded first in the history, list focused; the file sub/b.txt -> moved to sub, b.txt is the focus row, nothing selected",
    async run(t, ctx) {
      const dir = await prep(ctx, "fz-sel", SEL);
      const sub = path.join(dir, "sub");
      // (i) the folder, chosen with Enter
      await openBox(ctx);
      await settled(ctx);
      await query(ctx, "sub", (x) => x.some((y) => y.name === "sub"));
      await selectRow(ctx, "sub");
      await ctx.press.enter();
      await ctx.waitFor(`!document.querySelector('.fuzzy-palette')`, { label: "the box to close" });
      await ctx.waitFor(`(document.querySelector('.path-bar-row input')?.value ?? '').toLowerCase() === ${JSON.stringify(sub.toLowerCase())} && !document.querySelector('.list-notice')`, { label: "the move into sub", timeout: 10000 }).catch(() => {});
      await ctx.settle(150);
      t.eq(norm((await ctx.pathBarState()).value), norm(sub), "(i) the current folder is sub");
      t.eq(await activeIsList(ctx), true, "(i) the file list has the focus");
      t.eq(await ctx.ev(`!!document.querySelector('.ui-dialog, .error-dialog')`), false, "(i) no error is shown");
      const status1 = await statusMessage(ctx);
      t.ok(!/invalid|不正|移動できません/.test(status1), "(i) no failure notice in the status bar", JSON.stringify(status1));
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the visit history" });
      const hist = await ctx.ev(`[...document.querySelectorAll('.nav-history-row .path')].map((e) => e.title || e.textContent)`);
      t.eq(norm(hist[0] ?? ""), norm(sub), "(i) sub is the first entry of the visit history", JSON.stringify(hist));
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the history to close" });
      // (ii) the file, back at the start folder, chosen with Enter
      await ctx.nav(dir);
      await ctx.focusList();
      await openBox(ctx);
      await settled(ctx);
      await query(ctx, "b.txt", (x) => x.some((y) => y.rel === "sub/b.txt"));
      await selectRow(ctx, "b.txt");
      await ctx.press.enter();
      await ctx.waitFor(`!document.querySelector('.fuzzy-palette')`, { label: "the box to close" });
      await ctx.waitFor(`(document.querySelector('.path-bar-row input')?.value ?? '').toLowerCase() === ${JSON.stringify(sub.toLowerCase())} && !document.querySelector('.list-notice')`, { label: "the move to sub", timeout: 10000 }).catch(() => {});
      await ctx.settle(200);
      t.eq(norm((await ctx.pathBarState()).value), norm(sub), "(ii) the current folder is sub (the parent of b.txt)");
      t.eq(await focusedName(ctx), "b.txt", "(ii) b.txt is the focus row (not the first row a.txt)");
      t.eq(await selectedNames(ctx), [], "(ii) the selection is empty");
      t.eq(await activeIsList(ctx), true, "(ii) the file list has the focus");
      // (iii) the same file chosen with a click on its row
      await ctx.nav(dir);
      await ctx.focusList();
      await openBox(ctx);
      await settled(ctx);
      await query(ctx, "c.txt", (x) => x.some((y) => y.rel === "sub/c.txt"));
      await ctx.clickSel(`.fuzzy-row[data-index="${(await rows(ctx)).findIndex((y) => y.rel === "sub/c.txt")}"]`);
      await ctx.waitFor(`!document.querySelector('.fuzzy-palette')`, { label: "the box to close" });
      await ctx.waitFor(`(document.querySelector('.path-bar-row input')?.value ?? '').toLowerCase() === ${JSON.stringify(sub.toLowerCase())} && !document.querySelector('.list-notice')`, { label: "the move to sub", timeout: 10000 }).catch(() => {});
      await ctx.settle(200);
      t.eq([norm((await ctx.pathBarState()).value), await focusedName(ctx)], [norm(sub), "c.txt"], "(iii) a click on the row: moved to sub, c.txt is the focus row");
      t.note("the drive-root case (D:\\b.txt -> D:\\) is [単体] (fuzzy-wiring.test.ts): the E2E stays inside the test folder");
    },
  },
];
