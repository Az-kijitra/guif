// SPEC-0300-0023 第2版 (画面の見た目を tuif に合わせる) -- the [CDP] acceptance criteria that need their own config.toml or a measured set-up:
//   the presets, [theme] / [colors] / [font] / [layout] and the notices W-B0 .. W-B9 (AC-1700 .. AC-1705, AC-1721, AC-1750 .. AC-1755, AC-1804),
//   the viewer's colours given by the initialization script (AC-1721 / AC-1724), the rows and frames (AC-1722 / AC-1723 / AC-1760 / AC-1761),
//   the pages of columns (AC-1762 / AC-1792 / AC-1793 / AC-1796, R-1842), the menu bar etc. (AC-1810).
// The ACs that run with the default config are also in color-font.mjs (AC-1720 / AC-1750 (i)), layout.mjs (AC-1804 24%), list.mjs (AC-1780 ...),
// tree.mjs (AC-1800), scroll.mjs (AC-1753 / AC-1790), wording.mjs (AC-1783), theme.mjs (AC-1741 / AC-1742 / AC-1748 / AC-1708).
//
// R-1842: the 2-column page needs the test to measure W and ch and to write a `min_col_width` that gives 2 <= W / minCol < 3. `AC-1842` (a normal test,
// default config) measures them; the scenario M writes the number (default 37 when the measurement did not run, e.g. under --filter) and its first test
// FAILS when the set-up does not give "20 rows, 2 columns" (checked by measurement, not assumed).

import fs from "node:fs";
import { MOD } from "../lib/cdp.mjs";
import { bodySize, drawn, expectedPage, fitBody, listHeading, minColPx } from "./_list.mjs";
import { chOf, DEFAULT_FONT_FAMILY, openFiles, openViewerWindow, RGB, rowHeightOf, setSort, waitViewerShows } from "./_util.mjs";
import { focusRowByName } from "./_menu.mjs";
import { VIEWER_LOOK } from "./viewer.mjs";

const H20 = 328; // the list's inner height for 20 rows of 16px: 320 <= H < 336 (R-1842 (1))
const NONE = "rgba(0, 0, 0, 0)";
const bold = (w) => Number(w) >= 600 || w === "bold";
const notice = async (ctx) => {
  await ctx.reload();
  return await ctx.ev(`document.querySelector('.status-message')?.textContent ?? ""`);
};
const cssVars = (ctx, names) => Promise.all(names.map((n) => ctx.m.cssVar(n)));
const rowLook = (ctx, label) =>
  ctx.ev(`(() => { const r = [...document.querySelectorAll('.file-list-row')].find((x) => x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!r) return null; const s = getComputedStyle(r); return { color: s.color, bg: s.backgroundColor, bold: Number(s.fontWeight) >= 600, opacity: s.opacity, mark: r.querySelector('.mark').textContent, outline: s.outlineStyle }; })()`);
