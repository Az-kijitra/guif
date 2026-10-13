// E2E runner: drives the REAL app (Tauri + WebView2) over the Chrome DevTools Protocol and checks
// the [CDP] acceptance criteria of SPEC-0300-0017 (SPEC-0400-0001 R-07 / R-08; design
// SPEC-0200-0001 §3.8.14, §3.8.17, §3.8.18, §3.11.9, §3.11.16). Node 22+ built-ins only; no dependencies.
//
//   npm run e2e                      launch `tauri dev` with a throw-away config folder and run everything
//   npm run e2e -- --filter AC-92    only ACs whose id starts with the prefix (scenario ACs too)
//   npm run e2e -- --keep            leave the app running afterwards (then use --attach); scenarios are SKIPPED
//   npm run e2e:attach               reuse the app left by --keep; scenarios are SKIPPED
//   options: --port 9340  --timeout 600 (seconds)  --shots <dir>  --final-shot <png>
//   --selftest-abort                 expect a different override folder on purpose: the run must stop
//                                    before sending any input and exit with code 1 (SPEC-0400-0001 AC-08 ii);
//                                    scenarios are SKIPPED
//
// Theme scenarios (SPEC-0300-0017 Phase 12, specs/theme.mjs): config.toml is read once at startup, so every
// scenario is its own app start with its own `config.toml` (written by this harness into the throw-away config
// folder before the start; the default is `ui_theme = "light"`, R-995-1, which keeps every other spec on the
// light theme whatever the PC's OS theme is). The OS theme is only READ (lib/os-theme.mjs); nothing in the OS is
// ever changed.
//
// OS clipboard (SPEC-0400-0001 R-09 / R-09-1 ~ R-09-3): the clipboard checks ("copy path" AC-1051 / 1052 / 1077
// and the file-list copy / cut / paste checks of specs/clipboard.mjs) use your real clipboard. Before them it is
// read from the test side (Windows PowerShell 5.1); empty, text or a file list (+ Preferred DropEffect) is saved,
// the clipboard is emptied for the test, and the saved content is restored afterwards (also on failure; a restore
// that fails twice FAILS the test); anything else (image, HTML, a file list together with text, ...) makes those
// checks SKIP. Copy plain text or files only before a run if you want them to execute (copying from a browser or
// IDE often adds "HTML Format" and they are skipped). With Windows clipboard history / cloud sync on, the content
// written by the test can remain in the history or sync target. The window must be in the foreground for writeText.
// Self tests (no app needed): node e2e/lib/clipboard.mjs --selftest | node e2e/lib/context.mjs --selftest |
//                             node e2e/lib/scope.mjs --selftest | node e2e/lib/os-theme.mjs --selftest
//
// File operations (SPEC-0200-0001 §3.10.17): the page stubs refuse every file-changing command except
// fs_ops_copy / fs_ops_move inside withScopedFileOps (only paths inside the test folder), and the backend is
// started with REFLEXFILES_E2E_FS_SCOPE = the test folder so it refuses anything outside it as well.
//
// Real settings folder (R-08): its snapshot from BEFORE THE FIRST launch is compared after the last app has
// ended, also when the run aborts (SPEC-0200-0001 §3.11.16 MUST-124).
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
import { readOsAppTheme } from "./lib/os-theme.mjs";
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

const SPEC_FILES = ["window", "layout", "color-font", "path-bar", "tree", "list", "scroll", "select-focus", "status-bar", "overlay", "contextmenu", "clipboard", "viewer", "viewer-highlight", "viewer-keys", "viewer-text", "menubar", "wording", "config"];

async function loadTests() {
  const all = [];
  for (const name of SPEC_FILES) {
    const module = await import(pathToFileURL(path.join(here, "specs", `${name}.mjs`)).href);
    all.push(...module.tests);
  }
  return all;
}

// Scenario modules: `scenarios = [{ id, title, configToml?, navigationToml?, tests }]` (one app start each).
// theme.mjs: config.toml scenarios (Phase 12); history-invalid.mjs: navigation.toml scenarios (AC-256 / AC-257);
// os-input.mjs: the OS key input checks (SPEC-0400-0001 R-12). A scenario may carry `skipReason()` (null = run): when it
// returns a string the app is NOT started and the scenario's tests are recorded as SKIP with that reason. os-input is
// opt-in (REFLEXFILES_E2E_OS_INPUT=1, R-12-5; the reason text begins "OS のキー入力のテストは無効") because it uses the
// user's screen and keyboard.
const SCENARIO_FILES = ["theme", "history-invalid", "menubar-keymap", "os-input"];

