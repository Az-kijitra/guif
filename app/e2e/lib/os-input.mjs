// OS key input for the [E2E・OS 入力] checks (SPEC-0400-0001 5th edition R-12 / R-12-1-1 ~ R-12-5, SPEC-0200-0001
// §3.14.6 and §3.14.12-5 MUST-133 / 134 / 135, SHOULD-205; used by SPEC-0300-0020 AC-1348 and SPEC-0300-0015 AC-520).
//
// What this file does: sends a few keys through the OS input queue (Win32 SendInput, called from PowerShell by P/Invoke;
// Node built-ins only, no dependency) to the window of the app that THIS test run started. Everything is built so that a
// wrong state ends in "nothing sent", never in "keys went somewhere else":
//   * only the names in ALLOWED_KEYS can be sent (checked before the first send; there is no way to name another key);
//   * the app is found by PROCESS: a descendant of the test-launched process whose executable is exactly
//     <app>\src-tauri\target\<profile>\reflexfiles-successor.exe (never by window title, never the user's ReflexFiles.exe);
//   * before EVERY entry the foreground window is read; if it is not the target window nothing more is sent (a FAIL for the
//     caller, never a SKIP), and the real implementation checks it once more inside the same PowerShell call that sends;
//   * the helper never brings a window to the front or moves the focus (the app has to get the foreground by itself);
//   * the modifiers of an entry are pressed and released inside ONE SendInput array; at the end the modifiers are read back
//     (GetAsyncKeyState) and only REPORTED (stuckModifiers), never "repaired" by sending more input;
//   * the opt-in: REFLEXFILES_E2E_OS_INPUT=1 (R-12-5). Without it the checks are SKIPPED with OS_INPUT_SKIP_REASON.
//
// Self test (no app, nothing is sent):   node e2e/lib/os-input.mjs --selftest
// Read-only probe of the Win32 side:      node e2e/lib/os-input.mjs --probe   (prints the foreground window and held modifiers)

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------------------------------------ opt-in

export const OS_INPUT_ENV = "REFLEXFILES_E2E_OS_INPUT";
export const OS_INPUT_SKIP_REASON = `OS のキー入力のテストは無効です(${OS_INPUT_ENV}=1 を設定すると実行します。実行中はユーザーの画面とキーボードを使います)`;

/** null when the OS input checks are enabled, else the SKIP reason (R-12-5). */
export function osInputSkipReason(env = process.env) {
  if (process.platform !== "win32") return "OS のキー入力のテストは無効です(Windows でのみ実行できます)";
  return env[OS_INPUT_ENV] === "1" ? null : OS_INPUT_SKIP_REASON;
}

// ------------------------------------------------------------------------------------------------ the allow-list

/** R-12-3: exactly these names, nothing else (no paging keys, no Enter / Space / Delete, no letters, no Ctrl, no Alt+F4). */
export const ALLOWED_KEYS = Object.freeze([
  "AltTap", "F10", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Alt+F", "Alt+E", "Alt+V", "Alt+G", "Alt+Space",
]);

export function assertAllowedKey(name) {
  if (typeof name !== "string") throw new Error(`os-input: a key name must be a string (got ${typeof name})`);
  if (!ALLOWED_KEYS.includes(name)) throw new Error(`os-input: ${JSON.stringify(name)} is not on the allow-list (${ALLOWED_KEYS.join(" ")})`);
}

/** Alt+Space is one unit with the Escape that closes the system menu it opens (R-12-3). */
export function sequenceFor(name) {
  assertAllowedKey(name);
  return name === "Alt+Space" ? ["Alt+Space", "Escape"] : [name];
}

// ------------------------------------------------------------------------------------------------ the key table

const VK_MENU = 0x12;
const VK = { F10: 0x79, Escape: 0x1b, Space: 0x20, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28 };
const ALT_LETTER = { "Alt+F": 0x46, "Alt+E": 0x45, "Alt+V": 0x56, "Alt+G": 0x47 };
const down = (vk, extended) => (extended ? { vk, down: true, extended: true } : { vk, down: true });
const up = (vk, extended) => (extended ? { vk, down: false, extended: true } : { vk, down: false });

