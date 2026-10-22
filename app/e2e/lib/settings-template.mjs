// The text the app writes for SPEC-0300-0022 R-1610 / R-1620 (the scaffold `config.toml` and `config.sample.toml`), made on the TEST side from the
// original in the repository, so that an E2E can compare the bytes (AC-1601 / AC-1620 / AC-1623).
//
// The rule is the one of `src-tauri/src/settings_file/source.rs::render_from` (R-1611 / R-1635 / R-1637), written down again here on purpose (the E2E
// must not call the code it checks): (1) a line of the OTHER kind's marker (`#@template ` / `#@sample `) is dropped and the own marker becomes `## `;
// (2) `@VERSION@` -> the app version (`Cargo.toml`, the same value as `CARGO_PKG_VERSION`); (3) every line break is CRLF whatever the original has,
// the text ends with exactly one; (4) a BOM of the original is not carried over. UTF-8, no BOM.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL_FILE = path.resolve(here, "..", "..", "src-tauri", "templates", "config.sample.toml");
const CARGO_TOML = path.resolve(here, "..", "..", "src-tauri", "Cargo.toml");

const MARKERS = { template: "#@template ", sample: "#@sample " };

/** The version of the app under test (`[package] version` of src-tauri/Cargo.toml). */
export function appVersion() {
  const m = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(CARGO_TOML, "utf8"));
  if (!m) throw new Error("could not read the package version from src-tauri/Cargo.toml");
  return m[1];
}

/** `kind` = "template" (the first config.toml) or "sample" (config.sample.toml). Returns the exact text, CRLF line breaks. */
export function renderSettingsText(kind) {
  if (!(kind in MARKERS)) throw new Error(`unknown kind ${kind}`);
  const own = MARKERS[kind];
  const other = MARKERS[kind === "template" ? "sample" : "template"];
  let original = fs.readFileSync(ORIGINAL_FILE, "utf8");
  if (original.charCodeAt(0) === 0xfeff) original = original.slice(1);
  const lines = original.split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // Rust's str::lines(): a trailing line break does not start a line
  let out = "";
  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith(other)) continue;
    out += (line.startsWith(own) ? `## ${line.slice(own.length)}` : line) + "\r\n";
  }
  return out.split("@VERSION@").join(appVersion());
}

/** True when `buffer` is UTF-8 without a BOM, has only CRLF line breaks (no bare LF or CR), and equals `renderSettingsText(kind)` byte for byte. */
export function describeAgainst(buffer, kind) {
  const expected = Buffer.from(renderSettingsText(kind), "utf8");
  const text = buffer.toString("utf8");
  return {
    equal: buffer.equals(expected),
    bom: buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf,
    bareLf: /(^|[^\r])\n/.test(text),
    bareCr: /\r(?!\n)/.test(text),
    bytes: buffer.length,
    expectedBytes: expected.length,
  };
}
