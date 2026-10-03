// OS clipboard guard for the E2E run (SPEC-0400-0001 第3版 R-09 / AC-09; SPEC-0300-0018 AC-1051;
// design SPEC-0200-0001 §3.9.14, §3.9.17.6).
//
// "Copy path" writes TEXT to the user's real OS clipboard. Before the test the clipboard is
// inspected from the TEST side (PowerShell, STA; never through the app under test):
//   * empty or text only  -> the text is saved and put back after the test (also when it failed);
//   * anything else (image, files, HTML, rich text, ...) -> cannot be restored -> the test is SKIPPED.
//
// Node built-ins only (node:child_process). Self test (does not need the app):
//   node app/e2e/lib/clipboard.mjs --selftest
//
// NOTE for the runner: with Windows clipboard history / cloud sync turned on, the text written by
// the test can remain in the history or sync target. For the check to run, copy plain text only
// before the run (copying from a browser or IDE often adds "HTML Format" and the check is skipped).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Skip } from "./report.mjs";

const TEXT_FORMATS = new Set(["UnicodeText", "Text", "OEMText", "System.String", "Locale"]);

function powershell(script) {
  const wrapped = `[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ${script}`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-STA", "-NonInteractive", "-Command", wrapped], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`PowerShell clipboard access failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`);
  }
  return result.stdout;
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");

/** { kind: "empty" } | { kind: "text", text } | { kind: "other", formats } */
export function inspectClipboard() {
  const out = powershell(
    `$d = [System.Windows.Forms.Clipboard]::GetDataObject(); if ($d -eq $null) { 'FORMATS:' } else { 'FORMATS:' + ($d.GetFormats() -join '|') }`,
  );
  const line = out.split(/\r?\n/).find((l) => l.startsWith("FORMATS:")) ?? "FORMATS:";
  const formats = line.slice("FORMATS:".length).split("|").filter((f) => f !== "");
  if (formats.length === 0) return { kind: "empty" };
  if (formats.some((f) => !TEXT_FORMATS.has(f))) return { kind: "other", formats };
  return { kind: "text", text: readClipboardText() };
}

/** The clipboard text exactly as stored (CRLF kept, no trailing newline added or removed). */
export function readClipboardText() {
  const out = powershell(
    `$t = Get-Clipboard -Raw; if ($t -eq $null) { $t = '' }; 'B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$t))`,
  );
  const line = out.split(/\r?\n/).find((l) => l.startsWith("B64:")) ?? "B64:";
  return Buffer.from(line.slice(4), "base64").toString("utf8");
}

export function writeClipboardTextForTest(text) {
  powershell(`Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(text)}')))`);
}

export function clearClipboard() {
  powershell(`[System.Windows.Forms.Clipboard]::Clear()`);
}

function restore(saved) {
  if (saved.kind === "text") writeClipboardTextForTest(saved.text);
  else clearClipboard();
}

/** R-09: save -> run -> restore (always). Throws Skip when the clipboard cannot be restored. */
export async function withClipboardGuard(fn) {
  let saved;
  try {
    saved = inspectClipboard();
  } catch (error) {
    throw new Skip(`cannot inspect the OS clipboard, so it could not be restored (SPEC-0400-0001 R-09): ${error.message}`);
  }
  if (saved.kind === "other") {
    throw new Skip(`OS clipboard holds non-text data (${saved.formats.join(", ")}); cannot restore it (SPEC-0400-0001 R-09)`);
  }
  try {
    return await fn();
  } finally {
    restore(saved);
  }
}

// ----------------------------------------------------------------- self test (AC-09 i/ii/iii)

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
    console.log(`SKIP  clipboard self test: the clipboard holds non-text data (${real.formats.join(", ")})`);
    return 0;
  }
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
  } finally {
    try {
      restore(real);
    } catch (error) {
      console.log(`WARN  could not restore the original clipboard: ${error.message}`);
    }
  }
  return results.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--selftest")) {
  process.exit(await selftest());
}
