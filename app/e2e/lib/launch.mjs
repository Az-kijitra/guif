// Starts / stops the real app (`tauri dev`) for the E2E run and guards the user's
// real data (SPEC-0400-0001 第2版 R-08; SPEC-0200-0001 §3.8.14, §3.8.17 MUST-109).
//
//  1. a fresh temporary config folder is passed as REFLEXFILES_CONFIG_DIR (the app
//     only honours it in debug builds);
//  2. the app must print `[config] override dir: <that path>` on stderr; if the line
//     is missing or names another path, the app is killed BEFORE the page is ever
//     connected, so not a single input is sent;
//  2b. REFLEXFILES_E2E_FS_SCOPE = the test folder is passed too (debug builds): the backend then
//     refuses file operations outside it (SPEC-0400-0001 R-10); the notice `E2E fs scope active: ...`
//     must be seen on stderr before any input is sent (SPEC-0200-0001 §3.10.17.6);
//  3. after the run, the real settings folder (%APPDATA%\dev.guif.app\)
//     must be unchanged (modification times compared with a snapshot taken before).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { listTargets, sleep } from "./cdp.mjs";

export const VITE_PORT = 5173; // vite.config.ts: strictPort
export const IDENTIFIER = "dev.guif.app";
export const REAL_CONFIG_DIR = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), IDENTIFIER);
const KEEP_FILE = path.join(os.tmpdir(), "rf-e2e-keep.json");
const OVERRIDE_LINE = /^\[config\] override dir: (.*)$/;
// SPEC-0400-0001 R-10-2 / SPEC-0200-0001 §3.10.17.6: the backend's notice that the E2E file scope is active.
const SCOPE_LINE = /^E2E fs scope active: (.*)$/;

export class AbortRun extends Error {}

// ---------------------------------------------------------------- snapshots

/** relative path -> "d|f:mtimeMs:size" for the folder itself and everything below it. */
export function snapshotDir(dir) {
  if (!fs.existsSync(dir)) return { "(folder)": "absent" };
  const result = {};
  const visit = (full, rel) => {
    const stat = fs.statSync(full);
    result[rel || "."] = `${stat.isDirectory() ? "d" : "f"}:${stat.mtimeMs}:${stat.isDirectory() ? 0 : stat.size}`;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full)) visit(path.join(full, name), rel ? `${rel}/${name}` : name);
    }
  };
  visit(dir, "");
  return result;
}

export function diffSnapshots(before, after) {
  const problems = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) problems.push(`${key}: ${before[key] ?? "(none)"} -> ${after[key] ?? "(none)"}`);
  }
  return problems;
}

// -------------------------------------------------------------------- ports

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export async function assertPortsFree(ports) {
  for (const port of ports) {
    if (await portInUse(port)) {
      throw new AbortRun(
        `port ${port} is already in use: stop the running guif / vite instance, or use --attach for an app started by this script with --keep`,
      );
    }
  }
}

// ---------------------------------------------------------------- processes

export function killTree(pid) {
  if (!pid) return;
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
}

/** PIDs listening on the given TCP ports (from `netstat -ano`). */
function listenersOn(ports) {
  const output = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout ?? "";
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(line);
    if (m && ports.includes(Number(m[1]))) pids.add(Number(m[2]));
  }
  return [...pids];
}

/**
 * After the normal tree kill, make sure nothing of this run still listens on the vite / debug
 * ports (the ports were verified free at launch, so any listener is ours). If something is left
 * (a detached `tauri dev` tree), kill the listeners and their ancestors up to this script.
 */
