// SPEC-0300-0023 (the colour scheme: AC-1741 / AC-1742 / AC-1748 / AC-1749 / AC-1708 / AC-960) -- the scenarios that need a config.toml other than the default
// `external_apps = []` (R-1840), so each is its own app start (config.toml is read once at startup). Replaces the ui_theme scenarios S1 .. S9 of
// SPEC-0300-0017 Phase 12 (the table "置き換えた受入基準" of SPEC-0300-0017 第11版: AC-906 / AC-907 / AC-949 / AC-951 .. AC-961 -> AC-1724 / AC-1740 .. AC-1743 /
// AC-1748 / AC-1749 / AC-1708). The presets, [colors], [font], [layout] and their notices are in appearance.mjs.
//
// What an E2E can NOT show: that the real OS switch changes nothing and the flicker at the first paint (AC-1742 / AC-1743 are checked by eye).
// `Emulation` only changes what the page's media query says, which is exactly what the app must not follow now.

import fs from "node:fs";
import path from "node:path";
import { MOD, sleep } from "../lib/cdp.mjs";
import { readOsAppTheme } from "../lib/os-theme.mjs";
import { openFiles, openViewerWindow, RGB, waitViewerShows } from "./_util.mjs";
import { checkHighlightFollowsOs } from "./viewer-highlight.mjs";
import { VIEWER_LOOK } from "./viewer.mjs";

const countOf = (text, part) => (part === "" ? 0 : text.split(part).length - 1);
const configFile = (ctx) => path.join(ctx.handle.cfgDir, "config.toml");
const uiBg = (ctx) => ctx.m.cssVar("--ui-bg");
const matchesDark = (ctx, target = ctx.cdp) => target.ev(`matchMedia("(prefers-color-scheme: dark)").matches`);

/** Reload (so the startup notice is shown again; the DTO is a snapshot) and read the status message. */
async function reloadAndReadNotice(ctx) {
  await ctx.reload();
  return await ctx.ev(`document.querySelector('.status-message')?.textContent ?? ""`);
}

function configState(ctx) {
  const file = configFile(ctx);
  if (!fs.existsSync(file)) return null;
  return { bytes: fs.readFileSync(file).toString("hex"), mtimeMs: fs.statSync(file).mtimeMs };
}
/** R-917-6: the app never rewrites config.toml, never leaves a backup/temporary sibling of it. */
function checkConfigUntouched(t, ctx, before, label) {
  t.eq(configState(ctx), before, `${label}: config.toml bytes and modification time unchanged`);
  const stray = fs.readdirSync(ctx.handle.cfgDir).filter((n) => n.startsWith("config.toml") && n !== "config.toml");
  t.eq(stray, [], `${label}: no backup / temporary file next to config.toml`);
}

/** Nord is the default and is dark: the page, the colour scheme and the window theme agree whatever the OS says. */
async function checkNord(t, ctx) {
  t.eq(await uiBg(ctx), "#2e3440", "--ui-bg is nord's bg");
  t.eq((await ctx.m.cs("body", ["background-color"]))["background-color"], RGB.bg, "body background");
  t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], "dark", "container color-scheme dark");
}

// ------------------------------------------- S1: the preset opposite to the OS (AC-1741) + AC-960 at the end

const OS = readOsAppTheme(); // read only; null when unreadable
// "the opposite of the OS": OS dark -> light, OS light (or unknown) -> nord.
const OPPOSITE_PRESET = OS === "dark" ? "light" : "nord";
const OPPOSITE_DARK = OPPOSITE_PRESET !== "light";
const S1_CONFIG = `# E2E scenario S1 (AC-960: a comment line must survive untouched)\nexternal_apps = []\n\n[theme]\npreset = "${OPPOSITE_PRESET}"   # the opposite of the OS\n`;

