// SPEC-0300-0017 第5版 Phase 12 (dark theme): the ACs that need a config.toml other than the default
// `ui_theme = "light"` (R-995-1), so each scenario is its own app start (config.toml is read once at startup).
// Design: SPEC-0200-0001 §3.11.9 / §3.11.16 (MUST-124 ... SHOULD-186). run.mjs starts the app per scenario,
// writes `configToml` into the throw-away config folder before the start, runs `tests` and shuts the app down.
//
// What an E2E can NOT show (R-995-2 note 2): that a fixed theme ignores the OS. `Emulation` overrides the fixed
// theme, so the fixed-theme scenarios run WITHOUT emulation and the report says whether the OS was the opposite
// (discriminating) or the same (not discriminating). The real OS switch, the title bar and the first-paint flicker
// are checked by eye (AC-951 / 953 / 953-1 re-open / 954 / 961).

import fs from "node:fs";
import path from "node:path";
import { MOD, sleep } from "../lib/cdp.mjs";
import { fixedThemeNote } from "../lib/os-theme.mjs";
import { openFiles, RGB_DARK, setSort, openViewerWindow, waitViewerShows } from "./_util.mjs";
import { checkViewerPalette, VIEWER_LOOK, VIEWER_PALETTE } from "./viewer.mjs";

const THEME_NOTICE = 'Could not understand ui_theme in config.toml (use "light", "dark" or "system"); following the OS theme.';
const KEYMAP_LINE = 'toggle_time = "Ctrl+Alt+T"\n';
const countOf = (text, part) => (part === "" ? 0 : text.split(part).length - 1);

// ------------------------------------------------------------------ helpers

/** Reload (so the 6 s startup notice is shown again: the DTO is a snapshot, SHOULD-184) and read the status message. */
async function reloadAndReadNotice(ctx) {
  await ctx.reload();
  return await ctx.ev(`document.querySelector('.status-message')?.textContent ?? ""`);
}

const matchesDark = (ctx, target = ctx.cdp) => target.ev(`matchMedia("(prefers-color-scheme: dark)").matches`);
const uiBg = (ctx) => ctx.m.cssVar("--ui-bg");

/** SHOULD-185: with no emulation the page's colour scheme equals the OS's, and the DTO says "system". */
async function checkFollowsOs(t, ctx) {
  const dto = await ctx.configDto();
  t.eq(dto.uiTheme, "system", "DTO uiTheme is system (the app did not pin a theme)");
  const dark = await matchesDark(ctx);
  if (ctx.osTheme) {
    t.eq(dark, ctx.osTheme === "dark", `matchMedia(dark) equals the OS app theme (${ctx.osTheme}; no emulation)`);
  } else {
    t.note("the OS app theme could not be read (AppsUseLightTheme); only the DTO was checked");
  }
  t.eq(await uiBg(ctx), dark ? "#1e1f22" : "#f5f5f5", "--ui-bg matches the colour scheme the page sees");
  return dto;
}

const configFile = (ctx) => path.join(ctx.handle.cfgDir, "config.toml");
function configState(ctx) {
  const file = configFile(ctx);
  if (!fs.existsSync(file)) return null;
  return { bytes: fs.readFileSync(file).toString("hex"), mtimeMs: fs.statSync(file).mtimeMs };
}
/** R-917-6: the app never rewrites config.toml, never leaves a backup/temporary sibling of it. */
function checkConfigUntouched(t, ctx, before, label) {
  const after = configState(ctx);
  t.eq(after, before, `${label}: config.toml bytes and modification time unchanged`);
  const stray = fs.readdirSync(ctx.handle.cfgDir).filter((n) => n.startsWith("config.toml") && n !== "config.toml");
  t.eq(stray, [], `${label}: no backup / temporary file next to config.toml`);
}

const messageCount = (message, part) => countOf(message, part);