async function ensurePortsFree(ports) {
  for (let i = 0; i < 6; i++) {
    if (listenersOn(ports).length === 0) return;
    await sleep(500);
  }
  const leftovers = listenersOn(ports);
  let table = [];
  try {
    const json = execFileSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"], { encoding: "utf8" });
    table = [].concat(JSON.parse(json));
  } catch {
    /* fall back to killing the listeners only */
  }
  const byPid = new Map(table.map((p) => [p.ProcessId, p]));
  const victims = new Set(leftovers);
  for (const pid of leftovers) {
    for (let p = byPid.get(pid), guard = 0; p && guard < 10; p = byPid.get(p.ParentProcessId), guard++) {
      if (p.ProcessId === process.pid || p.ProcessId === process.ppid) break;
      if (/^(reflexfiles-successor|cargo|node|npm|cmd|tauri)/i.test(p.Name)) victims.add(p.ProcessId);
      else if (p.ProcessId !== pid) break;
    }
  }
  for (const pid of victims) killTree(pid);
  await sleep(1000);
}

function normalizePathForCompare(p) {
  return path.resolve(p.trim()).replace(/[\\/]+$/, "").toLowerCase();
}

/** SHOULD-178: the backend prints the canonical (verbatim, `\\?\`) form; compare with that prefix stripped on BOTH sides. */
export function stripExtendedPrefix(p) {
  return p.trim().replace(/^\\\\\?\\/, "");
}

function removeDir(dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      // WebView2 may still hold files for a moment.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}

// ------------------------------------------------------------------- launch

// SPEC-0300-0023 R-1840: the default test config writes no colour (the default preset nord is measured; a `ui_theme` line is an unknown key now
// and would raise W-AC in every scenario). `configToml: null` writes no config.toml at all; a string is written as is.
// SPEC-0300-0021 R-1585 2: every config.toml the E2E writes declares `external_apps` (without it the default four are active and a key press
// could start the USER's apps). `configToml: null` (no file) is not allowed.
export const DEFAULT_CONFIG_TOML = 'external_apps = []\n';

// MUST-143 (a): there is a `[[external_apps]]` heading, or an `external_apps =` line BEFORE the first table header (a line after
// `[input_keymap_custom]` belongs to that table). The same rule as src/e2e-external-apps-static.test.ts.
function declaresExternalApps(toml) {
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[\[\s*external_apps\s*\]\]/.test(line)) return true;
    if (/^\[/.test(line)) return false;
    if (/^external_apps\s*=/.test(line)) return true;
  }
  return false;
}

// SPEC-0300-0021 R-1585 2 / AC-1506, SPEC-0300-0022 R-1682 / AC-1680, SPEC-0400-0001 R-08-1 1: the ONLY scenarios that may start without `external_apps` in
// config.toml. S8 (specs/theme.mjs) is a deliberately broken file; F0 (specs/settings-file.mjs, AC-1645) starts WITHOUT a config.toml. Both are
// guarded by (i) the page-side block of `external_app_launch` (BLOCKED_COMMANDS), (ii) the backend scope check, (iii) this list. The same list is
// in src/e2e-external-apps-static.test.ts (ALLOW_LIST).
export const UNDECLARED_EXTERNAL_APPS_SCENARIOS = ["S8", "F0"];

/** Throws AbortRun unless `configToml` (a string) declares external_apps; null / undefined / non-strings are refused too. */
export function assertExternalAppsDeclared(configToml) {
  if (typeof configToml === "string" && declaresExternalApps(configToml)) return;
  throw new AbortRun("the test config.toml does not declare external_apps (before the first table header): the default four registrations would start the user's apps");
}

/**
 * Launches `tauri dev` and returns once the override line has been verified and the main
 * page is listed by the debug port. Throws AbortRun (after killing the app) otherwise.
 */