const s1Tests = [
  {
    id: "AC-1741",
    title: "a preset whose brightness is the opposite of the OS's (OS dark -> light, OS light -> nord): the main window and the viewer's computed color-scheme follow the preset, not the OS",
    async run(t, ctx) {
      await openFiles(ctx, "opp-main", 20, { size: true, time: false, hidden: false, tree: true });
      t.note(`OS app theme: ${OS ?? "unknown"}; preset: ${OPPOSITE_PRESET}`);
      const scheme = OPPOSITE_DARK ? "dark" : "light";
      t.eq((await ctx.m.cs(".app-shell", ["color-scheme"]))["color-scheme"], scheme, `main: container color-scheme is ${scheme}`);
      t.eq(await ctx.m.cssVar("--ui-color-scheme"), scheme, `main: --ui-color-scheme is ${scheme}`);
      t.eq(await matchesDark(ctx), OPPOSITE_DARK, "main: the window theme (matchMedia) follows the preset");
      if (OS !== null) t.ok(OPPOSITE_DARK !== (OS === "dark"), "this run is discriminating: the preset is the opposite of the OS");
      const dir = ctx.fx.mkdir("opp-viewer");
      fs.writeFileSync(ctx.fx.at("opp-viewer", "a.txt"), "opposite line one\n");
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "opposite line one" }))) return;
        const s = await viewer.ev(VIEWER_LOOK);
        t.eq(s.htmlScheme, scheme, `viewer: html color-scheme is ${scheme}`);
        t.eq(s.prefersDark, OPPOSITE_DARK, "viewer: matchMedia follows the preset");
        t.eq(s.uiVars, [], "viewer: no --ui-* variable");
        t.eq(s.htmlBg, OPPOSITE_DARK ? "rgb(46, 52, 64)" : "rgb(245, 245, 245)", "viewer: html background is the preset's bg");
      } finally {
        viewer.close();
      }
    },
  },
  {
    // MUST be last in S1: it closes the app.
    id: "AC-960",
    title: "a [theme] with comments: after toggles / sort and a normal window close, config.toml is unchanged and ui-state.toml has no theme / colour item",
    async run(t, ctx) {
      const before = configState(ctx);
      t.ok(before !== null && Buffer.from(before.bytes, "hex").toString("utf8") === S1_CONFIG, "config.toml holds the scenario's commented content before the test");
      const dir = await openFiles(ctx, "many100", 100, { size: true, time: false, hidden: false, tree: true });
      t.ok(dir.length > 0, "the folder is open");
      await ctx.ensureView({ size: false, time: true, tree: false });
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
        t.ok(!/theme|preset|colors/i.test(text), "ui-state.toml has no theme item", text.slice(0, 200));
      } else {
        t.fail("ui-state.toml was not written at the close (cannot judge the theme item)");
      }
      t.note("AC-1742 の「OS のテーマの切替」の実機の部分は [目視]");
    },
  },
];

// ------------------------------------------------- S2: no appearance keys (AC-1742 / AC-1749)

