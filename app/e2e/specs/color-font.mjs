// SPEC-0300-0023 AC-1720 / AC-1721 / AC-1750 / AC-1752 (replaces SPEC-0300-0017 §16.2 AC-904 / AC-906 (i) / AC-908, see the table
// "置き換えた受入基準" of SPEC-0300-0017 第11版 / 第12版). The default preset nord is measured (R-1840). The other presets, [colors], [theme] and [font]
// are in appearance.mjs; AC-906 (ii) / AC-949 are rewritten in theme.mjs.
import { DEFAULT_FONT_FAMILY, openFiles, RGB } from "./_util.mjs";

// R-1722 / R-1724 for nord (strings as Rust `appearance/vars.rs` writes them; compared trimmed and lower-cased, §16.0). The derived ones
// (muted, muted-2, error) are the values fixed for nord by the Rust tests.
export const NORD_VARIABLES = {
  "--ui-bg": "#2e3440",
  "--ui-fg": "#eceff4",
  "--ui-surface": "#2e3440",
  "--ui-surface-2": "#2e3440",
  "--ui-surface-3": "#3b4252",
  "--ui-border": "#4c566a",
  "--ui-border-strong": "#8d929a",
  "--ui-border-muted": "#4c566a",
  "--ui-muted": "#b3b7be",
  "--ui-muted-2": "#8d929a",
  "--ui-hover": "#8fbcbb",
  "--ui-selected": "#3b4252",
  "--ui-focused": "#88c0d0",
  "--ui-row-head": "#3b4252",
  "--ui-link": "#88c0d0",
  "--ui-error": "#ff8a80",
  "--ui-backdrop": "rgba(0,0,0,.35)",
  "--ui-shadow-1": "rgba(0,0,0,.4)",
  "--ui-shadow-2": "rgba(0,0,0,.45)",
  "--ui-border-active": "#88c0d0",
  "--ui-cursor-fg": "#2e3440",
  "--ui-cursor-bg": "#8fbcbb",
  "--ui-folder": "#81a1c1",
  "--ui-executable": "#a3be8c",
  "--ui-selected-fg": "#ebcb8b",
  "--ui-status-fg": "#e5e9f0",
  "--ui-status-bg": "#3b4252",
  "--ui-menu-active-fg": "#2e3440",
  "--ui-menu-active-bg": "#88c0d0",
  "--ui-tree-current": "#88c0d0",
  "--ui-tree-cursor": "#ebcb8b",
  "--ui-color-scheme": "dark",
  // R-1754 (second edition): 12px and a row of round(12 x 1.32) = 16px.
  "--ui-font-size": "12px",
  "--ui-line-height": "16px",
  "--list-row-height": "16px",
};

export const tests = [
  {
    id: "AC-904",
    title: "every --ui-* variable of nord (AC-1720 / AC-1721) and the font variables (12px, row 16px) are defined on :root with the Rust string",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      for (const [name, expected] of Object.entries(NORD_VARIABLES)) {
        t.eq(await ctx.m.cssVar(name), expected, name);
      }
      t.eq((await ctx.m.cssVar("--ui-font")).replaceAll('"', ""), DEFAULT_FONT_FAMILY.toLowerCase().replaceAll('"', ""), "--ui-font is the default stack");
    },
  },
  {
    id: "AC-906",
    title: "nord, no emulation (AC-1721 / AC-1741): body = bg, container color-scheme dark, html normal, whatever the OS theme is",
    async run(t, ctx) {
      // R-1740: the colour scheme comes from the preset (nord = dark) and not from the OS; E2E config.toml has no theme line (R-1840).
      await openFiles(ctx, "many100", 100);
      t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], RGB.bg, "body background");
      t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], "dark", "container color-scheme");
      t.eq((await ctx.m.cs("html", ["color-scheme"]))["color-scheme"], "normal", "html color-scheme");
      t.eq(await ctx.ev(`matchMedia("(prefers-color-scheme: dark)").matches`), true, "the page is dark (nord is dark; the window theme is set from the colour scheme, R-1741)");
      if (ctx.osTheme) t.note(`OS app theme: ${ctx.osTheme}; the colour scheme is nord's either way`);
    },
  },
  {
    id: "AC-908",
    title: "fonts (AC-1750 (i) / AC-1752): every place of the main window has the default [font] stack at 12px; the row is 16px",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: true });
      const f = (sel, i = 0) => ctx.m.cs(sel, ["font-family", "font-size"], i);
      const same = async (label, sel, i = 0) => {
        const s = await f(sel, i);
        t.ok(s !== null, `${label} exists`);
        if (s === null) return;
        t.eq(s["font-family"], DEFAULT_FONT_FAMILY, `${label} font-family`);
        t.eq(s["font-size"], "12px", `${label} font-size`);
      };
      await same("container", ".app-shell");
      await same("menu bar heading", ".menubar .heading");
      await same("PATH label", ".path-label");
      await same("path input", ".path-bar-row input");
      await same("list row", ".file-list-row");
      await same("list name", ".file-list-row .name");
      await same("list size cell", ".file-list-row .size");
      await same("list time cell", ".file-list-row .modified");
      await same("list heading", ".file-list-frame .pane-title");
      await same("tree node", ".tree-node");
      await same("tree heading", ".tree-pane .pane-title");
      await same("status bar", ".status-bar");
      t.eq((await ctx.m.cs(".file-list-row", ["height"]))["height"], "16px", "list row height");
      t.eq((await ctx.m.cs(".tree-node", ["height"]))["height"], "16px", "tree node height");

      // Menu bar dropdown (F10 opens "ファイル").
      await ctx.focusList();
      await ctx.press.accessKey("F");
      await ctx.waitFor(`!!document.querySelector('.menubar .dropdown .item')`, { label: "the File menu" });
      await same("dropdown item", ".menubar .dropdown .item");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.menubar .dropdown')`, { label: "the dropdown to close" });

      // Sort menu (s).
      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      await same("sort menu item", ".sort-menu-item");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });

      // Search bar (/).
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar')`, { label: "the search bar" });
      await same("search input", ".search-bar input");
      await same("search button", ".search-bar button");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });

      // Visit history (Ctrl+Y).
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the visit history list" });
      await same("history path", ".nav-history-list .path");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the history list to close" });

      // A dialog (Delete asks for confirmation; nothing is deleted: the command is refused anyway): every element in it, title and buttons included.
      await ctx.focusList();
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the delete confirmation dialog" });
      const dialog = await ctx.ev(`[...document.querySelectorAll('.ui-dialog, .ui-dialog *')].map((e) => { const s = getComputedStyle(e); return { tag: e.tagName, family: s.fontFamily, size: s.fontSize }; })`);
      t.ok(dialog.length >= 3, "the dialog has a title, a body and buttons", String(dialog.length));
      t.eq([...new Set(dialog.map((x) => x.family))], [DEFAULT_FONT_FAMILY], "every element of the dialog has the default stack");
      t.eq([...new Set(dialog.map((x) => x.size))], ["12px"], "every element of the dialog is 12px");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });
    },
  },
];
