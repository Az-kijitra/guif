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

export const RGB = {
  bg: "rgb(245, 245, 245)",
  surface: "rgb(255, 255, 255)",
  surface2: "rgb(240, 240, 240)",
  surface3: "rgb(232, 240, 255)",
  border: "rgb(208, 208, 208)",
  borderStrong: "rgb(207, 207, 207)",
  borderMuted: "rgb(238, 238, 238)",
  muted: "rgb(102, 102, 102)",
  hover: "rgb(232, 240, 255)",
  selected: "rgb(219, 233, 255)",
  focused: "rgb(122, 167, 255)",
  error: "rgb(176, 0, 32)",
  backdrop: "rgba(0, 0, 0, 0.35)",
};

export const FRAME_FOCUS = { width: "1px", style: "solid", color: RGB.focused, offset: "-1px" };
export const NO_OUTLINE_STYLE = "none";

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

/** R-911-1 dark values as getComputedStyle prints them (SPEC-0300-0017 AC-949). */
export const RGB_DARK = {
  bg: "rgb(30, 31, 34)",
  fg: "rgb(230, 230, 230)",
  surface: "rgb(43, 45, 49)",
  border: "rgb(58, 61, 68)",
  selected: "rgb(58, 74, 99)",
  hover: "rgb(58, 74, 99)",
  focused: "rgb(122, 167, 255)",
  muted: "rgb(207, 207, 207)",
  error: "rgb(255, 138, 128)",
  backdrop: "rgba(0, 0, 0, 0.35)",
};

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
