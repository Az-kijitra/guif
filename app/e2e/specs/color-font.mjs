// SPEC-0300-0017 §16.2: colours (CSS variables) and fonts (AC-904, AC-906, AC-908).
import { openFiles, RGB } from "./_util.mjs";

// R-911 + R-924 (strings as in the spec; compared trimmed and lower-cased, §16.0).
const VARIABLES = {
  "--ui-bg": "#f5f5f5",
  "--ui-fg": "#111",
  "--ui-surface": "#fff",
  "--ui-surface-2": "#f0f0f0",
  "--ui-surface-3": "#e8f0ff",
  "--ui-border": "#d0d0d0",
  "--ui-border-strong": "#cfcfcf",
  "--ui-border-muted": "#eee",
  "--ui-muted": "#666",
  "--ui-muted-2": "#999",
  "--ui-hover": "#e8f0ff",
  "--ui-selected": "#dbe9ff",
  "--ui-focused": "#7aa7ff",
  "--ui-row-head": "#f0f0f0",
  "--ui-link": "#2a6fdb",
  "--ui-error": "#b00020",
  "--ui-backdrop": "rgba(0,0,0,.35)",
  "--ui-shadow-1": "rgba(0,0,0,.12)",
  "--ui-shadow-2": "rgba(0,0,0,.14)",
  "--list-row-height": "28px",
};

const SEGOE = '"Segoe UI"';
const startsWithFont = (value, first) => typeof value === "string" && value.startsWith(first);

export const tests = [
  {
    id: "AC-904",
    title: "every R-911 variable and --list-row-height is defined on :root with the spec's string",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      for (const [name, expected] of Object.entries(VARIABLES)) {
        t.eq(await ctx.m.cssVar(name), expected, name);
      }
    },
  },
  {
    id: "AC-906",
    title: "OS dark mode: body stays light, the container is color-scheme light, html is normal",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
      try {
        await ctx.settle();
        t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], RGB.bg, "body background in dark mode");
        t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], "light", "container color-scheme");
        t.eq((await ctx.m.cs("html", ["color-scheme"]))["color-scheme"], "normal", "html color-scheme");
      } finally {
        await ctx.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "" }] });
      }
    },
  },
  {
    id: "AC-908",
    title: "fonts: Segoe UI 13px base; monospace for list/tree/path input/history path; sizes per R-922",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: true });
      const f = (sel, i = 0) => ctx.m.cs(sel, ["font-family", "font-size"], i);

      const shell = await f(".app-shell");
      t.ok(startsWithFont(shell["font-family"], SEGOE), "container font-family starts with Segoe UI", shell["font-family"]);
      t.eq(shell["font-size"], "13px", "container font-size");

      const mono = async (label, sel, size, i = 0) => {
        const s = await f(sel, i);
        t.ok(startsWithFont(s["font-family"], "ui-monospace"), `${label} font-family starts with ui-monospace`, s["font-family"]);
        t.eq(s["font-size"], size, `${label} font-size`);
      };
      await mono("list name", ".file-list-row .name-text", "12px");
      await mono("tree node", ".tree-node", "12px");
      await mono("path input", ".path-bar-row input", "12px");
      t.eq((await f(".file-list-row .size"))["font-size"], "11px", "list size cell font-size");
      t.eq((await f(".file-list-row .modified"))["font-size"], "11px", "list time cell font-size");
      t.eq((await f(".status-bar"))["font-size"], "11px", "status bar font-size");
      t.ok(startsWithFont((await f(".status-bar"))["font-family"], SEGOE), "status bar font-family");

      // Sort menu (s).
      await ctx.focusList();
      await ctx.press.sortMenu();
      await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
      t.eq((await f(".sort-menu-item"))["font-size"], "13px", "sort menu item font-size");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });

      // Search bar (/).
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar')`, { label: "the search bar" });
      t.ok(startsWithFont((await f(".search-bar input"))["font-family"], SEGOE), "search input font-family");
      t.ok(startsWithFont((await f(".search-bar button"))["font-family"], SEGOE), "button font-family");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });

      // Visit history (Ctrl+Y): the folders visited so far are listed.
      await ctx.focusList();
      await ctx.press.history();
      await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: "the visit history list" });
      await mono("history path", ".nav-history-list .path", "12px");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the history list to close" });

      // A dialog (Delete asks for confirmation; nothing is deleted: the command is refused anyway).
      await ctx.focusList();
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the delete confirmation dialog" });
      t.ok(startsWithFont((await f(".ui-dialog"))["font-family"], SEGOE), "dialog font-family");
      t.ok(startsWithFont((await f(".ui-dialog button"))["font-family"], SEGOE), "dialog button font-family");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });
    },
  },
];
