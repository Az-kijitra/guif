// The OS's app theme, READ ONLY (SPEC-0200-0001 §3.11.9 / §3.11.16 SHOULD-185): HKCU\Software\Microsoft\Windows\
// CurrentVersion\Themes\Personalize, value AppsUseLightTheme (1 = light, 0 = dark). This module never writes the
// registry and never changes any OS setting. It lets the theme scenarios compare what the page sees
// (`matchMedia`) with what the OS says, and tell whether a fixed `ui_theme` could be told apart from the OS.
//
//   node app/e2e/lib/os-theme.mjs            prints the current value
//   node app/e2e/lib/os-theme.mjs --selftest the parser against sample output (no registry access)

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

/** "light" | "dark" | null (unreadable) from the text of `reg query ... /v AppsUseLightTheme`. */
export function parseAppsUseLightTheme(text) {
  const m = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(text ?? "");
  if (!m) return null;
  return Number.parseInt(m[1], 16) === 0 ? "dark" : "light";
}

export function readOsAppTheme() {
  const r = spawnSync("reg", ["query", KEY, "/v", "AppsUseLightTheme"], { encoding: "utf8", windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return parseAppsUseLightTheme(r.stdout);
}

/**
 * What a fixed theme `fixed` ("light" | "dark") proves on this PC: only a fixed theme that is the opposite of the
 * OS can show that the OS is ignored. Returns a note for the report, or null when it is discriminating.
 */
export function fixedThemeNote(fixed, os) {
  if (os === null) return "OS のテーマを読めないため固定の効果は判別できない(note: could not read AppsUseLightTheme)";
  if (os === fixed) return `note: OS と同じ明暗(${os})のため固定の効果は判別できない`;
  return null;
}

async function selftest() {
  const ok = [];
  const check = (name, cond) => {
    ok.push(cond);
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  };
  const sample = (v) => `\r\nHKEY_CURRENT_USER\\${KEY}\r\n    AppsUseLightTheme    REG_DWORD    ${v}\r\n\r\n`;
  check("0x1 -> light", parseAppsUseLightTheme(sample("0x1")) === "light");
  check("0x0 -> dark", parseAppsUseLightTheme(sample("0x0")) === "dark");
  check("garbage -> null", parseAppsUseLightTheme("ERROR: nope") === null);
  check("fixed opposite of the OS is discriminating", fixedThemeNote("dark", "light") === null && fixedThemeNote("light", "dark") === null);
  check("fixed same as the OS is not", fixedThemeNote("light", "light") !== null && fixedThemeNote("dark", null) !== null);
  return ok.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--selftest")) process.exit(await selftest());
  console.log(readOsAppTheme());
}
