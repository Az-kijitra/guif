// One-off measurement tool (NOT part of `npm run e2e`): where does the time go when the viewer opens a 1,000,000
// character file? Starts the real app (same guards as run.mjs: throw-away config folder, E2E file scope), opens a small
// file first so that the viewer window exists, installs timing hooks in that page (fetch of ipc.localhost, Worker,
// MutationObserver, long tasks) WITHOUT touching the app's code, then opens the big file with Enter in the main window
// and prints one timeline (ms after the Enter key). Run: node e2e/perf-viewer.mjs [chars]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cdp, sleep } from "./lib/cdp.mjs";
import { createContext } from "./lib/context.mjs";
import { Fixtures } from "./lib/fixtures.mjs";
import { launchApp, shutdown } from "./lib/launch.mjs";
import { findViewerTarget, openViewerWindow, waitViewerShows } from "./specs/_util.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chars = Number(process.argv[2] ?? 1_000_000);
const log = (m) => console.log(`[perf] ${m}`);

const HOOKS = `(() => {
  if (window.__perf) return true;
  const now = () => performance.timeOrigin + performance.now();
  const ev = (window.__perf = { events: [] });
  const mark = (name, extra) => ev.events.push({ t: now(), name, ...extra });
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    const m = /ipc\\.localhost\\/([^?#]+)/.exec(url);
    if (!m) return origFetch(input, init);
    const cmd = decodeURIComponent(m[1]);
    mark('ipc-start', { cmd });
    const res = await origFetch(input, init);
    mark('ipc-response-headers', { cmd });
    res.clone().arrayBuffer().then((b) => mark('ipc-body-received', { cmd, bytes: b.byteLength }));
    return res;
  };
  const OrigWorker = window.Worker;
  window.Worker = class extends OrigWorker {
    constructor(...a) { super(...a); mark('worker-created'); this.addEventListener('message', (e) => mark('worker-message', { chunks: e.data?.chunks?.length, htmlChars: e.data?.chunks?.reduce((n, c) => n + c.length, 0), error: e.data?.error }));
      this.addEventListener('error', () => mark('worker-error')); }
    postMessage(m, ...r) { mark('worker-post', { chars: m?.code?.length, language: m?.language }); return super.postMessage(m, ...r); }
  };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) ev.events.push({ t: performance.timeOrigin + e.startTime, name: 'longtask', ms: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] });
  let seenGutter = false, seenCode = false, seenColour = false, lastLen = -1;
  new MutationObserver(() => {
    const g = document.querySelector('.viewer-body .gutter');
    const p = document.querySelector('.viewer-body pre.code');
    if (g && !seenGutter && g.textContent.length > 1000) { seenGutter = true; mark('gutter-rendered', { chars: g.textContent.length }); }
    if (p && p.textContent.length !== lastLen && p.textContent.length > 1000) { lastLen = p.textContent.length; if (!seenCode) { seenCode = true; mark('code-text-set', { chars: lastLen }); } }
    if (p && !seenColour && p.querySelector('[class*="hljs-"]')) { seenColour = true; mark('first-colour-element', { chars: p.textContent.length }); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  return true;
})()`;

const fx = new Fixtures();
let handle;
let cdp;
try {
  const line = "const a = 1; // c\n";
  const big = line.repeat(Math.ceil(chars / line.length)).slice(0, chars);
  fx.mkdir("perf");
  fs.writeFileSync(fx.at("perf", "0-small.ts"), "const s = 1;\n");
  fs.writeFileSync(fx.at("perf", "a.ts"), big);
  handle = await launchApp({ appDir, cdpPort: 9340, timeoutMs: 600000, log, fsScope: fx.root, fx });
  cdp = await Cdp.connect(handle.target.webSocketDebuggerUrl);
  const ctx = createContext({ cdp, fx, log });
  ctx.port = 9340;
  ctx.handle = handle;
  await ctx.waitFor(`document.readyState === "complete" && !!document.querySelector('.app-shell')`, { timeout: 120000 });
  await ctx.install();
  await ctx.pageReady();
  await ctx.nav(fx.at("perf"));
  const t = { ok: () => {}, fail: (m) => log(`FAIL ${m}`) };

  // 1) a small file: creates the viewer window
  const viewer = await openViewerWindow(t, ctx, { downs: 0 });
  await waitViewerShows(t, viewer, "0-small.ts", "text");
  await viewer.setViewport(1024, 768);
  await sleep(1500);
  await viewer.ev(HOOKS);
  await cdp.ev(HOOKS);

  // 2) the big file, opened in the SAME window; nothing polls the viewer while it loads except a tiny counter
  await ctx.focusList();
  await ctx.press.down();
  await sleep(300);
  const tEnter = Date.now();
  await cdp.ev(`window.__perf.events.push({ t: performance.timeOrigin + performance.now(), name: 'main-enter-about-to-be-sent' }); true`);
  await ctx.press.enter();
  const deadline = Date.now() + 240000;
  let colouredAt = null;
  while (Date.now() < deadline) {
    await sleep(500);
    const n = await viewer.ev(`window.__perf.events.some((e) => e.name === 'first-colour-element')`).catch(() => false);
    if (n) {
      colouredAt = Date.now();
      break;
    }
  }
  await sleep(1500);
  const viewerEvents = await viewer.ev(`window.__perf.events`);
  const mainEvents = await cdp.ev(`window.__perf.events`);
  const all = [...mainEvents.map((e) => ({ ...e, page: "main" })), ...viewerEvents.map((e) => ({ ...e, page: "viewer" }))].sort((a, b) => a.t - b.t);
  const base = all.find((e) => e.name === "main-enter-about-to-be-sent")?.t ?? tEnter;
  console.log(`\ntimeline (ms after the Enter key; file = ${chars} chars)`);
  for (const e of all) {
    const { t: time, name, page, ...rest } = e;
    if (e.t < base - 50) continue;
    console.log(`${String(Math.round(time - base)).padStart(7)}  ${page.padEnd(6)} ${name} ${Object.keys(rest).length ? JSON.stringify(rest) : ""}`);
  }
  // cost of the test's own wait (waitViewerShows probe: the whole body text over CDP)
  const probeStart = Date.now();
  await viewer.ev(`(() => { const n = (document.querySelector('.viewer-body .code') ?? document.querySelector('.viewer-body'))?.textContent ?? ''; return { text: n, name: document.querySelector('.filename')?.textContent }; })()`);
  console.log(`\none waitViewerShows-style probe (textContent of the body returned over CDP): ${Date.now() - probeStart} ms`);
  const colourProbe = Date.now();
  await viewer.ev(`!!document.querySelector('.viewer-body pre.code [class*="hljs-"]')`);
  console.log(`one waitColoured-style probe (a boolean): ${Date.now() - colourProbe} ms`);
  console.log(`first colour seen by the 500 ms poll: ${colouredAt === null ? "never" : colouredAt - tEnter + " ms after Enter"}`);
  viewer.close();
} finally {
  cdp?.close();
  if (handle) await shutdown(handle, { keep: false });
  fx.dispose();
}
process.exit(0);