const norm = (v) => String(v).replaceAll('"', "");
/** font-family printed by the engine: quotes only where an identifier needs them, so compare without quotes: the stack is `first`, then the default stack. */
const stackStartsWith = (actual, first) => norm(actual).startsWith(`${norm(first)}, `) && norm(actual).includes("JetBrains Mono") && norm(actual).endsWith("monospace");
const frameColor = (ctx, sel) => ctx.ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)}), '::before').borderTopColor`);

// ============================================================================ normal tests (default config)

/** R-1842: the measured W (inner width of the list at 1000 wide, tree + size shown) and ch, used to choose min_col_width for the scenario M. */
const measured = { W: null, ch: null };
const DEFAULT_MIN_COL = 37; // 2 <= W / ((37 + 10) ch) < 3 for ch between 6.0 and 7.8 at W about 752

/** min_col_width that puts W / minCol at about 2.5 (an integer; the size cell adds 10). */
export function chooseMinColWidth() {
  if (measured.W === null || measured.ch === null) return DEFAULT_MIN_COL;
  return Math.round(measured.W / (2.5 * measured.ch)) - 10;
}

export const tests = [
  {
    id: "AC-1842",
    title: "R-1842 measurement: at 1000 wide with the tree and the size shown, measure W and ch and the min_col_width that gives 2 <= W / minCol < 3 (used by the scenario M)",
    async run(t, ctx) {
      await openFiles(ctx, "m-probe", 100, { size: true, time: false, hidden: false, tree: true });
      const { W, H } = await fitBody(ctx, null, H20);
      const ch = await chOf(ctx, ".file-list");
      measured.W = W;
      measured.ch = ch;
      const X = chooseMinColWidth();
      const ratio = W / minColPx(X, true, false, ch);
      t.ok(ch > 5 && ch < 10, "ch is plausible", String(ch));
      t.ok(W > 600 && W < 900, "W is plausible at 1000 wide (tree 24%)", String(W));
      t.ok(H >= 320 && H < 336, "H gives 20 rows of 16px", String(H));
      t.ok(ratio >= 2 && ratio < 3, `min_col_width ${X} gives 2 <= W / minCol < 3`, String(ratio));
      t.ok(X >= 10 && X <= 80, "and it is inside the allowed range 10 .. 80", String(X));
      t.note(`W=${W} H=${H} ch=${ch.toFixed(3)} -> min_col_width ${X} (W / minCol = ${ratio.toFixed(2)})`);
    },
  },
  {
    id: "AC-1722",
    title: "row colours (nord): cursor c.txt = cursor_bg / cursor_fg / bold; selected d.txt = selected, bold, '*', no background; dir1 / .git folder colour; a.EXE / b.ps1 executable colour; adding c.txt to the selection keeps the cursor colours",
    async run(t, ctx) {
      for (const dir of [".git", "dir1"]) ctx.fx.folder("colours", dir);
      for (const f of ["a.EXE", "b.ps1", "c.txt", "d.txt"]) ctx.fx.file("colours", f);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("colours"));
      await ctx.ensureView({ size: true, time: false, hidden: true, tree: true });
      await ctx.focusList();
      const names = await ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r) => r.getAttribute('aria-label'))`);
      const at = (n) => names.indexOf(n);
      t.ok(at("c.txt") >= 0 && at("d.txt") >= 0, "all six entries are listed", JSON.stringify(names));
      await focusRowByName(ctx, "d.txt");
      await ctx.key(" ", 0, "Space"); // select d.txt
      await focusRowByName(ctx, "c.txt");
      await ctx.settle(150);
      t.eq(await ctx.ev(`document.querySelector('.file-list-row:is(.cursor,.idle)')?.getAttribute('aria-label')`), "c.txt", "the cursor is on c.txt");
      const c = await rowLook(ctx, "c.txt");
      const d = await rowLook(ctx, "d.txt");
      t.eq([c.bg, c.color, c.bold], [RGB.cursorBg, RGB.cursorFg, true], "c.txt (cursor): cursor_bg, cursor_fg, bold");
      t.eq([d.color, d.bold, d.bg, d.mark], [RGB.selectedFg, true, NONE, "* "], "d.txt (selected): selected colour, bold, no background, '* '");
      const dir1 = await rowLook(ctx, "dir1");
      const git = await rowLook(ctx, ".git");
      t.eq([dir1.color, dir1.bold], [RGB.folder, true], "dir1: folder colour, bold");
      t.eq([git.color, git.bold, git.opacity], [dir1.color, dir1.bold, dir1.opacity], ".git looks like dir1 (colour, weight, opacity)");
      for (const n of ["a.EXE", "b.ps1"]) t.eq([(await rowLook(ctx, n)).color, (await rowLook(ctx, n)).bold], [RGB.executable, false], `${n}: executable colour, normal weight`);
      // Add c.txt to the selection with Ctrl+click: the cursor row keeps the cursor colours and gets the mark.
      const centre = await ctx.m.center(`.file-list-row[aria-label="c.txt"]`);
      await ctx.click(centre.x, centre.y, { modifiers: MOD.Ctrl });
      await ctx.settle(150);
      const c2 = await rowLook(ctx, "c.txt");
      t.eq([c2.bg, c2.color, c2.mark], [RGB.cursorBg, RGB.cursorFg, "* "], "c.txt (cursor + selected): cursor_bg kept, mark '*'");
    },
  },
  {
    id: "AC-1723",
    title: "Tab to the tree: the cursor row has no background and a 1px --ui-border-active outline; the list frame is border_inactive, the tree frame border",
    async run(t, ctx) {
      await openFiles(ctx, "colours", 6, { size: true, time: false, hidden: false, tree: true });
      await ctx.focusList();
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree to take focus" });
      await ctx.settle();
      const idle = await ctx.ev(`(() => { const s = getComputedStyle(document.querySelector('.file-list-row:is(.cursor,.idle)')); return [s.backgroundColor, s.outlineWidth, s.outlineStyle, s.outlineColor]; })()`);
      t.eq(idle, [NONE, "1px", "solid", RGB.borderActive], "cursor row: no background, outline 1px solid border");
      t.eq(await frameColor(ctx, ".file-list-frame"), RGB.border, "list frame colour = border_inactive");
      t.eq(await frameColor(ctx, ".tree-pane"), RGB.borderActive, "tree frame colour = border");
    },
  },
  {
    id: "AC-1760",
    title: "frames and headings: only the tree and the list have a frame (menu bar, path bar, status bar border width 0); heading ファイル (78 件) [並び: 種類 昇順] / ドライブ / ツリー; with 12 hits and modified desc: ファイル (12 件) [並び: 更新日時 降順]",
    async run(t, ctx) {
      for (let i = 1; i <= 66; i++) ctx.fx.file("heads", `doc_${String(i).padStart(2, "0")}.txt`);
      for (let i = 1; i <= 12; i++) ctx.fx.file("heads", `img_${String(i).padStart(2, "0")}.png`);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("heads"));
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: true });
      await ctx.focusList();
      await setSort(ctx, "type", "asc");
      t.eq(await listHeading(ctx), "ファイル (78 件) [並び: 種類 昇順]", "list heading (AC-1760)");
      t.eq(await ctx.ev(`document.querySelector('.tree-pane .pane-title').textContent`), "ドライブ / ツリー", "tree heading");
      for (const sel of [".menubar", ".path-bar-row", ".status-bar"]) {
        const s = await ctx.m.cs(sel, ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"]);
        t.eq(Object.values(s), ["0px", "0px", "0px", "0px"], `${sel}: no frame`);
      }
      t.eq(await ctx.m.count(".pane"), 2, "exactly two frames (the tree and the list)");
      // AC-1761: the sort first, then the filter (the heading follows both).
      await setSort(ctx, "modified", "desc");
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.type("img_");
      await ctx.settle(300);
      t.eq(await listHeading(ctx), "ファイル (12 件) [並び: 更新日時 降順]", "list heading with 12 hits and modified desc (AC-1761)");
      await ctx.press.escape();
    },
  },
  {
    id: "AC-1810",
    title: "menu bar (closed, File menu open), path bar, status bar, search bar, history, sort menu and the delete dialog use the nord variables (R-1810 .. R-1815); the dialog has no radius and the active frame",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false, tree: true });
      const cs = (sel, props, i = 0) => ctx.m.cs(sel, props, i);
      // R-1810: the closed menu bar is a band in the surface colour; a heading has the fg colour.
      const bar = await cs(".menubar", ["background-color", "border-top-width"]);
      t.eq([bar["background-color"], bar["border-top-width"]], [RGB.statusBg, "0px"], "menu bar: status_bar_bg, no frame (R-1810)");
      // R-1814: the PATH label is the tree_current colour and bold; the input has the strong frame.
      const label = await cs(".path-bar-row > :first-child", ["color", "font-weight"]);
      t.eq([label.color, bold(label["font-weight"])], [RGB.treeCurrent, true], "PATH label: tree_current, bold");
      t.eq((await cs(".path-bar-row input", ["border-top-color"]))["border-top-color"], RGB.borderStrong, "path input frame = border_strong");
      // R-1811: the status bar is a band with the status colours.
      const st = await cs(".status-bar", ["background-color", "color"]);
      t.eq([st["background-color"], st.color], [RGB.statusBg, RGB.statusFg], "status bar: status_bar_bg / status_bar_fg");
      // The File menu opened from the keyboard: the dropdown and the lit item.
      await ctx.focusList();
      await ctx.press.accessKey("F");
      await ctx.waitFor(`!!document.querySelector('.menubar .dropdown .item')`, { label: "the File menu" });
      await ctx.settle(150);
      const dd = await cs(".menubar .dropdown", ["background-color", "border-top-color", "border-top-width"]);
      t.eq([dd["background-color"], dd["border-top-color"], dd["border-top-width"]], [RGB.surface, RGB.borderActive, "1px"], "dropdown: surface, active frame 1px");
      const lit = await ctx.ev(`(() => { const e = document.querySelector('.menubar .item.highlighted'); if (!e) return null; const s = getComputedStyle(e); return [s.backgroundColor, s.color]; })()`);
      if (lit !== null) t.eq(lit, [RGB.hover, RGB.cursorFg], "lit dropdown item: --ui-hover (cursor_bg) / cursor_fg (R-1812)");
      {
        const heading = await ctx.ev(`(() => { const e = document.querySelector('.menubar .heading.current'); const s = getComputedStyle(e); return [s.backgroundColor, s.color]; })()`);
        t.eq(heading, [RGB.menuActiveBg, RGB.menuActiveFg], "the open heading: menu_bar_active_bg / menu_bar_active_fg");
      }
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.menubar .dropdown')`, { label: "the menu to close" });
      // The sort menu.
      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      const sm = await cs(".sort-menu", ["background-color", "border-top-color"]);
      t.eq([sm["background-color"], sm["border-top-color"]], [RGB.surface, RGB.borderActive], "sort menu: surface, active frame");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });
      // The delete confirmation dialog.
      await ctx.focusList();
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the delete confirmation" });
      const dlg = await cs(".ui-dialog", ["background-color", "border-top-color", "border-top-width", "border-radius"]);
      t.eq([dlg["background-color"], dlg["border-top-color"], dlg["border-top-width"], dlg["border-radius"]], [RGB.surface, RGB.borderActive, "1px", "0px"], "dialog: surface, active frame 1px, radius 0");
      t.eq((await cs(".backdrop", ["background-color"]))["background-color"], RGB.backdrop, "backdrop");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });
    },
  },
];