export async function launchApp({ appDir, cdpPort, timeoutMs, log, expectOverride, fsScope, configToml = DEFAULT_CONFIG_TOML, navigationToml, seedConfigDir, fx, allowUndeclaredExternalApps = false, scenarioId }) {
  // R-10: the backend refuses file operations outside this folder (the test folder, realpath form).
  if (typeof fsScope !== "string" || !path.isAbsolute(fsScope) || !fs.statSync(fsScope).isDirectory()) {
    throw new AbortRun(`unusable E2E file scope folder: ${fsScope}`);
  }
  // R-1585 2: refuse before anything is created. The ONE explicit opt-out is a deliberately broken config (theme.mjs S8).
  const configText = typeof configToml === "function" ? configToml(fx) : configToml;
  if (allowUndeclaredExternalApps && !UNDECLARED_EXTERNAL_APPS_SCENARIOS.includes(scenarioId)) {
    throw new AbortRun(`scenario ${scenarioId ?? "(none)"} is not on the list of scenarios that may start without external_apps (${UNDECLARED_EXTERNAL_APPS_SCENARIOS.join(", ")})`);
  }
  if (!allowUndeclaredExternalApps) assertExternalAppsDeclared(configText);
  const scopeRoot = fs.realpathSync.native(fsScope);
  await assertPortsFree([VITE_PORT, cdpPort]);

  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-cfg-"));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-wv-"));
  // MUST-108 launch rule: non-empty, absolute, an existing empty directory.
  if (!cfgDir || !path.isAbsolute(cfgDir) || !fs.statSync(cfgDir).isDirectory() || fs.readdirSync(cfgDir).length !== 0) {
    throw new AbortRun(`unusable temporary config folder: ${cfgDir}`);
  }

  // Written by the test harness, before the app starts (the app never writes config.toml, R-917-6).
  if (configText !== null) {
    try {
      fs.writeFileSync(path.join(cfgDir, "config.toml"), configText, "utf8");
    } catch (e) {
      removeDir(cfgDir);
      removeDir(userData);
      throw new AbortRun(`could not write the test config.toml: ${e.message}`);
    }
  }

  // SHOULD-190: `navigationToml` is `(fx) => string | null` (the content may name folders inside the fresh test
  // folder `fx.root`, which exists only per start). It is written into cfgDir (= REFLEXFILES_CONFIG_DIR) only,
  // after the Fixtures exist and before the app is spawned; a failure removes the folders and aborts the run.
  if (navigationToml !== undefined && navigationToml !== null) {
    try {
      if (typeof navigationToml !== "function") throw new Error("navigationToml must be a function (fx) => string | null");
      const content = navigationToml(fx);
      if (content !== null) {
        if (typeof content !== "string") throw new Error("navigationToml returned neither a string nor null");
        fs.writeFileSync(path.join(cfgDir, "navigation.toml"), content, "utf8");
      }
    } catch (e) {
      removeDir(cfgDir);
      removeDir(userData);
      throw new AbortRun(`could not write the test navigation.toml: ${e.message}`);
    }
  }

  // SPEC-0300-0022 AC-1620 / AC-1621 / AC-1623: a scenario may put a `config.sample.toml` (a file with a given content and age, or a FOLDER) into the throw-away
  // config folder before the start, to see what the start does with it. `seedConfigDir` is `(fx) => [{ name, content?, dir?, mtime? }]`; ONLY the name
  // `config.sample.toml` is accepted (never `config.toml`: that one is written above, after the external_apps check) and only inside cfgDir.
  if (seedConfigDir !== undefined && seedConfigDir !== null) {
    try {
      for (const entry of seedConfigDir(fx)) {
        if (entry.name !== "config.sample.toml") throw new Error(`seedConfigDir may only create config.sample.toml (got ${entry.name})`);
        const target = path.join(cfgDir, entry.name);
        if (entry.dir === true) fs.mkdirSync(target);
        else fs.writeFileSync(target, entry.content, "utf8");
        if (entry.mtime !== undefined) fs.utimesSync(target, entry.mtime, entry.mtime);
      }
    } catch (e) {
      removeDir(cfgDir);
      removeDir(userData);
      throw new AbortRun(`could not seed the test config folder: ${e.message}`);
    }
  }

  const realBefore = snapshotDir(REAL_CONFIG_DIR);
  log(`config override folder: ${cfgDir}`);

  // The app's output goes to files (not pipes) so a --keep run can outlive this script.
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-log-"));
  const errPath = path.join(logDir, "app.err.log");
  const outFd = fs.openSync(path.join(logDir, "app.out.log"), "w");
  const errFd = fs.openSync(errPath, "w");

  const child = spawn("npm", ["run", "tauri", "--", "dev"], {
    cwd: appDir,
    shell: true,
    windowsHide: true,
    stdio: ["ignore", outFd, errFd],
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      WEBVIEW2_USER_DATA_FOLDER: userData,
      REFLEXFILES_CONFIG_DIR: cfgDir,
      REFLEXFILES_E2E_FS_SCOPE: scopeRoot,
    },
  });
  const handle = { child, pid: child.pid, cfgDir, userData, logDir, realBefore, cdpPort, attached: false, fsScope: scopeRoot };
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  const stderrLines = () => fs.readFileSync(errPath, "utf8").split(/\r?\n/);

  const fail = async (message) => {
    killTree(child.pid);
    await ensurePortsFree([VITE_PORT, cdpPort]);
    removeDir(cfgDir);
    removeDir(userData);
    removeDir(logDir);
    throw new AbortRun(message);
  };

  // (1) the override line, before anything is connected.
  const deadline = Date.now() + timeoutMs;
  let overrideLine;
  for (;;) {
    const lines = stderrLines();
    const found = lines.map((line) => OVERRIDE_LINE.exec(line)).find((m) => m !== null);
    if (found) {
      overrideLine = found[1];
      break;
    }
    if (exited) await fail("the app exited before printing `[config] override dir:`; last stderr lines:\n" + lines.slice(-15).join("\n"));
    if (Date.now() > deadline) await fail("timed out waiting for the `[config] override dir:` line on stderr; no input was sent");
    await sleep(500);
  }
  // `expectOverride` exists only for the abort self-test (--selftest-abort): it makes the check fail on purpose.
  const expected = expectOverride ?? cfgDir;
  if (normalizePathForCompare(overrideLine) !== normalizePathForCompare(expected)) {
    await fail(`override dir mismatch: the app reports "${overrideLine}" but the test folder is "${expected}"; no input was sent`);
  }
  log(`verified: the app reports the override folder ${overrideLine}`);

  // (1b) the E2E file scope notice (printed right after the override line); no input before it is verified.
  let scopeLine;
  for (;;) {
    const lines = stderrLines();
    const found = lines.map((line) => SCOPE_LINE.exec(line)).find((m) => m !== null);
    if (found) {
      scopeLine = found[1];
      break;
    }
    if (exited) await fail("the app exited before printing `E2E fs scope active:`; last stderr lines:\n" + lines.slice(-15).join("\n"));
    if (Date.now() > deadline) await fail("timed out waiting for the `E2E fs scope active:` line on stderr; no input was sent");
    await sleep(500);
  }
  if (normalizePathForCompare(stripExtendedPrefix(scopeLine)) !== normalizePathForCompare(stripExtendedPrefix(scopeRoot))) {
    await fail(`E2E file scope mismatch: the app reports "${scopeLine}" but the test folder is "${scopeRoot}"; no input was sent`);
  }
  log(`verified: the backend limits file operations to ${scopeLine}`);

  // (2) the main page.
  let target;
  while (target === undefined) {
    if (exited) await fail("the app exited before its page became available");
    if (Date.now() > deadline) await fail("timed out waiting for the main page on the debug port");
    try {
      const targets = await listTargets(cdpPort);
      target = targets.find((t) => t.type === "page" && !t.url.includes("/viewer") && t.url.startsWith("http"));
    } catch {
      /* the debug port is not open yet */
    }
    if (target === undefined) await sleep(2000);
  }
  handle.target = target;
  return handle;
}

