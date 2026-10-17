/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// [単体 + 静的] Spec: SPEC-0600-0001 R-1401 (installer name), R-1402 (scripts, checksum), R-1411 / T-09 (version check), R-1496 / AC-1470 (audit is read-only).
// Design: SPEC-0200-0001 §3.15.4 (footprint table), §3.15.6, §3.15.13 2 (build.mjs launches tauri.js with process.execPath) and 3 (R3, M1).
//
// Contract assumed (reported to the implementer) -- app/scripts/release/*.mjs, Node built-ins only, ES modules:
//   versions.mjs        export readVersions(appDir: string): { "tauri.conf.json": string; "package.json": string; "package-lock.json": string; "Cargo.toml": string; "Cargo.lock": string }
//                         - Cargo.toml: `version` of the [package] table; Cargo.lock: the `version` right after `name = "reflexfiles-successor"`;
//                           package-lock.json: the top-level `version`
//                       export checkVersions(v): { ok: boolean; errors: string[] }   // all equal AND MAJOR.MINOR.PATCH; each error names the offending file
//                       `node scripts/release/versions.mjs` (npm run release:check) prints and exits 0 when ok, 1 otherwise (run with cwd = app)
//   sha256.mjs          export sha256File(path): Promise<string>  (lowercase hex);  export formatChecksumLine(hex, name): string  === `${hex} *${name}`
//   installer-name.mjs  export expectedInstallerName(conf: {productName, version}): string  === `${productName}_${version}_x64-setup.exe`
//   footprint.mjs       export FOOTPRINT: { id: string; label: string; location: string; afterUninstall: "removed" | "remains" | "unchanged" }[]
//                         ids exactly R1 R2 R3 R4 R5 F1 F2 F3 S1 S2 S3 T1 W1 D1 M1 (M1 = the aborted-install leftovers, label contains 中断時)
//   build.mjs / audit-state.mjs: top-level scripts; only their source text is inspected here (nothing is executed, no tauri build).
// Status at TDD time: RED (app/scripts/release/ does not exist yet).