// ============================================================================ scenarios

const EXT = "external_apps = []\n";

/** A scenario test that reads the startup notice and checks `includes` of each part (the order and joins are fixed by the unit tests). */
const hasAll = (t, message, parts, label) => {
  for (const part of parts) t.ok(message.includes(part), `${label}: the notice has ${JSON.stringify(part)}`, JSON.stringify(message));
};

// ------------------------------------------------------- P1: preset = light (AC-1701 / AC-1721 (ii) / AC-1724 light)

const LIGHT = {
  "--ui-bg": "#f5f5f5", "--ui-fg": "#1f2937", "--ui-surface": "#f5f5f5", "--ui-border": "#b4b4b4", "--ui-border-active": "#0066cc", "--ui-cursor-fg": "#ffffff",
  "--ui-cursor-bg": "#0078d7", "--ui-folder": "#d97706", "--ui-executable": "#16a34a", "--ui-selected-fg": "#ea580c", "--ui-status-fg": "#374151", "--ui-status-bg": "#e5e7eb",
  "--ui-menu-active-fg": "#ffffff", "--ui-menu-active-bg": "#0078d7", "--ui-tree-current": "#0066cc", "--ui-tree-cursor": "#d97706", "--ui-color-scheme": "light",
};
const p1Tests = [
  {
    id: "AC-1721",
    title: 'preset = "LIGHT" (any case, AC-1701): the root variables hold the light preset (AC-1721 (ii)); the page is light; the cursor row uses the light cursor colours',
    async run(t, ctx) {
      await openFiles(ctx, "light-main", 20, { size: true, time: false, hidden: false, tree: true });
      for (const [name, value] of Object.entries(LIGHT)) t.eq(await ctx.m.cssVar(name), value, name);
      t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], "rgb(245, 245, 245)", "body background");
      t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], "light", "container color-scheme");
      await ctx.focusList();
      const c = await ctx.ev(`(() => { const s = getComputedStyle(document.querySelector('.file-list-row.cursor')); return [s.backgroundColor, s.color]; })()`);
      t.eq(c, ["rgb(0, 120, 215)", "rgb(255, 255, 255)"], "cursor row: light cursor_bg / cursor_fg");
      t.eq(await notice(ctx), "", "no startup notice");
    },
  },
  {
    id: "AC-1724",
    title: "viewer, light: the initialization script gives the variables before the first paint (window.__GUIF_APPEARANCE__); background, text, header, line numbers and the truncation banner use the light values",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("light-viewer");
      fs.writeFileSync(ctx.fx.at("light-viewer", "a.txt"), "light viewer line one\nsecond\n");
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "light viewer line one" }))) return;
        const init = await viewer.ev(`(() => { const a = window.__GUIF_APPEARANCE__; return a && Array.isArray(a.vars) ? a.vars.length : null; })()`);
        t.ok(typeof init === "number" && init >= 20, "window.__GUIF_APPEARANCE__.vars was placed by the initialization script", String(init));
        const s = await viewer.ev(VIEWER_LOOK);
        t.eq([s.htmlBg, s.bodyBg, s.rootColor, s.htmlScheme], ["rgb(245, 245, 245)", "rgb(245, 245, 245)", "rgb(31, 41, 55)", "light"], "html / body background, text colour, color-scheme (light)");
        t.eq(s.uiVars, [], "no --ui-* variable in the viewer");
        const head = await viewer.ev(`(() => { const s = getComputedStyle(document.querySelector('.viewer-header')); return [s.backgroundColor, s.color, s.borderBottomColor]; })()`);
        t.eq(head, ["rgb(229, 231, 235)", "rgb(55, 65, 81)", "rgb(0, 102, 204)"], "header: status_bar_bg / status_bar_fg / border");
      } finally {
        viewer.close();
      }
    },
  },
];

