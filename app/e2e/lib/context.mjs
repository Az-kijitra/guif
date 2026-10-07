// The per-run context handed to every spec: CDP access, measurement helpers, fixtures, and
// the guarded input helpers. Every key/mouse input goes through here so the safety rules
// (SPEC-0200-0001 §3.8.17 SHOULD-152) are enforced in one place:
//   * file-changing commands are replaced by a rejecting stub in the page (after every load);
//   * keys are only sent while the app shows a folder inside the fixture root
//     (or while the path bar is being edited, which cannot change files).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTargets, MOD, sleep } from "./cdp.mjs";
import { measureApi, PAGE_HELPERS } from "./measure.mjs";
import { AbortRun } from "./launch.mjs";
import { withClipboardGuard } from "./clipboard.mjs";
import { copyMoveArgsAllowed, isInsideScope } from "./scope.mjs";

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
//
// FAIL-CLOSED (SPEC-0200-0001 §3.10.17.2 MUST-118 / SHOULD-177): Tauri's ipc-protocol.js switches
// to `window.ipc.postMessage` for this request AND ALL LATER ones as soon as a `fetch` rejects (or
// its JSON answer cannot be parsed); the refusing stubs would then be bypassed for good. So the
// replacement below never rejects: whatever goes wrong (bad input, a throwing stub, a rejecting
// original fetch) it answers with a refusing Response. A switch that happens anyway is detected
// through Tauri's `console.warn`/`console.error` ("IPC custom protocol failed") -> `ipcFallback`.
//
// The function is injected into the page as source text (`${fn}`), so it must stay self-contained;
// `--selftest` runs the very same function against a fake window.
export function installStubRuntime(win) {
  if (win.__e2e) return "ok";
  const origFetch = win.fetch.bind(win);
  const state = { stubs: {}, calls: [], ipcFallback: false, clipboardScope: false };
  const answer = (value, ok) =>
    new Response(JSON.stringify(value === undefined ? null : value), {
      status: 200,
      headers: { "Content-Type": "application/json", "Tauri-Response": ok ? "ok" : "error" },
    });
  const refuse = (message) => answer({ code: "other", message: `E2E: ${message}` }, false);
  for (const level of ["warn", "error"]) {
    const orig = win.console[level].bind(win.console);
    win.console[level] = (...args) => {
      try {
        if (args.some((a) => String(a).includes("IPC custom protocol failed"))) state.ipcFallback = true;
      } catch {}
      return orig(...args);
    };
  }
  // SPEC-0200-0001 §3.10.17.4 MUST-120: outside `withClipboardGuard` (clipboardScope === false) the
  // clipboard_* commands never reach Rust; these are the answers the app gets instead.
  const clipboardOutsideScope = {
    clipboard_set_files: { ok: false, sequence: 0, error: "rejected" },
    clipboard_clear_if_unchanged: false,
    clipboard_get_files: { state: "unavailable", paths: [], sequence: 0 },
  };
  win.fetch = async (input, init) => {
    try {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input !== null && typeof input === "object" ? input.url : undefined;
      if (typeof url !== "string") return refuse("invalid fetch input");
      const match = /^(?:https?:\/\/ipc\.localhost|ipc:\/\/localhost)\/([^?#]+)/.exec(url);
      if (!match) return await origFetch(input, init);
      const cmd = decodeURIComponent(match[1]);
      state.calls.push(cmd);
      if (cmd.startsWith("clipboard_") && state.clipboardScope !== true) {
        return answer(Object.hasOwn(clipboardOutsideScope, cmd) ? clipboardOutsideScope[cmd] : { code: "other", message: "E2E: clipboard outside the guard" }, Object.hasOwn(clipboardOutsideScope, cmd));
      }
      const stub = state.stubs[cmd];
      if (typeof stub !== "function") return await origFetch(input, init);
      let args = {};
      try {
        const body = init && init.body;
        args = JSON.parse(typeof body === "string" ? body : new TextDecoder().decode(body));
      } catch {}
      const result = await stub(args, async () => await origFetch(input, init), cmd);
      if (result instanceof Response) return result;
      if (result !== null && typeof result === "object" && "error" in result) return answer(result.error, false);
      return answer(result, true);
    } catch (error) {
      return refuse(`stub error: ${error && error.message ? error.message : String(error)}`);
    }
  };
  win.__e2e = state;
  return "ok";
}
const STUB_RUNTIME = `(${installStubRuntime.toString()})(window)`;

const PROBE_EXPR = `window.__TAURI_INTERNALS__.invoke("fs_ops_create", {}).then(() => "accepted", (e) => JSON.stringify(e))`;

/**
 * MUST-118 (c): proof that the refusing stubs are in force. `ev` evaluates an expression in the
 * page. Throws AbortRun when the IPC fell back to postMessage or the blocked-command probe is not refused.
 */
export async function verifyStubsWith(ev) {
  const fallback = await ev(`window.__e2e ? window.__e2e.ipcFallback === true : "missing"`);
  if (fallback === "missing") {
    const error = new AbortRun("the IPC stubs are not installed in the page; refusing to continue");
    error.reason = "missing"; // e.g. the page reloaded (a dev-server reload) between the injection and this check
    throw error;
  }
  if (fallback !== false) throw new AbortRun("the IPC fell back to postMessage (\"IPC custom protocol failed\"); the refusing stubs are bypassed");
  const probe = await ev(PROBE_EXPR);
  if (typeof probe !== "string" || !probe.includes("E2E: blocked command")) {
    throw new AbortRun(`the blocked-command stub is not effective (probe answered: ${probe}); no input was sent`);
  }
}

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

  // A page reload (the dev server may reload once on a cold start) can wipe the stubs between the
  // injection and its verification: the injection is then repeated, never skipped (3 attempts).
  ctx.install = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await installOnce();
      } catch (error) {
        if (!(error instanceof AbortRun) || error.reason !== "missing" || attempt >= 3) throw error;
        await sleep(500);
        await ctx.waitFor(`document.readyState === "complete" && !!document.querySelector('.app-shell')`, { timeout: 60000, label: "the page after a reload" });
      }
    }
  };

  const installOnce = async () => {
    await cdp.ev(PAGE_HELPERS);
    ctx.stubStatus = await cdp.ev(STUB_RUNTIME);
    if (ctx.stubStatus !== "ok") throw new AbortRun(`the IPC cannot be intercepted (${ctx.stubStatus}); refusing to run without the safety stubs`);
    for (const cmd of BLOCKED_COMMANDS) {
      await cdp.ev(`window.__e2e.stubs[${JSON.stringify(cmd)}] = () => ({ error: { code: "other", message: "E2E: blocked command" } }); true`);
    }
    // A reload inside withScopedFileOps / withClipboardGuard keeps the scope (the page state is new).
    if (ctx.fileOpsRoot !== null) await applyScopedFileOps();
    if (ctx.clipboardScopeActive) await cdp.ev(`window.__e2e.clipboardScope = true; true`);
    // Prove the interception works: a blocked command must be refused with our marker message.
    await ctx.verifyStubs();
    return ctx.stubStatus;
  };

  // §3.10.17.3 / §3.10.17.6: fs_ops_copy / fs_ops_move are let through ONLY while every item and the
  // destination are inside the test folder (the lexical rule of scope.mjs, injected as source text);
  // the backend (REFLEXFILES_E2E_FS_SCOPE) judges the same paths again, with links resolved.
  ctx.fileOpsRoot = null;
  ctx.clipboardScopeActive = false;
  const SCOPE_SOURCE = `const isInsideScope = ${isInsideScope.toString()}; const copyMoveArgsAllowed = ${copyMoveArgsAllowed.toString()};`;
  const SCOPED_COMMANDS = ["fs_ops_copy", "fs_ops_move"];
  const applyScopedFileOps = async () => {
    for (const cmd of SCOPED_COMMANDS) {
      await cdp.ev(`(() => { ${SCOPE_SOURCE}
        window.__e2e.stubs[${JSON.stringify(cmd)}] = async (args, passThrough) =>
          copyMoveArgsAllowed(${JSON.stringify(ctx.fileOpsRoot)}, args)
            ? passThrough()
            : { error: { code: "other", message: "E2E: copy/move outside the test folder" } };
        return true; })()`);
    }
  };
  const blockScopedCommands = async () => {
    for (const cmd of SCOPED_COMMANDS) {
      await cdp.ev(`window.__e2e.stubs[${JSON.stringify(cmd)}] = () => ({ error: { code: "other", message: "E2E: blocked command" } }); true`);
    }
  };

  /**
   * Runs `fn` with fs_ops_copy / fs_ops_move allowed inside the test folder only. Afterwards the
   * commands are blocked again and the stubs are verified (MUST-118 (c)): an IPC fallback or an
   * accepted probe aborts the whole run.
   */
  ctx.withScopedFileOps = async (fn) => {
    if (ctx.fileOpsRoot !== null) throw new Error("withScopedFileOps cannot be nested");
    ctx.fileOpsRoot = fs.realpathSync.native(ctx.fx.root);
    await applyScopedFileOps();
    try {
      return await fn();
    } finally {
      ctx.fileOpsRoot = null;
      await blockScopedCommands();
      await ctx.verifyStubs();
    }
  };

  /** MUST-118 (c): no postMessage fallback happened and the blocked-command probe is still refused (AbortRun otherwise). */
  ctx.verifyStubs = () => verifyStubsWith((expr) => cdp.ev(expr));

  /**
   * MUST-120: clipboard_* commands reach the real OS clipboard only inside this scope, i.e. inside
   * withClipboardGuard (saved before, restored after); outside it the page stub refuses them.
   */
  ctx.withClipboardGuard = (fn, options) =>
    withClipboardGuard(async () => {
      ctx.clipboardScopeActive = true;
      await cdp.ev(`window.__e2e.clipboardScope = true; true`);
      try {
        return await fn();
      } finally {
        ctx.clipboardScopeActive = false;
        await cdp.ev(`window.__e2e.clipboardScope = false; true`);
      }
    }, options);

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

  // SPEC-0200-0001 §3.11.9: `Emulation.setEmulatedMedia` for prefers-color-scheme on THIS page target ("" = clear).
  // Callers clear it in a finally. Never used to prove a fixed theme (it overrides the fixed one, R-995-2 note 2).
  ctx.emulateColorScheme = (value, target = cdp) =>
    target.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });

  /** The startup snapshot of config.toml as the page got it (read-only command; DTO incl. uiTheme, SHOULD-185). */
  ctx.configDto = () => cdp.ev(`window.__TAURI_INTERNALS__.invoke("config_load_keymap")`);

  /**
   * SHOULD-186 (3): the harness's forced kill skips the app's save at exit, so AC-960 asks the main window to close
   * (the same close request as the title bar's X: the page's onCloseRequested flush runs) and waits for the process.
   * After this the page is gone: run.mjs sees `ctx.appClosed` and skips the end-of-run stub verification.
   */
  ctx.requestMainWindowClose = async () => {
    ctx.appClosed = true;
    await cdp.ev(`window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label: "main" }).catch(() => {}); true`);
  };
  ctx.appClosed = false;
  ctx.waitForAppExit = async (timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let listening = true;
      try {
        await listTargets(ctx.port);
      } catch {
        listening = false;
      }
      if (!listening) return true;
      if (Date.now() > deadline) return false;
      await sleep(300);
    }
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
    const fallback = await cdp.ev(`window.__e2e ? window.__e2e.ipcFallback === true : "missing"`);
    if (fallback !== false) throw new AbortRun(`refusing to send input: the IPC stubs are not in force (${fallback === "missing" ? "not installed" : "IPC fell back to postMessage"})`);
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
  ctx.click = async (x, y, options) => {
    await assertSafeToSend();
    await cdp.click(x, y, options);
  };
  // SPEC-0200-0001 §3.9.17.6: the right button goes through the same safety check as ctx.click.
  ctx.rightClickAt = async (x, y, options) => {
    await assertSafeToSend();
    await cdp.rightClick(x, y, options);
  };
  ctx.rightClickSel = async (selector, index = 0, options) => {
    const c = await m.center(selector, index);
    if (c === null) throw new Error(`rightClickSel: ${selector}[${index}] not found`);
    await ctx.rightClickAt(c.x, c.y, options);
    return c;
  };
  /** SPEC-0300-0018 §15: dispatch a synthetic contextmenu; returns dispatchEvent's value (false = preventDefault). */
  ctx.dispatchContextMenu = (selector, { clientX = 10, clientY = 10, index = 0 } = {}) =>
    cdp.ev(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return "missing";
      return el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: ${clientX}, clientY: ${clientY} })); })()`);
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

  /**
   * SPEC-0300-0009 AC-642: Backspace (go to the parent) and Enter ON A FOLDER ROW only change the SHOWN folder; they
   * are the only keys allowed while the app shows a folder OUTSIDE the test folder (a drive root or a first-level
   * folder, read only). Like ctx.nav it never changes a file: any other key is refused here, Enter needs the
   * focused row to be a folder (not a file: that would open it), no dialog / overlay may be open, and the IPC
   * stubs must still be in force (the file-changing commands are refused by the page and by the backend scope anyway).
   */
  ctx.viewKey = async (key) => {
    if (key !== "Backspace" && key !== "Enter") throw new AbortRun(`viewKey only sends Backspace / Enter on a folder row (got ${key})`);
    const fallback = await cdp.ev(`window.__e2e ? window.__e2e.ipcFallback === true : "missing"`);
    if (fallback !== false) throw new AbortRun("refusing to send input: the IPC stubs are not in force");
    const state = await cdp.ev(`(() => {
      const input = document.querySelector('.path-bar-row input');
      const row = document.querySelector('.file-list-row.focused');
      return { editing: !!input && document.activeElement === input,
        overlay: !!document.querySelector('.ui-dialog, [role=dialog], .nav-history-list, .ctx-menu, .sort-menu, .search-bar'),
        listFocused: document.activeElement === document.querySelector('.app-shell [role=listbox]'),
        focusedIsFolder: !!row && (row.querySelector('.name-text')?.textContent ?? '').startsWith('📁') };
    })()`);
    if (state.editing || state.overlay || !state.listFocused) throw new AbortRun(`refusing ${key}: the file list is not the plain focus target (${JSON.stringify(state)})`);
    if (key === "Enter" && !state.focusedIsFolder) throw new AbortRun("refusing Enter: the focused row is not a folder");
    await cdp.key(key);
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

// ---------------------------------------------------------------- self test (MUST-118 / SHOULD-177)
// node app/e2e/lib/context.mjs --selftest   (no app needed: the real stub runtime runs against a fake window)

async function selftest() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  };
  const okResponse = () => new Response("null", { status: 200, headers: { "Tauri-Response": "ok" } });
  const makeWin = (origFetch) => {
    const warnings = [];
    return { warnings, fetch: origFetch, console: { warn: (...a) => warnings.push(a.join(" ")), error: (...a) => warnings.push(a.join(" ")) } };
  };
  const refused = async (res, text) => {
    if (!(res instanceof Response)) return false;
    const body = await res.text();
    return res.headers.get("Tauri-Response") === "error" && (text === undefined || body.includes(text));
  };
  // Never rejects: resolves to { res } or { threw }.
  const call = async (win, input, init) => {
    try {
      return { res: await win.fetch(input, init) };
    } catch (error) {
      return { threw: error };
    }
  };
  const ipc = (cmd) => `http://ipc.localhost/${cmd}`;
  const calls = [];
  const rejecting = async () => {
    calls.push("orig");
    throw new TypeError("network down");
  };
  const fresh = (orig = async () => okResponse()) => {
    const win = makeWin(orig);
    installStubRuntime(win);
    return win;
  };

  // (a) a blocked command is refused through the real stub registration used by install()
  {
    const win = fresh();
    win.__e2e.stubs.fs_ops_create = () => ({ error: { code: "other", message: "E2E: blocked command" } });
    const { res, threw } = await call(win, ipc("fs_ops_create"), { body: "{}" });
    check("blocked command -> refusing Response", !threw && (await refused(res, "E2E: blocked command")));
  }
  // (b) the stub throws
  {
    const win = fresh();
    win.__e2e.stubs.fs_ops_delete_trash = () => {
      throw new Error("boom");
    };
    const { res, threw } = await call(win, ipc("fs_ops_delete_trash"), { body: "{}" });
    check("throwing stub -> refusing Response, no reject", !threw && (await refused(res, "stub error")));
  }
  // (c) passThrough with a rejecting origFetch
  {
    const win = fresh(rejecting);
    win.__e2e.stubs.fs_ops_copy = async (_args, passThrough) => passThrough();
    const { res, threw } = await call(win, ipc("fs_ops_copy"), { body: "{}" });
    check("passThrough with a rejecting origFetch -> refusing Response, no reject", !threw && (await refused(res)));
  }
  // (d) an unstubbed IPC command with a rejecting origFetch (SHOULD-177: return await)
  {
    const win = fresh(rejecting);
    const { res, threw } = await call(win, ipc("fs_list_dir"), { body: "{}" });
    check("unstubbed command with a rejecting origFetch -> refusing Response, no reject", !threw && (await refused(res)));
  }
  // (e) invalid input
  for (const [label, input] of [["null", null], ["undefined", undefined], ["number", 42], ["object without url", {}], ["object with a non-string url", { url: 7 }]]) {
    const win = fresh();
    const { res, threw } = await call(win, input, undefined);
    check(`invalid input (${label}) -> refusing Response, no reject`, !threw && (await refused(res, "invalid fetch input")));
  }
  // (f) an unparsable body keeps working for stubs (args = {}), a Response answer is handed on unchanged
  {
    const win = fresh();
    let seen;
    win.__e2e.stubs.some_cmd = (args) => {
      seen = args;
      return { ok: 1 };
    };
    const { res, threw } = await call(win, ipc("some_cmd"), { body: "not json" });
    check("unparsable body -> args {} and an ok answer", !threw && res.headers.get("Tauri-Response") === "ok" && JSON.stringify(seen) === "{}");
  }
  // (g) a switch to postMessage is noticed through Tauri's warning
  {
    const win = fresh();
    check("ipcFallback starts false", win.__e2e.ipcFallback === false);
    win.console.warn("unrelated warning");
    check("an unrelated warning does not set ipcFallback", win.__e2e.ipcFallback === false);
    win.console.warn("IPC custom protocol failed, Tauri will now use the postMessage interface instead", new Error("x"));
    check("console.warn 'IPC custom protocol failed' -> ipcFallback", win.__e2e.ipcFallback === true);
    check("the original console.warn still ran", win.warnings.length === 2);
    const probes = [];
    let threw;
    try {
      await verifyStubsWith(async (expr) => (probes.push(expr), expr.includes("ipcFallback") ? win.__e2e.ipcFallback === true : "never"));
    } catch (error) {
      threw = error;
    }
    check("verifyStubs: fallback detected -> AbortRun (probe not even needed)", threw instanceof AbortRun && probes.length === 1);
  }
  // (h) the probe being accepted / the runtime missing -> AbortRun; healthy -> passes
  {
    const run = async (answers) => {
      try {
        await verifyStubsWith(async (expr) => (expr.includes("ipcFallback") ? answers.fallback : answers.probe));
        return "passed";
      } catch (error) {
        return error instanceof AbortRun ? "abort" : `other:${error}`;
      }
    };
    check("verifyStubs: probe accepted -> AbortRun", (await run({ fallback: false, probe: "accepted" })) === "abort");
    check("verifyStubs: probe answered a non-string -> AbortRun", (await run({ fallback: false, probe: undefined })) === "abort");
    check("verifyStubs: runtime missing -> AbortRun", (await run({ fallback: "missing", probe: "x" })) === "abort");
    check("verifyStubs: healthy -> passes", (await run({ fallback: false, probe: `{"message":"E2E: blocked command"}` })) === "passed");
  }
  // (i) MUST-120: clipboard_* only reaches the real command inside the scope
  {
    let reached = 0;
    const win = fresh(async () => (reached++, okResponse()));
    for (const cmd of ["clipboard_set_files", "clipboard_clear_if_unchanged", "clipboard_get_files"]) {
      const { res, threw } = await call(win, ipc(cmd), { body: "{}" });
      const body = threw ? undefined : await res.clone().json();
      check(`${cmd} outside the scope is not passed to the app`, !threw && reached === 0, JSON.stringify(body));
    }
    const set = await (await win.fetch(ipc("clipboard_set_files"), { body: "{}" })).json();
    const clr = await (await win.fetch(ipc("clipboard_clear_if_unchanged"), { body: "{}" })).json();
    const get = await (await win.fetch(ipc("clipboard_get_files"), { body: "{}" })).json();
    check("outside the scope: set_files rejected", set.ok === false && set.sequence === 0 && set.error === "rejected");
    check("outside the scope: clear_if_unchanged is false", clr === false);
    check("outside the scope: get_files unavailable and empty", get.state === "unavailable" && get.paths.length === 0 && get.sequence === 0);
    win.__e2e.clipboardScope = true;
    await win.fetch(ipc("clipboard_get_files"), { body: "{}" });
    check("inside the scope the command is passed through", reached === 1);
  }

  return results.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--selftest")) {
  process.exit(await selftest());
}
