// SPEC-0300-0015 第9版: the viewer's keys, scrolling, image display and the window focus ([CDP] acceptance criteria).
//   AC-500 (arrow / Shift+arrow / Page / Home / End amounts and DIRECTIONS), AC-516 (modifier + arrow does not scroll),
//   AC-517 (the real key sequence on text, Markdown Text, Markdown HTML and a 200% image), AC-518 (the corners of a large /
//   small / wide image are reachable at 100% / 200% / 156.25%, by keys, wheel and scrollTo), AC-519 (drag pan, Ctrl+wheel),
//   AC-481 (zoom buttons / keys / limits), AC-482 (Fit enlarges small images), AC-487 (Fit follows the window size),
//   AC-520 (CDP part: the viewer has the window focus by itself), AC-521 (keys still work after Alt+Right / button clicks).
// The OS-input half of AC-520 is specs/os-input.mjs. Keys go to the viewer page with Input.dispatchKeyEvent.

import fs from "node:fs";
import { MOD, sleep } from "../lib/cdp.mjs";
import { makePng } from "../lib/png.mjs";
import { openViewerWindow, waitViewerShows } from "./_util.mjs";
import {
  activeIsBody, bodyState, clickButton, closeViewerWindow, imageGeometry, mouseClickButton, press, setScroll, showInViewer, zoomText,
} from "./_viewer.mjs";

const BIG = [2000, 1500];
const SMALL = [200, 160]; // enlarged by Fit but below the 800% limit (a 100 x 80 image in a 1000 x 700 area would need 875%: see CAPPED)
const CAPPED = [100, 80];
const WIDE = [3000, 100];
const TINY = [4, 3];

const longLine = (i) => (`L${String(i).padStart(3, "0")} ` + "abcdefghij".repeat(30)).slice(0, 300);
const LONG_TEXT = Array.from({ length: 500 }, (_, i) => longLine(i + 1)).join("\n") + "\n";
const LONG_MARKDOWN = Array.from({ length: 300 }, (_, i) => `Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog.\n`).join("\n");

/** fixture folder with the given files ({ name: string | Buffer }), created once per run */
function fixture(ctx, folder, files) {
  if (ctx.fx.exists(folder)) return;
  ctx.fx.mkdir(folder);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(ctx.fx.at(folder, name), content);
}

const near = (t, actual, expected, label, tol = 1) => t.approx(actual, expected, label, tol);
const percent = (text) => (text === null ? NaN : Number.parseInt(text, 10));

/** Presses the keys of the AC-517 sequence and checks the positions after each step. */
async function checkSequence(t, viewer, label, { horizontal }) {
  await setScroll(viewer, 0, 0);
  await sleep(100);
  const s0 = await bodyState(viewer);
  t.ok(s0.maxTop > 300, `${label}: the body scrolls vertically`, JSON.stringify(s0));
  t.ok(horizontal ? s0.maxLeft > 300 : s0.maxLeft <= 0, `${label}: horizontal scrolling is ${horizontal ? "possible" : "not possible"}`, JSON.stringify(s0));
  for (let i = 0; i < 3; i++) await press(viewer, "ArrowDown");
  near(t, (await bodyState(viewer)).top, 216, `${label}: Down x3 -> 216`);
  for (let i = 0; i < 3; i++) await press(viewer, "ArrowUp");
  near(t, (await bodyState(viewer)).top, 0, `${label}: Up x3 -> 0`);
  for (let i = 0; i < 2; i++) await press(viewer, "ArrowRight");
  near(t, (await bodyState(viewer)).left, horizontal ? 144 : 0, `${label}: Right x2 -> ${horizontal ? 144 : 0}`);
  for (let i = 0; i < 2; i++) await press(viewer, "ArrowLeft");
  near(t, (await bodyState(viewer)).left, 0, `${label}: Left x2 -> 0`);
  await press(viewer, "End");
  let s = await bodyState(viewer);
  near(t, s.top, s.maxTop, `${label}: End -> the bottom`);
  near(t, s.left, 0, `${label}: End -> left 0`);
  await press(viewer, "ArrowUp");
  near(t, (await bodyState(viewer)).top, s.maxTop - 72, `${label}: Up after End -> bottom - 72`);
  await press(viewer, "Home");
  near(t, (await bodyState(viewer)).top, 0, `${label}: Home -> 0`);
  await press(viewer, "ArrowUp");
  near(t, (await bodyState(viewer)).top, 0, `${label}: Up at 0 stays 0 (never negative)`);
}

