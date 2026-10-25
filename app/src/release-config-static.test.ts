/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0600-0001 第3版 AC-1400 (bundle settings), AC-1401 (icons, 第3版: made from icons-source/android-chrome-512x512.png), AC-1404 (no detection), R-1411 / T-09 (versions agree), R-1471.
// Design: SPEC-0200-0001 §3.15.5, §3.15.8, §3.15.13 (H-4 decided: package-lock.json top-level version is in scope).
//
// Contract assumed (reported to the implementer): no script is imported here, only files are read.
//   - app/src-tauri/tauri.conf.json carries the keys of §3.15.5 (version 0.3.0, top-level mainBinaryName, bundle.targets ["nsis"], ...).
//   - app/src-tauri/icons/ holds exactly 32x32.png, 128x128.png, 128x128@2x.png, icon.ico, made from icons-source/android-chrome-512x512.png (R-1470).
//   - Cargo.toml `[package] version`, Cargo.lock `guif` version, package.json and package-lock.json
//     (top level and packages[""]) are all 0.3.0.
// Status at TDD time: RED (the repo is still at 0.0.0 / targets "all" / icon []).

const APP = resolve(__dirname, "..");
const TAURI = join(APP, "src-tauri");
const ICONS = join(TAURI, "icons");
const EXPECTED_VERSION = "0.3.0";

// R-1470 / AC-1401 (iv): the source image of the icons (recorded sha256; `favicon_io/android-chrome-512x512.png`).
const ICON_FILES = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico"];
const ICON_PNG_SIZES: Record<string, number> = { "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256 };
const ICON_SOURCE = join(TAURI, "icons-source", "android-chrome-512x512.png");
const ICON_SOURCE_SHA256 = "3bf2fb728bdbd0806c5db433c337ddd984f8ef53794ed3b304510fab33c1ca46";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conf: any = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf-8"));
const read = (p: string) => readFileSync(p, "utf-8");

function cargoTomlVersion(text: string): string | null {
  const m = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(text);
  return m ? m[1] : null;
}
function cargoLockVersion(text: string): string | null {
  const m = /name\s*=\s*"guif"\s*\r?\nversion\s*=\s*"([^"]+)"/.exec(text);
  return m ? m[1] : null;
}

describe("R-1411 / T-09 / H-4: the versions agree on 0.3.0", () => {
  it("tauri.conf.json version is 0.3.0 (the source of truth)", () => {
    expect(conf.version).toBe(EXPECTED_VERSION);
  });
  it("package.json version is 0.3.0", () => {
    expect(JSON.parse(read(join(APP, "package.json"))).version).toBe(EXPECTED_VERSION);
  });
  it("package-lock.json top-level version and packages[''].version are 0.3.0", () => {
    const lock = JSON.parse(read(join(APP, "package-lock.json")));
    expect(lock.version).toBe(EXPECTED_VERSION);
    expect(lock.packages[""].version).toBe(EXPECTED_VERSION);
  });
  it("Cargo.toml [package] version is 0.3.0", () => {
    expect(cargoTomlVersion(read(join(TAURI, "Cargo.toml")))).toBe(EXPECTED_VERSION);
  });
  it("Cargo.lock: the guif package is 0.3.0", () => {
    expect(cargoLockVersion(read(join(TAURI, "Cargo.lock")))).toBe(EXPECTED_VERSION);
  });
});

