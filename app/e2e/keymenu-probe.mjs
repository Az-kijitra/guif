// Spike probe for SPEC-0300-0020 R-1350-3 (NOT registered in run.mjs, NOT part of `npm run e2e`): what does the OS do with
// F10 / Alt+letter / Alt alone / Alt+Space when they arrive through the real input queue, and does the menu bar still get
// the next keys? Needs a person once: the window of the app started here must be clicked (title bar) so that it is in front,
// because a process started from a background shell cannot take the foreground by itself (Windows foreground lock).
//
//   $env:GUIF_E2E_OS_INPUT = "1"; cd app; node e2e/keymenu-probe.mjs        (PowerShell)
//   GUIF_E2E_OS_INPUT=1 node e2e/keymenu-probe.mjs                         (bash)
//
// Without GUIF_E2E_OS_INPUT=1 it does nothing and does not even start the app. Safety (SPEC-0400-0001 R-08 / R-10 /
// R-12): the same start as run.mjs (throw-away config folder, E2E file scope, refusing stubs verified), keys only from the
// allow-list of lib/os-input.mjs and only while the app window of THIS run is in front (checked before every step and again
// by the helper before every key); the probe never brings a window to the front and stops at once when the app loses the
// foreground. Everything is printed to the standard output; nothing is written to a file. The app is always ended.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cdp, sleep } from "./lib/cdp.mjs";
import { createContext } from "./lib/context.mjs";
import { Fixtures } from "./lib/fixtures.mjs";
import { diffSnapshots, launchApp, REAL_CONFIG_DIR, shutdown, snapshotDir } from "./lib/launch.mjs";
import { openSession, osInputSkipReason, sendKeys } from "./lib/os-input.mjs";
import { barState, dropdown, focusedName, prepMenu } from "./specs/_menu.mjs";