/** Ctrl+Alt+T must fire toggle_time (AC-958 / AC-959 key assignment survives). */
async function checkToggleTimeFires(t, ctx) {
  const dir = ctx.fx.files("keymap-check", 10);
  await ctx.nav(dir);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree: false });
  await ctx.focusList();
  await ctx.key("t", MOD.Ctrl | MOD.Alt, "KeyT");
  await ctx.settle(200);
  t.eq((await ctx.viewState()).time, true, "Ctrl+Alt+T fired toggle_time (the time column appeared)");
}

// ---------------------------------------------------------- S1: ui_theme = "dark"

const DARK_VARIABLES = {
  "--ui-bg": "#1e1f22", "--ui-fg": "#e6e6e6", "--ui-surface": "#2b2d31", "--ui-surface-2": "#2b2d31", "--ui-surface-3": "#3a4a63",
  "--ui-border": "#3a3d44", "--ui-border-strong": "#3a3d44", "--ui-border-muted": "#3a3d44", "--ui-muted": "#cfcfcf", "--ui-muted-2": "#999",
  "--ui-hover": "#3a4a63", "--ui-selected": "#3a4a63", "--ui-focused": "#7aa7ff", "--ui-row-head": "#333741", "--ui-link": "#7ab4ff",
  "--ui-error": "#ff8a80", "--ui-backdrop": "rgba(0,0,0,.35)", "--ui-shadow-1": "rgba(0,0,0,.4)", "--ui-shadow-2": "rgba(0,0,0,.45)",
  "--list-row-height": "28px",
};

const S1_CONFIG = '# E2E scenario S1 (AC-960: a comment line must survive untouched)\nui_theme = "dark"   # fixed dark\n';

