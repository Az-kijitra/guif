// The per-run context handed to every spec: CDP access, measurement helpers, fixtures, and
// the guarded input helpers. Every key/mouse input goes through here so the safety rules
// (SPEC-0200-0001 §3.8.17 SHOULD-152) are enforced in one place:
//   * file-changing commands are replaced by a rejecting stub in the page (after every load);
//   * keys are only sent while the app shows a folder inside the fixture root
//     (or while the path bar is being edited, which cannot change files).

import fs from "node:fs";
import path from "node:path";
import { MOD, sleep } from "./cdp.mjs";
import { measureApi, PAGE_HELPERS } from "./measure.mjs";
import { AbortRun } from "./launch.mjs";

// Commands that change files, open other programs, or write archives: always refused.
const BLOCKED_COMMANDS = [
  "fs_ops_copy", "fs_ops_move", "fs_ops_delete_trash", "fs_ops_delete_permanently", "fs_ops_rename", "fs_ops_create",
  "archive_create", "archive_extract", "viewer_os_open_path",
];

// `window.__TAURI_INTERNALS__.invoke` (and `.ipc` / `.postMessage`) are read-only in the page, so
// the IPC is intercepted one level lower: Tauri's custom-protocol IPC is a global `fetch` to
// `http://ipc.localhost/<command>` (SPEC-0200-0001 §3.8.17 SHOULD-151's alternative route, done
// in the page instead of with Fetch.enable). A stub is `async (args, passThrough, cmd) => ...`:
// return a Response (e.g. `passThrough()`) to hand it on, `{ error: <value> }` to reject the
// command, or any other value to answer successfully.
const STUB_RUNTIME = String.raw`(() => {
  if (window.__e2e) return "ok";
  const origFetch = window.fetch.bind(window);
  const state = { stubs: {}, calls: [] };
  const answer = (value, ok) =>
    new Response(JSON.stringify(value === undefined ? null : value), {
      status: 200,
      headers: { "Content-Type": "application/json", "Tauri-Response": ok ? "ok" : "error" },
    });
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const match = /^(?:https?:\/\/ipc\.localhost|ipc:\/\/localhost)\/([^?#]+)/.exec(url);
    if (!match) return origFetch(input, init);
    const cmd = decodeURIComponent(match[1]);
    state.calls.push(cmd);
    const stub = state.stubs[cmd];
    if (!stub) return origFetch(input, init);
    let args = {};
    try {
      const body = init && init.body;
      args = JSON.parse(typeof body === "string" ? body : new TextDecoder().decode(body));
    } catch {}
    const result = await stub(args, () => origFetch(input, init), cmd);
    if (result instanceof Response) return result;
    if (result !== null && typeof result === "object" && "error" in result) return answer(result.error, false);
    return answer(result, true);
  };
  window.__e2e = state;
  return "ok";
})()`;