// ------------------------------------------------- P2: Solarized_Dark with a light bg override (AC-1701 / AC-1721 (iii) / AC-1740)

const P2_CONFIG = `${EXT}\n[theme]\nname = "Solarized_Dark"\n\n[colors]\nbg = "#F0F0F0"\n`;
const p2Tests = [
  {
    id: "AC-1721-iii",
    title: 'name = "Solarized_Dark" (AC-1701) and [colors] bg = "#F0F0F0": the preset is solarized, --ui-bg is #f0f0f0, and the colour scheme follows the new bg (light, R-1740)',
    async run(t, ctx) {
      await openFiles(ctx, "solar-main", 10, { size: true, time: false, hidden: false, tree: true });
      t.eq(await ctx.m.cssVar("--ui-bg"), "#f0f0f0", "--ui-bg is the override");
      t.eq(await ctx.m.cssVar("--ui-border-active"), "#268bd2", "--ui-border-active is solarized's border (the preset was found by the name)");
      t.eq(await ctx.m.cssVar("--ui-folder"), "#b58900", "--ui-folder is solarized's folder");
      t.eq(await ctx.m.cssVar("--ui-color-scheme"), "light", "the colour scheme is decided by the bg (#F0F0F0 is light)");
      t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], "rgb(240, 240, 240)", "body background");
      t.eq(await notice(ctx), "", "no startup notice");
    },
  },
];

// ------------------------------------------------- P3: [colors] with wrong values (AC-1704 / AC-1703: W-B2, W-B8, W-AC)

const P3_CONFIG = `external_apps = []

[theme]
preset = "nord"

[colors]
folder = "#GG0000"
file = "#ＡＢＣ"
border = "#12345"
cursor_bg = "256"
status_bar_fg = 3
foo = "red"
selected_mark = "yellow"
symlink = "#ＡＢ"
`;
// Lines: 3 [theme], 4 preset, 6 [colors], 7 folder, 8 file, 9 border, 10 cursor_bg, 11 status_bar_fg, 12 foo, 13 selected_mark, 14 symlink.
const p3Tests = [
  {
    id: "AC-1704",
    title: "[colors] with wrong values: no crash, the wrong ones keep nord's value, W-B2 lists them with lines (5 + ほか), foo is W-AC, the valid selected_mark is used (#E5C07B)",
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "colors-main", 10, { size: true, time: false, hidden: false, tree: true });
      t.eq(await ctx.m.cssVar("--ui-folder"), "#81a1c1", "folder (wrong value) keeps nord's");
      t.eq(await ctx.m.cssVar("--ui-border-active"), "#88c0d0", "border (wrong value) keeps nord's");
      t.eq(await ctx.m.cssVar("--ui-cursor-bg"), "#8fbcbb", "cursor_bg (256 is not a colour) keeps nord's");
      t.eq(await ctx.m.cssVar("--ui-status-fg"), "#e5e9f0", "status_bar_fg (a number) keeps nord's");
      t.eq(await ctx.m.cssVar("--ui-selected-fg"), "#e5c07b", "selected_mark = yellow is used");
      hasAll(t, message, ["config.toml の [colors] の色 6 件を解釈できないため、配色の色を使います: ", "folder(7 行目)", "file(8 行目)", "border(9 行目)", "cursor_bg(10 行目)", "status_bar_fg(11 行目)", "ほか 1 件"], "W-B2");
      hasAll(t, message, ["config.toml の不明な設定 1 件を無視しました: ", "foo(12 行目)"], "W-AC");
    },
  },
];

// ------------------------------------------------- P4: precedence of the aliases (AC-1703: W-B8)

const P4_CONFIG = `${EXT}\n[colors]\nbg = "#111111"\nbackground = "#222222"\nselected = "red"\nselected_mark = "blue"\n`;
const p4Tests = [
  {
    id: "AC-1703",
    title: "bg before background, selected_mark over selected (R-1710): bg #111111 and selected #61AFEF are used; W-B8 lists the unused background and selected",
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "alias-main", 5, { size: true, time: false, hidden: false, tree: true });
      t.eq(await ctx.m.cssVar("--ui-bg"), "#111111", "bg wins over background");
      t.eq(await ctx.m.cssVar("--ui-selected-fg"), "#61afef", "selected_mark wins over selected");
      hasAll(t, message, ["config.toml の使われない設定 2 件があります: ", "background(5 行目、bg を使います)", "selected(6 行目、selected_mark を使います)"], "W-B8");
    },
  },
];

