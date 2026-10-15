/// <reference types="node" />
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0600-0001 AC-1400 (bundle settings), AC-1401 (icons), R-1411 / T-09 (versions agree), R-1471.
// Design: SPEC-0200-0001 §3.15.5, §3.15.8, §3.15.13 (H-4 decided: package-lock.json top-level version is in scope).
//
// Contract assumed (reported to the implementer): no script is imported here, only files are read.
//   - app/src-tauri/tauri.conf.json carries the keys of §3.15.5 (version 0.3.0, top-level mainBinaryName, bundle.targets ["nsis"], ...).
//   - app/src-tauri/icons/ holds exactly 32x32.png, 128x128.png, 128x128@2x.png, icon.ico (byte-identical to old main a62954e).
//   - Cargo.toml `[package] version`, Cargo.lock `reflexfiles-successor` version, package.json and package-lock.json
//     (top level and packages[""]) are all 0.3.0.
// Status at TDD time: RED (the repo is still at 0.0.0 / targets "all" / icon []).

const APP = resolve(__dirname, "..");
const TAURI = join(APP, "src-tauri");
const ICONS = join(TAURI, "icons");
const EXPECTED_VERSION = "0.3.0";

// `git -C C:\Users\toshi\git\ReflexFiles rev-parse a62954e:app/src-tauri/icons/<file>` (blob hashes of the old main).
const ICON_BLOBS: Record<string, string> = {
  "32x32.png": "08300b558e30f35dc5cbba70bcfb8826f2a10622",
  "128x128.png": "bf4c554941e975e3e6fe84787d0500f6b3ad1fca",
  "128x128@2x.png": "234c2b6a37aa2994985a420eb0d2dbc3cfa76e15",
  "icon.ico": "a50a93352923152e3d7397c30abd915ce9701923",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conf: any = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf-8"));
const read = (p: string) => readFileSync(p, "utf-8");

function cargoTomlVersion(text: string): string | null {
  const m = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(text);
  return m ? m[1] : null;
}
function cargoLockVersion(text: string): string | null {
  const m = /name\s*=\s*"reflexfiles-successor"\s*\r?\nversion\s*=\s*"([^"]+)"/.exec(text);
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
  it("Cargo.lock: the reflexfiles-successor package is 0.3.0", () => {
    expect(cargoLockVersion(read(join(TAURI, "Cargo.lock")))).toBe(EXPECTED_VERSION);
  });
});

describe("AC-1400 / R-1400 / R-1403 / T-02 / T-03: tauri.conf.json distribution settings", () => {
  it("product name and identifier are unchanged", () => {
    expect(conf.productName).toBe("ReflexFiles");
    expect(conf.identifier).toBe("dev.reflexfiles.successor");
  });
  it("bundle.targets is exactly [\"nsis\"] (no MSI)", () => {
    expect(conf.bundle.targets).toEqual(["nsis"]);
  });
  it("mainBinaryName is ReflexFiles and equals productName (T-02, top-level key)", () => {
    expect(conf.mainBinaryName).toBe("ReflexFiles");
    expect(conf.mainBinaryName).toBe(conf.productName);
  });
  it("bundle.icon lists exactly the four icons in order", () => {
    expect(conf.bundle.icon).toEqual(["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"]);
  });
  it("nsis: installMode currentUser, languages [Japanese], installerHooks installer-hooks.nsh", () => {
    const nsis = conf.bundle?.windows?.nsis;
    expect(nsis?.installMode).toBe("currentUser");
    expect(nsis?.languages).toEqual(["Japanese"]);
    expect(nsis?.installerHooks).toBe("installer-hooks.nsh");
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
  it("the hook file named by installerHooks exists next to tauri.conf.json", () => {
    const hooks = conf.bundle?.windows?.nsis?.installerHooks;
    expect(typeof hooks).toBe("string");
    expect(existsSync(join(TAURI, hooks))).toBe(true);
  });
});

describe("AC-1401 / T-01: icons are byte-identical to the old main (git blob sha1)", () => {
  it("icons/ holds exactly the four files (nothing else)", () => {
    expect(existsSync(ICONS)).toBe(true);
    expect(readdirSync(ICONS).sort()).toEqual(Object.keys(ICON_BLOBS).sort());
  });
  it.each(Object.entries(ICON_BLOBS))("%s has blob hash %s", (file, expected) => {
    const buf = readFileSync(join(ICONS, file));
    const blob = createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
    expect(blob).toBe(expected);
  });
});
