// The test executable for the external-app E2E (SPEC-0300-0021 R-1585 3 / 4; SPEC-0200-0001 §3.16.10, §3.16.15 SHOULD-217 (b)).
//
// `src-tauri/examples/rf_launch_probe.rs` (std only) appends one JSON line `{"exe","args","cwd"}` to `<its own file name>.record.jsonl`
// next to itself and ends (`--rf-sleep=<ms>` waits first, then appends `{"done":true}`). It starts nothing.
//   * buildProbe()        `cargo build --example rf_launch_probe` once per run (`tauri dev` does not build examples);
//   * placeProbe(fx, n)   a copy INSIDE the test folder (in its own sub folder `probe-bin`), the only kind of program an E2E registers;
//   * placeOutsideProbe() a copy OUTSIDE the test folder (under os.tmpdir()), for AC-1525 (the backend must refuse it, R-1584);
//   * readRecords / waitRecords / waitDone / clearRecords, awaitSleepers (cleanup waits for sleeping probes);
//   * externalAppsToml(apps)  the `[[external_apps]]` text (program as a TOML literal string).
// NEVER register or launch anything else: no wt.exe, Code.exe, explorer.exe, GitHubDesktop.exe (AC-1506 scans this tree).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sleep } from "./cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = path.resolve(here, "..", "..", "src-tauri", "Cargo.toml");

let built; // absolute path of rf_launch_probe.exe
const placed = new Set(); // every copy this run made (inside and outside)
const outsideDirs = [];

/** Builds the probe once per run and returns the path of the built executable. Throws with the cargo output on failure. */
export function buildProbe() {
  if (built !== undefined) return built;
  const result = spawnSync("cargo", ["build", "--example", "rf_launch_probe", "--manifest-path", manifest, "--message-format=json"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const tail = String(result.stderr ?? "").split(/\r?\n/).slice(-25).join("\n");
    throw new Error(`cargo build --example rf_launch_probe failed (${result.error ? result.error.message : "exit " + result.status}):\n${tail}`);
  }
  let exe;
  for (const line of String(result.stdout).split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    try {
      const message = JSON.parse(line);
      if (message.reason === "compiler-artifact" && message.target?.name === "rf_launch_probe" && typeof message.executable === "string") exe = message.executable;
    } catch {
      /* not a JSON line */
    }
  }
  if (exe === undefined || !fs.existsSync(exe)) throw new Error("cargo did not report the executable of the example rf_launch_probe");
  built = exe;
  return built;
}

/** A copy of the probe at `<fx.root>\probe-bin\<name>.exe` (made once per name). Returns its absolute path. */
export function placeProbe(fx, name) {
  const src = buildProbe();
  const dest = path.join(fx.mkdir("probe-bin"), `${name}.exe`);
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  placed.add(dest);
  return dest;
}

/** A copy of the probe OUTSIDE the test folder: `%TEMP%\rf-probe-outside-XXXXXX\<name>.exe`. Made once per name. */
const outsideByName = new Map();
export function placeOutsideProbe(name = "outside") {
  const src = buildProbe();
  if (outsideByName.has(name)) return outsideByName.get(name);
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "rf-probe-outside-")));
  outsideDirs.push(dir);
  const dest = path.join(dir, `${name}.exe`);
  fs.copyFileSync(src, dest);
  placed.add(dest);
  outsideByName.set(name, dest);
  return dest;
}

const recordFile = (exe) => `${exe}.record.jsonl`;

/** { calls: [{ exe, args, cwd }], done: <number of end marks> } (a missing file = nothing recorded). */
export function readRecords(exe) {
  let text;
  try {
    text = fs.readFileSync(recordFile(exe), "utf8");
  } catch {
    return { calls: [], done: 0 };
  }
  const calls = [];
  let done = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const record = JSON.parse(line);
    if (record.done === true) done++;
    else calls.push(record);
  }
  return { calls, done };
}

export function clearRecords(exe) {
  fs.rmSync(recordFile(exe), { force: true });
}

/** Waits until at least `count` launches are recorded; returns the calls (it may return fewer after the timeout). */
export async function waitRecords(exe, count, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { calls } = readRecords(exe);
    if (calls.length >= count || Date.now() > deadline) return calls;
    await sleep(100);
  }
}

/** Waits for the end mark of a probe that was started with `--rf-sleep` (SHOULD-217 (b)). */
export async function waitDone(exe, marks = 1, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (readRecords(exe).done >= marks) return true;
    if (Date.now() > deadline) return false;
    await sleep(100);
  }
}

/** Cleanup: waits (up to `timeoutMs`) for every probe that was started with `--rf-sleep=` to write its end mark. */
export async function awaitSleepers(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const waiting = [...placed].filter((exe) => {
      const { calls, done } = readRecords(exe);
      return calls.filter((c) => c.args.some((a) => a.startsWith("--rf-sleep="))).length > done;
    });
    if (waiting.length === 0 || Date.now() > deadline) return waiting;
    await sleep(100);
  }
}

/** Removes the copies outside the test folder (after the sleepers ended). Best effort. */
export async function disposeOutsideProbes() {
  await awaitSleepers();
  for (const dir of outsideDirs.splice(0)) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(300);
      }
    }
  }
  outsideByName.clear();
}

const tomlLiteral = (text) => {
  if (text.includes("'") || /[\r\n]/.test(text)) throw new Error(`cannot write ${JSON.stringify(text)} as a TOML literal string`);
  return `'${text}'`;
};
const tomlBasic = (text) => JSON.stringify(text);

/**
 * `[[external_apps]]` text for `apps = [{ name, program, args?, argsForFile?, key?, raw? }]`. `program` is a TOML literal string; `name`,
 * `key` and the arguments are basic strings. `raw` (an array of "line") is appended to the element as written (for deliberately
 * wrong fields: a name that is not a string, a key that is a number, ...).
 */
export function externalAppsToml(apps) {
  let out = "";
  for (const app of apps) {
    out += "[[external_apps]]\n";
    if (app.name !== undefined) out += `name = ${tomlBasic(app.name)}\n`;
    if (app.program !== undefined) out += `program = ${tomlLiteral(app.program)}\n`;
    if (app.args !== undefined) out += `args = [${app.args.map(tomlBasic).join(", ")}]\n`;
    if (app.argsForFile !== undefined) out += `args_for_file = [${app.argsForFile.map(tomlBasic).join(", ")}]\n`;
    if (app.key !== undefined) out += `key = ${tomlBasic(app.key)}\n`;
    for (const line of app.raw ?? []) out += `${line}\n`;
  }
  return out;
}