async function loadScenarios() {
  const all = [];
  for (const name of SCENARIO_FILES) {
    const module = await import(pathToFileURL(path.join(here, "specs", `${name}.mjs`)).href);
    all.push(...module.scenarios);
  }
  return all;
}

// ---------------------------------------------------------------------- main

const options = parseArgs(process.argv.slice(2));
const report = new Report();
const log = (message) => console.log(`[e2e] ${message}`);
let realBefore; // R-08 (3): the snapshot of the FIRST launch is the baseline for the whole run (MUST-124 (2))
let current; // { handle, cdp, fx, ... } of the app that is running now
const osTheme = readOsAppTheme(); // read-only; null when unreadable

/**
 * MUST-124 (1): the common body of the normal run and of every scenario. Connects, installs the refusing stubs
 * (R-11 fail-closed) and waits for the list, runs `tests`, and verifies the stubs again before it returns.
 * A failing test never throws; an AbortRun (also from the stub verification) sets report.aborted.
 */
async function runWithApp(handle, fx, tests, { scenario, finalShot } = {}) {
  const cdp = await Cdp.connect(handle.target.webSocketDebuggerUrl);
  current.cdp = cdp;
  log(`test folder: ${fx.root}`);
  const ctx = createContext({ cdp, fx, shotsDir: options.shots, log });
  ctx.port = handle.cdpPort;
  ctx.handle = handle;
  ctx.osTheme = osTheme;
  ctx.scenario = scenario ?? null;

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
        report.record("FAIL", test.id, test.title, Date.now() - started, [...checks.failures, ...checks.notes, ...(shot ? [`screenshot: ${shot}`] : [])]);
      } else {
        report.record("PASS", test.id, test.title, Date.now() - started, checks.notes);
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

  // MUST-118 (c): the IPC must still be intercepted (no postMessage fallback; the probe is refused).
  // Not possible after a test closed the app on purpose (AC-960): the stubs were verified before that close.
  if (!report.aborted && !ctx.appClosed) {
    try {
      await ctx.verifyStubs();
    } catch (error) {
      if (!(error instanceof AbortRun)) throw error;
      report.aborted = true;
      report.record("FAIL", "MUST-118", `IPC stubs still in force at the end of ${scenario ? "scenario " + scenario.id : "the run"}`, 0, [`ABORT: ${error.message}`]);
    }
  }

  if (finalShot && !report.aborted && !ctx.appClosed) {
    await takeFinalShot(ctx, fx, cdp, finalShot);
  }
}