// SPEC-0300-0022 R-1681 / AC-1608 (SPEC-0200-0001 §3.17.11): the backend prints ONE line per decision of "設定ファイルを開く" to its standard error while an
// E2E scope is active (`[e2e] settings-file launch: refused|vscode|association`); no file is written. This reads those lines from the app's
// standard-error log (`handle.logDir`), in order. `refused` = the scope refused the launch; `vscode` / `association` = a launch was started
// (must never be seen in an E2E).
const SETTINGS_LAUNCH_LINE = /^\[e2e\] settings-file launch: (\S+)\s*$/;
export function readSettingsLaunchLog(logDir) {
  const text = fs.readFileSync(path.join(logDir, "app.err.log"), "utf8");
  return text.split(/\r?\n/).map((line) => SETTINGS_LAUNCH_LINE.exec(line)).filter((m) => m !== null).map((m) => m[1]);
}

/** --attach: reuse an app that THIS script started with --keep (so its override is known). */
export async function attachApp({ cdpPort, allowRealConfig, log }) {
  let kept;
  try {
    kept = JSON.parse(fs.readFileSync(KEEP_FILE, "utf8"));
  } catch {
    kept = undefined;
  }
  if (kept === undefined && !allowRealConfig) {
    throw new AbortRun("--attach needs an app started by this script with --keep (no record found); --i-know-this-uses-real-config overrides this check");
  }
  if (kept !== undefined) {
    log(`attaching to the app started with --keep (config override folder ${kept.cfgDir})`);
  } else {
    log("WARNING: attaching to an app whose settings folder is unknown; it may use your real data");
  }
  const port = kept?.cdpPort ?? cdpPort;
  if (kept !== undefined) {
    // The record must describe a live app of ours: its stderr log names the same override folder,
    // that folder still exists, and something listens on the recorded debug port.
    let reported;
    try {
      const m = fs.readFileSync(path.join(kept.logDir, "app.err.log"), "utf8").split(/\r?\n/).map((x) => OVERRIDE_LINE.exec(x)).find((x) => x !== null);
      reported = m?.[1];
    } catch {
      reported = undefined;
    }
    if (!reported || normalizePathForCompare(reported) !== normalizePathForCompare(kept.cfgDir) || !fs.existsSync(kept.cfgDir)) {
      throw new AbortRun("the --keep record does not match a running app of this script (override line / folder); refusing to attach");
    }
    if (listenersOn([port]).length === 0) throw new AbortRun("nothing listens on the recorded debug port; the kept app is gone");
  }
  if (kept !== undefined) {
    // SHOULD-217 (c): the kept folder's config.toml follows the same rule, checked before anything is connected.
    let keptConfig;
    try {
      keptConfig = fs.readFileSync(path.join(kept.cfgDir, "config.toml"), "utf8");
    } catch {
      keptConfig = undefined;
    }
    assertExternalAppsDeclared(keptConfig);
  }
  const targets = await listTargets(port);
  const target = targets.find((t) => t.type === "page" && !t.url.includes("/viewer") && t.url.startsWith("http"));
  if (target === undefined) throw new AbortRun("no main page found on the debug port");
  // S-3: without the recorded backend scope the app cannot be shown to refuse file operations outside the
  // test folder, and the specs change files: refuse to run at all.
  if (!kept?.fsScope) {
    throw new AbortRun("--attach: the backend file scope (REFLEXFILES_E2E_FS_SCOPE) of this app cannot be confirmed; refusing to run specs that change files");
  }
  return {
    child: undefined,
    pid: kept?.pid,
    cfgDir: kept?.cfgDir,
    userData: kept?.userData,
    logDir: kept?.logDir,
    realBefore: kept?.realBefore ?? snapshotDir(REAL_CONFIG_DIR),
    cdpPort: port,
    attached: true,
    fsScope: kept?.fsScope,
    target,
  };
}

/** Kills the app and deletes the temporary folders; with `keep`, leaves the app running. */
export async function shutdown(handle, { keep }) {
  if (handle.attached) return;
  if (keep) {
    fs.writeFileSync(
      KEEP_FILE,
      JSON.stringify({
        pid: handle.pid,
        cdpPort: handle.cdpPort,
        cfgDir: handle.cfgDir,
        userData: handle.userData,
        logDir: handle.logDir,
        realBefore: handle.realBefore,
        fsScope: handle.fsScope,
      }),
    );
    handle.child?.unref();
    return;
  }
  killTree(handle.pid);
  await ensurePortsFree([VITE_PORT, handle.cdpPort]);
  fs.rmSync(KEEP_FILE, { force: true });
  removeDir(handle.cfgDir);
  removeDir(handle.userData);
  if (handle.logDir) removeDir(handle.logDir);
}