const s2Tests = [
  {
    id: "AC-1742",
    title: "nord, OS light then dark (emulated): nothing changes -- no reload, no colour change; focus, selection, rows and the search input stay (main) and the viewer's colours stay (viewer, code colours)",
    async run(t, ctx) {
      await openFiles(ctx, "follow-main", 100, { size: true, time: false, hidden: false, tree: true }, { prefix: "report_" });
      await ctx.focusList();
      await ctx.press.down();
      await ctx.key(" ", 0, "Space");
      await ctx.key(" ", 0, "Space");
      await ctx.press.up();
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
            cursor: rows.findIndex((r) => r.classList.contains('cursor') || r.classList.contains('idle')),
            selected: rows.map((r, i) => (r.getAttribute('aria-selected') === 'true' ? i : -1)).filter((i) => i >= 0),
            rows: rows.length,
            bg: getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(),
            scheme: getComputedStyle(document.querySelector('.app-shell')).colorScheme,
            search: input ? { value: input.value, start: input.selectionStart, end: input.selectionEnd } : null,
          };
        })()`);
      try {
        const given = await snapshot();
        t.eq(given.bg, "#2e3440", "Given: nord");
        t.eq(given.search, { value: "rep", start: 3, end: 3 }, "the search input holds rep with the caret at the end");
        t.ok(given.selected.length === 2, "two rows are selected", JSON.stringify(given.selected));
        for (const scheme of ["light", "dark", "light"]) {
          await ctx.emulateColorScheme(scheme);
          await sleep(1200);
          t.eq(await snapshot(), given, `OS emulated ${scheme}: marker, cursor, selection, rows, colours and the search input are unchanged (no reload, no recolour)`);
        }
        t.note("実際の OS の切替・ちらつきは [目視] (AC-1742 / AC-1743)");
      } finally {
        await ctx.emulateColorScheme("");
      }
      await ctx.press.escape();
    },
  },
  {
    id: "AC-1742-viewer",
    title: "viewer, nord: OS light -> dark (emulated on the viewer page) changes neither the page colours nor the code colours, and nothing reloads",
    async run(t, ctx) {
      const dir = ctx.fx.mkdir("follow-viewer");
      fs.writeFileSync(ctx.fx.at("follow-viewer", "a-long.txt"), Array.from({ length: 400 }, (_, i) => `a line ${i + 1}`).join("\n") + "\n");
      await ctx.reload();
      await ctx.nav(dir);
      const viewer = await openViewerWindow(t, ctx);
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a-long.txt", "text", { contains: "a line 1" }))) return;
        await viewer.ev(`window.__themeMarker = "kept"; document.querySelector('.viewer-body').scrollTop = 150; true`);
        await sleep(200);
        const look = () => viewer.ev(`(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.querySelector('.viewer')).color, getComputedStyle(document.documentElement).colorScheme, window.__themeMarker ?? null, document.querySelector('.viewer-body').scrollTop])()`);
        const given = await look();
        t.eq(given.slice(0, 3), ["rgb(46, 52, 64)", "rgb(236, 239, 244)", "dark"], "Given: nord (background / text / color-scheme)");
        for (const scheme of ["light", "dark"]) {
          await ctx.emulateColorScheme(scheme, viewer);
          await sleep(600);
          t.eq(await look(), given, `OS emulated ${scheme}: background, text, color-scheme, marker and scrollTop are unchanged`);
        }
      } finally {
        await ctx.emulateColorScheme("", viewer).catch(() => {});
        viewer.close();
      }
      await checkHighlightFollowsOs(t, ctx);
    },
  },
  {
    id: "AC-1749",
    title: "started with the default: writing [theme] preset = light into config.toml while running changes nothing (also after a reload; config.toml is read at the start only)",
    async run(t, ctx) {
      const noticeBefore = await reloadAndReadNotice(ctx);
      const bgBefore = await uiBg(ctx);
      t.eq(bgBefore, "#2e3440", "nord at the start");
      fs.writeFileSync(configFile(ctx), 'external_apps = []\n\n[theme]\npreset = "light"\n', "utf8"); // written by the harness, not by the app
      try {
        await sleep(8000);
        t.eq(await uiBg(ctx), bgBefore, "the colours did not change within 8 s");
        const noticeAfter = await reloadAndReadNotice(ctx);
        t.eq(noticeAfter, noticeBefore, "the startup notice is unchanged after a reload");
        t.eq(await uiBg(ctx), bgBefore, "after a reload the colours are unchanged (the start's snapshot)");
      } finally {
        fs.writeFileSync(configFile(ctx), "external_apps = []\n", "utf8"); // back to the scenario's file
      }
    },
  },
];

// ------------------------------------------- S3: ui_theme is an unknown key now (AC-1748)

const S3_CONFIG = 'external_apps = []\nui_theme = "light"\n';
const s3Tests = [
  {
    id: "AC-1748",
    title: 'ui_theme = "light" on line 2 (no [theme]): nord; W-AC lists ui_theme(2 行目) and the old W-33 sentence is gone; config.toml untouched',
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      await checkNord(t, ctx);
      t.eq(message, "config.toml の不明な設定 1 件を無視しました: ui_theme(2 行目)。", "W-AC with the line of ui_theme");
      t.eq(countOf(message, "ui_theme を解釈できない"), 0, "no W-33 sentence");
      t.eq(countOf(message, "OS のテーマ設定に従います"), 0, "nothing says the theme follows the OS");
      checkConfigUntouched(t, ctx, before, "after the start");
    },
  },
];

// ---------------------------------------------- S8 / S9: whole-file vs wrong-typed keymap

const s8Tests = [
  {
    id: "AC-1708",
    title: "config.toml with a syntax error on line 2: nord and the defaults, one W-31 that says 配色(nord), no separate notice for colours / fonts, config.toml untouched",
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      await checkNord(t, ctx);
      t.ok(
        message.startsWith("config.toml の 2 行目を読み込めなかったため、既定のキー割り当て、配色(nord)、外部アプリの既定の登録を使います。 詳細: "),
        "W-31 with its line 2 and the closing sentence naming 配色(nord)",
        JSON.stringify(message),
      );
      for (const item of ["[colors]", "[font]", "[layout]", "使われない設定", "不明な設定"]) t.eq(countOf(message, item), 0, `no separate item in the notice: ${item}`);
      t.eq((await ctx.m.cs(".app-shell", ["font-size"]))["font-size"], "12px", "the default font size (12px)");
      const tree = await ctx.m.rect(".tree-pane");
      const body = await ctx.m.rect(".app-shell > .body");
      t.approx(tree.width, Math.floor((body.width * 24) / 100), "tree_width_percent 24 (the default)");
      t.eq((await ctx.externalAppsDto()).apps.length, 4, "the default four external apps (nothing was started: no key or menu was used here)");
      checkConfigUntouched(t, ctx, before, "after the start");
    },
  },
];

const s9Tests = [
  {
    id: "AC-959-iii",
    title: "input_keymap_custom = \"Ctrl+X\" (not a table) on line 3: nord; default keymap; one W-30-2 notice with its line that does not mention the colours",
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      await checkNord(t, ctx);
      t.eq(message, "config.toml の 3 行目の input_keymap_custom を解釈できないため、既定のキー割り当てを使います。", "the notice is exactly the W-30-2 sentence (with its line)", message);
      const dir = ctx.fx.files("keymap-check2", 5);
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: false });
      await ctx.focusList();
      await ctx.press.toggleHidden();
      await ctx.settle(300);
      t.eq((await ctx.viewState()).hidden, true, "Ctrl+H fired toggle_hidden (the default keymap)");
      checkConfigUntouched(t, ctx, before, "after the start");
    },
  },
];

// ------------------------------------------- S4 .. S7: ui_theme in other shapes + a valid keymap (AC-1748 with a keymap notice)

const KEYMAP_LINE = 'toggle_time = "Ctrl+Alt+T"\n';
const keymapBlock = `
[input_keymap_custom]
${KEYMAP_LINE}`;
const W_AC_THEME = "config.toml の不明な設定 1 件を無視しました: ui_theme(2 行目)。";

/** One ui_theme shape: it is an unknown key whatever its value (nord, W-AC with line 2), and the valid keymap still works. */
function unknownThemeTest(id, label, { extraKeymapNotice = null } = {}) {
  return {
    id,
    title: `ui_theme ${label} (an unknown key now): nord, W-AC names ui_theme(2 行目), Ctrl+Alt+T works, config.toml untouched`,
    async run(t, ctx) {
      const before = configState(ctx);
      const message = await reloadAndReadNotice(ctx);
      await checkNord(t, ctx);
      t.eq(countOf(message, W_AC_THEME), 1, "W-AC for ui_theme appears exactly once", JSON.stringify(message));
      t.eq(message, extraKeymapNotice === null ? W_AC_THEME : `${extraKeymapNotice} ${W_AC_THEME}`, "the whole notice (the keymap notice first, W-AC last)");
      const dir = ctx.fx.files("keymap-check", 10);
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: false });
      await ctx.focusList();
      await ctx.key("t", MOD.Ctrl | MOD.Alt, "KeyT");
      await ctx.settle(200);
      t.eq((await ctx.viewState()).time, true, "Ctrl+Alt+T fired toggle_time (the time column appeared)");
      checkConfigUntouched(t, ctx, before, "after the start");
    },
  };
}

export const scenarios = [
  { id: "S1", title: `[theme] preset = ${OPPOSITE_PRESET} (the opposite of the OS: ${OS ?? "unknown"})`, configToml: S1_CONFIG, tests: s1Tests },
  { id: "S2", title: "no appearance keys (external_apps only)", configToml: "external_apps = []\n", tests: s2Tests },
  { id: "S3", title: "ui_theme (an unknown key now) on line 2", configToml: S3_CONFIG, tests: s3Tests },
  { id: "S4", title: 'ui_theme = "Dark" + keymap', configToml: `external_apps = []