// ------------------------------------------------- P5 / P6: [theme] errors (W-B0, W-B1, W-B5)

const p5Tests = [
  {
    id: "AC-1702-i",
    title: 'preset = "dracula" on line 4: nord, W-B0 with the line and the usable values',
    async run(t, ctx) {
      const message = await notice(ctx);
      t.eq(await ctx.m.cssVar("--ui-bg"), "#2e3440", "nord");
      hasAll(t, message, ['config.toml の 4 行目の配色 "dracula" は使えないため、nord を使います(使える値: '], "W-B0");
    },
  },
];
const p6Tests = [
  {
    id: "AC-1702-ii",
    title: "preset = 1 (line 5) and colors = 1 at the top (line 2): nord, W-B1 and W-B5 with their lines, in the order W-B1 then W-B5",
    async run(t, ctx) {
      const message = await notice(ctx);
      t.eq(await ctx.m.cssVar("--ui-bg"), "#2e3440", "nord");
      const b1 = "config.toml の 5 行目の preset は文字列で書いてください。配色は nord を使います。";
      const b5 = "config.toml の 2 行目の colors は [colors] の表で書いてください。配色の色をそのまま使います。";
      hasAll(t, message, [b1, b5], "W-B1 / W-B5");
      t.ok(message.indexOf(b1) < message.indexOf(b5), "W-B1 comes before W-B5 (R-1820)", message);
    },
  },
];

// ------------------------------------------------- F1: size = 16 and a bad family element (AC-1750 (v) / AC-1755 (vii) / AC-1753)

const F1_CONFIG = `${EXT}\n[font]\nfamily = ["Good", "Bad\\u0001"]\nsize = 16\n`;
const f1Tests = [
  {
    id: "AC-1750",
    title: 'size = 16 and family = ["Good", "Bad\\u0001"]: 16px, row 21, "Good" first then the default stack; W-B9 names the dropped one; rows = floor(H / 21) (AC-1753)',
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "font16", 100, { size: true, time: false, hidden: false, tree: true });
      t.eq(await ctx.m.cssVar("--list-row-height"), "21px", "--list-row-height is round(16 x 1.32) = 21px");
      for (const [label, sel] of [["list row", ".file-list-row"], ["tree node", ".tree-node"], ["list heading", ".file-list-frame .pane-title"], ["menu bar heading", ".menubar .heading"], ["PATH label", ".path-label"], ["path input", ".path-bar-row input"], ["status bar", ".status-bar"]]) {
        const s = await ctx.m.cs(sel, ["font-family", "font-size"]);
        t.ok(stackStartsWith(s["font-family"], "Good"), `${label}: "Good" + the default stack`, s["font-family"]);
        t.eq(s["font-size"], "16px", `${label}: 16px`);
      }
      t.eq((await ctx.m.cs(".file-list-row", ["height"])).height, "21px", "list row height 21px");
      t.eq((await ctx.m.cs(".tree-node", ["height"])).height, "21px", "tree node height 21px");
      const { H } = await fitBody(ctx, null, 21 * 20 + 8);
      t.eq((await drawn(ctx)).gridRows, Math.floor(H / 21), `rows = floor(${H} / 21)`);
      t.ok(/config\.toml の 4 行目の \[font\] の family の "Bad.?" は使えないため除きます/.test(message), "W-B9 names the dropped element with its line", message);
      // The viewer keeps its own font (AC-1752).
      const dir = ctx.fx.mkdir("font16-viewer");
      fs.writeFileSync(ctx.fx.at("font16-viewer", "a.txt"), "viewer font line\n");
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "viewer font line" }))) return;
        const fonts = await viewer.ev(`(() => ({ root: getComputedStyle(document.querySelector('.viewer')).fontFamily, size: getComputedStyle(document.querySelector('.viewer-body .code')).fontSize }))()`);
        t.ok(!fonts.root.includes("Good"), "the viewer's font does not take [font]", fonts.root);
        t.eq(fonts.size, "13px", "the viewer's body size is its own (13px)");
      } finally {
        viewer.close();
      }
    },
  },
];

// ------------------------------------------------- F2: Consolas, size = 20 everywhere (AC-1752)

const F2_CONFIG = `${EXT}\n[font]\nfamily = "Consolas"\nsize = 20\n`;
const f2Tests = [
  {
    id: "AC-1752",
    title: 'family = "Consolas", size = 20: the menu bar, dropdown, path bar, status bar, history path, dialog and list/tree all start with "Consolas" at 20px; row height round(20 x 1.32) = 26',
    async run(t, ctx) {
      await openFiles(ctx, "font20", 100, { size: true, time: false, hidden: false, tree: true });
      const same = async (label, sel) => {
        const s = await ctx.m.cs(sel, ["font-family", "font-size"]);
        t.ok(s !== null, `${label} exists`);
        if (s !== null) {
          t.ok(stackStartsWith(s["font-family"], "Consolas"), `${label}: Consolas first, then the default stack`, s["font-family"]);
          t.eq(s["font-size"], "20px", `${label}: 20px`);
        }
      };
      for (const [label, sel] of [["list row", ".file-list-row"], ["tree node", ".tree-node"], ["menu bar heading", ".menubar .heading"], ["PATH label", ".path-label"], ["path input", ".path-bar-row input"], ["status bar", ".status-bar"]]) await same(label, sel);
      t.eq((await ctx.m.cs(".file-list-row", ["height"])).height, "26px", "list row height 26px");
      await ctx.focusList();
      await ctx.press.accessKey("F");
      await ctx.waitFor(`!!document.querySelector('.menubar .dropdown .item')`, { label: "the File menu" });
      await same("dropdown item", ".menubar .dropdown .item");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.menubar .dropdown')`, { label: "the dropdown to close" });
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the history" });
      await same("history path", ".nav-history-list .path");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the history to close" });
      await ctx.focusList();
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the dialog" });
      const dialog = await ctx.ev(`[...document.querySelectorAll('.ui-dialog, .ui-dialog *')].map((e) => { const s = getComputedStyle(e); return s.fontFamily + '|' + s.fontSize; })`);
      t.eq([...new Set(dialog.map((x) => x.split("|")[1]))], ["20px"], "every element of the dialog is 20px");
      t.ok(dialog.every((x) => stackStartsWith(x.split("|")[0], "Consolas")), "every element of the dialog starts with Consolas (title, text, buttons)", dialog[0]);
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });
    },
  },
];

