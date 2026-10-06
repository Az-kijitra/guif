// OS clipboard guard for the E2E run (SPEC-0400-0001 第4版 R-09 / R-09-1 ~ R-09-3 / AC-09;
// SPEC-0300-0018 AC-1051; design SPEC-0200-0001 §3.9.14, §3.10.13, §3.10.17.7 SHOULD-174).
//
// The app writes the user's REAL OS clipboard (text for "copy path", a file list + Preferred
// DropEffect for copy / cut). Before a test the clipboard is inspected from the TEST side
// (Windows PowerShell 5.1, STA, `System.Windows.Forms.Clipboard`; PowerShell 7's Get-Clipboard
// only knows text; never through the app under test):
//   * empty / text only / a file list (+ Preferred DropEffect and other companion formats)
//       -> saved, the clipboard is EMPTIED before the test starts (the OS content decides what a
//          paste takes, R-09 step 2-1) and put back afterwards, also when the test failed;
//   * anything else (image, HTML, rich text, a file list together with text, ...) -> it cannot
//     be restored -> the test is SKIPPED (R-09 step 3).
// A restore that still fails after one retry FAILS the test (the user's clipboard is not silently lost).
//
// Node built-ins only (node:child_process). Self test (does not need the app):
//   node app/e2e/lib/clipboard.mjs --selftest
//
// NOTE for the runner: with Windows clipboard history / cloud sync turned on, the content written by
// the test can remain in the history or sync target. For the check to run, copy plain text or files
// only before the run (copying from a browser or IDE often adds "HTML Format" and the check is skipped).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Skip } from "./report.mjs";

const TEXT_FORMATS = new Set(["UnicodeText", "Text", "OEMText", "System.String", "Locale"]);
// Formats that ride along with a file list (what Explorer / this app add). The list is fixed from the
// output of GetFormats($false) on a real machine (R-09-1); a format not listed makes the clipboard
// "other" (-> SKIP) instead of risking a lossy restore.
const FILE_COMPANION_FORMATS = new Set([
  "FileDrop",
  "Preferred DropEffect",
  "FileNameW",
  "FileName",
  "Shell IDList Array",
  "Shell Object Offsets",
  "DragContext",
  "DropDescription",
  "DragImageBits",
  "IsShowingLayered",
  "IsShowingText",
  "UsingDefaultDragImage",
  "InShellDragLoop",
  "Ole Private Data",
  "Paste Succeeded",
  "Performed DropEffect",
  "Logical Performed DropEffect",
]);

