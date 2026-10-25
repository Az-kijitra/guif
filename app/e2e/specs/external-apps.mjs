// SPEC-0300-0021 (external app launch) [CDP] acceptance criteria, SPEC-0300-0009 AC-653 ([CDP] part: junctions), SPEC-0400-0001 第6版
// R-08 / R-08-1 / R-10 / R-10-5. Design: SPEC-0200-0001 §3.16.10 / §3.16.11 (§3.16.15 wins where they differ).
//
// Three scenarios = three app starts (config.toml is read once at startup), each with its own throw-away config folder and the E2E file
// scope (launchApp always passes GUIF_CONFIG_DIR + GUIF_E2E_FS_SCOPE and refuses a config.toml without `external_apps`):
//   E0  `external_apps = []`              AC-1501 (no entrance, no launch) + AC-653 (junctions are folders / a broken one is a file)
//   E1  only probe registrations          keys, menu bar 「ファイル」, row / blank context menu, targets, args, status messages W-94..W-99,
//                                         auto-repeat, search box focus, overlays, focus return, enabled state, Ctrl+Alt+E vs Alt+E
//   E2  clashing / invalid registrations  start-up notice W-9A / W-9C (order, one message), the keys that stay usable
//
// SAFETY. Nothing but copies of the test executable (src-tauri/examples/rf_launch_probe.rs, lib/probe.mjs) is ever registered or launched:
// no wt.exe / Code.exe / explorer.exe / GitHubDesktop.exe. The page-side stub blocks `external_app_launch` (BLOCKED_COMMANDS); it is let
// through ONLY inside ctx.withExternalAppLaunch and then only for targets inside the test folder; the backend refuses a program or a
// target outside the E2E scope (R-1584). The copy OUTSIDE the scope (AC-1525) is a copy of the probe too, never a user program.
// Not automatable here: AC-1525 second half (a program inside the scope with a target outside: the page stub refuses before the backend can
// answer W-99; Rust unit tests), AC-1504 type error / syntax error (a type error would make the user's default four active: forbidden),
// AC-1550 / AC-1551 (real apps, manual).

import fs from "node:fs";
import path from "node:path";
import { MOD, sleep } from "../lib/cdp.mjs";
import { buildProbe, clearRecords, disposeOutsideProbes, externalAppsToml, placeOutsideProbe, placeProbe, awaitSleepers, readRecords, waitDone, waitRecords } from "../lib/probe.mjs";
import {
  MENU_TABLE, barState, clickWith, closeBar, dropdown, focusRowByName, focusedName, openByKeys, outline, row, runHighlighted, selectRows, selectedNames,
  statusFocus, waitDropdown,
} from "./_menu.mjs";
import { closeViewerWindow } from "./_viewer.mjs";
import { openViewerWindow } from "./_util.mjs";

// ------------------------------------------------------------------------------------------------ registrations (E1)

const CA = MOD.Ctrl | MOD.Alt;
/** [key, modifiers, code] of the registration keys (the same keys as the default four, plus three more). */
const KEYS = {
  terminal: ["c", CA, "KeyC"],
  code: ["v", CA, "KeyV"],
  explorer: ["e", CA, "KeyE"],
  github: ["G", CA | MOD.Shift, "KeyG"],
  slow: ["s", CA, "KeyS"],
  missing: ["m", CA, "KeyM"],
  args: ["a", CA, "KeyA"],
};
const hit = (ctx, name) => ctx.key(...KEYS[name]);

const NAME = {
  terminal: "ターミナルで開く",
  code: "VS Codeで開く",
  explorer: "エクスプローラーで開く",
  github: "GitHub Desktopで開く",
  slow: "遅いテスト",
  missing: "存在しないテスト",
  args: "引数テスト",
};
const APP_ORDER = ["terminal", "code", "explorer", "github", "slow", "missing", "args"];
const SHORTCUT = { terminal: "Ctrl+Alt+C", code: "Ctrl+Alt+V", explorer: "Ctrl+Alt+E", github: "Ctrl+Alt+Shift+G", slow: "Ctrl+Alt+S", missing: "Ctrl+Alt+M", args: "Ctrl+Alt+A" };

/** The probe copies of E1: five inside the test folder (own sub folder), one OUTSIDE it, one missing file inside. */
function probes(fx) {
  return {
    terminal: placeProbe(fx, "terminal"),
    code: placeProbe(fx, "code"),
    explorer: placeProbe(fx, "explorer"),
    slow: placeProbe(fx, "slow"),
    args: placeProbe(fx, "argsapp"),
    github: placeOutsideProbe("outside"),
    missing: path.join(fx.at("probe-bin"), "missing.exe"), // never created
  };
}

function registrations(fx) {
  const p = probes(fx);
  return [
    { name: NAME.terminal, program: p.terminal, args: ["-d", "{dir}"], key: "Ctrl+Alt+C" },
    { name: NAME.code, program: p.code, args: ["{path}"], key: "Ctrl+Alt+V" },
    { name: NAME.explorer, program: p.explorer, args: ["{dir}"], argsForFile: ["/select,", "{path}"], key: "Ctrl+Alt+E" },
    { name: NAME.github, program: p.github, args: ["{dir}"], key: "Ctrl+Alt+Shift+G" },
    { name: NAME.slow, program: p.slow, args: ["--rf-sleep=3000", "{path}"], key: "Ctrl+Alt+S" },
    { name: NAME.missing, program: p.missing, args: ["{path}"], key: "Ctrl+Alt+M" },
    { name: NAME.args, program: p.args, args: ["{path}", "{dir}", "x;y&z%1", "a{{b}}", "{path}{dir}"], key: "Ctrl+Alt+A" },
  ];
}