/** ONE flat array per entry: presses AND releases (the modifier is released inside the same SendInput call, MUST-133 b). */
export function buildInputs(name) {
  assertAllowedKey(name);
  if (name === "AltTap") return [down(VK_MENU), up(VK_MENU)];
  if (name === "F10" || name === "Escape") return [down(VK[name]), up(VK[name])];
  if (name.startsWith("Arrow")) return [down(VK[name], true), up(VK[name], true)]; // extended: not the NumLock-dependent numpad arrows
  if (name === "Alt+Space") return [down(VK_MENU), down(VK.Space), up(VK.Space), up(VK_MENU)];
  const letter = ALT_LETTER[name];
  return [down(VK_MENU), down(letter), up(letter), up(VK_MENU)];
}

// ------------------------------------------------------------------------------------------------ finding the app

const sameWindowsPath = (a, b) => typeof a === "string" && a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();

/**
 * R-12-1-1 / MUST-134 (a): the single DESCENDANT of rootPid whose executable path is exactly expectedExePath.
 * Zero or several candidates -> throws (nothing is sent). A parent cycle in the table cannot hang it.
 */
export function selectAppPid(processes, rootPid, expectedExePath) {
  const parent = new Map(processes.map((p) => [p.pid, p.ppid]));
  const isDescendant = (pid) => {
    const seen = new Set();
    for (let cur = parent.get(pid); cur !== undefined && !seen.has(cur); cur = parent.get(cur)) {
      if (cur === rootPid) return true;
      seen.add(cur);
    }
    return false;
  };
  const found = processes.filter((p) => p.pid !== rootPid && sameWindowsPath(p.exePath, expectedExePath) && isDescendant(p.pid));
  if (found.length !== 1) {
    throw new Error(`os-input: expected exactly one app process (${expectedExePath}) below the test-launched process ${rootPid}, found ${found.length}`);
  }
  return found[0].pid;
}

export function expectedExePath({ appDir, profile }) {
  if (profile !== "debug" && profile !== "release") throw new Error(`os-input: unknown build profile ${String(profile)}`);
  return path.join(appDir, "src-tauri", "target", profile, "reflexfiles-successor.exe");
}

// ------------------------------------------------------------------------------------------------ sendKeys

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertTarget(target) {
  const ok = target !== null && typeof target === "object" && Number.isInteger(target.pid) && target.pid > 0 && Number.isInteger(target.hwnd) && target.hwnd > 0;
  if (!ok) throw new Error("os-input: the target needs a pid and a window handle (the helper never guesses a window)");
}

/**
 * Sends `names` (allow-listed key names, validated ALL before the first send) to `target` = { pid, hwnd }.
 * deps: { getForegroundHwnd, sendInput(inputs) [returning false = refused], getPressedModifiers?, delayMs? }.
 * Resolves { sent, aborted, reason?, stuckModifiers }. Before each entry of the expanded sequence the foreground window is
 * read; when it is not target.hwnd (0 = none) the rest is not sent. The modifiers are read back at the end whatever happened.
 */