function powershell(script, { env } = {}) {
  const wrapped = `[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ${script}`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-STA", "-NonInteractive", "-Command", wrapped], {
    encoding: "utf8",
    timeout: 30000,
    ...(env ? { env } : {}),
  });
  if (result.error || result.status !== 0) {
    throw new Error(`PowerShell clipboard access failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`);
  }
  return result.stdout;
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The OS clipboard is a single global lock: OpenClipboard fails now and then while another program
// (clipboard history / cloud sync, WebView2, the app under test) holds it for a moment, and
// Set-Clipboard / Get-Clipboard do not retry (ISS-0203 (a)). Only for IDEMPOTENT operations (read,
// write, clear): they are retried a few times with a growing pause. A persistent failure still throws.
function powershellRetry(script, options) {
  // A time budget, not a fixed count: a clipboard-watching program (seen: "NoteBurner Video Downloader",
  // which reads every copied URL) was measured holding the clipboard for up to ~6 s in a row.
  const deadline = Date.now() + 30000;
  for (let delay = 200; ; delay = Math.min(delay * 2, 2000)) {
    try {
      return powershell(script, options);
    } catch (error) {
      if (Date.now() + delay >= deadline) throw error;
      sleepSync(delay);
    }
  }
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
const fromB64 = (text) => Buffer.from(text, "base64").toString("utf8");
const sameStrings = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * { kind: "empty" } | { kind: "text", text } | { kind: "files", paths, effect } | { kind: "other", formats }
 * `effect` is the first DWORD of Preferred DropEffect, or null when that format is absent.
 */
export function inspectClipboard() {
  const out = powershellRetry(
    [
      `$d = [System.Windows.Forms.Clipboard]::GetDataObject();`,
      `if ($d -eq $null) { 'FORMATS:' } else {`,
      `'FORMATS:' + ($d.GetFormats($false) -join '|');`,
      `if ($d.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) {`,
      `$list = @($d.GetData([System.Windows.Forms.DataFormats]::FileDrop));`,
      `'FILES:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $list -Compress)));`,
      `if ($d.GetDataPresent('Preferred DropEffect')) { $ms = $d.GetData('Preferred DropEffect'); $b = New-Object byte[] 4; [void]$ms.Read($b, 0, 4); 'EFFECT:' + [BitConverter]::ToInt32($b, 0) }`,
      `} }`,
    ].join(" "),
  );
  const lines = out.split(/\r?\n/);
  const line = (prefix) => lines.find((l) => l.startsWith(prefix));
  const formats = (line("FORMATS:") ?? "FORMATS:").slice("FORMATS:".length).split("|").filter((f) => f !== "");
  if (formats.length === 0) return { kind: "empty" };
  if (formats.includes("FileDrop")) {
    if (formats.some((f) => !FILE_COMPANION_FORMATS.has(f))) return { kind: "other", formats };
    const filesLine = line("FILES:");
    if (filesLine === undefined) return { kind: "other", formats };
    const paths = [].concat(JSON.parse(fromB64(filesLine.slice("FILES:".length))));
    const effectLine = line("EFFECT:");
    return { kind: "files", paths, effect: effectLine === undefined ? null : Number(effectLine.slice("EFFECT:".length)) };
  }
  if (formats.some((f) => !TEXT_FORMATS.has(f))) return { kind: "other", formats };
  return { kind: "text", text: readClipboardText() };
}

/** The clipboard text exactly as stored (CRLF kept, no trailing newline added or removed). */
export function readClipboardText() {
  const out = powershellRetry(
    `$t = Get-Clipboard -Raw; if ($t -eq $null) { $t = '' }; 'B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$t))`,
  );
  const line = out.split(/\r?\n/).find((l) => l.startsWith("B64:")) ?? "B64:";
  return Buffer.from(line.slice(4), "base64").toString("utf8");
}

export function writeClipboardTextForTest(text) {
  powershellRetry(`Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(text)}')))`);
}

export function clearClipboard() {
  powershellRetry(`[System.Windows.Forms.Clipboard]::Clear()`);
}

// A file list (in the given order) and, when `effect` is not null, a Preferred DropEffect DWORD.
// `copy = $true` of SetDataObject is REQUIRED: without it the content disappears when this
// PowerShell process exits (SHOULD-174 (c)); (10, 100) = retry up to 10 times, 100 ms apart.
function setFileDropScript(paths, effect, extra = "") {
  const payload = b64(JSON.stringify({ paths, effect }));
  return [
    `$j = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))`,
    `$d = New-Object System.Windows.Forms.DataObject`,
    `$sc = New-Object System.Collections.Specialized.StringCollection`,
    `foreach ($p in @($j.paths)) { [void]$sc.Add([string]$p) }`,
    `$d.SetFileDropList($sc)`,
    `if ($j.effect -ne $null) { $ms = New-Object System.IO.MemoryStream (,[BitConverter]::GetBytes([int]$j.effect)); $d.SetData('Preferred DropEffect', $ms) }`,
    extra,
    `[System.Windows.Forms.Clipboard]::SetDataObject($d, $true, 10, 100)`,
  ]
    .filter((s) => s !== "")
    .join("; ");
}

// path.resolve first: a `..` can never slip a path out of the root (S-1)
const isInside = (root, p) =>
  typeof p === "string" && p !== "" && path.resolve(p).toLowerCase().startsWith(path.resolve(root).toLowerCase().replace(/[\\/]+$/, "") + "\\");

/**
 * R-09-2: the test side only ever writes paths INSIDE the test folder `root`; the user's own paths
 * come back only through restore(). `effect` null = no Preferred DropEffect is written.
 */
export function writeFileDropForTest(paths, effect, { root }) {
  if (typeof root !== "string" || root === "") throw new Error("writeFileDropForTest needs the test folder as `root`");
  if (!Array.isArray(paths) || paths.length === 0) throw new Error("writeFileDropForTest needs a non-empty list of paths");
  const outside = paths.filter((p) => !isInside(root, p));
  if (outside.length > 0) throw new Error(`refusing to write paths outside the test folder to the OS clipboard (R-09-2): ${outside.join(", ")}`);
  powershellRetry(setFileDropScript(paths, effect));
}

/**
 * The process name of the window that currently OWNS the clipboard ("reflexfiles-successor" for the
 * app's main window, SPEC-0200-0001 §3.10.4), "none" when there is no owner. Real-device check.
 */
export function clipboardOwnerProcessName() {
  const out = powershell(
    [
      `Add-Type -Namespace RfE2e -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetClipboardOwner(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);'`,
      `$h = [RfE2e.Win]::GetClipboardOwner()`,
      `if ($h -eq [IntPtr]::Zero) { 'OWNER:none' } else { $p = [uint32]0; [void][RfE2e.Win]::GetWindowThreadProcessId($h, [ref]$p); 'OWNER:' + (Get-Process -Id $p).ProcessName }`,
    ].join("; "),
    // Add-Type compiles C#: a stale LIB (e.g. a Visual Studio path that no longer exists) turns csc's warning into an error.
    { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "LIB")) },
  );
  const line = out.split(/\r?\n/).find((l) => l.startsWith("OWNER:")) ?? "OWNER:none";
  return line.slice("OWNER:".length).trim();
}