// ------------------------------------------------- F3: bad size and an unusable family (W-B3 / W-B6; AC-1750 (iv) / AC-1755 (vi))

const F3_CONFIG = `${EXT}\n[font]\nfamily = "  "\nsize = "big"\n`;
const f3Tests = [
  {
    id: "AC-1755-vi",
    title: 'family = "  " and size = "big": the default stack and 12px, W-B6 and W-B3 with their lines (W-B6 before W-B3)',
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "font-bad", 10, { size: true, time: false, hidden: false, tree: true });
      const s = await ctx.m.cs(".file-list-row", ["font-family", "font-size", "height"]);
      t.eq([s["font-family"], s["font-size"], s.height], [DEFAULT_FONT_FAMILY, "12px", "16px"], "defaults");
      const b6 = "config.toml の 4 行目の [font] の family を解釈できないため、既定のフォントを使います(文字列か文字列の配列。制御文字は使えません)。";
      hasAll(t, message, [b6, "config.toml の 5 行目の [font] の size を解釈できないため、既定の 12 を使います(10〜24 の整数)。"], "W-B6 / W-B3");
      t.ok(message.indexOf(b6) < message.indexOf("の size を解釈できない"), "W-B6 comes before W-B3 (R-1820)", message);
    },
  },
];

// ------------------------------------------------- F4: a family with CSS metacharacters (AC-1755 (ii))

const F4_CONFIG = `${EXT}\n[font]\nfamily = "X; color: red"\n`;
const f4Tests = [
  {
    id: "AC-1755-ii",
    title: 'family = "X; color: red": one quoted family name in font-family, the row colours are not affected, no notice',
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "font-css", 10, { size: true, time: false, hidden: false, tree: true });
      const s = await ctx.m.cs(".file-list-row", ["font-family"], 3);
      t.ok(s["font-family"].startsWith('"X; color: red", ') && stackStartsWith(norm(s["font-family"]).replace("X; color: red", "X"), "X"), "font-family holds the name as one quoted family, then the default stack", s["font-family"]);
      const colour = await ctx.ev(`getComputedStyle(document.querySelectorAll('.file-list-row')[3]).color`);
      t.eq(colour, RGB.fg, "the row colour is the file colour (nothing was injected)");
      t.eq(message, "", "no startup notice");
    },
  },
];

// ------------------------------------------------- L1 / L2: tree_width_percent = 40 / 10 (AC-1804)

const treeCheck = async (t, ctx, percent) => {
  for (const vw of [1000, 640]) {
    await ctx.setViewport(vw, 700);
    const body = await ctx.m.rect(".app-shell > .body");
    const tree = await ctx.m.rect(".tree-pane");
    const frame = await ctx.m.rect(".file-list-frame");
    t.approx(tree.width, Math.floor((body.width * percent) / 100), `${percent}% at ${vw}: tree pane width = floor(body x ${percent} / 100)`);
    t.approx(frame.left, tree.right + 3, `${percent}% at ${vw}: the list takes the rest (3px gap)`);
    t.approx(frame.right, body.right, `${percent}% at ${vw}: list right = body right`);
  }
};
const l1Tests = [
  {
    id: "AC-1804-40",
    title: "tree_width_percent = 40: the tree pane is 40% of the body (398px at 1000, 254px at 640) and the list gets the rest",
    async run(t, ctx) {
      await openFiles(ctx, "tree40", 30, { size: true, time: false, hidden: false, tree: true });
      await treeCheck(t, ctx, 40);
      t.eq(await notice(ctx), "", "no startup notice");
    },
  },
];
const l2Tests = [
  {
    id: "AC-1804-10",
    title: "tree_width_percent = 10 (the lower limit): the tree pane is 10% of the body at 1000 and 640",
    async run(t, ctx) {
      await openFiles(ctx, "tree10", 30, { size: true, time: false, hidden: false, tree: true });
      await treeCheck(t, ctx, 10);
    },
  },
];

// ------------------------------------------------- L3: bad [layout] values (W-B4) / L4: font and layout not tables (W-B7)