// ------------------------------------------------------------------------------------------------ helpers

const lc = (value) => (Array.isArray(value) ? value.map(lc) : typeof value === "string" ? value.toLowerCase() : value);
const statusMsg = (ctx) => ctx.ev(`document.querySelector('.status-message')?.textContent ?? ''`);
async function waitStatus(ctx, expected, timeout = 8000) {
  try {
    await ctx.waitFor(`document.querySelector('.status-message')?.textContent === ${JSON.stringify(expected)}`, { timeout, label: `status ${expected}` });
    return true;
  } catch {
    return false;
  }
}
const launchCalls = (ctx) => ctx.ev(`(window.__e2e.calls ?? []).filter((c) => c === "external_app_launch").length`);
const W94 = (name) => `「${name}」を起動しました`;

const allProbes = (fx) => Object.values(probes(fx));
const totalRecords = (fx) => allProbes(fx).reduce((n, exe) => n + readRecords(exe).calls.length, 0);
const resetRecords = (fx) => allProbes(fx).forEach((exe) => clearRecords(exe));

/** After `ms` nothing was launched: no external_app_launch call reached the page's IPC, no probe recorded, no launch status message. */
async function expectNoLaunch(t, ctx, label, ms = 1300) {
  const before = await launchCalls(ctx);
  await sleep(ms);
  t.eq(await launchCalls(ctx), before, `${label}: no external_app_launch call was made`);
  t.eq(totalRecords(ctx.fx), 0, `${label}: no probe recorded anything`);
  const message = await statusMsg(ctx);
  t.ok(!/を起動(しました|できませんでした)/.test(message), `${label}: no launch / failure status message`, JSON.stringify(message));
}

/** Waits for exactly one new record of `exe` and returns it (a failed check is recorded when it does not come). */
async function oneRecord(t, exe, label, timeout = 8000) {
  const calls = await waitRecords(exe, 1, timeout);
  t.eq(calls.length, 1, `${label}: the probe recorded exactly one launch`);
  return calls[0];
}

const FILES_DIR = "ea";
async function prep(ctx, folder = FILES_DIR, { tree = true } = {}) {
  if (folder === FILES_DIR && !ctx.fx.exists(FILES_DIR)) {
    ctx.fx.file(FILES_DIR, "a.txt");
    ctx.fx.file(FILES_DIR, "b.txt");
    ctx.fx.file(FILES_DIR, "c.txt");
    ctx.fx.file(path.join(FILES_DIR, "d"), "inner.txt");
  }
  if (!ctx.fx.exists(folder)) ctx.fx.mkdir(folder);
  const dir = ctx.fx.at(folder);
  // a viewer window closed by an earlier test can leave the OS focus elsewhere: the keys below need the main page in front
  await ctx.cdp.send("Page.bringToFront").catch(() => {});
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree });
  await ctx.focusList();
  await ctx.settle(150);
  return dir;
}

const menuLabelCenter = (ctx, selector, labelSelector, label) =>
  ctx.ev(`(() => { const it = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.querySelector(${JSON.stringify(labelSelector)})?.textContent === ${JSON.stringify(label)});
    if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: it.getAttribute('aria-disabled') === 'true' }; })()`);

async function clickCtxItem(ctx, label) {
  const c = await menuLabelCenter(ctx, ".ctx-menu .ctx-item", ".ctx-label", label);
  if (c === null) throw new Error(`context menu item not found: ${label}`);
  await ctx.click(c.x, c.y);
}

const ctxEntries = (ctx) =>
  ctx.ev(`[...document.querySelectorAll('.ctx-menu > *')].map((e) => e.getAttribute('role') === 'separator' ? '---' : e.querySelector('.ctx-label').textContent)`);
const ctxDisabled = (ctx) =>
  ctx.ev(`[...document.querySelectorAll('.ctx-menu .ctx-item')].filter((e) => e.getAttribute('aria-disabled') === 'true').map((e) => e.querySelector('.ctx-label').textContent)`);
const ctxHasShortcut = (ctx) => ctx.ev(`!!document.querySelector('.ctx-menu .ctx-shortcut, .ctx-menu [class*=shortcut]')`);

async function openRowMenu(ctx, name) {
  await ctx.rightClickSel(row(name));
  await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the context menu" });
  await ctx.settle(100);
}
async function openBlankMenu(ctx) {
  const r = await ctx.m.rect(".file-list-frame");
  await ctx.rightClickAt(r.left + 40, r.bottom - 25);
  await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the context menu (blank)" });
  await ctx.settle(100);
}
async function closeCtxMenu(ctx) {
  await ctx.press.escape();
  await ctx.waitFor(`!document.querySelector('.ctx-menu')`, { label: "the context menu to close" });
}

/** Runs a menu bar item by its label with the mouse (the dropdown is open). */
async function clickBarItem(ctx, label) {
  const c = await menuLabelCenter(ctx, ".menubar .dropdown .item", ".label", label);
  if (c === null) throw new Error(`menu bar item not found: ${label}`);
  await ctx.click(c.x, c.y);
}

const rowIcons = (ctx) => ctx.ev(`Object.fromEntries([...document.querySelectorAll('.app-shell .file-list-row')].map((e) => [e.getAttribute('aria-label'), e.classList.contains('dir')]))`);