const s1Tests = [
  {
    id: "AC-948",
    title: "ui_theme = dark: every R-911-1 variable on :root has the dark string; --list-row-height unchanged",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      for (const [name, expected] of Object.entries(DARK_VARIABLES)) t.eq(await ctx.m.cssVar(name), expected, name);
      t.eq((await ctx.configDto()).uiTheme, "dark", "DTO uiTheme");
    },
  },
  {
    id: "AC-906-ii",
    title: "ui_theme = dark (no emulation): body #1e1f22, container color-scheme dark, html normal",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      t.eq(await matchesDark(ctx), true, "prefers-color-scheme: dark matches although nothing is emulated (the app pinned dark)");
      t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], RGB_DARK.bg, "body background");
      t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], "dark", "container color-scheme");
      t.eq((await ctx.m.cs("html", ["color-scheme"]))["color-scheme"], "normal", "html color-scheme");
      const note = fixedThemeNote("dark", ctx.osTheme ?? null);
      if (note !== null) t.note(note);
    },
  },
  {
    id: "AC-949",
    title: "ui_theme = dark: computed styles of the screen, a dialog, the regex error and the context menu use the dark values",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false, tree: true });
      await ctx.focusList();
      await ctx.press.down();
      await ctx.key(" ", 0, "Space");
      await ctx.key(" ", 0, "Space");
      await ctx.press.up(); // focus on the 3rd entry; the 2nd and 3rd are selected
      await ctx.settle();
      const bg = async (sel, i = 0) => (await ctx.m.cs(sel, ["background-color"], i))["background-color"];
      t.eq(await bg("body"), RGB_DARK.bg, "body background");
      t.eq(await bg(".app-shell"), RGB_DARK.bg, "container background");
      t.eq((await ctx.m.cs(".app-shell", ["color", "color-scheme"])), { color: RGB_DARK.fg, "color-scheme": "dark" }, "container text colour / color-scheme");
      for (const sel of [".path-bar-row", ".status-bar", ".tree-panel", ".file-list-frame"]) {
        t.eq(await bg(sel), RGB_DARK.surface, `${sel} background`);
        const b = await ctx.m.cs(sel, ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"]);
        t.eq(Object.values(b), Array(4).fill(RGB_DARK.border), `${sel} border colours`);
      }
      t.eq(await bg(".file-list-row", 2), RGB_DARK.selected, "focused + selected row background");
      t.eq((await ctx.m.outline(".file-list-row", 2)).color, RGB_DARK.focused, "focus row outline colour");
      t.eq((await ctx.m.cs(".file-list-row .size", ["color"], 1)).color, RGB_DARK.muted, "size cell text colour");

      // (i) the delete confirmation dialog
      await ctx.press.del();
      await ctx.waitFor(`!!document.querySelector('.ui-dialog')`, { label: "the delete confirmation" });
      await ctx.settle(150);
      t.eq(await bg(".backdrop"), RGB_DARK.backdrop, "dialog backdrop");
      t.eq(await bg(".ui-dialog"), RGB_DARK.surface, "dialog body background");
      t.eq((await ctx.m.cs(".ui-dialog", ["box-shadow"]))["box-shadow"], "rgba(0, 0, 0, 0.4) 0px 8px 20px 0px", "dialog shadow");
      t.eq((await ctx.m.cs(".ui-dialog button", ["color-scheme"]))["color-scheme"], "dark", "dialog button color-scheme");
      if ((await ctx.m.count(".ui-dialog input[type=checkbox]")) > 0) {
        t.eq((await ctx.m.cs(".ui-dialog input[type=checkbox]", ["color-scheme"]))["color-scheme"], "dark", "dialog checkbox color-scheme");
      }
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ui-dialog')`, { label: "the dialog to close" });

      // (ii) the regex error text
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.clickSel(".search-bar .regex-toggle");
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("[");
      await ctx.waitFor(`!!document.querySelector('.search-bar .search-error')`, { label: "the regex error text" });
      t.eq((await ctx.m.cs(".search-bar .search-error", ["color"])).color, RGB_DARK.error, "regex error colour");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });

      // (iii) the context menu
      await ctx.focusList();
      await ctx.rightClickSel(".app-shell .file-list-row", 3);
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the context menu" });
      await ctx.settle(100);
      const menu = await ctx.m.cs(".ctx-menu", ["border-top-color", "box-shadow"]);
      t.eq(menu["border-top-color"], RGB_DARK.border, "context menu border");
      t.eq(menu["box-shadow"], "rgba(0, 0, 0, 0.45) 0px 8px 20px 0px", "context menu shadow");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ctx-menu')`, { label: "the context menu to close" });

      // dimensions are the light ones (AC-900 / AC-901)
      t.eq(await ctx.m.cssVar("--list-row-height"), "28px", "--list-row-height");
      t.eq((await ctx.m.cs(".file-list-row", ["height"])).height, "28px", "row height");
    },
  },
  {
    id: "AC-907-ii",
    title: "viewer (ui_theme = dark): html/body #1e1e1e, text #ddd, html color-scheme dark, margin 8px, no --ui-* variables; the content is shown",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("viewer-dark");
      fs.writeFileSync(ctx.fx.file("viewer-dark", "note.txt"), "dark viewer line one\nsecond line\n");
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "note.txt", "text", { contains: "dark viewer line one" }))) return;
        const body = await viewer.ev(`document.querySelector('.viewer-body .text-view')?.textContent ?? ''`);
        t.ok(body.includes("dark viewer line one"), "the viewer body shows the file's text", JSON.stringify(body.slice(0, 80)));
        const s = await viewer.ev(VIEWER_LOOK);
        t.eq(s.htmlBg, "rgb(30, 30, 30)", "html background");
        t.eq(s.bodyBg, "rgb(30, 30, 30)", "body background");
        t.eq(s.bodyMargin, "8px", "body margin");
        t.eq(s.overflow, ["visible", "visible", "visible", "visible"], "html / body overflow");
        t.eq(s.htmlScheme, "dark", "html color-scheme (R-913-2)");
        t.eq(s.rootColor, "rgb(221, 221, 221)", "viewer text colour");
        t.eq(s.rootFont, "sans-serif", "viewer root font-family");
        t.eq([s.uiBg, s.rowHeight, s.uiVars], ["", "", []], "the main window's variables are not defined in the viewer");
        t.eq(s.prefersDark, true, "the viewer follows the pinned dark theme without emulation");
        const note = fixedThemeNote("dark", ctx.osTheme ?? null);
        if (note !== null) t.note(note);
      } finally {
        viewer.close();
      }
    },
  },
  {
    id: "AC-955-ii",
    title: "viewer palette (ui_theme = dark): header, truncation banner, error and line numbers use the R-913-1 dark values",
    async run(t, ctx) {
      await checkViewerPalette(t, ctx, VIEWER_PALETTE.dark);
    },
  },
  {
    id: "AC-957-reverse",
    title: "started with ui_theme = dark: removing the line while running changes nothing, even after a page reload (the DTO is a snapshot)",
    async run(t, ctx) {
      await ctx.reload();
      const before = { bg: await uiBg(ctx), dto: await ctx.configDto() };
      t.eq([before.bg, before.dto.uiTheme], ["#1e1f22", "dark"], "dark at the start");
      fs.writeFileSync(configFile(ctx), "# the ui_theme line was removed while the app runs\n", "utf8");
      try {
        await sleep(10000);
        t.eq(await uiBg(ctx), "#1e1f22", "still dark 10 s after the line was removed");
        const notice = await reloadAndReadNotice(ctx);
        t.eq((await ctx.configDto()).uiTheme, "dark", "after a reload the DTO still says dark (config.toml is not read again)");
        t.eq(await uiBg(ctx), "#1e1f22", "after a reload still dark");
        t.eq(notice, "", "no startup notice appears");
      } finally {
        fs.writeFileSync(configFile(ctx), S1_CONFIG, "utf8"); // restore the scenario's file for AC-960
      }
    },
  },
  {
    // MUST be last in S1: it closes the app.
    id: "AC-960",
    title: "ui_theme = dark with comments: after toggles / sort and a normal window close, config.toml is unchanged and ui-state.toml has no theme item",
    async run(t, ctx) {
      const before = configState(ctx);
      t.ok(before !== null && Buffer.from(before.bytes, "hex").toString("utf8") === S1_CONFIG, "config.toml holds the scenario's commented content before the test");
      const dir = await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false, tree: true });
      t.ok(dir.length > 0, "the folder is open");
      await ctx.ensureView({ size: false, time: true, tree: false });
      await setSort(ctx, "size", "desc");

      // The forced kill of shutdown() skips the save at exit: ask the window to close and wait for the process.
      await ctx.settle(1500); // ui-state.toml is saved with a debounce
      await ctx.requestMainWindowClose();
      const exited = await ctx.waitForAppExit(30000);
      t.ok(exited, "the app process ended after the close request");
      if (!exited) return;
      await sleep(500);

      checkConfigUntouched(t, ctx, before, "after the close");
      const uiStatePath = path.join(ctx.handle.cfgDir, "ui-state.toml");
      if (fs.existsSync(uiStatePath)) {
        const text = fs.readFileSync(uiStatePath, "utf8");
        t.ok(!/theme/i.test(text), "ui-state.toml has no theme item", text.slice(0, 200));
      } else {
        t.fail("ui-state.toml was not written at the close (cannot judge the theme item)");
      }
      t.note("AC-960 'OS のテーマの切替' の部分は固定テーマ中の Emulation が固定を上書きするため [目視] (SHOULD-186 / 追補)");
    },
  },
];