/**
 * Another program (the Windows shell, the same code path as Explorer's Ctrl+V) pastes the current clipboard
 * into `dir`: a real-device check that what the app wrote is accepted by Explorer (copy vs move included).
 * `dir` must be inside the test folder `root` (R-08 / R-09-2).
 */
export function explorerPasteForTest(dir, { root }) {
  if (!isInside(root, path.join(dir, "x"))) throw new Error(`refusing to paste outside the test folder: ${dir}`);
  // S-2: the shell would MOVE whatever is on the clipboard if it is a cut; only ever paste files of the test folder
  const now = inspectClipboard();
  if (now.kind !== "files" || now.paths.length === 0 || !now.paths.every((p) => isInside(root, p))) {
    throw new Error(`refusing the shell paste: the clipboard is not a file list entirely inside the test folder (${describe(now)})`);
  }
  const payload = b64(JSON.stringify({ dir }));
  powershell(
    [
      `$j = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))`,
      `$ns = (New-Object -ComObject Shell.Application).NameSpace([string]$j.dir)`,
      `$ns.Self.InvokeVerb('paste')`,
    ].join("; "),
  );
}

/** { paths, effect } of the file list on the clipboard, or null when there is none. */
export function readFileDropForTest() {
  const now = inspectClipboard();
  return now.kind === "files" ? { paths: now.paths, effect: now.effect } : null;
}

function restore(saved) {
  if (saved.kind === "text") writeClipboardTextForTest(saved.text);
  else if (saved.kind === "files") powershellRetry(setFileDropScript(saved.paths, saved.effect));
  else clearClipboard();
}

function describe(saved) {
  if (saved.kind === "files") return `${saved.paths.length} file(s), effect ${saved.effect}`;
  if (saved.kind === "text") return `text of ${saved.text.length} chars`;
  return saved.kind;
}

function sameContent(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "text") return a.text === b.text;
  if (a.kind === "files") return sameStrings(a.paths, b.paths) && a.effect === b.effect;
  return true;
}

// SHOULD-174 (b): one retry; a restore that still does not take FAILS the test, naming what was lost.
function restoreVerified(saved) {
  let lastError = "the restored content differs";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      restore(saved);
      if (sameContent(inspectClipboard(), saved)) return;
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(`could not restore the OS clipboard (${describe(saved)}): ${lastError}`);
}

/**
 * R-09: save -> [empty it] -> run -> restore (always). Throws Skip when the clipboard cannot be
 * restored or could not be emptied. `startEmpty` (default true, R-09 step 2-1) empties the
 * clipboard before `fn` because the OS content decides what a paste takes.
 */