const l3Tests = [
  {
    id: "AC-1802-w-b4",
    title: 'min_col_width = 1000 and tree_width_percent = "x": the defaults (24 / 24%), W-B4 twice with their lines and ranges',
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "layout-bad", 30, { size: true, time: false, hidden: false, tree: true });
      const body = await ctx.m.rect(".app-shell > .body");
      t.approx((await ctx.m.rect(".tree-pane")).width, Math.floor((body.width * 24) / 100), "tree_width_percent fell back to 24");
      hasAll(t, message, ["config.toml の 4 行目の min_col_width を解釈できないため、既定の 24 を使います(10〜80 の整数)。", "config.toml の 5 行目の tree_width_percent を解釈できないため、既定の 24 を使います(10〜50 の整数)。"], "W-B4");
    },
  },
];
const l4Tests = [
  {
    id: "AC-1802-w-b7",
    title: "font = 1 and layout = 1 (not tables): the defaults, W-B7 for font (line 2) and for layout (line 3), font first",
    async run(t, ctx) {
      const message = await notice(ctx);
      await openFiles(ctx, "tables-bad", 10, { size: true, time: false, hidden: false, tree: true });
      t.eq((await ctx.m.cs(".file-list-row", ["font-size"]))["font-size"], "12px", "default font size");
      const f = "config.toml の 2 行目の font は [font] の表で書いてください。既定の値を使います。";
      const l = "config.toml の 3 行目の layout は [layout] の表で書いてください。既定の値を使います。";
      hasAll(t, message, [f, l], "W-B7");
      t.ok(message.indexOf(f) < message.indexOf(l), "font comes before layout (R-1820)", message);
    },
  },
];

// ------------------------------------------------- M: 2 columns (R-1842): AC-1762 / AC-1792 / AC-1793 / AC-1796

/** The R-1842 set-up: 100 files, size shown, H for 20 rows, W / minCol in [2, 3). A failed set-up FAILS the test (nothing is assumed). */
async function setUpTwoColumns(t, ctx, name = "m-100", count = 100) {
  await openFiles(ctx, name, count, { size: true, time: false, hidden: false, tree: true });
  const { W, H } = await fitBody(ctx, null, H20);
  const ch = await chOf(ctx, ".file-list");
  const rowHeight = await rowHeightOf(ctx);
  const X = chooseMinColWidth();
  const ratio = W / minColPx(X, true, false, ch);
  const page = expectedPage({ W, H, rowHeight, ch, count, showSize: true, showTime: false, minColWidth: X, focusIndex: 0 });
  const d = await drawn(ctx);
  const ok = page.rows === 20 && page.cols === 2 && d.gridRows === 20 && d.columns.length === Math.min(2, page.totalCols) && ratio >= 2 && ratio < 3;
  t.ok(ok, `R-1842 set-up: rows 20, cols 2 (W=${W}, H=${H}, ch=${ch.toFixed(3)}, min_col_width ${X}, W / minCol = ${ratio.toFixed(2)})`, JSON.stringify({ page, gridRows: d.gridRows, shown: d.columns.length }));
  return { ok, W, H, ch, rowHeight, X };
}
const moveCursor = async (ctx, idx) => {
  await ctx.focusList();
  for (let i = 0; i < 4; i++) await ctx.press.pageUp(); // up to the 1st entry (the cursor stops there)
  await ctx.settle(60);
  const pages = Math.floor(idx / 20);
  for (let i = 0; i < pages; i++) await ctx.press.pageDown();
  for (let i = 0; i < idx % 20; i++) await ctx.press.down();
  await ctx.settle(100);
};
const cursorLabel = (ctx) => ctx.ev(`document.querySelector('.file-list-row:is(.cursor,.idle)')?.getAttribute('aria-label') ?? ''`);
const labelOf = (index) => `f${String(index + 1).padStart(3, "0")}.txt`;

const mTests = [
  {
    id: "AC-1792",
    title: "1 column x 20 rows, 2 columns shown, 100 entries (5 columns): → from the 1st moves the page 1-2 -> 1-2 -> 3-4 -> 3-4 -> 5; the last page is one column of the whole width",
    async run(t, ctx) {
      const s = await setUpTwoColumns(t, ctx);
      if (!s.ok) return;
      await ctx.focusList();
      const seen = [];
      for (const target of [null, 20, 40, 60, 80]) {
        if (target !== null) {
          await ctx.press.right();
          await ctx.settle(100);
          t.eq(await cursorLabel(ctx), labelOf(target), `→ moves the cursor to the ${target + 1}th entry`);
        }
        const d = await drawn(ctx);
        seen.push(d.columns.map((c) => Number(/\d+/.exec(c.labels[0])[0]) - 1).map((first) => Math.floor(first / 20) + 1));
        if (target === 80) t.eq(d.columns.map((c) => c.width), [s.W], "the last page: the 5th column alone is W wide");
      }
      t.eq(seen, [[1, 2], [1, 2], [3, 4], [3, 4], [5]], "the columns shown after each move: 1-2, 1-2, 3-4, 3-4, 5");
    },
  },
  {
    id: "AC-1762",
    title: "headings of the pages: first page ends ' ▶'; middle page starts '◀ ' and ends ' ▶'; last page starts '◀ ' only; no ◀ / ▶ inside the name cells",
    async run(t, ctx) {
      const s = await setUpTwoColumns(t, ctx);
      if (!s.ok) return;
      const base = "ファイル (100 件) [並び: 名前 昇順]";
      for (const [idx, want] of [[0, `${base} ▶`], [40, `◀ ${base} ▶`], [80, `◀ ${base}`]]) {
        await moveCursor(ctx, idx);
        t.eq(await listHeading(ctx), want, `cursor on the ${idx + 1}th entry: heading`);
        const inNames = await ctx.ev(`[...document.querySelectorAll('.file-list-row .name')].some((e) => /[◀▶]/.test(e.textContent))`);
        t.eq(inNames, false, `cursor on the ${idx + 1}th entry: no ◀ / ▶ in a name cell`);
      }
    },
  },
  {
    id: "AC-1793",
    title: "on a page of 2 columns: a 1px --ui-border line on the right of column 1 only, no line on column 2, no gap between the columns",
    async run(t, ctx) {
      const s = await setUpTwoColumns(t, ctx);
      if (!s.ok) return;
      await moveCursor(ctx, 0);
      const d = await drawn(ctx);
      t.eq(d.columns.length, 2, "two columns");
      t.eq(d.columns[0].seps.every(Boolean), true, "every row of column 1 has the line (class sep)");
      t.eq(d.columns[1].seps.some(Boolean), false, "no row of column 2 has it");
      const widths = await ctx.ev(`(() => { const rows = [...document.querySelectorAll('.file-list-row')]; const f = (r) => { const s = getComputedStyle(r); return [s.borderRightWidth, s.borderRightStyle, s.borderRightColor]; }; return [f(rows[0]), f(rows[20])]; })()`);
      t.eq(widths[0], ["1px", "solid", RGB.border], "column 1: border-right 1px solid --ui-border");
      t.eq(widths[1][0], "0px", "column 2: no border");
      t.approx(d.columns[1].left, d.columns[0].width, "no gap: column 2 starts where column 1 ends");
    },
  },
];