// A representative picture of the finished look: many files, size + date columns, tree open.
async function takeFinalShot(ctx, fx, cdp, file) {
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

/** Starts one app (the normal run or a scenario), runs `tests` in it, and always shuts it down again. */
async function launchAndRun(tests, { configToml, navigationToml, scenario, finalShot }) {
  // The test folder exists BEFORE the launch: it is the backend's E2E file scope (R-10). New for every start.
  const fx = new Fixtures();
  current = { handle: undefined, cdp: undefined, fx };
  try {
    const launchOptions = {
      appDir,
      cdpPort: options.port,
      timeoutMs: options.timeout * 1000,
      log,
      fsScope: fx.root,
      expectOverride: options.selftestAbort ? path.join(os.tmpdir(), "rf-e2e-deliberately-wrong") : undefined,
      fx,
    };
    if (navigationToml !== undefined) launchOptions.navigationToml = navigationToml; // (fx) => string | null, written before the spawn
    if (configToml !== undefined) launchOptions.configToml = configToml; // else launchApp's default (ui_theme = "light")
    const handle = await launchApp(launchOptions); // checks the override line + the fs scope notice EVERY time
    current.handle = handle;
    realBefore ??= handle.realBefore;
    await runWithApp(handle, fx, tests, { scenario, finalShot });
  } finally {
    const { handle, cdp } = current;
    current = undefined;
    cdp?.close();
    try {
      if (handle) await shutdown(handle, { keep: false });
    } finally {
      fx.dispose();
    }
  }
}

/** --attach / --keep: one app, as before (the scenarios are skipped by the caller). */
async function runWithOneApp(tests) {
  let handle;
  let fx;
  if (options.attach) {
    handle = await attachApp({ cdpPort: options.port, allowRealConfig: options.realConfig, log });
    realBefore ??= handle.realBefore;
    // the kept app's backend only accepts file operations inside the folder it was started with
    fx = new Fixtures(handle.fsScope ? { root: handle.fsScope } : {});
    current = { handle, cdp: undefined, fx };
  } else {
    fx = new Fixtures();
    current = { handle: undefined, cdp: undefined, fx };
    handle = await launchApp({ appDir, cdpPort: options.port, timeoutMs: options.timeout * 1000, log, fsScope: fx.root });
    current.handle = handle;
    realBefore ??= handle.realBefore;
  }
  await runWithApp(handle, fx, tests, { finalShot: options.finalShot });
}

function skipScenarios(scenarios, reason) {
  for (const s of scenarios) for (const t of s.selected) report.record("SKIP", t.id, t.title, 0, [`scenario ${s.id}: ${reason}`]);
}

async function main() {
  const matches = (t) => options.filter === undefined || t.id.startsWith(options.filter);
  const normal = (await loadTests()).filter(matches);
  const scenarios = (await loadScenarios()).map((s) => ({ ...s, selected: s.tests.filter(matches) })).filter((s) => s.selected.length > 0);
  const scenarioCount = scenarios.reduce((n, s) => n + s.selected.length, 0);
  // SHOULD-184 (2): only a filter that matches neither a normal test nor a scenario test is an error.
  if (normal.length === 0 && scenarioCount === 0) throw new AbortRun(`no test matches --filter ${options.filter}`);
  log(`OS app theme (read only): ${osTheme ?? "unknown"}`);

  if (options.attach || options.keep) {
    // SHOULD-184 (3): one app that stays alive and restarts do not mix.
    if (normal.length > 0) await runWithOneApp(normal);
    skipScenarios(scenarios, options.attach ? "--attach: the app cannot be restarted with another config.toml" : "--keep: the last app would keep the ports");
    return;
  }

  // SHOULD-184 (2): a filter that matches scenario tests only skips the normal start.
  // --selftest-abort always starts once: the launch is what must be stopped.
  if (normal.length > 0 || options.selftestAbort) {
    await launchAndRun(normal, { configToml: undefined, scenario: undefined, finalShot: options.finalShot });
  }
  if (options.selftestAbort) {
    skipScenarios(scenarios, "--selftest-abort");
    return;
  }
  for (const scenario of scenarios) {
    if (report.aborted) {
      // MUST-124 (3): after an abort the remaining scenarios are not started.
      for (const t of scenario.selected) report.record("SKIP", t.id, t.title, 0, [`scenario ${scenario.id} not started: the run was aborted`]);
      continue;
    }
    const skipReason = scenario.skipReason?.() ?? null;
    if (skipReason !== null) {
      for (const t of scenario.selected) report.record("SKIP", t.id, t.title, 0, [`scenario ${scenario.id}: ${skipReason}`]);
      continue;
    }
    log(`scenario ${scenario.id}: ${scenario.title}`);
    await launchAndRun(scenario.selected, { configToml: scenario.configToml, navigationToml: scenario.navigationToml, scenario });
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
  // an app that was still running when an error escaped (launchAndRun cleans up itself; this is the last resort)
  try {
    if (current) {
      current.cdp?.close();
      if (current.handle && !current.handle.attached) await shutdown(current.handle, { keep: options.keep });
      if (!options.keep && !current.handle?.attached) current.fx?.dispose();
    }
  } catch (error) {
    extra.push(`cleanup problem: ${error.message}`);
  }
  try {
    if (realBefore !== undefined) {
      // R-08 (3): the real settings folder must be exactly as it was before the FIRST launch (also after an abort).
      const after = snapshotDir(REAL_CONFIG_DIR);
      const problems = diffSnapshots(realBefore, after);
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
  report.summary(extra);
  exitCode = report.exitCode;
}
process.exit(exitCode);
