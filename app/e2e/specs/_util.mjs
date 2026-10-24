// Helpers shared by the specs (not a spec file itself: it exports no `tests`).

/** Reload, show `count` files of fixture folder `name`, put the display toggles into `view`. */
export async function openFiles(ctx, name, count, view = {}, fileOptions) {
  const dir = ctx.fx.files(name, count, fileOptions);
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree: true, ...view });
  return dir;
}

export const BORDER_SIDES = ["top", "right", "bottom", "left"];

/** Computed border properties of all four sides, as one comparable object. */
export async function borders(ctx, selector, index = 0) {
  const props = [];
  for (const side of BORDER_SIDES) props.push(`border-${side}-width`, `border-${side}-style`, `border-${side}-color`);
  props.push("border-radius");
  return ctx.m.cs(selector, props, index);
}

/** Expected `borders()` for a 1px solid frame in `color` with no radius. */
export function expectedBorders(color) {
  const out = { "border-radius": "0px" };
  for (const side of BORDER_SIDES) {
    out[`border-${side}-width`] = "1px";
    out[`border-${side}-style`] = "solid";
    out[`border-${side}-color`] = color;
  }
  return out;
}

/**
 * The default preset `nord` (SPEC-0300-0023 R-1708 / R-1722; the E2E measures nord, R-1840) as getComputedStyle prints it. The keys keep the names
 * of the old light table so the specs read the same; the values are the --ui-* variables of Rust `appearance/vars.rs` for nord. The derived
 * ones (muted, muted2, error) are what vars_tests.rs fixes for nord: #b3b7be, #8d929a and #ff8a80.
 */
export const RGB = {
  bg: "rgb(46, 52, 64)", //            --ui-bg = bg #2E3440
  fg: "rgb(236, 239, 244)", //         --ui-fg = file #ECEFF4
  surface: "rgb(46, 52, 64)", //       --ui-surface = bg
  surface2: "rgb(46, 52, 64)", //      --ui-surface-2 = bg
  surface3: "rgb(59, 66, 82)", //      --ui-surface-3 = status_bar_bg #3B4252
  border: "rgb(76, 86, 106)", //       --ui-border = border_inactive #4C566A
  borderStrong: "rgb(141, 146, 154)", // --ui-border-strong (derived)
  borderMuted: "rgb(76, 86, 106)", //  --ui-border-muted = border_inactive
  borderActive: "rgb(136, 192, 208)", // --ui-border-active = border #88C0D0
  muted: "rgb(179, 183, 190)", //      --ui-muted (derived)
  muted2: "rgb(141, 146, 154)", //     --ui-muted-2 (derived)
  hover: "rgb(143, 188, 187)", //      --ui-hover = cursor_bg #8FBCBB
  selected: "rgb(59, 66, 82)", //      --ui-selected = status_bar_bg
  focused: "rgb(136, 192, 208)", //    --ui-focused = border #88C0D0
  error: "rgb(255, 138, 128)", //      --ui-error (derived, dark)
  backdrop: "rgba(0, 0, 0, 0.35)",
  cursorFg: "rgb(46, 52, 64)", //      --ui-cursor-fg #2E3440
  cursorBg: "rgb(143, 188, 187)", //   --ui-cursor-bg #8FBCBB
  folder: "rgb(129, 161, 193)", //     --ui-folder #81A1C1
  executable: "rgb(163, 190, 140)", // --ui-executable #A3BE8C
  selectedFg: "rgb(235, 203, 139)", // --ui-selected-fg #EBCB8B
  statusFg: "rgb(229, 233, 240)", //   --ui-status-fg #E5E9F0
  statusBg: "rgb(59, 66, 82)", //      --ui-status-bg #3B4252
  menuActiveFg: "rgb(46, 52, 64)", //  --ui-menu-active-fg
  menuActiveBg: "rgb(136, 192, 208)", // --ui-menu-active-bg
  treeCurrent: "rgb(136, 192, 208)", // --ui-tree-current
  treeCursor: "rgb(235, 203, 139)", // --ui-tree-cursor
};

/** The 1px frame colour of the focused pane / the focus outline (R-1761 / R-1786): --ui-border-active in nord. */
export const FRAME_FOCUS = { width: "1px", style: "solid", color: RGB.borderActive, offset: "-1px" };
export const NO_OUTLINE_STYLE = "none";

/**
 * SPEC-0300-0023 R-1842 / design §3.18.6 (spike S-3): the width of one `ch` in the font of the element `selector` -- the advance of "0" measured on a
 * canvas with the element's computed `font` (the way the app measures it). `fontSize` etc. come from the element, so the value is the one the app uses.
 */