ui_theme = "Dark"
${keymapBlock}`, tests: [unknownThemeTest("AC-1748-i", '= "Dark"')] },
  { id: "S5", title: "ui_theme = 1 + keymap", configToml: `external_apps = []
ui_theme = 1
${keymapBlock}`, tests: [unknownThemeTest("AC-1748-ii", "= 1")] },
  { id: "S6", title: "ui_theme = { mode } + keymap", configToml: `external_apps = []
ui_theme = { mode = "dark" }
${keymapBlock}`, tests: [unknownThemeTest("AC-1748-iii", '= { mode = "dark" } (a table)')] },
  {
    id: "S7",
    title: "ui_theme + unknown keymap action",
    configToml: `external_apps = []
ui_theme = "Dark"
${keymapBlock}no_such_action = "Ctrl+Alt+Z"
`,
    tests: [unknownThemeTest("AC-1748-iv", "with an unknown keymap action", { extraKeymapNotice: "config.toml の不正なキー割り当て 1 件を無視しました: no_such_action(6 行目)。" })],
  },
  { id: "S8", title: "TOML syntax error", configToml: "# E2E: a syntax error on line 2\nthis is = = not toml\n", allowUndeclaredExternalApps: true, tests: s8Tests },
  { id: "S9", title: "input_keymap_custom not a table", configToml: '# E2E\nexternal_apps = []\ninput_keymap_custom = "Ctrl+X"\n', tests: s9Tests },
];