const reason = osInputSkipReason();
if (reason !== null) {
  console.log(reason);
  console.log("何も実行しませんでした(アプリも起動していません)。");
  process.exit(0);
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = (m) => console.log(`[probe] ${m}`);
const fx = new Fixtures();
let handle;
let cdp;
let session;
let abortReason = null;
const rows = [];
const stuck = [];

try {
  handle = await launchApp({ appDir, cdpPort: 9340, timeoutMs: 600000, log, fsScope: fx.root, fx });
  cdp = await Cdp.connect(handle.target.webSocketDebuggerUrl);
  const ctx = createContext({ cdp, fx, log });
  ctx.port = 9340;
  ctx.handle = handle;
  await ctx.waitFor(`document.readyState === "complete" && !!document.querySelector('.app-shell')`, { timeout: 120000, label: "the app page" });
  await ctx.install();
  await ctx.pageReady();
  await prepMenu(ctx, "probe");
  await ctx.verifyStubs();
  session = await openSession({ rootPid: handle.pid, appDir, profile: "debug" });
  const target = session.target;

  const inFront = async () => {
    const f = await session.foreground();
    return f.hwnd === target.hwnd && f.pid === target.pid;
  };
  const guard = async () => {
    await ctx.verifyStubs();
    const problems = diffSnapshots(handle.realBefore, snapshotDir(REAL_CONFIG_DIR));
    if (problems.length > 0) throw new Error(`the real settings folder changed (${problems.join("; ")})`);
  };

  // --- 2. wait for the person (no key is sent, nothing is brought to the front by the test)
  console.log("");
  console.log("アプリのウィンドウ(タイトル guif)のタイトルバーを1回クリックして、その後は触らないでください。");
  console.log("(最大 120 秒待ちます。前面になるまでキーは1つも送りません)");
  const waitUntil = Date.now() + 120000;
  while (!(await inFront())) {
    if (Date.now() > waitUntil) throw new Error("120 秒待ちましたが、アプリのウィンドウが前面になりませんでした。キーは送っていません。");
    await sleep(500);
  }
  log("アプリのウィンドウが前面になりました。2 秒待ってから開始します(その間も触らないでください)。");
  await sleep(2000);
  if (!(await inFront())) throw new Error("開始前にアプリが前面でなくなりました。中止します(キーは送っていません)。");

  // --- 3. the steps
  const snapshot = async (label, result) => {
    const bar = await barState(ctx);
    const gui = await session.guiState();
    const rect = await session.rect(target.hwnd);
    const active = await ctx.ev(`(() => { const a = document.activeElement; return a ? a.tagName + '.' + (a.className || '') + (a.getAttribute('role') ? '[' + a.getAttribute('role') + ']' : '') : null; })()`);
    const row = {
      step: label,
      sent: result ? result.sent.join(" ") : "-",
      "bar active": bar.current >= 0 ? `yes(${bar.current})` : "no",
      "open menu": bar.open >= 0 ? String(bar.open) : "-",
      "lit item": bar.highlight ?? "-",
      status: bar.focus,
      "row focus": await focusedName(ctx),
      activeElement: active,
      "OS menu mode": gui.inMenuMode,
      "OS sysmenu": gui.inSystemMenuMode,
      rect: rect.join(","),
    };
    rows.push(row);
    return row;
  };
  const run = async (label, send) => {
    if (abortReason !== null) return undefined;
    if (!(await inFront())) {
      abortReason = `${label}: アプリが前面ではなくなったので中止しました(このステップのキーは送っていません)`;
      return undefined;
    }
    await guard();
    const r0 = (await session.rect(target.hwnd)).join(",");
    const result = await send();
    stuck.push(...result.stuckModifiers);
    if (result.aborted) abortReason = `${label}: ${result.reason}`;
    const r1 = (await session.rect(target.hwnd)).join(","); // right after the keys
    await sleep(200);
    const r2 = (await session.rect(target.hwnd)).join(","); // 200 ms later
    await sleep(150);
    const row = await snapshot(label, result);
    const changed = [r1, r2, row.rect].some((r) => r !== r0);
    row["rect before/+0/+200ms"] = changed ? `!!! CHANGED ${r0} -> ${r1} -> ${r2}` : "same";
    if (changed) console.log(`[probe] !!! ${label}: the window rectangle changed: ${r0} -> ${r1} -> ${r2} -> ${row.rect}`);
    return result;
  };

  await snapshot("start", null);
  // (a) F10, Right + Down, Esc
  await run("(a1) F10", () => sendKeys(target, ["F10"], session.deps));
  await run("(a2) Right, Down", () => sendKeys(target, ["ArrowRight", "ArrowDown"], session.deps));
  await run("(a3) Esc", () => sendKeys(target, ["Escape"], session.deps));
  // (b) Alt+F, Esc
  await run("(b1) Alt+F", () => sendKeys(target, ["Alt+F"], session.deps));
  if (abortReason === null) {
    const dd = await dropdown(ctx);
    const first = dd?.entries.find((e) => !e.sep && e.enabled)?.label ?? null;
    rows[rows.length - 1]["lit item"] += first === null ? "" : ` (first enabled: ${first})`;
  }
  await run("(b2) Esc", () => sendKeys(target, ["Escape"], session.deps));
  // (c) Alt alone (R-1350-3 spike): the bar must become active WITHOUT the OS entering its menu mode; a second Alt alone
  //     closes it; then Down must reach the file list (the focus row moves)
  await run("(c1) Alt alone", () => sendKeys(target, ["AltTap"], session.deps));
  await run("(c2) Alt alone again", () => sendKeys(target, ["AltTap"], session.deps));
  const rowBefore = await focusedName(ctx);
  await run("(c3) Down after the second Alt", () => sendKeys(target, ["ArrowDown"], session.deps));
  const rowAfter = await focusedName(ctx);
  rows.push({ step: "(c) row focus before/after the Down", sent: "-", "row focus": `${rowBefore} -> ${rowAfter}`, status: rowBefore === rowAfter ? "!!! the Down did not move the focus row" : "moved" });
  await run("(c4) Esc, Esc (back to the start)", () => sendKeys(target, ["Escape", "Escape"], session.deps));
  // (d) Alt+Space: the helper sends the Escape that closes the system menu itself; the state is read in between
  let systemMenu = null;
  const spaceDeps = {
    ...session.deps,
    sendInput: async (inputs) => {
      const accepted = await session.deps.sendInput(inputs);
      if (accepted !== false && inputs.some((i) => i.vk === 0x20)) {
        await sleep(400);
        systemMenu = { gui: await session.guiState(), rect: await session.rect(target.hwnd), bar: await barState(ctx) };
      }
      return accepted;
    },
  };
  await run("(d) Alt+Space (+ the Escape that follows)", () => sendKeys(target, ["Alt+Space"], spaceDeps));
  if (systemMenu !== null) {
    rows.push({ step: "(d) state 400 ms after Alt+Space", sent: "-", "bar active": systemMenu.bar.current >= 0 ? "yes" : "no", "OS menu mode": systemMenu.gui.inMenuMode, "OS sysmenu": systemMenu.gui.inSystemMenuMode, rect: systemMenu.rect.join(",") });
  }
  // (e) no modifier left pressed
  const held = await session.deps.getPressedModifiers();
  stuck.push(...held);
  rows.push({ step: "(e) modifiers still pressed (GetAsyncKeyState)", sent: "-", status: held.length === 0 ? "none" : held.join(",") });
} catch (error) {
  abortReason = abortReason ?? String(error && error.message ? error.message : error);
} finally {
  session?.close();
  cdp?.close();
  let r08 = "unknown";
  if (handle) {
    await shutdown(handle, { keep: false });
    r08 = diffSnapshots(handle.realBefore, snapshotDir(REAL_CONFIG_DIR)).length === 0 ? "unchanged" : "CHANGED";
  }
  fx.dispose();
  console.log("");
  if (rows.length > 0) {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    console.log(cols.join(" | "));
    for (const r of rows) console.log(cols.map((c) => (r[c] === undefined ? "" : String(r[c]))).join(" | "));
  }
  console.log("");
  console.log(`stuck modifiers: ${stuck.length === 0 ? "none" : [...new Set(stuck)].join(",")}`);
  console.log(`real settings folder (R-08): ${r08}`);
  console.log(abortReason === null ? "result: finished" : `result: STOPPED - ${abortReason}`);
}
process.exit(0);
