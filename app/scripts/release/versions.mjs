// Version agreement check for the distribution (SPEC-0600-0001 R-1411 / T-09, design SPEC-0200-0001 3.15.6).
// Node built-ins only. `node scripts/release/versions.mjs` (npm run release:check) runs from the app directory.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;
const CARGO_PACKAGE = "guif";

/** `version` of the [package] table of a Cargo.toml text, or null. */
function cargoTomlVersion(text) {
  let inPackage = false;
  for (const line of text.split(/\r?\n/)) {
    const table = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (table) {
      inPackage = table[1].trim() === "package";
      continue;
    }
    if (inPackage) {
      const m = /^\s*version\s*=\s*"([^"]*)"/.exec(line);
      if (m) return m[1];
    }
  }
  return null;
}

/** `version` right after `name = "guif"` in a Cargo.lock text, or null. */
function cargoLockVersion(text) {
  const m = new RegExp(`name\\s*=\\s*"${CARGO_PACKAGE}"\\s*\\r?\\nversion\\s*=\\s*"([^"]*)"`).exec(text);
  return m ? m[1] : null;
}

/**
 * Read the version of each of the five files that must agree.
 * @param {string} appDir the app directory (contains package.json and src-tauri/)
 */
export function readVersions(appDir) {
  const tauri = join(appDir, "src-tauri");
  const json = (p) => JSON.parse(readFileSync(p, "utf-8"));
  return {
    "tauri.conf.json": json(join(tauri, "tauri.conf.json")).version ?? null,
    "package.json": json(join(appDir, "package.json")).version ?? null,
    "package-lock.json": json(join(appDir, "package-lock.json")).version ?? null,
    "Cargo.toml": cargoTomlVersion(readFileSync(join(tauri, "Cargo.toml"), "utf-8")),
    "Cargo.lock": cargoLockVersion(readFileSync(join(tauri, "Cargo.lock"), "utf-8")),
  };
}

/**
 * All five must be equal and MAJOR.MINOR.PATCH. Each error names the offending file.
 * @param {Record<string, string | null>} v
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkVersions(v) {
  const errors = [];
  for (const [file, ver] of Object.entries(v)) {
    if (typeof ver !== "string" || !SEMVER.test(ver)) {
      errors.push(`${file}: version ${JSON.stringify(ver)} is not MAJOR.MINOR.PATCH`);
    }
  }
  const reference = v["tauri.conf.json"];
  for (const [file, ver] of Object.entries(v)) {
    if (file !== "tauri.conf.json" && ver !== reference) {
      errors.push(`${file}: version ${JSON.stringify(ver)} differs from tauri.conf.json ${JSON.stringify(reference)}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function main() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const versions = readVersions(appDir);
  const result = checkVersions(versions);
  for (const [file, ver] of Object.entries(versions)) console.log(`${file}: ${ver}`);
  if (!result.ok) {
    for (const e of result.errors) console.error(`ERROR ${e}`);
    process.exit(1);
  }
  console.log(`OK all versions agree: ${versions["tauri.conf.json"]}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