/** The scroll positions that reach the far end: End + Right keys, mouse wheel, scrollTo. */
async function scrollToEnd(viewer, method) {
  await setScroll(viewer, 0, 0);
  await sleep(100);
  if (method === "keys") {
    await press(viewer, "End");
    for (let i = 0; i < 120; i++) {
      const s = await bodyState(viewer);
      if (s.left >= s.maxLeft - 0.5) break;
      await viewer.key("ArrowRight", MOD.Shift);
      await sleep(20);
    }
  } else if (method === "wheel") {
    const s = await bodyState(viewer);
    const x = s.cw / 2;
    const y = 100 + s.ch / 2;
    for (let i = 0; i < 8; i++) {
      await viewer.wheel(x, y, 0, 6000);
      await viewer.wheel(x, y, 6000, 0);
      await sleep(250);
      const now = await bodyState(viewer);
      if (now.top >= now.maxTop - 0.5 && now.left >= now.maxLeft - 0.5) break;
    }
  } else {
    await setScroll(viewer, 1e7, 1e7);
  }
  await sleep(250);
}

function checkTopLeft(t, g, label) {
  near(t, g.img.top, g.box.top, `${label}: image top = content top`);
  near(t, g.img.left, g.box.left, `${label}: image left = content left`);
}
function checkBottomRight(t, g, label) {
  near(t, g.img.bottom, g.box.bottom, `${label}: image bottom = content bottom`);
  near(t, g.img.right, g.box.right, `${label}: image right = content right`);
}
function checkCentered(t, g, label) {
  near(t, g.img.cx, g.box.cx, `${label}: image centre x = display centre x`);
  near(t, g.img.cy, g.box.cy, `${label}: image centre y = display centre y`);
}

