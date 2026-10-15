// Build the NSIS installer and record its checksum (SPEC-0600-0001 R-1401 / R-1402, design SPEC-0200-0001 3.15.6 / 3.15.13 2).
//
// Run from the app directory with `npm run release:build`. The first build needs the network: Tauri downloads NSIS and
// nsis_tauri_utils from GitHub into %LOCALAPPDATA%\tauri\NSIS. The installer is only built here, never executed.
//
// tauri.js is launched with the current Node executable and a fixed argument list (no command string, no extra process
// layer), so there is nothing to escape and no spawn restriction to work around.
// Node built-ins and the sibling scripts only.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedInstallerName } from "./installer-name.mjs";
import { formatChecksumLine, sha256File } from "./sha256.mjs";
import { checkVersions, readVersions } from "./versions.mjs";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tauriDir = join(appDir, "src-tauri");
const tauriJs = join(appDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
// CARGO_TARGET_DIR (when set) moves the whole output tree, exactly as it does for cargo and tauri build.
// It must be an absolute path (a relative one would depend on where cargo and this script each resolve it).
const targetDir = process.env.CARGO_TARGET_DIR ? process.env.CARGO_TARGET_DIR : join(tauriDir, "target");
const bundleDir = join(targetDir, "release", "bundle");
const nsisDir = join(bundleDir, "nsis");
const msiDir = join(bundleDir, "msi");

function fail(message) {
  console.error(`ERROR ${message}`);
  process.exit(1);
}

async function main() {
  // (1) the five versions agree
  const versions = readVersions(appDir);
  const checked = checkVersions(versions);
  if (!checked.ok) {
    for (const e of checked.errors) console.error(`ERROR ${e}`);
    fail("the versions do not agree");
  }
  const conf = JSON.parse(readFileSync(join(tauriDir, "tauri.conf.json"), "utf-8"));
  const expected = expectedInstallerName(conf);
  console.log(`version ${conf.version}; expected installer ${expected}`);

  if (process.env.CARGO_TARGET_DIR && !isAbsolute(process.env.CARGO_TARGET_DIR)) fail("CARGO_TARGET_DIR must be an absolute path");
  if (!existsSync(tauriJs)) fail(`${tauriJs} not found (the dependencies are not installed)`);

  // Earlier installers and checksums are generated files under target/; remove them so that exactly one is left.
  if (existsSync(nsisDir)) {
    for (const f of readdirSync(nsisDir)) {
      if (/-setup\.exe(\.sha256)?$/.test(f)) unlinkSync(join(nsisDir, f));
    }
  }

  // (2) build
  execFileSync(process.execPath, [tauriJs, "build", "--bundles", "nsis"], { cwd: appDir, stdio: "inherit" });

  // (3) exactly one *-setup.exe and it has the expected name
  const installers = existsSync(nsisDir) ? readdirSync(nsisDir).filter((f) => f.endsWith("-setup.exe")) : [];
  if (installers.length !== 1) fail(`expected exactly one *-setup.exe in ${nsisDir}, found ${JSON.stringify(installers)}`);
  if (installers[0] !== expected) fail(`installer name ${installers[0]} differs from the expected ${expected}`);

  // (4) no MSI
  if (existsSync(msiDir)) fail(`an msi folder exists (${msiDir}); only the NSIS installer is distributed`);

  // (5) sha256: print and write <installer>.sha256 next to it
  const installerPath = join(nsisDir, installers[0]);
  const hex = await sha256File(installerPath);
  const line = formatChecksumLine(hex, installers[0]);
  writeFileSync(`${installerPath}.sha256`, `${line}\n`, "utf-8");
  console.log(`installer: ${installerPath}`);
  console.log(`sha256: ${line}`);
  console.log(`checksum file: ${installerPath}.sha256`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
