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
//  3. after the run, the real settings folder (%APPDATA%\dev.reflexfiles.successor\)
//     must be unchanged (modification times compared with a snapshot taken before).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { listTargets, sleep } from "./cdp.mjs";

export const VITE_PORT = 5173; // vite.config.ts: strictPort
export const IDENTIFIER = "dev.reflexfiles.successor";
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
        `port ${port} is already in use: stop the running ReflexFiles / vite instance, or use --attach for an app started by this script with --keep`,
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

// R-995-1 / SPEC-0200-0001 §3.11.9: the default test config pins the light theme so the existing
// assertions hold on a PC whose OS is dark. `configToml: null` writes no config.toml at all; a string is
// written as is (callers that add `input_keymap_custom` keep the `ui_theme` line themselves).
export const DEFAULT_CONFIG_TOML = 'ui_theme = "light"\n';

/**
 * Launches `tauri dev` and returns once the override line has been verified and the main
 * page is listed by the debug port. Throws AbortRun (after killing the app) otherwise.
 */
export async function launchApp({ appDir, cdpPort, timeoutMs, log, expectOverride, fsScope, configToml = DEFAULT_CONFIG_TOML, navigationToml, fx }) {
  // R-10: the backend refuses file operations outside this folder (the test folder, realpath form).
  if (typeof fsScope !== "string" || !path.isAbsolute(fsScope) || !fs.statSync(fsScope).isDirectory()) {
    throw new AbortRun(`unusable E2E file scope folder: ${fsScope}`);
  }
  const scopeRoot = fs.realpathSync.native(fsScope);
  await assertPortsFree([VITE_PORT, cdpPort]);

  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-cfg-"));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-wv-"));
  // MUST-108 launch rule: non-empty, absolute, an existing empty directory.
  if (!cfgDir || !path.isAbsolute(cfgDir) || !fs.statSync(cfgDir).isDirectory() || fs.readdirSync(cfgDir).length !== 0) {
    throw new AbortRun(`unusable temporary config folder: ${cfgDir}`);
  }

  // Written by the test harness, before the app starts (the app never writes config.toml, R-917-6).
  if (configToml !== null) {
    try {
      fs.writeFileSync(path.join(cfgDir, "config.toml"), configToml, "utf8");
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