export async function withClipboardGuard(fn, { startEmpty = true } = {}) {
  let saved;
  try {
    saved = inspectClipboard();
  } catch (error) {
    throw new Skip(`cannot inspect the OS clipboard, so it could not be restored (SPEC-0400-0001 R-09): ${error.message}`);
  }
  if (saved.kind === "other") {
    throw new Skip(`OS clipboard holds data that cannot be restored (${saved.formats.join(", ")}); (SPEC-0400-0001 R-09)`);
  }
  let result;
  let failure;
  try {
    if (startEmpty) {
      // inside the try: whatever happens from here on, the saved content is put back (SHOULD-174 (a))
      clearClipboard();
      const after = inspectClipboard();
      if (after.kind !== "empty") throw new Skip(`the OS clipboard could not be emptied before the test (it holds ${describe(after)})`);
    }
    result = await fn();
  } catch (error) {
    failure = error;
  }
  try {
    restoreVerified(saved);
  } catch (restoreError) {
    // R-6: the original error (a Skip, a failed check, ...) is not hidden by a restore failure
    if (failure === undefined) throw restoreError;
    failure.message = `${failure.message} (additionally: ${restoreError.message})`;
  }
  if (failure !== undefined) throw failure;
  return result;
}

// ----------------------------------------------------------------- self test (AC-09 i ~ viii)