const m45Tests = [
  {
    // SPEC-0300-0023 R-1796 / SPEC-0300-0009 R-60: Shift+arrow extends range selection
    id: "AC-1796-shift",
    title: "Shift+→ from the 30th entry selects the 30th .. 45th (16 entries) (SPEC-0300-0023 R-1796 / AC-1796, SPEC-0300-0009 R-60)",
    async run(t, ctx) {
      const s = await setUpTwoColumns(t, ctx, "m-45", 45);
      if (!s.ok) return;
      const selected = async () => (await ctx.m.statusItems()).find((x) => x.startsWith("選択: "));
      await moveCursor(ctx, 29);
      await ctx.key("ArrowDown", MOD.Shift, "ArrowDown");
      await ctx.settle(150);
      t.note(`reference: after Shift+↓ the status says ${await selected()} (a range of 2 would be 選択: 2)`);
      await moveCursor(ctx, 29);
      await ctx.key("ArrowRight", MOD.Shift, "ArrowRight");
      await ctx.settle(150);
      t.eq(await cursorLabel(ctx), labelOf(44), "Shift+→: the cursor is on the 45th");
      t.eq(await selected(), "選択: 16", "Shift+→ selected the 30th .. 45th (16 entries)");
    },
  },
  {
    id: "AC-1796",
    title: "45 entries, 20 rows, 2 columns: → keeps the row and, when the next column is shorter, goes to its last entry; ← goes to the same row of the previous column",
    async run(t, ctx) {
      const s = await setUpTwoColumns(t, ctx, "m-45", 45);
      if (!s.ok) return;
      const step = async (from, key, want, label, mods = 0) => {
        await moveCursor(ctx, from);
        t.eq(await cursorLabel(ctx), labelOf(from), `${label}: start on the ${from + 1}th`);
        await ctx.key(key, mods, key);
        await ctx.settle(120);
        t.eq(await cursorLabel(ctx), labelOf(want), `${label}: ${key} -> the ${want + 1}th`);
      };
      await step(14, "ArrowRight", 34, "(i) 15th");
      await step(29, "ArrowRight", 44, "(ii) 30th (no 10th row in column 3) goes to the last entry");
      await step(44, "ArrowRight", 44, "(iii) 45th does not move");
      await step(24, "ArrowLeft", 4, "(iv) 25th");
      await step(4, "ArrowLeft", 4, "(v) 5th does not move");
    },
  },
];

export const scenarios = [
  { id: "A1", title: '[theme] preset = "LIGHT"', configToml: `${EXT}\n[theme]\npreset = "LIGHT"\n`, tests: p1Tests },
  { id: "A2", title: 'name = "Solarized_Dark" + [colors] bg = "#F0F0F0"', configToml: P2_CONFIG, tests: p2Tests },
  { id: "A3", title: "[colors] with wrong values", configToml: P3_CONFIG, tests: p3Tests },
  { id: "A4", title: "bg / background, selected / selected_mark", configToml: P4_CONFIG, tests: p4Tests },
  { id: "A5", title: 'preset = "dracula"', configToml: `${EXT}\n[theme]\npreset = "dracula"\n`, tests: p5Tests },
  { id: "A6", title: "preset = 1 and colors = 1", configToml: `${EXT}colors = 1\n\n[theme]\npreset = 1\n`, tests: p6Tests },
  { id: "A7", title: 'size = 16, family = ["Good", "Bad\\u0001"]', configToml: F1_CONFIG, tests: f1Tests },
  { id: "A8", title: 'family = "Consolas", size = 20', configToml: F2_CONFIG, tests: f2Tests },
  { id: "A9", title: 'family = "  ", size = "big"', configToml: F3_CONFIG, tests: f3Tests },
  { id: "A10", title: 'family = "X; color: red"', configToml: F4_CONFIG, tests: f4Tests },
  { id: "A11", title: "tree_width_percent = 40", configToml: `${EXT}\n[layout]\ntree_width_percent = 40\n`, tests: l1Tests },
  { id: "A12", title: "tree_width_percent = 10", configToml: `${EXT}\n[layout]\ntree_width_percent = 10\n`, tests: l2Tests },
  { id: "A13", title: "bad [layout] values", configToml: `${EXT}\n[layout]\nmin_col_width = 1000\ntree_width_percent = "x"\n`, tests: l3Tests },
  { id: "A14", title: "font = 1, layout = 1", configToml: `external_apps = []\nfont = 1\nlayout = 1\n`, tests: l4Tests },
  { id: "A15", title: "min_col_width from the measurement (R-1842)", configToml: () => `${EXT}\n[layout]\nmin_col_width = ${chooseMinColWidth()}\n`, tests: [...mTests, ...m45Tests] },
];
