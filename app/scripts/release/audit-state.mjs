// Read-only record of the machine state around ReflexFiles (SPEC-0600-0001 R-1496 / AC-1470, design SPEC-0200-0001 3.15.6).
// Prints one JSON document to standard output. It never writes, deletes, or changes anything: the registry is only
// queried, the file system is only listed. Run it with `npm run release:audit`, before and after an install/uninstall.
// Node built-ins and footprint.mjs only.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FOOTPRINT } from "./footprint.mjs";

const UNINSTALL = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
const NAME = /reflexfiles/i;

/** Decode the console output of reg.exe (the OEM code page; Shift_JIS on a Japanese Windows). */
function decode(buffer) {
  try {
    return new TextDecoder("shift_jis").decode(buffer);
  } catch {
    return buffer.toString("utf-8");
  }
}

/** Run a fixed command without any extra process layer. Returns { ok, out }. */
function run(file, args) {
  try {
    const buffer = execFileSync(file, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out: decode(buffer) };
  } catch (e) {
    return { ok: false, out: e && e.stdout ? decode(e.stdout) : "" };
  }
}

/** `reg query <key> [/s] [flags]` -> { exists, text } */
function regQuery(key, extra = []) {
  const r = run("reg", ["query", key, ...extra]);
  return { exists: r.ok, text: r.out };
}

/** Parse the output of a recursive query into [{ key, values: { name: "TYPE data" } }]. */
function parseBlocks(text) {
  const blocks = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (/^HK/i.test(raw)) {
      current = { key: raw.trim(), values: {} };
      blocks.push(current);
    } else if (current) {
      const m = raw.match(/^\s+(.+?)\s{4}(REG_\w+)\s{0,4}(.*)$/);
      if (m) current.values[m[1]] = `${m[2]} ${m[3]}`;
    }
  }
  return blocks;
}

/** Uninstall entries (one view) whose key name or DisplayName contains "reflexfiles", ignoring case. */
function uninstallEntries(hive, flags) {
  const root = `${hive}\\${UNINSTALL}`;
  const r = regQuery(root, ["/s", ...flags]);
  const entries = parseBlocks(r.text).filter((b) => {
    if (b.key.length <= root.length) return false;
    const leaf = b.key.slice(root.length + 1).split("\\")[0];
    const display = (b.values.DisplayName || "").replace(/^REG_\w+\s*/, "");
    return NAME.test(leaf) || NAME.test(display);
  });
  return { root, queryOk: r.exists, entries };
}

/** Files and folders under a directory whose names contain "reflexfiles"; the ReflexFiles folder is listed in full. */
function listMatching(dir, depth) {
  if (!existsSync(dir)) return { dir, exists: false, items: [] };
  const items = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!NAME.test(entry.name)) continue;
    const full = join(dir, entry.name);
    items.push(entry.isDirectory() ? { name: entry.name, type: "dir", children: listAll(full, depth) } : fileInfo(full, entry.name));
  }
  return { dir, exists: true, items };
}

function fileInfo(full, name) {
  const s = statSync(full);
  return { name, type: "file", size: s.size, modified: s.mtime.toISOString() };
}

function listAll(dir, depth) {
  if (depth <= 0) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    out.push(entry.isDirectory() ? { name: entry.name, type: "dir", children: listAll(full, depth - 1) } : fileInfo(full, entry.name));
  }
  return out;
}

/** The Programs folder of the Start menu, to the sub-folders: every .lnk and every sub-folder that mentions reflexfiles. */
function startMenu(programs) {
  if (!existsSync(programs)) return { dir: programs, exists: false, items: [] };
  const items = [];
  for (const entry of readdirSync(programs, { withFileTypes: true })) {
    const full = join(programs, entry.name);
    if (entry.isDirectory()) {
      const children = readdirSync(full).filter((n) => NAME.test(n) || NAME.test(entry.name));
      if (children.length > 0 || NAME.test(entry.name)) items.push({ name: entry.name, type: "dir", children: readdirSync(full) });
    } else if (NAME.test(entry.name)) {
      items.push(fileInfo(full, entry.name));
    }
  }
  return { dir: programs, exists: true, items };
}

function desktopFolder(script) {
  const r = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  return r.ok ? r.out.trim() : "";
}

function main() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const appData = process.env.APPDATA || "";
  const programData = process.env.ProgramData || "";
  const desktop = desktopFolder("[Environment]::GetFolderPath('Desktop')");
  const commonDesktop = desktopFolder("[Environment]::GetFolderPath('CommonDesktopDirectory')");

  const report = {
    generatedAt: new Date().toISOString(),
    note: "read-only record; nothing was written, deleted or changed",
    // R-1444-1: the same information in the three places the installer looks at
    uninstall: {
      HKCU: uninstallEntries("HKCU", []),
      HKLM_64: uninstallEntries("HKLM", ["/reg:64"]),
      HKLM_32_WOW6432Node: uninstallEntries("HKLM", ["/reg:32"]),
    },
    // R2 / R3 / R5 of footprint.mjs
    registry: {
      "HKCU\\Software\\reflexfiles": regQuery("HKCU\\Software\\reflexfiles", ["/s"]),
      "HKCU\\...\\CurrentVersion\\Run ReflexFiles": regQuery("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", ["/v", "ReflexFiles"]),
    },
    startMenu: {
      user: startMenu(join(appData, "Microsoft", "Windows", "Start Menu", "Programs")),
      allUsers: startMenu(join(programData, "Microsoft", "Windows", "Start Menu", "Programs")),
    },
    desktop: {
      folder: desktop,
      shortcuts: desktop ? listMatching(desktop, 0) : { dir: "", exists: false, items: [] },
      commonFolder: commonDesktop,
      commonShortcuts: commonDesktop ? listMatching(commonDesktop, 0) : { dir: "", exists: false, items: [] },
    },
    localAppData: localAppData ? listMatching(localAppData, 3) : { dir: "", exists: false, items: [] },
    footprint: FOOTPRINT.map((f) => ({ id: f.id, location: f.location, afterUninstall: f.afterUninstall })),
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