/** The E1 body runs with external_app_launch passed through (inside the test folder only). */
const e1 = (fn) => (t, ctx) => ctx.withExternalAppLaunch(() => fn(t, ctx));

// ------------------------------------------------------------------------------------------------ E0: external_apps = []

const e0Tests = [
  {
    id: "AC-1501",
    title: "external_apps = []: no registration, no entrance (File menu, row / blank context menu), the key starts and says nothing",
    async run(t, ctx) {
      const dto = await ctx.externalAppsDto();
      t.eq([dto.apps, dto.invalid, dto.typeError], [[], [], false], "the start-up DTO: zero registrations, nothing invalid");
      await prep(ctx);
      await focusRowByName(ctx, "a.txt");
      await openByKeys(ctx, 0);
      const file = await dropdown(ctx);
      t.eq(outline(file), MENU_TABLE[0].map((e) => (e === "---" ? "---" : e[0])), "「ファイル」: exactly the fixed items (no registration item, no extra separator)");
      await closeBar(ctx);
      await openRowMenu(ctx, "a.txt");
      const rowMenu = await ctxEntries(ctx);
      const os = rowMenu.indexOf("OSの関連付けで開く");
      t.ok(os >= 0, "the row menu has 「OSの関連付けで開く」", JSON.stringify(rowMenu));
      t.eq(rowMenu.slice(os + 1, os + 3), ["---", "コピー"], "row menu: 「OSの関連付けで開く」, one separator, 「コピー」");
      t.ok(!rowMenu.some((label, i) => label === "---" && rowMenu[i + 1] === "---"), "row menu: no double separator");
      await closeCtxMenu(ctx);
      await openBlankMenu(ctx);
      const blank = await ctxEntries(ctx);
      t.eq(blank[blank.length - 1], "貼り付け", "blank menu: ends with 「貼り付け」 (no trailing separator)", JSON.stringify(blank));
      await closeCtxMenu(ctx);
      await ctx.focusList();
      const before = await launchCalls(ctx);
      await hit(ctx, "terminal");
      await sleep(1200);
      t.eq(await launchCalls(ctx), before, "Ctrl+Alt+C: no launch call at all");
      const message = await statusMsg(ctx);
      t.ok(!/起動/.test(message), "Ctrl+Alt+C: no launch / failure status message", JSON.stringify(message));
    },
  },
  {
    id: "AC-653",
    title: "junction to a folder is listed as a folder and Enter shows its contents; a symlink to a folder too (SKIP without the right); a broken junction is a file",
    async run(t, ctx) {
      const base = "jn";
      if (!ctx.fx.exists(base)) {
        ctx.fx.file(path.join(base, "t"), "inner.txt");
        ctx.fx.file(base, "f.txt");
        fs.symlinkSync(ctx.fx.at(base, "t"), ctx.fx.at(base, "j"), "junction");
        ctx.fx.mkdir("jn-gone");
        fs.symlinkSync(ctx.fx.at("jn-gone"), ctx.fx.at(base, "jb"), "junction");
        fs.rmdirSync(ctx.fx.at("jn-gone")); // the junction's target is gone: it cannot be followed
        try {
          fs.symlinkSync(ctx.fx.at(base, "t"), ctx.fx.at(base, "sd"), "dir");
        } catch (error) {
          ctx.symlinkNote = `symbolic link not created (${error.code ?? error.message}): that part is SKIPPED`;
        }
      }
      const dir = await prep(ctx, base);
      const kinds = await rowIcons(ctx);
      t.eq(kinds.j, true, "(i) the junction j is listed as a folder");
      t.eq(kinds.jb, false, "(iii) the broken junction jb is listed as a file (not a folder)");
      t.eq(kinds["f.txt"], false, "(iv) f.txt is a file");
      t.eq(kinds.t, true, "t is a folder");
      if (ctx.symlinkNote) t.note(ctx.symlinkNote);
      else t.eq(kinds.sd, true, "(ii) the symbolic link sd is listed as a folder");
      await focusRowByName(ctx, "j");
      await ctx.viewKey("Enter");
      await ctx.waitFor(`document.querySelector('.path-bar-row input')?.value?.toLowerCase().endsWith(${JSON.stringify(path.join(dir, "j").toLowerCase())})`, { label: "the path bar to show j" });
      await ctx.settle(200);
      t.eq(await ctx.ev(`[...document.querySelectorAll('.app-shell .file-list-row')].map((e) => e.getAttribute('aria-label'))`), ["inner.txt"], "Enter on j shows the contents of t");
    },
  },
];

// ------------------------------------------------------------------------------------------------ E1

