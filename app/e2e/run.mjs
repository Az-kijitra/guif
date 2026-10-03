// E2E runner: drives the REAL app (Tauri + WebView2) over the Chrome DevTools Protocol and checks
// the [CDP] acceptance criteria of SPEC-0300-0017 (SPEC-0400-0001 R-07 / R-08; design
// SPEC-0200-0001 §3.8.14, §3.8.17, §3.8.18). Node 22+ built-ins only; no dependencies.
//
//   npm run e2e                      launch `tauri dev` with a throw-away config folder and run everything
//   npm run e2e -- --filter AC-92    only ACs whose id starts with the prefix
//   npm run e2e -- --keep            leave the app running afterwards (then use --attach)
//   npm run e2e:attach               reuse the app left by --keep
//   options: --port 9340  --timeout 600 (seconds)  --shots <dir>  --final-shot <png>
//   --selftest-abort                 expect a different override folder on purpose: the run must stop
//                                    before sending any input and exit with code 1 (SPEC-0400-0001 AC-08 ii)
//
// OS clipboard (SPEC-0400-0001 R-09): the "copy path" checks (AC-1051 / 1052 / 1077) write text to your
// real clipboard. Before them the clipboard is read from the test side (PowerShell); text or empty is saved and
// restored afterwards (also on failure); anything else (image, files, HTML, ...) makes those checks SKIP.
// Copy plain text only before a run if you want them to execute (copying from a browser or IDE often adds
// "HTML Format" and they are skipped). With Windows clipboard history / cloud sync on, the text written by the
// test can remain in the history or sync target. The window must be in the foreground for writeText.
// Self test of the guard: node e2e/lib/clipboard.mjs --selftest
//
// Exit code: 0 = no FAIL and the run was not aborted; 1 otherwise.

import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import { Cdp } from "./lib/cdp.mjs";
import { createContext } from "./lib/context.mjs";
import { Fixtures } from "./lib/fixtures.mjs";
import { AbortRun, attachApp, diffSnapshots, launchApp, REAL_CONFIG_DIR, shutdown, snapshotDir } from "./lib/launch.mjs";
import { Checks, Report, Skip } from "./lib/report.mjs";