export const chOf = (ctx, selector = ".file-list") =>
  ctx.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const c = document.createElement("canvas").getContext("2d"); c.font = getComputedStyle(e).font; return c.measureText("0").width; })()`);

/** The row height the list is laid out with (the CSS variable --list-row-height, a "NNpx" string) as a number. */
export const rowHeightOf = async (ctx) => Number.parseFloat(await ctx.m.cssVar("--list-row-height"));

const SORT_LABELS = { name: "名前", size: "サイズ", type: "種類", modified: "更新日時" };
const SORT_STATUS_KEYS = { 名前: "name", サイズ: "size", 種類: "type", 更新日時: "modified" };

/** Current sort as shown by the status bar item `並び替え: {キー} {↑|↓}`. */
export async function currentSort(ctx) {
  const text = (await ctx.m.statusItems()).find((x) => x.startsWith("並び替え: "));
  const match = /^並び替え: (\S+) (↑|↓)$/.exec(text ?? "");
  if (!match) throw new Error(`unexpected sort status item: ${text}`);
  return { key: SORT_STATUS_KEYS[match[1]], order: match[2] === "↑" ? "asc" : "desc" };
}

/** Choose a sort through the sort menu (s, arrows, Enter); selecting the current key toggles its order. */
export async function setSort(ctx, key, order) {
  const choose = async (target) => {
    await ctx.focusList();
    await ctx.press.sortMenu();
    await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
    for (let i = 0; i < 5; i++) {
      const highlighted = await ctx.ev(`document.querySelector('.sort-menu-item.highlighted .label')?.textContent`);
      if (highlighted === SORT_LABELS[target]) break;
      await ctx.press.down();
    }
    await ctx.press.enter();
    await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });
    await ctx.settle(300);
  };
  let now = await currentSort(ctx);
  if (now.key !== key) {
    await choose(key);
    now = await currentSort(ctx);
  }
  if (now.order !== order) await choose(key);
  now = await currentSort(ctx);
  if (now.key !== key || now.order !== order) throw new Error(`could not set the sort to ${key} ${order} (now ${now.key} ${now.order})`);
}

// ------------------------------------------------------------------ viewer helpers
// SPEC-0300-0015 viewer window: a separate page target (/viewer) on the same debug port.

import { Cdp, listTargets, sleep } from "../lib/cdp.mjs";

export async function findViewerTarget(ctx, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const target = (await listTargets(ctx.port)).find((x) => x.type === "page" && x.url.includes("/viewer"));
    if (target !== undefined) return target;
    if (Date.now() > deadline) return undefined;
    await sleep(500);
  }
}

/**
 * Opens the viewer for the list entry `downs` rows below the first (Down x downs, Enter), in the folder the
 * main window shows. A viewer window that is already open is reused by the app. Returns a connected Cdp
 * (the caller closes it) or undefined (a failed check is recorded).
 */
export async function openViewerWindow(t, ctx, { downs = 0 } = {}) {
  await ctx.focusList();
  for (let i = 0; i < downs; i++) await ctx.press.down();
  await ctx.press.enter();
  const target = await findViewerTarget(ctx);
  t.ok(target !== undefined, "the viewer page appears on the debug port");
  if (target === undefined) return undefined;
  const viewer = await Cdp.connect(target.webSocketDebuggerUrl);
  for (let i = 0; i < 80; i++) {
    if (await viewer.ev(`!!document.querySelector('.viewer')`)) break;
    await sleep(250);
  }
  return viewer;
}

const VIEWER_KIND_SELECTOR = {
  text: ".viewer-body .text-view",
  error: ".viewer-body .placeholder.error",
  markdown: ".viewer-body .markdown-html, .viewer-body .text-view",
  image: ".viewer-body .image-stage img",
};

/**
 * Waits until the viewer shows `fileName` AND its body is really rendered (kind: text | error | markdown | image).
 * Guards against the one-off "ファイルが選択されていません" that never filled in (seen once by the orchestrator, not
 * reproduced): when the body is still the placeholder after the timeout a failed check says REPRODUCED.
 */
export async function waitViewerShows(t, viewer, fileName, kind, { timeout = 20000, contains } = {}) {
  const selector = VIEWER_KIND_SELECTOR[kind];
  const probe = `(() => {
    const name = document.querySelector('.viewer .filename')?.textContent ?? null;
    const placeholder = document.querySelector('.viewer-body .placeholder')?.textContent ?? null;
    const pos = document.querySelector('.viewer .position')?.textContent ?? null;
    const text = (document.querySelector('.viewer-body .code') ?? document.querySelector('.viewer-body'))?.textContent ?? '';
    return { text, pos, name, shown: !!document.querySelector(${JSON.stringify(selector)}), placeholder };
  })()`;
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await viewer.ev(probe);
    // the error display clears the file name header (hasFile is false), so only the body is judged there
    // `contains` guards against a viewer window that still shows a same-named file from an earlier folder
    if ((kind === "error" || last.name === fileName) && last.shown && (contains === undefined || last.text.includes(contains))) return true;
    if (Date.now() > deadline) break;
    await sleep(200);
  }
  const stuck = last.placeholder === "ファイルが選択されていません";
  t.fail(
    `${stuck ? "REPRODUCED: the viewer stayed on \"ファイルが選択されていません\" and never showed the content. " : ""}` +
      `expected ${kind} view of ${fileName}, got name=${JSON.stringify(last.name)} placeholder=${JSON.stringify(last.placeholder)} shown=${last.shown} position=${JSON.stringify(last.pos)}${contains === undefined ? "" : ` (wanted text ${JSON.stringify(contains)}, body starts ${JSON.stringify(last.text.slice(0, 40))})`}`,
  );
  return false;
}

/** The default [font] family stack (R-1750) as getComputedStyle prints it. */
export const DEFAULT_FONT_FAMILY = '"JetBrains Mono", "JetBrainsMono NFM", "JetBrainsMono NF", "Cascadia Mono", Consolas, "BIZ UDGothic", monospace';

/** Kept only so theme.mjs loads until it is rewritten (the dark table of ui_theme is gone, SPEC-0300-0023 #2). */