const e1Tests = [
  {
    id: "AC-1530",
    title: "menu bar 「ファイル」: after 「OSの関連付けで開く」 and a separator the registrations in config order with their first key, then a separator, 「新規作成…」",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      await focusRowByName(ctx, "a.txt");
      await openByKeys(ctx, 0);
      const file = await dropdown(ctx);
      const base = MENU_TABLE[0].map((e) => (e === "---" ? "---" : e[0]));
      const expected = [...base.slice(0, 3), ...APP_ORDER.map((k) => NAME[k]), "---", ...base.slice(3)];
      t.eq(outline(file), expected, "「ファイル」 outline");
      const shown = file.entries.filter((e) => !e.sep && APP_ORDER.some((k) => NAME[k] === e.label)).map((e) => [e.label, e.shortcut]);
      t.eq(shown, APP_ORDER.map((k) => [NAME[k], SHORTCUT[k]]), "shortcut text = the first key of the registration");
      await closeBar(ctx);
    }),
  },
  {
    id: "AC-1531",
    title: "row menu: separator, the registrations, separator, 「コピー」; blank menu: 「貼り付け」, separator, the registrations; no shortcut text",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      await openRowMenu(ctx, "a.txt");
      const rowMenu = await ctxEntries(ctx);
      const os = rowMenu.indexOf("OSの関連付けで開く");
      t.ok(os >= 0, "the row menu has 「OSの関連付けで開く」", JSON.stringify(rowMenu));
      t.eq(rowMenu.slice(os + 1, os + 2 + APP_ORDER.length + 2), ["---", ...APP_ORDER.map((k) => NAME[k]), "---", "コピー"], "row menu: --- apps --- コピー");
      t.eq(await ctxHasShortcut(ctx), false, "the row menu shows no shortcut text");
      await closeCtxMenu(ctx);
      await openBlankMenu(ctx);
      const blank = await ctxEntries(ctx);
      const paste = blank.indexOf("貼り付け");
      t.ok(paste >= 0, "the blank menu has 「貼り付け」", JSON.stringify(blank));
      t.eq(blank.slice(paste + 1), ["---", ...APP_ORDER.map((k) => NAME[k])], "blank menu: 貼り付け, then --- and the apps, nothing after");
      t.eq(await ctxHasShortcut(ctx), false, "the blank menu shows no shortcut text");
      await closeCtxMenu(ctx);
    }),
  },
  {
    id: "AC-1522",
    title: "arguments / working folder reach the probe element by element (space ; & % , in names), file -> {dir}/{path} and args_for_file, folder -> the folder; status 「…を起動しました」",
    run: e1(async (t, ctx) => {
      const sp = "sp";
      const fileName = "f i;l&e%1,x.txt";
      const folderName = "f o;l&d%2,y";
      if (!ctx.fx.exists(sp)) {
        ctx.fx.file(sp, fileName);
        ctx.fx.folder(sp, folderName);
      }
      const dir = await prep(ctx, sp);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      const filePath = path.join(dir, fileName);
      const folderPath = path.join(dir, folderName);

      await focusRowByName(ctx, fileName);
      await hit(ctx, "args");
      const a = await oneRecord(t, p.args, "file + 引数テスト");
      t.eq(lc(a?.args), lc([filePath, dir, "x;y&z%1", "a{b}", filePath + dir]), "file: {path} {dir} literal-with-% {{b}} {path}{dir} as 5 separate arguments");
      t.eq(lc(a?.cwd), lc(dir), "file: the working folder is the folder of the file");
      t.ok(await waitStatus(ctx, W94(NAME.args)), "status 「引数テスト」を起動しました", JSON.stringify(await statusMsg(ctx)));

      await hit(ctx, "explorer");
      const e = await oneRecord(t, p.explorer, "file + エクスプローラー");
      t.eq(lc(e?.args), lc(["/select,", filePath]), "file: args_for_file = [\"/select,\", {path}] (2 elements)");
      t.eq(lc(e?.cwd), lc(dir), "file: working folder");

      await hit(ctx, "terminal");
      const c = await oneRecord(t, p.terminal, "file + ターミナル");
      t.eq(lc(c?.args), lc(["-d", dir]), "file: [-d, {dir}]");
      await hit(ctx, "code");
      const v = await oneRecord(t, p.code, "file + VS Code");
      t.eq(lc(v?.args), lc([filePath]), "file: [{path}]");

      resetRecords(ctx.fx);
      await focusRowByName(ctx, folderName);
      await hit(ctx, "explorer");
      const fe = await oneRecord(t, p.explorer, "folder + エクスプローラー");
      t.eq(lc(fe?.args), lc([folderPath]), "folder: args (not args_for_file) = [{dir}] = the folder");
      t.eq(lc(fe?.cwd), lc(folderPath), "folder: the working folder is the folder itself");
      await hit(ctx, "terminal");
      const fc = await oneRecord(t, p.terminal, "folder + ターミナル");
      t.eq(lc(fc?.args), lc(["-d", folderPath]), "folder: [-d, folder]");
      await hit(ctx, "code");
      const fv = await oneRecord(t, p.code, "folder + VS Code");
      t.eq(lc(fv?.args), lc([folderPath]), "folder: [{path}] = the folder");
      await hit(ctx, "args");
      const fa = await oneRecord(t, p.args, "folder + 引数テスト");
      t.eq(lc(fa?.args), lc([folderPath, folderPath, "x;y&z%1", "a{b}", folderPath + folderPath]), "folder: {path} and {dir} are both the folder");
    }),
  },
  {
    id: "AC-1512",
    title: "keys: the target is the FOCUS row (a.txt b.txt selected, focus c.txt); selection and focus do not change",
    run: e1(async (t, ctx) => {
      const dir = await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      await clickWith(ctx, row("a.txt"));
      await clickWith(ctx, row("b.txt"), MOD.Ctrl);
      await clickWith(ctx, row("c.txt"), MOD.Ctrl);
      await clickWith(ctx, row("c.txt"), MOD.Ctrl); // toggled off again: the focus stays on c.txt
      await ctx.settle(100);
      t.eq([await selectedNames(ctx), await focusedName(ctx)], [["a.txt", "b.txt"], "c.txt"], "setup: selection a.txt b.txt, focus row c.txt (not selected)");
      await hit(ctx, "code");
      const r = await oneRecord(t, p.code, "Ctrl+Alt+V");
      t.eq(lc(r?.args), lc([path.join(dir, "c.txt")]), "the argument is the absolute path of c.txt");
      await ctx.settle(150);
      t.eq([await selectedNames(ctx), await focusedName(ctx)], [["a.txt", "b.txt"], "c.txt"], "selection and focus are unchanged");
    }),
  },
  {
    id: "AC-1513",
    title: "empty folder / search filter with 0 rows: the target is the current folder ({path} and {dir} both the folder)",
    run: e1(async (t, ctx) => {
      const p = probes(ctx.fx);
      const empty = await prep(ctx, "e");
      resetRecords(ctx.fx);
      await hit(ctx, "code");
      const a = await oneRecord(t, p.code, "empty folder + VS Code");
      t.eq(lc(a?.args), lc([empty]), "empty folder: {path} = the current folder");
      await hit(ctx, "terminal");
      const b = await oneRecord(t, p.terminal, "empty folder + ターミナル");
      t.eq(lc(b?.args), lc(["-d", empty]), "empty folder: {dir} = the current folder");
      t.eq(lc(b?.cwd), lc(empty), "empty folder: working folder");

      resetRecords(ctx.fx);
      const dir = await prep(ctx);
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-input')`, { label: "the search bar" });
      await ctx.type("zzzz-no-such");
      await ctx.settle(300);
      t.eq(await ctx.rowCount(), 0, "the filter shows 0 rows");
      await ctx.ev(`document.querySelector('.search-bar .apply-button').focus(); true`);
      await hit(ctx, "args");
      const f = await oneRecord(t, p.args, "filter with 0 rows + 引数テスト");
      t.eq(lc(f?.args?.slice(0, 2)), lc([dir, dir]), "filter with 0 rows: {path} and {dir} are the current folder");
    }),
  },
  {
    id: "AC-1514",
    title: "row context menu: the target is the right-clicked row and the selection stays; blank menu: the current folder",
    run: e1(async (t, ctx) => {
      const dir = await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      await selectRows(ctx, ["a.txt", "b.txt"]);
      await openRowMenu(ctx, "b.txt");
      await clickCtxItem(ctx, NAME.code);
      const r = await oneRecord(t, p.code, "row menu + VS Code");
      t.eq(lc(r?.args), lc([path.join(dir, "b.txt")]), "the target is b.txt");
      await ctx.waitFor(`!document.querySelector('.ctx-menu')`, { label: "the menu to close" });
      await ctx.settle(150);
      t.eq(await selectedNames(ctx), ["a.txt", "b.txt"], "after the run the selection is still a.txt b.txt (no restore of the opening selection)");
      t.ok(await waitStatus(ctx, W94(NAME.code)), "status 「VS Codeで開く」を起動しました", JSON.stringify(await statusMsg(ctx)));

      resetRecords(ctx.fx);
      await openBlankMenu(ctx);
      await clickCtxItem(ctx, NAME.terminal);
      const b = await oneRecord(t, p.terminal, "blank menu + ターミナル");
      t.eq(lc(b?.args), lc(["-d", dir]), "blank menu: the target is the current folder");
      t.eq(lc(b?.cwd), lc(dir), "blank menu: working folder");
    }),
  },
  {
    id: "AC-1515",
    title: "tree focus: key and menu bar target the list focus row; search input: the key does nothing (the menu bar launches); the 適用 button: the key launches",
    run: e1(async (t, ctx) => {
      const dir = await prep(ctx);
      const p = probes(ctx.fx);
      const a = path.join(dir, "a.txt");
      resetRecords(ctx.fx);
      await focusRowByName(ctx, "a.txt");
      await ctx.press.tab(); // list -> tree
      await ctx.settle(150);
      t.eq(await statusFocus(ctx), "フォーカス: ツリー", "setup: the tree has the focus");
      await hit(ctx, "code");
      const k = await oneRecord(t, p.code, "tree focus + key");
      t.eq(lc(k?.args), lc([a]), "key with the tree focused: the target is a.txt (the list focus row), not the tree node");

      clearRecords(p.code);
      await openByKeys(ctx, 0);
      await runHighlighted(ctx, NAME.code);
      const m = await oneRecord(t, p.code, "tree focus + menu bar");
      t.eq(lc(m?.args), lc([a]), "menu bar with the tree focused: the target is a.txt");

      // search input: the key does not launch, the menu bar does
      resetRecords(ctx.fx);
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`document.activeElement === document.querySelector('.search-input')`, { label: "the search input to have the focus" });
      const before = await launchCalls(ctx);
      await hit(ctx, "code");
      await sleep(1200);
      t.eq(await launchCalls(ctx), before, "search input: the key starts nothing");
      t.eq(totalRecords(ctx.fx), 0, "search input: nothing recorded");
      await openByKeys(ctx, 0);
      await runHighlighted(ctx, NAME.code);
      const s = await oneRecord(t, p.code, "search input + menu bar");
      t.eq(lc(s?.args), lc([a]), "search input + menu bar: it launches, target a.txt");

      // the 適用 button: the key launches
      clearRecords(p.code);
      await ctx.ev(`document.querySelector('.search-bar .apply-button').focus(); true`);
      await hit(ctx, "code");
      const b = await oneRecord(t, p.code, "適用 button + key");
      t.eq(b?.args?.length, 1, "the 適用 button focused: the key launches");
    }),
  },
  {
    id: "AC-1517",
    title: "right-click menu opened, then the clicked file is removed: the opening target is used, nothing starts, 「対象が見つかりません」; the enabled state does not change",
    run: e1(async (t, ctx) => {
      const gone = "vanish";
      if (!ctx.fx.exists(gone)) {
        ctx.fx.file(gone, "v1.txt");
        ctx.fx.file(gone, "v2.txt");
      }
      await prep(ctx, gone);
      resetRecords(ctx.fx);
      await openRowMenu(ctx, "v1.txt");
      const disabledBefore = await ctxDisabled(ctx);
      fs.rmSync(ctx.fx.at(gone, "v1.txt"));
      await sleep(300);
      t.eq(await ctxDisabled(ctx), disabledBefore, "the enabled / disabled display did not change after the file vanished");
      await clickCtxItem(ctx, NAME.code);
      const expected = `「${NAME.code}」を起動できませんでした。対象が見つかりません。`;
      t.ok(await waitStatus(ctx, expected), `status ${expected}`, JSON.stringify(await statusMsg(ctx)));
      await sleep(500);
      t.eq(totalRecords(ctx.fx), 0, "the probe was not started");
    }),
  },
  {
    id: "AC-1521",
    title: "a registration whose program does not exist: nothing else starts, 「実行ファイルが見つかりません: {program}。」",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      resetRecords(ctx.fx);
      await focusRowByName(ctx, "a.txt");
      await hit(ctx, "missing");
      const p = probes(ctx.fx);
      const expected = `「${NAME.missing}」を起動できませんでした。実行ファイルが見つかりません: ${p.missing}。`;
      const ok = await waitStatus(ctx, expected);
      t.ok(ok, `status ${expected}`, JSON.stringify(await statusMsg(ctx)));
      await sleep(500);
      t.eq(totalRecords(ctx.fx), 0, "no other program was started");
    }),
  },
  {
    id: "AC-1523",
    title: "key held down (auto-repeat keydowns): one launch; the next press launches a second time",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      await focusRowByName(ctx, "a.txt");
      await ctx.keyHold(...KEYS.code, 4);
      await waitRecords(p.code, 1);
      await sleep(1500);
      t.eq(readRecords(p.code).calls.length, 1, "held key (1 press + 4 repeats): exactly one launch");
      await hit(ctx, "code");
      const calls = await waitRecords(p.code, 2);
      await sleep(500);
      t.eq(readRecords(p.code).calls.length, 2, "the next press launches a second time", `recorded ${calls.length}`);
    }),
  },
  {
    id: "AC-1525",
    title: "a registration pointing at the probe copy OUTSIDE the E2E scope is refused by the backend (nothing recorded); 「テスト用の範囲の外です」; the copy inside the scope starts",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      t.ok(!ctx.fx.contains(p.github), "setup: the registered program really is outside the test folder", p.github);
      await focusRowByName(ctx, "a.txt");
      await hit(ctx, "github");
      const expected = `「${NAME.github}」を起動できませんでした。テスト用の範囲の外です。`;
      t.ok(await waitStatus(ctx, expected), `status ${expected}`, JSON.stringify(await statusMsg(ctx)));
      await sleep(1200);
      t.eq(readRecords(p.github).calls.length, 0, "the outside copy recorded nothing");
      await hit(ctx, "code");
      t.eq((await waitRecords(p.code, 1)).length, 1, "a program inside the scope with a target inside starts");
    }),
  },
  {
    id: "AC-1527",
    title: "a probe that waits 3 s: the launch message appears and the next key (Down) moves the focus without waiting for the end",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      await focusRowByName(ctx, "a.txt");
      const started = Date.now();
      await hit(ctx, "slow");
      await ctx.press.down();
      await ctx.waitFor(`document.querySelector('.app-shell .file-list-row:is(.cursor,.idle)')?.getAttribute('aria-label') !== 'a.txt'`, { timeout: 2500, label: "the focus to move" });
      const moved = Date.now() - started;
      t.ok(moved < 2500, "the focus moved long before the 3 s of the probe are over", `${moved} ms`);
      t.eq(readRecords(p.slow).done, 0, "the probe is still waiting (no end mark yet) when the focus has moved");
      t.ok(await waitStatus(ctx, W94(NAME.slow), 2500) || /を起動しました/.test(await statusMsg(ctx)), "the launch message is shown", JSON.stringify(await statusMsg(ctx)));
      const call = (await waitRecords(p.slow, 1))[0];
      t.ok(call?.args?.includes("--rf-sleep=3000"), "the argument --rf-sleep=3000 was recorded");
      t.ok(await waitDone(p.slow), "the probe wrote its end mark later (the test waits for it before cleanup)");
    }),
  },
  {
    id: "AC-1533",
    title: "no launch while (i) the delete confirmation, (ii) the path bar editing, (iii) the active menu bar, (iv) the viewer window is in front",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      await focusRowByName(ctx, "a.txt");
      resetRecords(ctx.fx);

      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('[role=dialog]')`, { label: "the delete confirmation" });
      await hit(ctx, "code");
      await expectNoLaunch(t, ctx, "(i) delete confirmation");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('[role=dialog]')`, { label: "the dialog to close" });

      await ctx.press.ctrlL();
      await sleep(150);
      t.eq((await ctx.pathBarState()).focused, true, "setup: the path bar is being edited");
      await hit(ctx, "code");
      await expectNoLaunch(t, ctx, "(ii) path bar editing");
      await ctx.press.escape();
      await ctx.focusList();

      await ctx.press.f10();
      await ctx.waitFor(`!!document.querySelector('.menubar .heading.current')`, { label: "the menu bar to be active" });
      await hit(ctx, "code");
      await expectNoLaunch(t, ctx, "(iii) menu bar active");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.menubar .heading.current') && !document.querySelector('.menubar .dropdown')`, { label: "the menu bar to be inactive" });

      // (iv) the viewer window in front: the keys go to the viewer page
      await ctx.focusList();
      const viewer = await openViewerWindow(t, ctx, { downs: 0 });
      if (viewer !== undefined) {
        try {
          await viewer.key(...KEYS.code);
          await viewer.key(...KEYS.terminal);
          await expectNoLaunch(t, ctx, "(iv) viewer window in front");
        } finally {
          await closeViewerWindow(ctx, viewer);
        }
      }
    }),
  },
  {
    id: "AC-1536",
    title: "tree focus: a menu bar run and a right-click menu run start after the menu closed, and the focus returns (tree / file list)",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      await focusRowByName(ctx, "a.txt");
      await ctx.press.tab();
      await ctx.settle(150);
      t.eq(await statusFocus(ctx), "フォーカス: ツリー", "setup: the tree has the focus");
      await openByKeys(ctx, 0);
      await runHighlighted(ctx, NAME.code);
      await oneRecord(t, p.code, "menu bar run");
      t.eq(await barState(ctx).then((s) => s.hasDropdown), false, "the dropdown is closed");
      t.eq(await statusFocus(ctx), "フォーカス: ツリー", "menu bar: the focus is back on the tree");

      clearRecords(p.code);
      await openRowMenu(ctx, "b.txt");
      await clickCtxItem(ctx, NAME.code);
      await oneRecord(t, p.code, "context menu run");
      t.eq(await ctx.ev(`!!document.querySelector('.ctx-menu')`), false, "the context menu is closed");
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "context menu: the focus is on the file list");
    }),
  },
  {
    id: "AC-1540",
    title: "3 rows selected with a focus row: the registration items are enabled (menu bar and context menu)",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      await selectRows(ctx, ["a.txt", "b.txt"]);
      await clickWith(ctx, row("c.txt"), MOD.Ctrl);
      await ctx.settle(100);
      t.eq((await selectedNames(ctx)).length, 3, "setup: 3 rows selected");
      await openByKeys(ctx, 0);
      const file = await dropdown(ctx);
      const apps = file.entries.filter((e) => !e.sep && APP_ORDER.some((k) => NAME[k] === e.label));
      t.eq(apps.length, APP_ORDER.length, "all registration items are in 「ファイル」");
      t.eq(apps.filter((e) => !e.enabled).map((e) => e.label), [], "none of them is disabled");
      await closeBar(ctx);
      await openRowMenu(ctx, "c.txt");
      const disabled = await ctxDisabled(ctx);
      t.eq(disabled.filter((l) => APP_ORDER.some((k) => NAME[k] === l)), [], "none of the registration items of the row menu is disabled");
      await closeCtxMenu(ctx);
    }),
  },
  {
    id: "AC-1544",
    title: "Ctrl+Alt+E launches the registration and does not open 「編集」; Alt+E opens 「編集」 and launches nothing",
    run: e1(async (t, ctx) => {
      await prep(ctx);
      const p = probes(ctx.fx);
      resetRecords(ctx.fx);
      await focusRowByName(ctx, "a.txt");
      await hit(ctx, "explorer");
      await oneRecord(t, p.explorer, "Ctrl+Alt+E");
      const bar = await barState(ctx);
      t.eq([bar.current, bar.open, bar.hasDropdown], [-1, -1, false], "Ctrl+Alt+E: the menu bar did not become active and no dropdown opened");
      clearRecords(p.explorer);
      const before = await launchCalls(ctx);
      await ctx.press.accessKey("E");
      await waitDropdown(ctx);
      const after = await barState(ctx);
      t.eq(after.open, 1, "Alt+E: the 「編集」 dropdown is open");
      await sleep(1000);
      t.eq([await launchCalls(ctx), readRecords(p.explorer).calls.length], [before, 0], "Alt+E: nothing was launched");
      await closeBar(ctx);
    }),
  },
  {
    // MUST be last in E1 (it cleans up nothing, but it is the only test that leaves sleepers if it failed half way): all sleepers are awaited.
    id: "AC-1527-end",
    title: "cleanup: every probe that was started with --rf-sleep has written its end mark",
    run: e1(async (t, ctx) => {
      const waiting = await awaitSleepers();
      t.eq(waiting, [], "no probe is still sleeping");
    }),
  },
];