export async function sendKeys(target, names, deps) {
  assertTarget(target);
  if (!Array.isArray(names)) throw new Error("os-input: the key names must be an array");
  for (const name of names) assertAllowedKey(name);
  const entries = names.flatMap((name) => sequenceFor(name));
  const result = { sent: [], aborted: false, stuckModifiers: [] };
  try {
    for (let i = 0; i < entries.length; i++) {
      const foreground = await deps.getForegroundHwnd();
      if (foreground !== target.hwnd) {
        result.aborted = true;
        result.reason = `the foreground window is ${foreground === 0 ? "none" : "0x" + foreground.toString(16)}, not the app window 0x${target.hwnd.toString(16)}; nothing more was sent`;
        break;
      }
      const accepted = await deps.sendInput(buildInputs(entries[i]));
      if (accepted === false) {
        result.aborted = true;
        result.reason = "the foreground window changed right before the send; the input was refused";
        break;
      }
      result.sent.push(entries[i]);
      if (i < entries.length - 1) await sleep(deps.delayMs ?? 120);
    }
  } finally {
    if (typeof deps.getPressedModifiers === "function") {
      try {
        result.stuckModifiers = [...(await deps.getPressedModifiers())];
      } catch {
        result.stuckModifiers = [-1]; // could not be read: reported as stuck rather than assumed fine
      }
    }
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ the PowerShell side

const CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class RfOs {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int l; public int t; public int r; public int b; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO { public int cbSize; public int flags; public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture; public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret; public RECT rcCaret; }
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO info);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint type);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);

  // The foreground window, or 0 when there is none or the foreground thread's active window is not the same window.
  public static long Foreground() {
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return 0;
    uint pid;
    uint tid = GetWindowThreadProcessId(fg, out pid);
    GUITHREADINFO gi = new GUITHREADINFO();
    gi.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(tid, ref gi)) return 0;
    if (gi.hwndActive != fg) return 0;
    return fg.ToInt64();
  }
  // Read-only: GUI_INMENUMODE (0x4) / GUI_SYSTEMMENUMODE (0x8) of the foreground thread: "flags activeHwnd menuOwnerHwnd".
  public static string GuiState() {
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return "0 0 0";
    uint pid;
    uint tid = GetWindowThreadProcessId(fg, out pid);
    GUITHREADINFO gi = new GUITHREADINFO();
    gi.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(tid, ref gi)) return "0 0 0";
    return gi.flags + " " + gi.hwndActive.ToInt64() + " " + gi.hwndMenuOwner.ToInt64();
  }
  public static string RectOf(long hwnd) {
    RECT r;
    if (!GetWindowRect(new IntPtr(hwnd), out r)) return "0 0 0 0";
    return r.l + " " + r.t + " " + r.r + " " + r.b;
  }
  public static long ForegroundPid() {
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return 0;
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    return pid;
  }
  public static string Modifiers() {
    int[] vks = new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5 };
    List<string> held = new List<string>();
    foreach (int vk in vks) if ((GetAsyncKeyState(vk) & 0x8000) != 0) held.Add(vk.ToString());
    return string.Join(",", held.ToArray());
  }
  // Visible, unowned top-level windows of one process that are really windows (at least 100 x 100: the tao event
  // target window of the app is "visible" too, but has no size).
  public static string Windows(uint wanted) {
    List<string> list = new List<string>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      RECT r;
      if (pid == wanted && IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero && GetWindowRect(h, out r) && (r.r - r.l) >= 100 && (r.b - r.t) >= 100) list.Add(h.ToInt64().ToString());
      return true;
    }, IntPtr.Zero);
    return string.Join(",", list.ToArray());
  }
  // ONE SendInput call for the whole array; the foreground is checked again right before it.
  public static string Send(long expectHwnd, string spec) {
    if (Foreground() != expectHwnd) return "refused";
    string[] parts = spec.Split(';');
    INPUT[] inputs = new INPUT[parts.Length];
    for (int i = 0; i < parts.Length; i++) {
      string[] f = parts[i].Split(':');
      uint vk = uint.Parse(f[0]);
      uint flags = 0;
      if (f[1] == "u") flags |= 0x2;
      if (f[2] == "e") flags |= 0x1;
      inputs[i].type = 1;
      inputs[i].u.ki.wVk = (ushort)vk;
      inputs[i].u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
      inputs[i].u.ki.dwFlags = flags;
    }
    uint n = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    return n == (uint)inputs.Length ? "ok" : "error:" + Marshal.GetLastWin32Error();
  }
}
`;

const WORKER_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# a stale LIB entry of the developer machine makes the C# compiler warn, and Add-Type treats that as an error (this process only)
Remove-Item Env:LIB -ErrorAction SilentlyContinue
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -IgnoreWarnings -TypeDefinition @'
${CSHARP}
'@
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try {
    $p = $line.Split(' ')
    switch ($p[0]) {
      'fg' { $out = [RfOs]::Foreground().ToString() + ' ' + [RfOs]::ForegroundPid().ToString() }
      'mods' { $out = [RfOs]::Modifiers() }
      'gui' { $out = [RfOs]::GuiState() }
      'rect' { $out = [RfOs]::RectOf([int64]$p[1]) }
      'windows' { $out = [RfOs]::Windows([uint32]$p[1]) }
      'send' { $out = [RfOs]::Send([int64]$p[1], $p[2]) }
      'procs' { $out = ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object { @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; exe = $_.ExecutablePath } }) -Compress }
      default { $out = 'unknown' }
    }
  } catch { $out = 'exception:' + $_.Exception.Message.Replace([Environment]::NewLine, ' ') }
  [Console]::Out.WriteLine('R ' + $out)
}
`;