const APP = resolve(__dirname, "..");
const DIR = join(APP, "scripts", "release");
const tmp = mkdtempSync(join(tmpdir(), "reflex-release-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = any;
const load = async (f: string): Promise<Mod> => await import(/* @vite-ignore */ pathToUrl(join(DIR, f)));
function pathToUrl(p: string): string {
  return "file:///" + p.replace(/\\/g, "/");
}

/** Remove JS comments so that prose about `npx` / `shell: true` does not trip the scans. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}
const source = (f: string): string => {
  const p = join(DIR, f);
  if (!existsSync(p)) throw new Error(`${p} does not exist yet (RED)`);
  return stripJsComments(readFileSync(p, "utf-8"));
};

// ---- fixture app dir -------------------------------------------------------------------------------------------------
type Vs = { conf: string; pkg: string; lock: string; toml: string; cargoLock: string };
const GOOD: Vs = { conf: "0.3.0", pkg: "0.3.0", lock: "0.3.0", toml: "0.3.0", cargoLock: "0.3.0" };
let n = 0;
function fixture(v: Vs): string {
  const dir = join(tmp, `app${n++}`);
  mkdirSync(join(dir, "src-tauri"), { recursive: true });
  writeFileSync(join(dir, "src-tauri", "tauri.conf.json"), JSON.stringify({ productName: "guif", version: v.conf }));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "reflexfiles-successor", version: v.pkg }));
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({ name: "reflexfiles-successor", version: v.lock, lockfileVersion: 3, packages: { "": { name: "reflexfiles-successor", version: v.lock } } }),
  );
  writeFileSync(
    join(dir, "src-tauri", "Cargo.toml"),
    `[package]\nname = "reflexfiles-successor"\nversion = "${v.toml}"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\n`,
  );
  writeFileSync(
    join(dir, "src-tauri", "Cargo.lock"),
    `version = 4\n\n[[package]]\nname = "aaa"\nversion = "9.9.9"\n\n[[package]]\nname = "reflexfiles-successor"\nversion = "${v.cargoLock}"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "zzz"\nversion = "8.8.8"\n`,
  );
  return dir;
}

describe("versions.mjs: readVersions / checkVersions (R-1411, T-09, H-4)", () => {
  it("reads each of the five files (the right package in Cargo.lock, [package] in Cargo.toml)", async () => {
    const m = await load("versions.mjs");
    expect(m.readVersions(fixture({ conf: "1.1.1", pkg: "2.2.2", lock: "3.3.3", toml: "4.4.4", cargoLock: "5.5.5" }))).toEqual({
      "tauri.conf.json": "1.1.1",
      "package.json": "2.2.2",
      "package-lock.json": "3.3.3",
      "Cargo.toml": "4.4.4",
      "Cargo.lock": "5.5.5",
    });
  });
  it("accepts five identical MAJOR.MINOR.PATCH versions", async () => {
    const m = await load("versions.mjs");
    expect(m.checkVersions(m.readVersions(fixture(GOOD)))).toEqual({ ok: true, errors: [] });
  });
  it.each([
    ["tauri.conf.json", { ...GOOD, conf: "0.3.1" }],
    ["package.json", { ...GOOD, pkg: "0.0.0" }],
    ["package-lock.json", { ...GOOD, lock: "0.0.0" }],
    ["Cargo.toml", { ...GOOD, toml: "0.2.0" }],
    ["Cargo.lock", { ...GOOD, cargoLock: "0.0.0" }],
  ] as [string, Vs][])("detects a mismatch in %s alone and names that file", async (file, vs) => {
    const m = await load("versions.mjs");
    const r = m.checkVersions(m.readVersions(fixture(vs)));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join("\n")).toContain(file);
  });
  it.each(["0.3", "0.3.0-beta.1", "v0.3.0", "0.3.0.1", ""])("rejects a non MAJOR.MINOR.PATCH version %j even when all agree", async (v) => {
    const m = await load("versions.mjs");
    const r = m.checkVersions(m.readVersions(fixture({ conf: v, pkg: v, lock: v, toml: v, cargoLock: v })));
    expect(r.ok).toBe(false);
  });
  it("`node scripts/release/versions.mjs` exits 0 on the real repo (release:check)", () => {
    const out = execFileSync(process.execPath, [join(DIR, "versions.mjs")], { cwd: APP, encoding: "utf-8" });
    expect(out).toContain("0.3.0");
  });
});

describe("sha256.mjs (R-1402)", () => {
  it("sha256File gives the known vector for `abc`", async () => {
    const m = await load("sha256.mjs");
    const f = join(tmp, "abc.bin");
    writeFileSync(f, "abc");
    expect(await m.sha256File(f)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("sha256File of an empty file", async () => {
    const m = await load("sha256.mjs");
    const f = join(tmp, "empty.bin");
    writeFileSync(f, "");
    expect(await m.sha256File(f)).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("sha256File streams a multi-chunk file correctly (3 MiB of zero bytes)", async () => {
    const m = await load("sha256.mjs");
    const f = join(tmp, "big.bin");
    writeFileSync(f, Buffer.alloc(3 * 1024 * 1024));
    const { createHash } = await import("node:crypto");
    expect(await m.sha256File(f)).toBe(createHash("sha256").update(Buffer.alloc(3 * 1024 * 1024)).digest("hex"));
  });
  it("sha256File rejects for a missing file", async () => {
    const m = await load("sha256.mjs");
    await expect(m.sha256File(join(tmp, "nope.bin"))).rejects.toThrow();
  });
  it("formatChecksumLine is sha256sum compatible: `<hex> *<name>`", async () => {
    const m = await load("sha256.mjs");
    expect(m.formatChecksumLine("ba78", "guif_0.3.0_x64-setup.exe")).toBe("ba78 *guif_0.3.0_x64-setup.exe");
  });
});

describe("installer-name.mjs (R-1401, T-08)", () => {
  it("expectedInstallerName builds <productName>_<version>_x64-setup.exe from the config", async () => {
    const m = await load("installer-name.mjs");
    expect(m.expectedInstallerName({ productName: "guif", version: "0.3.0" })).toBe("guif_0.3.0_x64-setup.exe");
  });
  it("is derived from its input, not hard-coded", async () => {
    const m = await load("installer-name.mjs");
    expect(m.expectedInstallerName({ productName: "Foo", version: "1.2.3" })).toBe("Foo_1.2.3_x64-setup.exe");
  });
  it("the real tauri.conf.json yields guif_0.3.0_x64-setup.exe", async () => {
    const m = await load("installer-name.mjs");
    const conf = JSON.parse(readFileSync(join(APP, "src-tauri", "tauri.conf.json"), "utf-8"));
    expect(m.expectedInstallerName(conf)).toBe("guif_0.3.0_x64-setup.exe");
  });
});

describe("footprint.mjs: the AC-1470 list as data (§3.15.4, §3.15.13 3)", () => {
  const IDS = ["R1", "R2", "R3", "R4", "R5", "F1", "F2", "F3", "S1", "S2", "S3", "T1", "W1", "D1", "M1"];
  it("has exactly the ids R1-R5, F1-F3, S1-S3, T1, W1, D1 and the aborted-install row M1, once each", async () => {
    const { FOOTPRINT } = await load("footprint.mjs");
    expect(FOOTPRINT.map((e: { id: string }) => e.id).sort()).toEqual([...IDS].sort());
  });
  it("every row has a label, a location and an afterUninstall mark (removed / remains / unchanged)", async () => {
    const { FOOTPRINT } = await load("footprint.mjs");
    for (const e of FOOTPRINT) {
      expect(typeof e.label, e.id).toBe("string");
      expect(e.label.length, e.id).toBeGreaterThan(0);
      expect(typeof e.location, e.id).toBe("string");
      expect(e.location.length, e.id).toBeGreaterThan(0);
      expect(["removed", "remains", "unchanged"], e.id).toContain(e.afterUninstall);
    }
  });
  it("the removed / remains marks follow the table (checkbox off)", async () => {
    const { FOOTPRINT } = await load("footprint.mjs");
    const mark = (id: string) => FOOTPRINT.find((e: { id: string }) => e.id === id).afterUninstall;
    for (const id of ["R1", "R5", "F1", "F2", "F3", "S1", "S2", "S3"]) expect(mark(id), id).toBe("removed");
    for (const id of ["R2", "R3", "T1", "W1", "D1", "M1"]) expect(mark(id), id).toBe("remains");
    expect(mark("R4")).toBe("unchanged");
  });
  it("key locations: Uninstall\\guif, Software\\guif\\guif, Run, guif.exe, uninstall.exe, the settings folder, WebView2 setup", async () => {
    const { FOOTPRINT } = await load("footprint.mjs");
    const loc = (id: string): string => FOOTPRINT.find((e: { id: string }) => e.id === id).location;
    expect(loc("R1")).toMatch(/CurrentVersion\\Uninstall\\guif/);
    expect(loc("R2")).toMatch(/Software\\guif\\guif/);
    expect(loc("R3")).toMatch(/Software\\guif\\guif/);
    expect(loc("R5")).toMatch(/CurrentVersion\\Run/);
    expect(loc("F1")).toContain("guif.exe");
    expect(loc("F2")).toContain("uninstall.exe");
    expect(loc("F3")).toMatch(/LOCALAPPDATA%\\guif/i);
    expect(loc("S1")).toContain("guif.lnk");
    expect(loc("S2")).toContain("guif.lnk");
    expect(loc("T1")).toContain("MicrosoftEdgeWebview2Setup.exe");
    expect(loc("D1")).toContain("dev.guif.app");
  });
  it("R3 is the `Installer Language` value; M1 is the aborted-install row (label contains 中断時)", async () => {
    const { FOOTPRINT } = await load("footprint.mjs");
    const row = (id: string) => FOOTPRINT.find((e: { id: string }) => e.id === id);
    expect(row("R3").location + row("R3").label).toContain("Installer Language");
    expect(row("M1").label).toContain("中断時");
  });
});

describe("build.mjs: static scan (MUST-140, R-1402)", () => {
  it("launches tauri.js with execFileSync(process.execPath, [...]) and no `shell` option", () => {
    const s = source("build.mjs");
    expect(s).toMatch(/execFileSync\(\s*process\.execPath\s*,\s*\[/);
    expect(s).toMatch(/tauri\.js/);
    expect(s).toMatch(/"build"/);
    expect(s).toMatch(/"--bundles"/);
    expect(s).toMatch(/"nsis"/);
    expect(s).not.toMatch(/\bshell\b/);
  });
  it("does not call npx / npx.cmd / npm and does not use exec / spawn with a command string", () => {
    const s = source("build.mjs");
    expect(s).not.toMatch(/\bnpx(\.cmd)?\b/);
    expect(s).not.toMatch(/\bnpm(\.cmd)?\b/);
    expect(s).not.toMatch(/\b(exec|execSync|spawn|spawnSync)\(/);
  });
  it("uses only Node built-ins and the sibling scripts (no package imports)", () => {
    const s = source("build.mjs");
    const specs = [...s.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const sp of specs) expect(sp.startsWith("node:") || sp.startsWith("./"), sp).toBe(true);
  });
  it("wires the pure parts: checkVersions, expectedInstallerName, sha256File, and refuses MSI output", () => {
    const s = source("build.mjs");
    for (const w of ["checkVersions", "expectedInstallerName", "sha256File", "formatChecksumLine"]) expect(s, w).toContain(w);
    expect(s).toMatch(/msi/);
    expect(s).toMatch(/\.sha256/);
  });
});

describe("audit-state.mjs: read-only (R-1496, AC-1470)", () => {
  const WRITE_APIS = [
    "writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream", "unlink", "unlinkSync", "rm", "rmSync", "rmdir", "rmdirSync",
    "mkdir", "mkdirSync", "rename", "renameSync", "copyFile", "copyFileSync", "cp", "cpSync", "truncate", "truncateSync", "symlink", "chmod", "utimes", "open", "openSync",
  ];
  it.each(WRITE_APIS)("does not use the fs write API `%s`", (api) => {
    const s = source("audit-state.mjs");
    expect(s).not.toMatch(new RegExp(`\\b${api}\\s*\\(`));
    expect(s).not.toMatch(new RegExp(`import\\s*\\{[^}]*\\b${api}\\b[^}]*\\}`));
  });
  it("never runs a mutating command (reg add/delete/import/copy/save/restore/load, rm, del, Remove-Item, Set-ItemProperty, New-Item ...)", () => {
    const s = source("audit-state.mjs");
    const MUT = "add|delete|import|copy|save|restore|load|unload|flags";
    expect(s).not.toMatch(new RegExp(`\\breg(\\.exe)?["'\`]?\\s*,\\s*\\[?\\s*["'\`](${MUT})\\b`, "i"));
    expect(s).not.toMatch(new RegExp(`\\breg(\\.exe)?\\s+(${MUT})\\b`, "i"));
    expect(s).not.toMatch(/\b(Remove-Item|Set-ItemProperty|New-Item|New-ItemProperty|Set-Content|Add-Content|Out-File|Move-Item|Copy-Item|Rename-Item|Clear-Item)\b/i);
    expect(s).not.toMatch(/\b(rmdir|del|erase|mklink|move|xcopy|robocopy)\s/i);
  });
  it("only queries: reg query is used, no `shell` option, execFileSync-style with fixed arguments", () => {
    const s = source("audit-state.mjs");
    expect(s).toMatch(/["'`]query["'`]/);
    expect(s).not.toMatch(/\bshell\b/);
    expect(s).not.toMatch(/\b(exec|execSync)\(/);
  });
  it("covers the three Uninstall views, the Programs sub-folders, the Desktop via GetFolderPath, and LOCALAPPDATA", () => {
    const s = source("audit-state.mjs");
    expect(s).toMatch(/Uninstall/);
    expect(s).toMatch(/HKLM|HKEY_LOCAL_MACHINE/);
    expect(s).toMatch(/HKCU|HKEY_CURRENT_USER/);
    expect(s).toMatch(/\/reg:32|\/reg:64|WOW6432Node/i);
    expect(s).toMatch(/GetFolderPath\(\s*'Desktop'\s*\)|GetFolderPath\(\\?["']Desktop\\?["']\)/);
    expect(s).toMatch(/Programs/);
    expect(s).toMatch(/LOCALAPPDATA/);
    expect(s).toMatch(/footprint\.mjs/);
    expect(s).toMatch(/JSON\.stringify/);
  });
});

describe("package.json: scripts and dependencies (R-1402)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg: any = JSON.parse(readFileSync(join(APP, "package.json"), "utf-8"));
  it("adds the three release scripts verbatim", () => {
    expect(pkg.scripts["release:check"]).toBe("node scripts/release/versions.mjs");
    expect(pkg.scripts["release:build"]).toBe("node scripts/release/build.mjs");
    expect(pkg.scripts["release:audit"]).toBe("node scripts/release/audit-state.mjs");
  });
  it("keeps the previous scripts", () => {
    for (const k of ["dev", "build", "preview", "prepare", "tauri", "test", "test:watch", "e2e", "e2e:attach"]) expect(pkg.scripts[k], k).toBeTypeOf("string");
  });
  it("adds no dependency (the package sets are unchanged)", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@tauri-apps/api", "highlight.js", "markdown-it"]);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(
      ["@sveltejs/adapter-static", "@sveltejs/kit", "@sveltejs/vite-plugin-svelte", "@tauri-apps/cli", "@types/node", "svelte", "typescript", "vite", "vitest"].sort(),
    );
  });
  it("every release script imports only node: built-ins or sibling files", () => {
    for (const f of ["versions.mjs", "sha256.mjs", "installer-name.mjs", "footprint.mjs", "build.mjs", "audit-state.mjs"]) {
      const s = source(f);
      for (const m of s.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) expect(m[1].startsWith("node:") || m[1].startsWith("./"), `${f}: ${m[1]}`).toBe(true);
    }
  });
});