// ------------------------------------------------------------------------------------------------ E2

// Registrations 1..7: 1 clashes with the custom sort_menu key, 2 is a fixed key, 3 is invalid (relative program), 4 is fine, 5 repeats 4's key,
// 6 uses Tab, 7 has no name (invalid).
const E2_KEYMAP = `input_keymap_custom = { sort_menu = "Ctrl+Alt+C" }\n`;
function e2Registrations(fx) {
  const p = placeProbe(fx, "e2");
  return [
    { name: "重なるA", program: p, args: ["A"], key: "Ctrl+Alt+C" },
    { name: "固定B", program: p, args: ["B"], key: "Ctrl+Q" },
    { name: "壊れたC", program: "relative\\x.exe", args: ["C"] },
    { name: "使えるD", program: p, args: ["D"], key: "Ctrl+Alt+K" },
    { name: "重なるE", program: p, args: ["E"], key: "Ctrl+Alt+K" },
    { name: "タブF", program: p, args: ["F"], key: "Tab" },
    { program: p, args: ["G"] },
  ];
}
// SPEC-0300-0019 第5版 §4.9 W-9A / W-9C with the lines (SPEC-0300-0022 R-1642, ISS-0234 (d)): the file is `ui_theme` (line 1), E2_KEYMAP (line 2), then 5 lines per
// registration (heading, name, program, args, key) starting on line 3, and 3 lines for the nameless 7 (heading, program, args). The line of an invalid
// registration is the line of the field that is wrong (3: its relative `program`), or its heading when no field is to blame (7: no name; the name cannot
// be shown, so only `7(32 行目)`); the line of an unusable key is its `key` line (5 lines apart: 7, 12, 26, 31).
const E2_NOTICE =
  "config.toml の外部アプリの登録 2 件を使いません: 3(壊れたC、15 行目), 7(32 行目)。 " +
  "外部アプリのキー 4 件は使いません(正しくないか、他の操作と重なっています): 重なるA: Ctrl+Alt+C(7 行目), 固定B: Ctrl+Q(12 行目), 重なるE: Ctrl+Alt+K(26 行目), タブF: Tab(31 行目)。";