export const tests = [
  {
    id: "AC-500",
    title: "text at (1000, 500): Down / Up / Right / Left = +72 / -72 / +72 / -72, Shift = 240, PageDown / PageUp = +/- the display height; Home / End",
    async run(t, ctx) {
      fixture(ctx, "vk-text", { "a.txt": LONG_TEXT });
      const viewer = await showInViewer(t, ctx, "vk-text", "a.txt", "text", { contains: "L001" });
      if (viewer === undefined) return;
      try {
        await setScroll(viewer, 1000, 500);
        await sleep(100);
        let before = await bodyState(viewer);
        near(t, before.top, 1000, "start top");
        near(t, before.left, 500, "start left");
        const step = async (label, key, mods, axis, delta) => {
          before = await bodyState(viewer);
          await press(viewer, key, mods);
          const after = await bodyState(viewer);
          near(t, after[axis] - before[axis], delta, `${label}: ${axis === "top" ? "vertical" : "horizontal"} change`);
          const other = axis === "top" ? "left" : "top";
          near(t, after[other] - before[other], 0, `${label}: the other axis does not move`);
        };
        await step("Down", "ArrowDown", 0, "top", 72);
        await step("Up", "ArrowUp", 0, "top", -72);
        await step("Right", "ArrowRight", 0, "left", 72);
        await step("Left", "ArrowLeft", 0, "left", -72);
        await step("Shift+Down", "ArrowDown", MOD.Shift, "top", 240);
        await step("Shift+Up", "ArrowUp", MOD.Shift, "top", -240);
        await step("Shift+Right", "ArrowRight", MOD.Shift, "left", 240);
        await step("Shift+Left", "ArrowLeft", MOD.Shift, "left", -240);
        const ch = (await bodyState(viewer)).ch;
        await step("PageDown", "PageDown", 0, "top", ch);
        await step("PageUp", "PageUp", 0, "top", -ch);
        await press(viewer, "End");
        const end = await bodyState(viewer);
        near(t, end.top, end.maxTop, "End: the bottom");
        near(t, end.left, 0, "End: left 0");
        await press(viewer, "Home");
        const home = await bodyState(viewer);
        near(t, home.top, 0, "Home: top 0");
        near(t, home.left, 0, "Home: left 0");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-516",
    title: "Ctrl / Alt / Meta + arrow, Ctrl+Home and Alt+PageDown do not scroll (AC-516 [CDP] side)",
    async run(t, ctx) {
      fixture(ctx, "vk-text", { "a.txt": LONG_TEXT });
      const viewer = await showInViewer(t, ctx, "vk-text", "a.txt", "text", { contains: "L001" });
      if (viewer === undefined) return;
      try {
        await setScroll(viewer, 1000, 500);
        await sleep(100);
        const start = await bodyState(viewer);
        for (const [label, key, mods] of [
          ["Ctrl+Up", "ArrowUp", MOD.Ctrl], ["Ctrl+Right", "ArrowRight", MOD.Ctrl], ["Ctrl+Down", "ArrowDown", MOD.Ctrl], ["Ctrl+Left", "ArrowLeft", MOD.Ctrl],
          ["Alt+Up", "ArrowUp", MOD.Alt], ["Alt+Down", "ArrowDown", MOD.Alt], ["Meta+Left", "ArrowLeft", MOD.Meta],
          ["Ctrl+Home", "Home", MOD.Ctrl], ["Alt+PageDown", "PageDown", MOD.Alt],
        ]) {
          await press(viewer, key, mods);
          const now = await bodyState(viewer);
          t.eq([now.top, now.left], [start.top, start.left], `${label} does not scroll`);
        }
        t.eq(await viewer.ev(`document.querySelector('.viewer .filename')?.textContent`), "a.txt", "still the same file (no navigation happened)");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-517",
    title: "the key sequence moves 216 -> 0 / 144 -> 0 / End / Up / Home / Up on text, Markdown Text, Markdown HTML (vertical only) and a 200% image",
    async run(t, ctx) {
      fixture(ctx, "vk-seq", { "a.txt": LONG_TEXT, "m.md": LONG_TEXT, "long.md": LONG_MARKDOWN, "z.png": makePng(...BIG) });
      // (i) text
      let viewer = await showInViewer(t, ctx, "vk-seq", "a.txt", "text", { contains: "L001" });
      if (viewer === undefined) return;
      try {
        await checkSequence(t, viewer, "(i) text", { horizontal: true });
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
      // (ii) Markdown in Text mode
      viewer = await showInViewer(t, ctx, "vk-seq", "m.md", "markdown");
      if (viewer === undefined) return;
      try {
        t.eq(await clickButton(viewer, "Text"), true, "the Text button exists");
        await sleep(400);
        await checkSequence(t, viewer, "(ii) Markdown Text", { horizontal: true });
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
      // (iii) Markdown in HTML mode
      viewer = await showInViewer(t, ctx, "vk-seq", "long.md", "markdown");
      if (viewer === undefined) return;
      try {
        await checkSequence(t, viewer, "(iii) Markdown HTML", { horizontal: false });
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
      // (iv) 2000 x 1500 PNG at 200%
      viewer = await showInViewer(t, ctx, "vk-seq", "z.png", "image");
      if (viewer === undefined) return;
      try {
        t.eq(await clickButton(viewer, "200%"), true, "the 200% button exists");
        await sleep(400);
        await checkSequence(t, viewer, "(iv) PNG 200%", { horizontal: true });
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-518",
    title: "image corners are reachable: 2000 x 1500 at 100% / 200% / 156.25% (keys, wheel, scrollTo), small image centred and unscrollable, wide image reaches both ends, Fit is centred",
    async run(t, ctx) {
      fixture(ctx, "vk-img", { "1-big.png": makePng(...BIG), "2-small.png": makePng(...SMALL), "3-wide.png": makePng(...WIDE) });
      const viewer = await showInViewer(t, ctx, "vk-img", "1-big.png", "image");
      if (viewer === undefined) return;
      try {
        const fitG = await imageGeometry(viewer);
        checkCentered(t, fitG, "big: Fit");
        for (const [label, setup, scale] of [
          ["100%", async () => clickButton(viewer, "100%"), 1],
          ["200%", async () => clickButton(viewer, "200%"), 2],
          ["156.25% (100% then Ctrl++ x2)", async () => {
            await clickButton(viewer, "100%");
            await sleep(250);
            await press(viewer, "+", MOD.Ctrl);
            await sleep(250);
            await press(viewer, "+", MOD.Ctrl);
            return true;
          }, 1.5625],
        ]) {
          t.eq(await setup(), true, `${label}: the zoom is set`);
          await sleep(500);
          for (const method of ["keys", "wheel", "scrollTo"]) {
            await setScroll(viewer, 0, 0);
            await sleep(200);
            const tl = await imageGeometry(viewer);
            checkTopLeft(t, tl, `big ${label} (${method}) at the top-left`);
            near(t, tl.img.w, BIG[0] * scale, `big ${label}: image width = pixels x scale`);
            near(t, tl.img.h, BIG[1] * scale, `big ${label}: image height = pixels x scale`);
            t.ok(tl.scroll.sw >= BIG[0] * scale - 1 && tl.scroll.sh >= BIG[1] * scale - 1, `big ${label}: the scroll size covers the image`, JSON.stringify(tl.scroll));
            await scrollToEnd(viewer, method);
            checkBottomRight(t, await imageGeometry(viewer), `big ${label} (${method}) at the bottom-right`);
          }
        }
        // small image at 100%: centred, not scrollable
        await press(viewer, "ArrowRight", MOD.Alt);
        if (!(await waitViewerShows(t, viewer, "2-small.png", "image"))) return;
        await clickButton(viewer, "100%");
        await sleep(400);
        let g = await imageGeometry(viewer);
        checkCentered(t, g, "small: 100%");
        t.ok(g.scroll.sw <= g.scroll.cw && g.scroll.sh <= g.scroll.ch, "small: 100% cannot scroll", JSON.stringify(g.scroll));
        near(t, g.img.w, SMALL[0], "small: 100% width");
        await clickButton(viewer, "Fit");
        await sleep(400);
        checkCentered(t, await imageGeometry(viewer), "small: Fit");
        // wide image at 100%: horizontal ends reachable, vertical centred
        await press(viewer, "ArrowRight", MOD.Alt);
        if (!(await waitViewerShows(t, viewer, "3-wide.png", "image"))) return;
        await clickButton(viewer, "100%");
        await sleep(400);
        await setScroll(viewer, 0, 0);
        await sleep(200);
        g = await imageGeometry(viewer);
        near(t, g.img.left, g.box.left, "wide: 100% left end");
        near(t, g.img.cy, g.box.cy, "wide: 100% vertically centred");
        t.ok(g.scroll.sw > g.scroll.cw && g.scroll.sh <= g.scroll.ch, "wide: scrolls horizontally only", JSON.stringify(g.scroll));
        await setScroll(viewer, 0, 1e7);
        await sleep(250);
        g = await imageGeometry(viewer);
        near(t, g.img.right, g.box.right, "wide: 100% right end");
        await clickButton(viewer, "Fit");
        await sleep(400);
        checkCentered(t, await imageGeometry(viewer), "wide: Fit");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-519",
    title: "left-button drag pans the image (200 px up-left -> scroll (200, 200)); Ctrl+wheel zooms to 125% keeping the point under the pointer, without the WebView zoom",
    async run(t, ctx) {
      fixture(ctx, "vk-img", { "1-big.png": makePng(...BIG), "2-small.png": makePng(...SMALL), "3-wide.png": makePng(...WIDE) });
      const viewer = await showInViewer(t, ctx, "vk-img", "1-big.png", "image");
      if (viewer === undefined) return;
      try {
        await clickButton(viewer, "100%");
        await sleep(400);
        await setScroll(viewer, 0, 0);
        await sleep(200);
        const rect = await viewer.ev(`(() => { const r = document.querySelector('.viewer-body').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);
        const x0 = rect.left + 600;
        const y0 = rect.top + 450;
        const send = (type, x, y, extra = {}) => viewer.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
        await send("mouseMoved", x0, y0, { button: "none" });
        await send("mousePressed", x0, y0, { buttons: 1 });
        for (let i = 1; i <= 8; i++) await send("mouseMoved", x0 - 25 * i, y0 - 25 * i, { buttons: 1 });
        await send("mouseReleased", x0 - 200, y0 - 200, { buttons: 0 });
        await sleep(250);
        const s = await bodyState(viewer);
        t.eq([Math.round(s.left), Math.round(s.top)], [200, 200], "the scroll position is (200, 200) after dragging 200 px up-left");
        // Ctrl + wheel
        await setScroll(viewer, 100, 100);
        await sleep(200);
        const before = await imageGeometry(viewer);
        const px = rect.left + 500;
        const py = rect.top + 400;
        const pointX = (px - before.img.left) / 1; // image px under the pointer (scale 1)
        const pointY = (py - before.img.top) / 1;
        await viewer.wheel(px, py, 0, -100, MOD.Ctrl);
        await sleep(500);
        const after = await imageGeometry(viewer);
        t.eq(await zoomText(viewer), "125%", "the zoom is 125% after one step");
        near(t, after.img.left + pointX * 1.25, px, "the image point under the pointer stays (x)");
        near(t, after.img.top + pointY * 1.25, py, "the image point under the pointer stays (y)");
        t.eq(after.dpr, before.dpr, "window.devicePixelRatio is unchanged (no WebView zoom)");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-481",
    title: "image zoom: 100% / 200% / Fit buttons and Ctrl+0 / 2 / 9, Ctrl++ / Ctrl+- steps of 1.25, limits 1% and 800%, the header shows the real percentage",
    async run(t, ctx) {
      fixture(ctx, "vk-img", { "1-big.png": makePng(...BIG), "2-small.png": makePng(...SMALL), "3-wide.png": makePng(...WIDE) });
      const viewer = await showInViewer(t, ctx, "vk-img", "2-small.png", "image");
      if (viewer === undefined) return;
      try {
        const z = async () => {
          await sleep(350);
          return zoomText(viewer);
        };
        await clickButton(viewer, "100%");
        t.eq(await z(), "100%", "100% button");
        await clickButton(viewer, "200%");
        t.eq(await z(), "200%", "200% button");
        await press(viewer, "0", MOD.Ctrl);
        t.eq(await z(), "100%", "Ctrl+0");
        await press(viewer, "2", MOD.Ctrl);
        t.eq(await z(), "200%", "Ctrl+2");
        await press(viewer, "9", MOD.Ctrl);
        const fit = percent(await z());
        const g = await imageGeometry(viewer);
        near(t, fit, Math.min(800, (g.box.w / SMALL[0]) * 100, (g.box.h / SMALL[1]) * 100), "Ctrl+9: Fit", 1);
        await press(viewer, "0", MOD.Ctrl);
        await press(viewer, "+", MOD.Ctrl);
        t.eq(await z(), "125%", "Ctrl++ from 100%");
        await press(viewer, "-", MOD.Ctrl);
        await press(viewer, "-", MOD.Ctrl);
        t.eq(await z(), "80%", "Ctrl+- twice from 125%");
        for (let i = 0; i < 20; i++) await viewer.key("+", MOD.Ctrl);
        t.eq(await z(), "800%", "the upper limit is 800%");
        for (let i = 0; i < 60; i++) await viewer.key("-", MOD.Ctrl);
        t.eq(await z(), "1%", "the lower limit is 1%");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-482",
    title: "Fit: 2000 x 1500 shrinks, 200 x 160 ENLARGES past 100%, 100 x 80 / 4 x 3 stop at 800% (R-481); centred, no scroll bar, the header shows the real percentage; Ctrl+wheel steps from the real Fit scale",
    async run(t, ctx) {
      fixture(ctx, "vk-fit", { "1-big.png": makePng(...BIG), "2-small.png": makePng(...SMALL), "3-capped.png": makePng(...CAPPED), "4-tiny.png": makePng(...TINY) });
      const viewer = await showInViewer(t, ctx, "vk-fit", "1-big.png", "image", { viewport: [1000, 700] });
      if (viewer === undefined) return;
      try {
        const names = ["1-big.png", "2-small.png", "3-capped.png", "4-tiny.png"];
        const natural = [BIG, SMALL, CAPPED, TINY];
        for (let i = 0; i < 4; i++) {
          if (i > 0) {
            await press(viewer, "ArrowRight", MOD.Alt);
            if (!(await waitViewerShows(t, viewer, names[i], "image"))) return;
            await sleep(350);
          }
          const g = await imageGeometry(viewer);
          const [w, h] = natural[i];
          const scale = Math.min(8, Math.max(0.01, Math.min(g.box.w / w, g.box.h / h)));
          const label = `(${["i", "ii", "ii-capped", "iii"][i]}) ${w} x ${h}`;
          t.eq(await clickButton(viewer, "Fit"), true, `${label}: the Fit button exists`);
          await sleep(350);
          const g2 = await imageGeometry(viewer);
          near(t, g2.img.w, w * scale, `${label}: width = pixels x Fit scale`, 1.5);
          near(t, g2.img.h, h * scale, `${label}: height = pixels x Fit scale`, 1.5);
          near(t, percent(await zoomText(viewer)), Math.round(scale * 100), `${label}: header percentage = the real scale`, 1);
          checkCentered(t, g2, label);
          t.ok(g2.scroll.sw <= g2.scroll.cw && g2.scroll.sh <= g2.scroll.ch, `${label}: no scroll bar in the display area`, JSON.stringify(g2.scroll));
          if (i < 2) {
            const fitsOne = Math.abs(g2.img.w - g2.box.w) <= 1.5 || Math.abs(g2.img.h - g2.box.h) <= 1.5;
            t.ok(fitsOne, `${label}: one side equals the display area`, JSON.stringify({ img: [g2.img.w, g2.img.h], box: [g2.box.w, g2.box.h] }));
          } else {
            t.eq(percent(await zoomText(viewer)), 800, `${label}: 800% (the upper limit of R-481)`);
          }
          if (i === 2) t.note("AC-482 の例の 100 x 80 / 1000 x 700 = 875% は R-481 の上限 800% を超える。実装は 800% で止まる(仕様内の不整合。(ii) の確認は 200 x 160 で行った)");
          if (i === 1) {
            // Ctrl + wheel steps by 1.25 from the REAL Fit scale
            const px = g2.box.cx;
            const py = g2.box.cy;
            await viewer.wheel(px, py, 0, -100, MOD.Ctrl);
            await sleep(450);
            near(t, percent(await zoomText(viewer)), Math.round(scale * 1.25 * 100), `${label}: one Ctrl+wheel step = Fit x 1.25`, 2);
          }
        }
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-487",
    title: "Fit follows the window size (1024 x 768 -> 1400 x 1000 -> 800 x 600); 200% and a Ctrl++ value do not; the Fit button re-fits",
    async run(t, ctx) {
      fixture(ctx, "vk-fit", { "1-big.png": makePng(...BIG), "2-small.png": makePng(...SMALL), "3-capped.png": makePng(...CAPPED), "4-tiny.png": makePng(...TINY) });
      const viewer = await showInViewer(t, ctx, "vk-fit", "2-small.png", "image");
      if (viewer === undefined) return;
      try {
        const expectFit = async (label) => {
          await sleep(500);
          const g = await imageGeometry(viewer);
          const scale = Math.min(8, Math.min(g.box.w / SMALL[0], g.box.h / SMALL[1]));
          near(t, g.img.w, SMALL[0] * scale, `${label}: the image is re-fitted`, 1.5);
          near(t, percent(await zoomText(viewer)), Math.round(scale * 100), `${label}: the header percentage follows`, 1);
          return g.img.w;
        };
        const sizes = [await expectFit("1024 x 768")];
        await viewer.setViewport(1400, 1000);
        sizes.push(await expectFit("1400 x 1000"));
        await viewer.setViewport(800, 600);
        sizes.push(await expectFit("800 x 600"));
        t.ok(sizes[1] > sizes[0] && sizes[2] < sizes[0], "the image grew and then shrank with the window", JSON.stringify(sizes));
        // 200% stays
        await viewer.setViewport(1024, 768);
        await clickButton(viewer, "200%");
        await sleep(400);
        await viewer.setViewport(1400, 1000);
        await sleep(500);
        t.eq(await zoomText(viewer), "200%", "200% stays 200% after widening");
        await viewer.setViewport(800, 600);
        await sleep(500);
        t.eq(await zoomText(viewer), "200%", "200% stays 200% after narrowing");
        // Fit then Ctrl++: the value stays
        await viewer.setViewport(1024, 768);
        await clickButton(viewer, "Fit");
        await sleep(400);
        await press(viewer, "+", MOD.Ctrl);
        await sleep(400);
        const stepped = await zoomText(viewer);
        await viewer.setViewport(1400, 1000);
        await sleep(500);
        t.eq(await zoomText(viewer), stepped, "the value after Ctrl++ does not change when the window grows");
        // the Fit button follows the new area
        await clickButton(viewer, "Fit");
        await expectFit("Fit button after the resize");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-520",
    title: "[CDP] the viewer window has the keyboard focus within 1 s of showing, also when an open viewer is reused for another file (the OS-input half is os-input)",
    async run(t, ctx) {
      fixture(ctx, "vk-focus", { "a.txt": LONG_TEXT, "b.txt": LONG_TEXT });
      await ctx.reload();
      await ctx.nav(ctx.fx.at("vk-focus"));
      const viewer = await openViewerWindow(t, ctx, { downs: 0 });
      if (viewer === undefined) return;
      try {
        if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "L001" }))) return;
        const started = Date.now();
        let focused = false;
        while (Date.now() - started < 1000 && !focused) {
          focused = await viewer.ev(`document.hasFocus()`);
          if (!focused) await sleep(50);
        }
        t.ok(focused, "document.hasFocus() is true within 1 s of showing (first open)");
        await press(viewer, "ArrowDown");
        near(t, (await bodyState(viewer)).top, 72, "Down scrolls without a click");
        // reuse: bring the main window to the front, open b.txt there
        await ctx.cdp.send("Page.bringToFront");
        await ctx.settle(300);
        await ctx.focusList();
        await ctx.press.down();
        await ctx.press.enter();
        if (!(await waitViewerShows(t, viewer, "b.txt", "text", { contains: "L001" }))) return;
        const started2 = Date.now();
        let focused2 = false;
        while (Date.now() - started2 < 1000 && !focused2) {
          focused2 = await viewer.ev(`document.hasFocus()`);
          if (!focused2) await sleep(50);
        }
        t.ok(focused2, "document.hasFocus() is true within 1 s of showing (reused window)");
        await setScroll(viewer, 0, 0);
        await sleep(100);
        await press(viewer, "ArrowDown");
        near(t, (await bodyState(viewer)).top, 72, "Down scrolls in the reused window");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-521",
    title: "keys still work after Alt+Right (next file) and after clicking header buttons: Down scrolls 72 px and the body keeps the focus",
    async run(t, ctx) {
      fixture(ctx, "vk-after", { "a.txt": LONG_TEXT, "b.txt": LONG_TEXT, "m.md": LONG_TEXT, "z.png": makePng(...BIG) });
      const viewer = await showInViewer(t, ctx, "vk-after", "a.txt", "text", { contains: "L001" });
      if (viewer === undefined) return;
      try {
        await press(viewer, "ArrowRight", MOD.Alt);
        if (!(await waitViewerShows(t, viewer, "b.txt", "text", { contains: "L001" }))) return;
        await sleep(300);
        await setScroll(viewer, 0, 0);
        await sleep(100);
        await press(viewer, "ArrowDown");
        near(t, (await bodyState(viewer)).top, 72, "after Alt+Right: Down scrolls 72");
        t.eq(await activeIsBody(viewer), true, "the body has the keyboard focus after the navigation");
        await press(viewer, "ArrowRight", MOD.Alt); // m.md
        if (!(await waitViewerShows(t, viewer, "m.md", "markdown"))) return;
        t.eq(await mouseClickButton(viewer, "Text"), true, "the Text button is clicked with the mouse");
        await sleep(500);
        t.eq(await activeIsBody(viewer), true, "the body keeps the focus after clicking Text");
        await setScroll(viewer, 0, 0);
        await sleep(100);
        await press(viewer, "ArrowDown");
        near(t, (await bodyState(viewer)).top, 72, "after clicking Text: Down scrolls 72");
        await press(viewer, "ArrowRight", MOD.Alt); // z.png
        if (!(await waitViewerShows(t, viewer, "z.png", "image"))) return;
        t.eq(await mouseClickButton(viewer, "200%"), true, "the 200% button is clicked with the mouse");
        await sleep(500);
        await setScroll(viewer, 0, 0);
        await sleep(100);
        await press(viewer, "ArrowDown");
        near(t, (await bodyState(viewer)).top, 72, "after clicking 200%: Down scrolls 72");
        t.eq(await mouseClickButton(viewer, "Fit"), true, "the Fit button is clicked with the mouse");
        await sleep(400);
        t.eq(await activeIsBody(viewer), true, "the body keeps the focus after clicking Fit");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
];

