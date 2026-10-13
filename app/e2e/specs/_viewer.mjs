// Helpers shared by the viewer specs of Phase 13 (viewer-keys / viewer-text / viewer-highlight; not a spec file itself).
// The viewer is its own page target (/viewer); keys and mouse events go to it directly with Input.dispatch* (the viewer
// has no file-changing command: Esc / Ctrl+Q only close it).

import { Cdp, listTargets, sleep } from "../lib/cdp.mjs";
import { openViewerWindow, waitViewerShows } from "./_util.mjs";

export const rowNames = (ctx) => ctx.ev(`[...document.querySelectorAll('.app-shell .file-list-row')].map((e) => e.getAttribute('aria-label'))`);

/**
 * Shows fixture folder `folder`, opens `fileName` with Enter in the main window and waits for its body to be rendered
 * (kind: text | markdown | image | error). Returns a connected Cdp for the viewer page (viewport 1024 x 768) or undefined
 * (a failed check was recorded).
 */
export async function showInViewer(t, ctx, folder, fileName, kind, { viewport = [1024, 768], contains, timeout } = {}) {
  await ctx.reload();
  await ctx.nav(ctx.fx.at(folder));
  const names = await rowNames(ctx);
  const downs = names.indexOf(fileName);
  if (downs < 0) {
    t.fail(`${fileName} is not in the list: ${JSON.stringify(names)}`);
    return undefined;
  }
  const viewer = await openViewerWindow(t, ctx, { downs });
  if (viewer === undefined) return undefined;
  if (viewport !== null) await viewer.setViewport(viewport[0], viewport[1]);
  if (!(await waitViewerShows(t, viewer, fileName, kind, { contains, timeout }))) {
    viewer.close();
    return undefined;
  }
  await sleep(150);
  return viewer;
}

/** Esc closes the viewer window; waits until its page is gone from the debug port. */
export async function closeViewerWindow(ctx, viewer) {
  // A viewer that is already gone (a test pressed Esc itself) must not be asked again: a closed page never answers and
  // the request would wait for the CDP timeout (this cost AC-527 two minutes).
  if (!(await listTargets(ctx.port)).some((x) => x.type === "page" && x.url.includes("/viewer"))) {
    viewer.close();
    return true;
  }
  try {
    await viewer.key("Escape");
  } catch {
    /* already closed */
  }
  viewer.close();
  const deadline = Date.now() + 8000;
  for (;;) {
    const gone = !(await listTargets(ctx.port)).some((x) => x.type === "page" && x.url.includes("/viewer"));
    if (gone || Date.now() > deadline) return gone;
    await sleep(150);
  }
}

export const bodyState = (viewer) =>
  viewer.ev(`(() => { const b = document.querySelector('.viewer-body'); return { top: b.scrollTop, left: b.scrollLeft, sh: b.scrollHeight, sw: b.scrollWidth, ch: b.clientHeight, cw: b.clientWidth, maxTop: b.scrollHeight - b.clientHeight, maxLeft: b.scrollWidth - b.clientWidth }; })()`);

export const setScroll = (viewer, top, left) =>
  viewer.ev(`(() => { const b = document.querySelector('.viewer-body'); b.scrollTo({ top: ${top}, left: ${left}, behavior: 'instant' }); return true; })()`);

/** A key to the viewer page and a moment for the scroll / layout to settle. */
export async function press(viewer, key, modifiers = 0, code) {
  await viewer.key(key, modifiers, code);
  await sleep(70);
}

/** Clicks a header button by its text with a DOM click (the focus stays where it is). */
export const clickButton = (viewer, label) =>
  viewer.ev(`(() => { const b = [...document.querySelectorAll('.viewer-header button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);

/** A real mouse click on a header button (the header must not take the keyboard focus, R-500-3). */
export async function mouseClickButton(viewer, label) {
  const c = await viewer.ev(`(() => { const b = [...document.querySelectorAll('.viewer-header button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (c === null) return false;
  await viewer.click(c.x, c.y);
  await sleep(120);
  return true;
}

export const zoomText = (viewer) => viewer.ev(`document.querySelector('.viewer-header .zoom')?.textContent ?? null`);
export const activeIsBody = (viewer) => viewer.ev(`document.activeElement === document.querySelector('.viewer-body')`);

/** Geometry of the displayed image against the body's CONTENT box (border, padding and scroll bars excluded). */
export const imageGeometry = (viewer) =>
  viewer.ev(`(() => {
    const b = document.querySelector('.viewer-body');
    const img = document.querySelector('.viewer-body .image-stage img');
    if (!img) return null;
    const br = b.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const pt = parseFloat(cs.paddingTop), pl = parseFloat(cs.paddingLeft), pb = parseFloat(cs.paddingBottom), pr = parseFloat(cs.paddingRight);
    const top = br.top + b.clientTop + pt;
    const left = br.left + b.clientLeft + pl;
    const bottom = br.top + b.clientTop + b.clientHeight - pb;
    const right = br.left + b.clientLeft + b.clientWidth - pr;
    return {
      img: { top: ir.top, left: ir.left, right: ir.right, bottom: ir.bottom, w: ir.width, h: ir.height, cx: ir.left + ir.width / 2, cy: ir.top + ir.height / 2 },
      box: { top, left, bottom, right, cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top },
      nat: { w: img.naturalWidth, h: img.naturalHeight },
      scroll: { top: b.scrollTop, left: b.scrollLeft, sw: b.scrollWidth, sh: b.scrollHeight, cw: b.clientWidth, ch: b.clientHeight },
      dpr: window.devicePixelRatio,
    };
  })()`);

export { Cdp, sleep };