// ------------------------------------------------- S2: no config.toml (follow the OS)

const FOLLOW_VIEW = (name, lines) => {
  const l = [];
  for (let i = 1; i <= lines; i++) l.push(`${name} line ${i}`);
  return l.join("\n") + "\n";
};

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const s2Tests = [
  {
    id: "AC-959-i",
    title: "no config.toml: the theme follows the OS (matchMedia = OS, DTO system), no startup notice",
    async run(t, ctx) {
      const notice = await reloadAndReadNotice(ctx);
      t.eq(fs.existsSync(configFile(ctx)), false, "there is no config.toml in this scenario");
      await checkFollowsOs(t, ctx);
      t.eq(notice, "", "no startup notice");
    },
  },
  {
    id: "AC-951",
    title: "no config.toml, OS light then dark (emulated): the screen switches within 1 s with no reload; focus, selection, scroll, rows and the search input stay",
    async run(t, ctx) {
      await openFiles(ctx, "follow-main", 100, { size: true, time: false, hidden: false, tree: true }, { prefix: "report_" });
      await ctx.focusList();
      await ctx.press.down();
      await ctx.key(" ", 0, "Space");
      await ctx.key(" ", 0, "Space");
      await ctx.press.up();
      await ctx.ev(`document.querySelector('.file-list').scrollLeft = 268; true`);
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("rep");
      await ctx.settle(300);
      await ctx.ev(`window.__themeMarker = "kept"; true`);
      const snapshot = () =>
        ctx.ev(`(() => {
          const rows = [...document.querySelectorAll('.app-shell .file-list-row')];
          const input = document.querySelector('.search-bar input');
          return {
            marker: window.__themeMarker ?? null,
            focus: rows.findIndex((r) => r.classList.contains('focused')),
            selected: rows.map((r, i) => (r.getAttribute('aria-selected') === 'true' ? i : -1)).filter((i) => i >= 0),
            rows: rows.length,
            scrollLeft: document.querySelector('.file-list').scrollLeft,
            search: input ? { value: input.value, start: input.selectionStart, end: input.selectionEnd } : null,
          };
        })()`);
      try {
        await ctx.emulateColorScheme("light"); // Given: OS light (made explicit, whatever the PC's OS is)
        await ctx.waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim() === '#f5f5f5'`, { timeout: 3000, label: "light --ui-bg" });
        const given = await snapshot();
        t.eq(given.marker, "kept", "the marker is in the page");
        t.eq(given.search, { value: "rep", start: 3, end: 3 }, "the search input holds rep with the caret at the end");
        t.ok(given.selected.length === 2, "two rows are selected", JSON.stringify(given.selected));

        await ctx.emulateColorScheme("dark");
        const started = Date.now();
        let switched = false;
        while (Date.now() - started < 2000) {
          if ((await ctx.m.cssVar("--ui-bg")) === "#1e1f22") {
            switched = true;
            break;
          }
          await sleep(25);
        }
        const elapsed = Date.now() - started;
        t.ok(switched && elapsed <= 1000, "--ui-bg became #1e1f22 within 1 s", `${switched ? elapsed + " ms" : "never"}`);
        t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], "dark", "container color-scheme dark");
        t.eq(await snapshot(), given, "marker, focus row, selection, scrollLeft, rows and the search input are unchanged in dark (no reload)");

        await ctx.emulateColorScheme("light");
        await ctx.waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim() === '#f5f5f5'`, { timeout: 3000, label: "light --ui-bg again" });
        t.eq(await snapshot(), given, "back in light everything is still unchanged");
        t.note("実際の OS の切替は [目視] (AC-951 後段)");
      } finally {
        await ctx.emulateColorScheme("");
      }
      await ctx.press.escape();
    },
  },
  {
    id: "AC-953",
    title: "viewer (no config.toml): OS light -> dark (emulated on the viewer page) repaints it without a reload; file, scrollTop and N / M stay; a reused window stays dark",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("follow-viewer");
      fs.writeFileSync(ctx.fx.at("follow-viewer", "a-long.txt"), FOLLOW_VIEW("a", 400));
      fs.writeFileSync(ctx.fx.at("follow-viewer", "b-second.txt"), FOLLOW_VIEW("b", 50));
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a-long.txt", "text", { contains: "a line 1" }))) return;
        const state = () =>
          viewer.ev(`(() => ({ marker: window.__themeMarker ?? null, name: document.querySelector('.filename')?.textContent, pos: document.querySelector('.position')?.textContent,
            scrollTop: document.querySelector('.viewer-body').scrollTop }))()`);
        await viewer.ev(`window.__themeMarker = "kept"; document.querySelector('.viewer-body').scrollTop = 150; true`);
        await sleep(200);
        await ctx.emulateColorScheme("light", viewer);
        const look = () => viewer.ev(`(() => { const r = getComputedStyle(document.querySelector('.viewer')); return [getComputedStyle(document.documentElement).backgroundColor, r.color, getComputedStyle(document.documentElement).colorScheme]; })()`);
        for (let i = 0; i < 20 && (await look())[0] !== "rgb(255, 255, 255)"; i++) await sleep(100);
        const given = await state();
        t.ok(given.scrollTop > 0, "the body is scrolled down", String(given.scrollTop));
        t.eq(await look(), ["rgb(255, 255, 255)", "rgb(17, 17, 17)", "light"], "Given: light (emulated)");

        await ctx.emulateColorScheme("dark", viewer);
        for (let i = 0; i < 20 && (await look())[0] !== "rgb(30, 30, 30)"; i++) await sleep(100);
        t.eq(await look(), ["rgb(30, 30, 30)", "rgb(221, 221, 221)", "dark"], "dark: background / text / color-scheme");
        t.eq(await state(), given, "no reload: marker, file name, N / M and scrollTop are unchanged");

        // reuse the same viewer window for another file: it stays dark (same CDP target, so the emulation holds)
        await ctx.focusList();
        await ctx.press.down();
        await ctx.press.enter();
        if (await waitViewerShows(t, viewer, "b-second.txt", "text", { contains: "b line 1" })) {
          t.eq((await look())[0], "rgb(30, 30, 30)", "the reused viewer window is dark");
        }
        t.note("ビューアを閉じて開き直したときのテーマ(AC-953 後段)と実際の OS の切替は [目視]");
      } finally {
        await ctx.emulateColorScheme("", viewer).catch(() => {});
        viewer.close();
      }
    },
  },
  {
    id: "AC-953-1",
    title: "viewer (no config.toml): OS light -> dark leaves the Markdown zoom / HTML-Text mode and the image's 200% display unchanged",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("follow-viewer2");
      fs.writeFileSync(ctx.fx.at("follow-viewer2", "a.md"), "# Title\n\n[a link](http://example.invalid/)\n\n`code`\n\n> quote\n");
      fs.writeFileSync(ctx.fx.at("follow-viewer2", "b.png"), PNG_1X1);
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      const clickButton = (label) =>
        viewer.ev(`(() => { const b = [...document.querySelectorAll('.viewer-header button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
      const state = () =>
        viewer.ev(`(() => ({ marker: window.__themeMarker ?? null, name: document.querySelector('.filename')?.textContent, zoom: document.querySelector('.zoom')?.textContent ?? null,
          pressed: [...document.querySelectorAll('.viewer-header button[aria-pressed]')].map((b) => b.textContent.trim() + ':' + b.getAttribute('aria-pressed')),
          htmlView: !!document.querySelector('.markdown-html'), imgStyle: document.querySelector('.image-view img')?.getAttribute('style') ?? null }))()`);
      const bgNow = () => viewer.ev(`getComputedStyle(document.documentElement).backgroundColor`);
      const toDark = async () => {
        await ctx.emulateColorScheme("light", viewer);
        for (let i = 0; i < 20 && (await bgNow()) !== "rgb(255, 255, 255)"; i++) await sleep(100);
        const given = await state();
        await ctx.emulateColorScheme("dark", viewer);
        for (let i = 0; i < 20 && (await bgNow()) !== "rgb(30, 30, 30)"; i++) await sleep(100);
        return given;
      };
      try {
        if (!(await waitViewerShows(t, viewer, "a.md", "markdown"))) return;
        await viewer.ev(`window.__themeMarker = "kept"; true`);
        t.eq(await clickButton("+"), true, "the zoom + button exists");
        t.eq(await clickButton("+"), true, "zoom + again");
        t.eq(await clickButton("Text"), true, "the Text mode button exists");
        await sleep(300);
        const mdGiven = await toDark();
        t.eq(mdGiven.zoom, "120%", "Markdown zoom is 120% before the change");
        t.eq(mdGiven.htmlView, false, "Markdown is in Text mode before the change");
        t.eq(await bgNow(), "rgb(30, 30, 30)", "Markdown view: dark now");
        t.eq(await state(), mdGiven, "Markdown: zoom, HTML/Text mode and the marker are unchanged");

        await ctx.focusList();
        await ctx.press.down();
        await ctx.press.enter();
        if (!(await waitViewerShows(t, viewer, "b.png", "image"))) return;
        t.eq(await clickButton("200%"), true, "the 200% button exists");
        await sleep(300);
        const imgGiven = await toDark();
        t.eq(imgGiven.zoom, "200%", "image shows 200% before the change");
        t.eq(await bgNow(), "rgb(30, 30, 30)", "image view: dark now");
        t.eq(await state(), imgGiven, "image: the 200% display / transform and the marker are unchanged");
        t.note("実際の OS の切替は [目視]");
      } finally {
        await ctx.emulateColorScheme("", viewer).catch(() => {});
        viewer.close();
      }
    },
  },
  {
    id: "AC-957",
    title: "started without ui_theme: writing ui_theme = dark into config.toml while running changes nothing (also after a reload)",
    async run(t, ctx) {
      const noticeBefore = await reloadAndReadNotice(ctx);
      const bgBefore = await uiBg(ctx);
      const darkBefore = await matchesDark(ctx);
      t.eq((await ctx.configDto()).uiTheme, "system", "DTO says system at the start");
      fs.writeFileSync(configFile(ctx), 'ui_theme = "dark"\n', "utf8"); // written by the harness, not by the app
      try {
        await sleep(10000);
        t.eq(await uiBg(ctx), bgBefore, "the colours did not change within 10 s");
        t.eq(await matchesDark(ctx), darkBefore, "matchMedia did not change");
        const noticeAfter = await reloadAndReadNotice(ctx);
        t.eq((await ctx.configDto()).uiTheme, "system", "after a reload the DTO still says system (config.toml was not read again)");
        t.eq(noticeAfter, noticeBefore, "the startup notice is unchanged");
        t.eq(await uiBg(ctx), bgBefore, "after a reload the colours are unchanged");
        t.note("「再起動するとダークで起動する」は S1(ui_theme = dark で起動するシナリオ)で代える");
      } finally {
        fs.rmSync(configFile(ctx), { force: true }); // back to "no config.toml"
      }
    },
  },
];

// -------------------------------------- S3: ui_theme = "system"

const s3Tests = [
  {
    id: "AC-917-system",
    title: 'ui_theme = "system": same as no key (matchMedia = OS, DTO system, no notice)',
    async run(t, ctx) {
      const notice = await reloadAndReadNotice(ctx);
      await checkFollowsOs(t, ctx);
      t.eq(notice, "", "no startup notice");
    },
  },
];

// ------------------------------------------- S4-S7: invalid ui_theme values + a valid keymap

/** AC-958 for one invalid value: followed OS, one theme notice, the keymap works, config.toml untouched. */
function invalidThemeTest(id, label, { extraKeymapNotice = null } = {}) {
  return {
    id,
    title: `ui_theme ${label}: follows the OS, one "could not understand ui_theme" notice, Ctrl+Alt+T works, config.toml untouched`,
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      const dto = await checkFollowsOs(t, ctx);
      t.eq(dto.uiThemeInvalid, true, "DTO uiThemeInvalid");
      t.eq(messageCount(message, THEME_NOTICE), 1, "the theme notice appears exactly once in the startup message", JSON.stringify(message));
      if (extraKeymapNotice !== null) {
        t.eq(message, `${extraKeymapNotice} ${THEME_NOTICE}`, "the keymap notice and the theme notice are one message, keymap first, joined by one space");
      } else {
        t.eq(message, THEME_NOTICE, "nothing but the theme notice");
      }
      await checkToggleTimeFires(t, ctx);
      checkConfigUntouched(t, ctx, before, "after the start");
    },
  };
}

const keymapBlock = `\n[input_keymap_custom]\n${KEYMAP_LINE}`;

// ---------------------------------------------- S8 / S9: whole-file vs wrong-typed keymap

const s8Tests = [
  {
    id: "AC-959-ii",
    title: "config.toml with a syntax error (and a ui_theme line): follows the OS, one R-45-2 notice that mentions the default theme, no separate theme notice",
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      const dto = await checkFollowsOs(t, ctx);
      t.eq(dto.uiThemeInvalid, false, "no theme notice of its own");
      t.eq(dto.parseError?.wholeFile, true, "DTO parseError.wholeFile");
      t.eq(messageCount(message, "config.toml could not be read"), 1, "the R-45-2 notice appears once", JSON.stringify(message));
      t.ok(message.includes("default theme"), "the notice says the theme falls back too", message);
      t.eq(messageCount(message, "Could not understand ui_theme"), 0, "no separate theme notice");
      checkConfigUntouched(t, ctx, before, "after the start");
    },
  },
];

const s9Tests = [
  {
    id: "AC-959-iii",
    title: 'ui_theme = "dark" with input_keymap_custom = "Ctrl+X" (not a table): dark; default keymap; one R-45-2 notice that does not mention the theme',
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      const dto = await ctx.configDto();
      t.eq([dto.uiTheme, dto.uiThemeInvalid], ["dark", false], "DTO: ui_theme is valid and stays dark");
      t.eq(dto.parseError?.wholeFile, false, "DTO parseError.wholeFile is false");
      t.eq(await matchesDark(ctx), true, "the page is dark (no emulation)");
      t.eq(await uiBg(ctx), "#1e1f22", "--ui-bg dark");
      t.eq(messageCount(message, "config.toml could not be read"), 1, "the R-45-2 notice appears once", JSON.stringify(message));
      t.ok(message.includes("Using the default keymap."), "the notice says the default keymap is used", message);
      t.ok(!/theme/i.test(message), "the notice does not mention the theme", message);
      // default keymap: Ctrl+H toggles hidden files
      const dir = ctx.fx.files("keymap-check2", 5);
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: false });
      await ctx.focusList();
      await ctx.press.toggleHidden();
      await ctx.settle(300);
      t.eq((await ctx.viewState()).hidden, true, "Ctrl+H fired toggle_hidden (the default keymap)");
      checkConfigUntouched(t, ctx, before, "after the start");
      const note = fixedThemeNote("dark", ctx.osTheme ?? null);
      if (note !== null) t.note(note);
    },
  },
];

export const scenarios = [
  { id: "S1", title: "ui_theme = dark", configToml: S1_CONFIG, tests: s1Tests },
  { id: "S2", title: "no config.toml", configToml: null, tests: s2Tests },
  { id: "S3", title: 'ui_theme = "system"', configToml: 'ui_theme = "system"\n', tests: s3Tests },
  { id: "S4", title: 'ui_theme = "Dark" + keymap', configToml: `ui_theme = "Dark"\n${keymapBlock}`, tests: [invalidThemeTest("AC-958-i", '"Dark"')] },
  { id: "S5", title: "ui_theme = 1 + keymap", configToml: `ui_theme = 1\n${keymapBlock}`, tests: [invalidThemeTest("AC-958-ii", "= 1")] },
  { id: "S6", title: "ui_theme = { mode } + keymap", configToml: `ui_theme = { mode = "dark" }\n${keymapBlock}`, tests: [invalidThemeTest("AC-958-iii", "= { mode = \"dark\" } (a table)")] },
  {
    id: "S7",
    title: "invalid ui_theme + unknown keymap action",
    configToml: `ui_theme = "Dark"\n${keymapBlock}no_such_action = "Ctrl+Alt+Z"\n`,
    tests: [invalidThemeTest("AC-958-tail", '"Dark" with an unknown action id', { extraKeymapNotice: "Ignored 1 invalid keymap override(s) in config.toml: no_such_action." })],
  },
  { id: "S8", title: "TOML syntax error", configToml: 'ui_theme = "dark"\nthis is = = not toml\n', tests: s8Tests },
  { id: "S9", title: 'ui_theme = "dark" + input_keymap_custom not a table', configToml: 'ui_theme = "dark"\ninput_keymap_custom = "Ctrl+X"\n', tests: s9Tests },
];