if (Number.parseInt(process.versions.node.split(".")[0], 10) < 22) {
  console.error(`Node 22 or newer is required (this is ${process.versions.node}).`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

// ------------------------------------------------------------------- options

function parseArgs(argv) {
  const options = { attach: false, keep: false, port: 9340, timeout: 600, filter: undefined, shots: undefined, finalShot: undefined, realConfig: false, selftestAbort: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--attach") options.attach = true;
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--port") options.port = Number(next());
    else if (arg === "--timeout") options.timeout = Number(next());
    else if (arg === "--filter") options.filter = next();
    else if (arg === "--shots") options.shots = next();
    else if (arg === "--final-shot") options.finalShot = next();
    else if (arg === "--i-know-this-uses-real-config") options.realConfig = true;
    else if (arg === "--selftest-abort") options.selftestAbort = true; // SPEC-0400-0001 AC-08 (ii)
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

const SPEC_FILES = ["window", "layout", "color-font", "path-bar", "tree", "list", "scroll", "select-focus", "status-bar", "overlay", "contextmenu", "viewer", "config"];

async function loadTests() {
  const all = [];
  for (const name of SPEC_FILES) {
    const module = await import(pathToFileURL(path.join(here, "specs", `${name}.mjs`)).href);
    all.push(...module.tests);
  }
  return all;
}

// ---------------------------------------------------------------------- main

const options = parseArgs(process.argv.slice(2));
const report = new Report();
const log = (message) => console.log(`[e2e] ${message}`);
let handle;
let cdp;
let fx;

async function main() {
  const tests = (await loadTests()).filter((t) => options.filter === undefined || t.id.startsWith(options.filter));
  if (tests.length === 0) throw new AbortRun(`no test matches --filter ${options.filter}`);

  handle = options.attach
    ? await attachApp({ cdpPort: options.port, allowRealConfig: options.realConfig, log })
    : await launchApp({
        appDir,
        cdpPort: options.port,
        timeoutMs: options.timeout * 1000,
        log,
        expectOverride: options.selftestAbort ? path.join(os.tmpdir(), "rf-e2e-deliberately-wrong") : undefined,
      });

  cdp = await Cdp.connect(handle.target.webSocketDebuggerUrl);
  fx = new Fixtures();
  log(`test folder: ${fx.root}`);
  const ctx = createContext({ cdp, fx, shotsDir: options.shots, log });
  ctx.port = handle.cdpPort;
  ctx.handle = handle;

  // First contact: install helpers + the refusing stubs, wait for the list. No viewport override
  // yet so the window-size test sees the real initial window (AC-942).
  await ctx.waitFor(`document.readyState === "complete" && !!document.querySelector('.app-shell')`, { timeout: 120000, label: "the app page" });
  const stubStatus = await ctx.install();
  log(`invoke stubs: ${stubStatus}`);
  await ctx.pageReady();

  for (const test of tests) {
    const started = Date.now();
    const checks = new Checks();
    cdp.takeErrors();
    try {
      await test.run(checks, ctx);
      const errors = cdp.takeErrors().filter((e) => !(test.allowedErrors ?? []).some((re) => re.test(e)));
      if (errors.length > 0) checks.fail(`page errors: ${errors.join(" | ")}`);
      if (checks.failures.length > 0) {
        const shot = await ctx.shot(test.id).catch(() => undefined);
        report.record("FAIL", test.id, test.title, Date.now() - started, [...checks.failures, ...(shot ? [`screenshot: ${shot}`] : [])]);
      } else {
        report.record("PASS", test.id, test.title, Date.now() - started);
      }
    } catch (error) {
      if (error instanceof Skip) {
        report.record("SKIP", test.id, test.title, Date.now() - started, [error.manual ? `manual: ${error.message}` : error.message]);
      } else if (error instanceof AbortRun) {
        report.aborted = true;
        report.record("FAIL", test.id, test.title, Date.now() - started, [`ABORT: ${error.message}`]);
        break;
      } else {
        const shot = await ctx.shot(test.id).catch(() => undefined);
        report.record("FAIL", test.id, test.title, Date.now() - started, [
          ...checks.failures,
          `error: ${(error && error.stack ? error.stack : String(error)).split("\n").slice(0, 4).join(" / ")}`,
          ...(shot ? [`screenshot: ${shot}`] : []),
        ]);
      }
    }
  }

  if (options.finalShot && !report.aborted) {
    await takeFinalShot(ctx, options.finalShot);
  }
}

// A representative picture of the finished look: many files, size + date columns, tree open.
async function takeFinalShot(ctx, file) {
  try {
    const dir = fx.files("final-shot", 150, { prefix: "document_", ext: ".txt", digits: 3 });
    fx.file("final-shot", "averyveryveryverylongname_quarterly_report_final.xlsx", { size: 1_073_636_966 });
    fx.folder("final-shot", "Photos");
    await ctx.reload();
    await ctx.nav(dir);
    await ctx.ensureView({ size: true, time: false, hidden: false, tree: true });
    await ctx.press.right();
    await ctx.settle(300);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await cdp.screenshot());
    log(`screenshot saved: ${file}`);
  } catch (error) {
    log(`final screenshot failed: ${error.message}`);
  }
}

let exitCode = 1;
try {
  await main();
} catch (error) {
  report.aborted = true;
  console.log(`ABORT  ${error.message}`);
  if (!(error instanceof AbortRun)) console.log(error.stack);
} finally {
  const extra = [];
  try {
    if (handle) {
      // R-08 (3): the real settings folder must be exactly as it was.
      const after = snapshotDir(REAL_CONFIG_DIR);
      const problems = diffSnapshots(handle.realBefore, after);
      if (problems.length > 0) {
        report.record("FAIL", "R-08", "real settings folder unchanged", 0, problems);
      } else {
        report.record("PASS", "R-08", `real settings folder unchanged (${REAL_CONFIG_DIR})`, 0);
      }
    }
  } catch (error) {
    extra.push(`could not verify the real settings folder: ${error.message}`);
    report.aborted = true;
  }
  try {
    cdp?.close();
    if (handle) await shutdown(handle, { keep: options.keep });
    fx?.dispose();
  } catch (error) {
    extra.push(`cleanup problem: ${error.message}`);
  }
  report.summary(extra);
  exitCode = report.exitCode;
}
process.exit(exitCode);