const e2Tests = [
  {
    id: "AC-1508",
    title: "start-up notice: invalid registrations (W-9A) then unusable keys (W-9C), one message, one space between",
    async run(t, ctx) {
      const dto = await ctx.externalAppsDto();
      t.eq(dto.apps.map((a) => a.name), ["重なるA", "固定B", "使えるD", "重なるE", "タブF"], "the usable registrations (3 and 7 are left out), in config order");
      t.eq(dto.invalid.map((i) => i.position), [3, 7], "the backend reports registrations 3 and 7 as invalid");
      await ctx.reload();
      t.eq(await statusMsg(ctx), E2_NOTICE, "the start-up status message");
    },
  },
  {
    id: "AC-1532",
    title: "a registration key that clashes with input_keymap_custom / a fixed key / Tab / an earlier registration is not used (the item stays, without shortcut); the sort menu keeps the key",
    run: (t, ctx) =>
      ctx.withExternalAppLaunch(async () => {
        await prep(ctx, "e2dir");
        const exe = placeProbe(ctx.fx, "e2");
        clearRecords(exe);
        await openByKeys(ctx, 0);
        const file = await dropdown(ctx);
        const apps = file.entries.filter((e) => !e.sep && ["重なるA", "固定B", "使えるD", "重なるE", "タブF"].includes(e.label)).map((e) => [e.label, e.shortcut]);
        t.eq(apps, [["重なるA", ""], ["固定B", ""], ["使えるD", "Ctrl+Alt+K"], ["重なるE", ""], ["タブF", ""]], "menu bar: all five items, only 使えるD shows its key");
        t.ok(!outline(file).includes("壊れたC"), "the invalid registration has no item");
        await closeBar(ctx);

        await ctx.focusList();
        await ctx.key("c", CA, "KeyC");
        await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu opened by Ctrl+Alt+C" });
        await ctx.press.escape();
        await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });
        await sleep(600);
        t.eq(readRecords(exe).calls.length, 0, "Ctrl+Alt+C opened the sort menu and launched nothing");

        await ctx.focusList();
        await ctx.key("k", CA, "KeyK");
        const first = await waitRecords(exe, 1);
        await sleep(800);
        const calls = readRecords(exe).calls;
        t.eq(calls.length, 1, "Ctrl+Alt+K launches exactly one registration (the earlier one wins)");
        t.eq(first[0]?.args, ["D"], "…and it is 使えるD");
        await ctx.press.tab();
        await ctx.settle(150);
        t.eq(await statusFocus(ctx), "フォーカス: ツリー", "Tab still moves the focus (it is not a registration key)");
        t.eq(readRecords(exe).calls.length, 1, "Tab started nothing");
      }),
  },
];

// ------------------------------------------------------------------------------------------------ scenarios

const prepareProbe = async () => {
  buildProbe(); // cargo build --example rf_launch_probe (once per run)
};

export const scenarios = [
  {
    id: "E0",
    title: "external_apps = [] (AC-1501) + junctions (AC-653)",
    configToml: '# no ui_theme (R-1840)\nexternal_apps = []\n',
    tests: e0Tests,
  },
  {
    id: "E1",
    title: "probe registrations only: keys, menus, targets, arguments, messages",
    configToml: (fx) => `# no ui_theme (R-1840)\n${externalAppsToml(registrations(fx))}`,
    prepare: prepareProbe,
    cleanup: async () => {
      await disposeOutsideProbes();
    },
    tests: e1Tests,
  },
  {
    id: "E2",
    title: "clashing / invalid registrations: start-up notice and the usable keys",
    configToml: (fx) => `# no ui_theme (R-1840)\n${E2_KEYMAP}${externalAppsToml(e2Registrations(fx))}`,
    prepare: prepareProbe,
    cleanup: async () => {
      await disposeOutsideProbes();
    },
    tests: e2Tests,
  },
];