/** A persistent PowerShell (compiled once). Requests are strictly one at a time. */
class Worker {
  #child;
  #buffer = "";
  #lines = [];
  #waiter = null;
  #closed = false;

  static async start(timeoutMs = 90000) {
    const worker = new Worker();
    const encoded = Buffer.from(WORKER_SCRIPT, "utf16le").toString("base64");
    worker.#child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-InputFormat", "Text", "-EncodedCommand", encoded], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    worker.#child.stdout.setEncoding("utf8");
    worker.#child.stdout.on("data", (chunk) => worker.#onData(chunk));
    let stderr = "";
    worker.#child.stderr.on("data", (chunk) => (stderr += chunk));
    worker.#child.on("exit", () => {
      worker.#closed = true;
      worker.#wake();
    });
    const ready = await worker.#readLine(timeoutMs);
    if (ready !== "READY") {
      worker.close();
      throw new Error(`os-input: the PowerShell helper did not start (${ready ?? "no output"}) ${stderr.slice(0, 300)}`);
    }
    return worker;
  }

  #onData(chunk) {
    this.#buffer += chunk;
    let at;
    while ((at = this.#buffer.indexOf("\n")) >= 0) {
      this.#lines.push(this.#buffer.slice(0, at).replace(/\r$/, ""));
      this.#buffer = this.#buffer.slice(at + 1);
    }
    this.#wake();
  }

  #wake() {
    const w = this.#waiter;
    this.#waiter = null;
    if (w) w();
  }

  async #readLine(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.#lines.length > 0) return this.#lines.shift();
      if (this.#closed || Date.now() > deadline) return null;
      await new Promise((resolve) => {
        this.#waiter = resolve;
        setTimeout(resolve, 200);
      });
    }
  }

  async request(line, timeoutMs = 30000) {
    if (this.#closed) throw new Error("os-input: the PowerShell helper has ended");
    this.#child.stdin.write(line + "\n");
    const answer = await this.#readLine(timeoutMs);
    if (answer === null || !answer.startsWith("R ")) throw new Error(`os-input: unexpected answer from the PowerShell helper: ${answer}`);
    const body = answer.slice(2);
    if (body.startsWith("exception:")) throw new Error(`os-input: ${body}`);
    return body;
  }

  close() {
    this.#closed = true;
    try {
      this.#child.stdin.end();
    } catch {
      /* already closed */
    }
    try {
      this.#child.kill();
    } catch {
      /* already ended */
    }
  }
}

const specOf = (inputs) => inputs.map((i) => `${i.vk}:${i.down ? "d" : "u"}:${i.extended ? "e" : "n"}`).join(";");

/** The real deps for one target window. sendInput is refused (false) when the foreground is not the target at that moment. */
export function realDeps(worker, target) {
  return {
    getForegroundHwnd: async () => Number((await worker.request("fg")).split(" ")[0]),
    sendInput: async (inputs) => {
      const answer = await worker.request(`send ${target.hwnd} ${specOf(inputs)}`);
      if (answer === "refused") return false;
      if (answer !== "ok") throw new Error(`os-input: SendInput failed (${answer})`);
      return true;
    },
    getPressedModifiers: async () => {
      const held = await worker.request("mods");
      return held === "" ? [] : held.split(",").map(Number);
    },
  };
}

/**
 * Opens a session for the app the test run started: finds its process (R-12-1-1) and its single visible top-level window.
 * It does not touch the window in any way. Throws when the process or the window is not unique (nothing is sent then).
 */