async function selftest() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  };
  // Keep the real clipboard intact while self-testing.
  let real;
  try {
    real = inspectClipboard();
  } catch (error) {
    console.log(`SKIP  clipboard self test: ${error.message}`);
    return 0;
  }
  if (real.kind === "other") {
    console.log(`SKIP  clipboard self test: the clipboard holds data that cannot be restored (${real.formats.join(", ")})`);
    return 0;
  }
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-clipself-")));
  const fileA = path.join(root, "a.txt");
  const fileB = path.join(root, "b 日本語.txt");
  fs.writeFileSync(fileA, "a");
  fs.writeFileSync(fileB, "b");
  try {
    // (i) text is restored
    writeClipboardTextForTest("keep-me");
    await withClipboardGuard(async () => writeClipboardTextForTest("changed-by-test"));
    check("AC-09 (i) text restored", readClipboardText() === "keep-me", JSON.stringify(readClipboardText()));
    // restored also when the body throws
    let threw = false;
    try {
      await withClipboardGuard(async () => {
        writeClipboardTextForTest("changed-2");
        throw new Error("boom");
      });
    } catch {
      threw = true;
    }
    check("AC-09 (i) restored after a failing body", threw && readClipboardText() === "keep-me");
    // (ii) empty is restored to empty
    clearClipboard();
    await withClipboardGuard(async () => writeClipboardTextForTest("changed-3"));
    check("AC-09 (ii) empty restored", inspectClipboard().kind === "empty");
    // (iii) image -> Skip, clipboard untouched
    powershell(`[System.Windows.Forms.Clipboard]::SetImage((New-Object System.Drawing.Bitmap 4, 4))`);
    let skipped = false;
    let ran = false;
    try {
      await withClipboardGuard(async () => {
        ran = true;
      });
    } catch (error) {
      skipped = error instanceof Skip;
    }
    check("AC-09 (iii) image -> Skip, body not run", skipped && !ran);
    check("AC-09 (iii) image still on the clipboard", inspectClipboard().kind === "other");

    // (iv) a file list is restored in the SAME ORDER (effect 1)
    writeFileDropForTest([fileB, fileA], 1, { root });
    const seenInside = [];
    await withClipboardGuard(async () => {
      seenInside.push(inspectClipboard().kind);
      writeClipboardTextForTest("changed-4");
    });
    const back = readFileDropForTest();
    check("AC-09 (iv) file list restored in order", back !== null && sameStrings(back.paths, [fileB, fileA]), JSON.stringify(back));
    // (v) Preferred DropEffect present is restored (2 = move)
    writeFileDropForTest([fileA], 2, { root });
    await withClipboardGuard(async () => writeClipboardTextForTest("changed-5"));
    check("AC-09 (v) effect restored", readFileDropForTest()?.effect === 2, JSON.stringify(readFileDropForTest()));
    // (vi) no Preferred DropEffect stays absent (none is invented)
    writeFileDropForTest([fileA], null, { root });
    check("AC-09 (vi) written without an effect reads back null", readFileDropForTest()?.effect === null);
    await withClipboardGuard(async () => writeClipboardTextForTest("changed-6"));
    check("AC-09 (vi) effect-less list restored without an effect", readFileDropForTest()?.effect === null && sameStrings(readFileDropForTest().paths, [fileA]));
    // (vii) a file list together with text cannot be restored -> Skip, untouched
    powershell(setFileDropScript([fileA], 1, `$d.SetText('also text')`));
    let skippedBoth = false;
    let ranBoth = false;
    try {
      await withClipboardGuard(async () => {
        ranBoth = true;
      });
    } catch (error) {
      skippedBoth = error instanceof Skip;
    }
    check("AC-09 (vii) files + text -> Skip, body not run", skippedBoth && !ranBoth);
    check("AC-09 (vii) files + text left untouched", inspectClipboard().kind === "other");
    // (viii) the clipboard is EMPTY when the body starts (startEmpty), and startEmpty:false keeps it
    writeClipboardTextForTest("not-empty");
    let atStart;
    await withClipboardGuard(async () => {
      atStart = inspectClipboard().kind;
    });
    check("AC-09 (viii) emptied before the body", atStart === "empty", String(atStart));
    check("AC-09 (viii) ... and the text is back afterwards", readClipboardText() === "not-empty");
    let kept;
    await withClipboardGuard(async () => {
      kept = inspectClipboard().kind;
    }, { startEmpty: false });
    check("AC-09 (viii) startEmpty:false keeps the content", kept === "text");
    // R-09-2: paths outside the test folder are refused
    let refused = false;
    try {
      writeFileDropForTest([path.join(os.homedir(), "x.txt")], 1, { root });
    } catch {
      refused = true;
    }
    check("R-09-2 a path outside the test folder is refused", refused);
    let refusedSibling = false;
    try {
      writeFileDropForTest([root + "-evil\\a.txt"], 1, { root });
    } catch {
      refusedSibling = true;
    }
    check("R-09-2 a same-prefix sibling folder is refused", refusedSibling);
    // S-1: `..` cannot slip out of the root
    let refusedDotDot = false;
    try {
      writeFileDropForTest([path.join(root, "..", "x.txt")], 1, { root });
    } catch {
      refusedDotDot = true;
    }
    check("S-1 a path leaving the root through .. is refused", refusedDotDot);
    let refusedDotDot2 = false;
    try {
      writeFileDropForTest([root + "\\sub\\..\\..\\x.txt"], 1, { root });
    } catch {
      refusedDotDot2 = true;
    }
    check("S-1 a nested .. escape is refused", refusedDotDot2);

    // S-2: the shell paste refuses anything but a file list entirely inside the test folder
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-clipself-out-"));
    const outsideFile = path.join(outsideDir, "precious.txt");
    fs.writeFileSync(outsideFile, "keep");
    const dest = path.join(root, "dest");
    fs.mkdirSync(dest);
    try {
      powershell(setFileDropScript([outsideFile], 2)); // a CUT of a file outside the test folder
      let refusedOutside = false;
      try {
        explorerPasteForTest(dest, { root });
      } catch {
        refusedOutside = true;
      }
      check("S-2 the shell paste refuses a clipboard file outside the test folder", refusedOutside);
      check("S-2 ... and nothing was moved", fs.existsSync(outsideFile) && fs.readdirSync(dest).length === 0);
      powershell(setFileDropScript([fileA, outsideFile], 1)); // one outside among inside
      let refusedMixed = false;
      try {
        explorerPasteForTest(dest, { root });
      } catch {
        refusedMixed = true;
      }
      check("S-2 the shell paste refuses a list with ONE outside path", refusedMixed && fs.readdirSync(dest).length === 0);
      clearClipboard();
      let refusedEmpty = false;
      try {
        explorerPasteForTest(dest, { root });
      } catch {
        refusedEmpty = true;
      }
      check("S-2 the shell paste refuses an empty clipboard", refusedEmpty);
      writeClipboardTextForTest("text");
      let refusedText = false;
      try {
        explorerPasteForTest(dest, { root });
      } catch {
        refusedText = true;
      }
      check("S-2 the shell paste refuses a text clipboard", refusedText);
      writeFileDropForTest([fileA], 1, { root });
      explorerPasteForTest(dest, { root });
      let pasted = false;
      for (let i = 0; i < 50 && !pasted; i++) {
        pasted = fs.existsSync(path.join(dest, "a.txt"));
        if (!pasted) await new Promise((r) => setTimeout(r, 200));
      }
      check("S-2 a list entirely inside the test folder is pasted", pasted);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  } finally {
    try {
      restore(real);
    } catch (error) {
      console.log(`WARN  could not restore the original clipboard: ${error.message}`);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
  return results.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--selftest")) {
  process.exit(await selftest());
}