export function createContext({ cdp, fx, shotsDir, log }) {
  const m = measureApi(cdp);
  const ctx = {
    cdp,
    m,
    fx,
    log,
    /** When set, the app shows stubbed (fake) paths and no real file system is touched. */
    fakeFs: false,
    stubStatus: "unknown",
    ev: (expr) => cdp.ev(expr),
  };

  ctx.shot = async (name) => {
    if (!shotsDir) return undefined;
    fs.mkdirSync(shotsDir, { recursive: true });
    const file = path.join(shotsDir, `${name}.png`);
    fs.writeFileSync(file, await cdp.screenshot());
    return file;
  };

  ctx.waitFor = async (expression, { timeout = 15000, label = expression, interval = 100 } = {}) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await cdp.ev(expression);
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
      await sleep(interval);
    }
  };

  /** Next animation frames (layout and effects settled). */
  ctx.frames = (n = 2) =>
    cdp.ev(`new Promise((resolve) => { let i = 0; const step = () => (++i >= ${n} ? resolve(true) : requestAnimationFrame(step)); requestAnimationFrame(step); })`);

  ctx.settle = async (ms = 120) => {
    await sleep(ms);
    await ctx.frames(2);
  };

  // ------------------------------------------------------------- page state

  ctx.install = async () => {
    await cdp.ev(PAGE_HELPERS);
    ctx.stubStatus = await cdp.ev(STUB_RUNTIME);
    if (ctx.stubStatus !== "ok") throw new AbortRun(`the IPC cannot be intercepted (${ctx.stubStatus}); refusing to run without the safety stubs`);
    for (const cmd of BLOCKED_COMMANDS) {
      await cdp.ev(`window.__e2e.stubs[${JSON.stringify(cmd)}] = () => ({ error: { code: "other", message: "E2E: blocked command" } }); true`);
    }
    // Prove the interception works: a blocked command must be refused with our marker message.
    const probe = await cdp.ev(`window.__TAURI_INTERNALS__.invoke("fs_ops_create", {}).then(() => "accepted", (e) => JSON.stringify(e))`);
    if (typeof probe !== "string" || !probe.includes("E2E: blocked command")) {
      throw new AbortRun(`the blocked-command stub is not effective (probe answered: ${probe}); no input was sent`);
    }
    return ctx.stubStatus;
  };

  // The list exists, is not loading, and the path bar shows a folder (the folder may be empty).
  ctx.pageReady = () =>
    ctx.waitFor(
      `!!document.querySelector('.app-shell [role=listbox]') && !document.querySelector('.list-notice') && !!document.querySelector('.path-bar-row input')?.value`,
      { timeout: 60000, label: "the file list to be ready" },
    );

  /** Reload the page, reinstall helpers + the refusing stubs, set the default viewport. */
  ctx.reload = async () => {
    await cdp.send("Page.reload", { ignoreCache: true });
    await sleep(500);
    await ctx.waitFor(`document.readyState === "complete" && !!document.querySelector('.app-shell')`, { timeout: 60000, label: "page reload" });
    await ctx.install();
    await ctx.pageReady();
    ctx.fakeFs = false;
    await ctx.setViewport(1000, 700);
  };

  ctx.setViewport = async (w, h) => {
    await cdp.setViewport(w, h);
    await ctx.settle();
  };

  /** Viewport (width, height) that gives the list frame exactly `frameW` x `frameH` (clientWidth/Height). */
  ctx.setFrameSize = async (frameW, frameH) => {
    await ctx.setViewport(1000, 700);
    const d0 = await m.dims(".file-list-frame");
    const w = 1000 + (frameW - d0.clientWidth);
    const h = 700 + (frameH - d0.clientHeight);
    await ctx.setViewport(w, h);
    const d1 = await m.dims(".file-list-frame");
    if (d1.clientWidth !== frameW || d1.clientHeight !== frameH) {
      throw new Error(`could not size the list frame to ${frameW}x${frameH} (got ${d1.clientWidth}x${d1.clientHeight})`);
    }
    return { viewportWidth: w, viewportHeight: h };
  };

  // ----------------------------------------------------------------- inputs

  ctx.pathBarState = () =>
    cdp.ev(`(() => { const i = document.querySelector('.path-bar-row input'); return i ? { value: i.value, focused: document.activeElement === i } : null; })()`);

  const assertSafeToSend = async () => {
    if (ctx.fakeFs) return;
    const state = await ctx.pathBarState();
    if (state === null) throw new AbortRun("refusing to send input: the path bar is not present");
    if (state.focused) return; // editing: typing into the path bar cannot change files
    if (!fx.contains(state.value)) {
      throw new AbortRun(`refusing to send input: the app shows "${state.value}", which is outside the test folder ${fx.root}`);
    }
  };

  ctx.key = async (key, modifiers = 0, code) => {
    await assertSafeToSend();
    await cdp.key(key, modifiers, code);
  };
  ctx.type = async (text) => {
    await assertSafeToSend();
    await cdp.type(text);
  };
  ctx.click = async (x, y) => {
    await assertSafeToSend();
    await cdp.click(x, y);
  };
  ctx.hover = (x, y) => cdp.hover(x, y);
  ctx.wheel = (x, y, dx, dy, mods = 0) => cdp.wheel(x, y, dx, dy, mods);

  ctx.clickSel = async (selector, index = 0) => {
    const c = await m.center(selector, index);
    if (c === null) throw new Error(`clickSel: ${selector}[${index}] not found`);
    await ctx.click(c.x, c.y);
  };

  ctx.focusList = () => cdp.ev(`document.querySelector('.app-shell [role=listbox]').focus(); true`);

  ctx.press = {
    ctrlL: () => ctx.key("l", MOD.Ctrl, "KeyL"),
    escape: () => ctx.key("Escape"),
    enter: () => ctx.key("Enter"),
    tab: () => ctx.key("Tab"),
    shiftTab: () => ctx.key("Tab", MOD.Shift),
    right: () => ctx.key("ArrowRight"),
    left: () => ctx.key("ArrowLeft"),
    down: () => ctx.key("ArrowDown"),
    up: () => ctx.key("ArrowUp"),
    pageDown: () => ctx.key("PageDown"),
    pageUp: () => ctx.key("PageUp"),
    search: () => ctx.key("/"),
    sortMenu: () => ctx.key("s", 0, "KeyS"),
    history: () => ctx.key("y", MOD.Ctrl, "KeyY"),
    jump: () => ctx.key("j", MOD.Ctrl, "KeyJ"),
    toggleTree: () => ctx.key("B", MOD.Ctrl | MOD.Shift, "KeyB"),
    toggleSize: () => ctx.key("S", MOD.Ctrl | MOD.Shift, "KeyS"),
    toggleTime: () => ctx.key("T", MOD.Ctrl | MOD.Shift, "KeyT"),
    toggleHidden: () => ctx.key("h", MOD.Ctrl, "KeyH"),
    del: () => ctx.key("Delete"),
  };

  /** Go to a folder through the path bar (Ctrl+L, type, Enter) and wait for the listing. */
  ctx.nav = async (dir) => {
    // Ctrl+L / typing / Enter only drive the path bar (they cannot change files), so this one
    // path is allowed to start outside the fixtures (the first run opens the home folder).
    await cdp.key("l", MOD.Ctrl, "KeyL");
    await sleep(100);
    const editing = await ctx.pathBarState();
    if (!editing || !editing.focused) {
      throw new AbortRun("Ctrl+L did not focus the path bar; refusing to send further input");
    }
    await cdp.type(dir);
    await cdp.key("Enter");
    const normalize = (p) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
    const wanted = normalize(dir);
    const deadline = Date.now() + 15000;
    for (;;) {
      const state = await ctx.pathBarState();
      const busy = await cdp.ev(`!!document.querySelector('.list-notice')`);
      if (state && !state.focused && !busy && normalize(state.value) === wanted) break;
      if (Date.now() > deadline) throw new Error(`timed out waiting for navigation to ${dir} (path bar: ${state?.value})`);
      await sleep(100);
    }
    await ctx.settle();
  };

  // -------------------------------------------------------------- view modes

  ctx.viewState = () =>
    cdp.ev(`(() => {
      const row = document.querySelector('.app-shell [role=option]');
      return {
        size: row ? !!row.querySelector('.size') : null,
        time: row ? !!row.querySelector('.modified') : null,
        tree: !!document.querySelector('.tree-panel'),
        hidden: [...document.querySelectorAll('.status-bar .status-item')].some((e) => e.textContent === '隠し: オン'),
      };
    })()`);

  /** Idempotently put the display toggles into the wanted state (list must have an entry). */
  ctx.ensureView = async ({ size, time, hidden, tree } = {}) => {
    await ctx.focusList();
    const state = await ctx.viewState();
    if (size !== undefined && state.size !== null && state.size !== size) await ctx.press.toggleSize();
    if (time !== undefined && state.time !== null && state.time !== time) await ctx.press.toggleTime();
    if (tree !== undefined && state.tree !== tree) await ctx.press.toggleTree();
    if (hidden !== undefined && state.hidden !== hidden) {
      await ctx.press.toggleHidden();
      await sleep(300);
    }
    await ctx.settle();
    await ctx.focusList();
  };

  ctx.rowCount = () => cdp.ev(`document.querySelectorAll('.app-shell [role=option]').length`);

  /** Run `fnSource` (a function expression string) for fs_list_dir etc. */
  ctx.stub = async (command, fnSource) => {
    if (ctx.stubStatus !== "ok") throw new Error(`invoke is not stubbable (${ctx.stubStatus})`);
    await cdp.ev(`window.__e2e.stubs[${JSON.stringify(command)}] = ${fnSource}; true`);
  };
  ctx.unstub = (command) => cdp.ev(`delete window.__e2e.stubs[${JSON.stringify(command)}]; true`);

  return ctx;
}
