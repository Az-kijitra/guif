/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0014 R-390-1 / R-320-1 / R-340-2 (no password UI, no attempt
//   counter, no encryption / decryption code, no bad-password code), R-327-5
//   (never create encrypted ZIPs), §12 "not carried over" list (the crate's
//   AES feature must not be enabled), AC-361 (search range and words below);
//   SPEC-0100-0005 R-08 (no trace of out-of-scope features).
// AC-361 range: the `app/` directory tree - `app/src/`, `app/src-tauri/src/`,
//   `app/src-tauri/Cargo.toml` included (comments and test code too);
//   `specs/`, `docs/` and other documents outside `app/` are NOT scanned.
//   Words: the four retired identifiers listed in AC-361 (assembled below).
// Architecture: SPEC-0200-0001 §3.4.2 ("do not write the forbidden words in
//   Cargo.toml comments; paraphrase"), §3.4.10 (the test assembles the words at
//   RUN TIME so that this very file does not contain them; same technique as
//   SPEC-0300-0010 MUST-62 / AC-55-1 in keymap-defaults.test.ts).
// Module under test: none (a repository scan in Node). GREEN today; it turns
//   RED if the implementation (or any comment) introduces a forbidden word.
//
// The Rust side has its own scan (unit-test-writer for app/src-tauri); this one
// covers the whole `app/` tree from the TypeScript test run so a frontend-only
// change is also caught. Both must assemble the words at run time.

const APP_ROOT = resolve(__dirname, "..");

// Assembled at run time: no contiguous literal of any word appears in this file.
const FORBIDDEN: string[] = [
  ["ZIP_BAD", "_PASSWORD"].join(""),
  ["aes", "-crypto"].join(""),
  ["with_aes", "_encryption"].join(""),
  ["by_index", "_decrypt"].join(""),
];

// Build outputs / dependency trees / VCS data are not source.
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "target", "build", "dist", ".git", "gen"]);
const TEXT_FILE = /\.(ts|js|mjs|cjs|svelte|json|rs|toml|md|html|css|yml|yaml|lock|txt|svg)$/i;
const MAX_BYTES = 4 * 1024 * 1024;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
    } else if (TEXT_FILE.test(name) && st.size <= MAX_BYTES) {
      out.push(full);
    }
  }
  return out;
}

// Case-insensitive on purpose: a differently-cased spelling is still a trace.
function findHits(files: string[], words: string[]): string[] {
  const hits: string[] = [];
  const patterns = words.map((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  for (const f of files) {
    const text = readFileSync(f, "utf-8");
    for (const re of patterns) if (re.test(text)) hits.push(`${relative(APP_ROOT, f).split(sep).join("/")} : ${re.source}`);
  }
  return hits;
}

describe("AC-361: no password / encryption trace under app/ (R-390-1)", () => {
  const files = walk(APP_ROOT);

  it("the scan covers the AC-361 range (app/src, app/src-tauri/src, app/src-tauri/Cargo.toml) and is not silently empty", () => {
    const rel = files.map((f) => relative(APP_ROOT, f).split(sep).join("/"));
    expect(rel.some((f) => f.startsWith("src/"))).toBe(true);
    expect(rel.some((f) => f.startsWith("src-tauri/src/"))).toBe(true);
    expect(rel).toContain("src-tauri/Cargo.toml");
    expect(files.length).toBeGreaterThan(50);
  });

  it("the scan does not reach outside app/ (specs/ and docs/ may legitimately name the words)", () => {
    for (const f of files) expect(relative(APP_ROOT, f).startsWith("..")).toBe(false);
  });

  it("there are exactly the four retired identifiers of AC-361 and none is empty", () => {
    expect(FORBIDDEN).toHaveLength(4);
    for (const w of FORBIDDEN) expect(w.length).toBeGreaterThan(8);
  });

  it("no file under app/ (comments and test code included) contains any of them", () => {
    expect(findHits(files, FORBIDDEN)).toEqual([]);
  });

  it("scanner self-check: a synthetic file containing a word (any casing) IS detected", () => {
    // Same pattern construction as findHits, applied to an in-memory sample.
    const sample = `// note: ${FORBIDDEN[1].toUpperCase()} must stay off\n`;
    const re = new RegExp(FORBIDDEN[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    expect(re.test(sample)).toBe(true);
    expect(re.test("nothing to see here")).toBe(false);
  });
});