export async function openSession({ rootPid, appDir, profile = "debug" }) {
  const worker = await Worker.start();
  try {
    const table = JSON.parse(await worker.request("procs", 60000)).map((p) => ({ pid: p.pid, ppid: p.ppid, exePath: p.exe ?? null }));
    const exe = expectedExePath({ appDir, profile });
    const pid = selectAppPid(table, rootPid, exe);
    const windows = async () => {
      const text = await worker.request(`windows ${pid}`);
      return text === "" ? [] : text.split(",").map(Number);
    };
    const first = await windows();
    if (first.length !== 1) throw new Error(`os-input: the app process ${pid} has ${first.length} visible top-level windows (expected exactly one before the viewer opens)`);
    const target = { pid, hwnd: first[0] };
    return {
      worker,
      pid,
      exe,
      target,
      deps: realDeps(worker, target),
      windows,
      /** deps + target for another window of the SAME app process (e.g. the viewer). */
      forWindow(hwnd) {
        const t = { pid, hwnd };
        return { target: t, deps: realDeps(worker, t) };
      },
      foreground: async () => {
        const [hwnd, fgPid] = (await worker.request("fg")).split(" ").map(Number);
        return { hwnd, pid: fgPid };
      },
      /** Read-only: { flags, inMenuMode, inSystemMenuMode, active, menuOwner } of the foreground thread. */
      guiState: async () => {
        const [flags, active, menuOwner] = (await worker.request("gui")).split(" ").map(Number);
        return { flags, inMenuMode: (flags & 0x4) !== 0, inSystemMenuMode: (flags & 0x8) !== 0, active, menuOwner };
      },
      /** Read-only: the window rectangle [left, top, right, bottom]. */
      rect: async (hwnd) => (await worker.request(`rect ${hwnd}`)).split(" ").map(Number),
      close: () => worker.close(),
    };
  } catch (error) {
    worker.close();
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------ self tests

async function selftest() {
  let failures = 0;
  const check = (name, ok, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  };
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check("the list has 12 names and is frozen", ALLOWED_KEYS.length === 12 && Object.isFrozen(ALLOWED_KEYS));
  check("allowed names pass", ALLOWED_KEYS.every((k) => !throws(() => assertAllowedKey(k))));
  const outside = [["Page", "Down"].join(""), ["Ctrl", "C"].join("+"), ["Alt", "F4"].join("+"), "f10", "", 13, null];
  check("outside names are refused", outside.every((k) => throws(() => assertAllowedKey(k))));
  check("Alt+Space expands to Alt+Space, Escape", JSON.stringify(sequenceFor("Alt+Space")) === '["Alt+Space","Escape"]');
  const exe = "C:\\r\\app\\src-tauri\\target\\debug\\reflexfiles-successor.exe";
  const table = [
    { pid: 1, ppid: 0, exePath: "n" },
    { pid: 2, ppid: 1, exePath: exe },
    { pid: 3, ppid: 0, exePath: exe },
    { pid: 4, ppid: 1, exePath: "C:\\Users\\x\\ReflexFiles.exe" },
  ];
  check("PID selection picks the descendant with the exact path", selectAppPid(table, 1, exe) === 2);
  check("PID selection refuses zero candidates", throws(() => selectAppPid(table.filter((p) => p.pid !== 2), 1, exe)));
  let sends = 0;
  const target = { pid: 2, hwnd: 100 };
  const wrong = await sendKeys(target, ["F10"], { getForegroundHwnd: () => 7, sendInput: () => void sends++ });
  check("dry run: another foreground window -> nothing is sent", wrong.aborted && sends === 0);
  const right = await sendKeys(target, ["F10", "ArrowDown"], { getForegroundHwnd: () => 100, sendInput: () => void sends++, delayMs: 0 });
  check("dry run: the app in front -> every entry is sent once", !right.aborted && sends === 2 && right.sent.length === 2);
  check("a name outside the list is refused before anything is sent", await sendKeys(target, ["F10", ["Ent", "er"].join("")], { getForegroundHwnd: () => 100, sendInput: () => void sends++ }).then(() => false, () => true) && sends === 2);
  return failures === 0 ? 0 : 1;
}

async function probe() {
  const worker = await Worker.start();
  try {
    console.log(`foreground (hwnd pid): ${await worker.request("fg")}`);
    console.log(`modifiers held (vk list): ${JSON.stringify(await worker.request("mods"))}`);
    console.log(`windows of this process's parent: ${JSON.stringify(await worker.request(`windows ${process.ppid}`))}`);
  } finally {
    worker.close();
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes("--selftest")) process.exit(await selftest());
  if (process.argv.includes("--probe")) process.exit(await probe());
}