describe("AC-1400 / R-1400 / R-1403 / T-02 / T-03: tauri.conf.json distribution settings", () => {
  it("product name is guif and identifier is dev.guif.app (R-1401, 【確定 #6】【確定 #6-1】)", () => {
    expect(conf.productName).toBe("guif");
    expect(conf.identifier).toBe("dev.guif.app");
  });
  it("the main window title is guif; the publisher, when set, is guif (R-1473)", () => {
    const main = (conf.app?.windows ?? []).find((w: { label?: string }) => w.label === "main") ?? conf.app?.windows?.[0];
    expect(main?.title).toBe("guif");
    if (conf.bundle?.publisher !== undefined) expect(conf.bundle.publisher).toBe("guif");
  });
  it("the Cargo package name is guif", () => {
    expect(/^\[package\][\s\S]*?^name\s*=\s*"guif"/m.test(read(join(TAURI, "Cargo.toml")))).toBe(true);
  });
  it("bundle.targets is exactly [\"nsis\"] (no MSI)", () => {
    expect(conf.bundle.targets).toEqual(["nsis"]);
  });
  it("mainBinaryName is guif and equals productName (T-02, top-level key)", () => {
    expect(conf.mainBinaryName).toBe("guif");
    expect(conf.mainBinaryName).toBe(conf.productName);
  });
  it("bundle.icon lists exactly the four icons in order", () => {
    expect(conf.bundle.icon).toEqual(["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"]);
  });
  it("nsis: installMode currentUser, languages [Japanese]", () => {
    const nsis = conf.bundle?.windows?.nsis;
    expect(nsis?.installMode).toBe("currentUser");
    expect(nsis?.languages).toEqual(["Japanese"]);
  });
  it("nsis: displayLanguageSelector is not true", () => {
    expect(conf.bundle?.windows?.nsis?.displayLanguageSelector).not.toBe(true);
  });
  it("webviewInstallMode.type is downloadBootstrapper (T-03)", () => {
    expect(conf.bundle?.windows?.webviewInstallMode?.type).toBe("downloadBootstrapper");
  });
  it("no `resources` anywhere in bundle (R-1403 / T-11) and no wix / msi section", () => {
    expect(conf.bundle.resources).toBeUndefined();
    expect(conf.bundle?.windows?.wix).toBeUndefined();
    expect(existsSync(join(TAURI, "resources"))).toBe(false);
  });
});

// Every file under app/src-tauri except the build output (target/).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return dir === TAURI && e.name === "target" ? [] : sourceFiles(p);
    return [p];
  });
}

describe("AC-1404 / R-1448: the installer has no old-product detection of its own", () => {
  it("(i) bundle.windows.nsis has no installerHooks and no template", () => {
    const nsis = conf.bundle?.windows?.nsis;
    expect(nsis).toBeDefined();
    expect(nsis.installerHooks).toBeUndefined();
    expect(nsis.template).toBeUndefined();
  });
  it("(ii) no installer-hooks.nsh and no other .nsh / .nsi file under app/src-tauri", () => {
    expect(existsSync(join(TAURI, "installer-hooks.nsh"))).toBe(false);
    expect(sourceFiles(TAURI).filter((p) => /\.(nsh|nsi)$/i.test(p))).toEqual([]);
  });
  it("(iii) no file under app/src-tauri contains `BundleIdentifier`", () => {
    const hits = sourceFiles(TAURI).filter((p) => {
      const text = readFileSync(p).toString("latin1");
      return text.includes("BundleIdentifier");
    });
    expect(hits).toEqual([]);
  });
});

// Width / height of a PNG from its IHDR (bytes 16..24, big-endian).
function pngSize(buf: Buffer): { w: number; h: number } {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
// Sizes of the entries of an ICO (a width / height byte of 0 means 256).
function icoSizes(buf: Buffer): { w: number; h: number }[] {
  expect(buf.readUInt16LE(0)).toBe(0);
  expect(buf.readUInt16LE(2)).toBe(1);
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const o = 6 + i * 16;
    return { w: buf[o] || 256, h: buf[o + 1] || 256 };
  });
}

describe("AC-1401 / T-01 / R-1470: icons made from the source image", () => {
  it("(i) icons/ holds exactly the four files (nothing else: no icns, android, ios, Store, 64x64)", () => {
    expect(existsSync(ICONS)).toBe(true);
    expect(readdirSync(ICONS).sort()).toEqual([...ICON_FILES].sort());
  });
  it.each(Object.entries(ICON_PNG_SIZES))("(ii) %s is %i x %i px", (file, n) => {
    expect(pngSize(readFileSync(join(ICONS, file)))).toEqual({ w: n, h: n });
  });
  it("(iii) icon.ico contains a 256 x 256 entry", () => {
    expect(icoSizes(readFileSync(join(ICONS, "icon.ico")))).toContainEqual({ w: 256, h: 256 });
  });
  it("(iv) the source image exists, is 512 x 512 and has the recorded sha256", () => {
    expect(existsSync(ICON_SOURCE)).toBe(true);
    const buf = readFileSync(ICON_SOURCE);
    expect(pngSize(buf)).toEqual({ w: 512, h: 512 });
    expect(createHash("sha256").update(buf).digest("hex")).toBe(ICON_SOURCE_SHA256);
  });
  it("(v) nothing under favicon_io/ is tracked by git", () => {
    const out = execFileSync("git", ["-C", resolve(APP, ".."), "ls-files", "--", "favicon_io"], { encoding: "utf-8" });
    expect(out.trim()).toBe("");
  });
});


