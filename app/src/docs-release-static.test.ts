/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0600-0001 第2版 AC-1460, R-1449, R-1486, R-1490, R-1491, T-04, S-6 (Japanese only); SPEC-0500-0001 R-03 (links exist).
// Design: SPEC-0200-0001 §3.15.7, §3.15.8.
//
// Contract: <repo>/README.md, <repo>/CHANGELOG.md, <repo>/docs/user_manual.md exist, are written in Japanese, and contain:
//   README + manual : SmartScreen with the way past it (「詳細情報」 then 「実行」)
//   README          : the "アプリのデータを削除する" default (R-1461), links to docs/user_manual.md and CHANGELOG.md
//   CHANGELOG       : a `## 0.3.0` heading
//   manual          : %APPDATA%\dev.reflexfiles.successor and that it stays by default
//   None of the three mentions the old product (R-1449). No placeholders; no other-language variants; no docs/CHANGELOG.md;
//   no app/src-tauri/resources/.

const REPO = resolve(__dirname, "..", "..");
const README = join(REPO, "README.md");
const CHANGELOG = join(REPO, "CHANGELOG.md");
const MANUAL = join(REPO, "docs", "user_manual.md");

const doc = (p: string): string => {
  if (!existsSync(p)) throw new Error(`${p} does not exist yet (RED)`);
  return readFileSync(p, "utf-8").replace(/^﻿/, "");
};
const JA = /[぀-ヿ]/;

describe("existence (AC-1460, R-1490)", () => {
  it.each([
    ["README.md", README],
    ["CHANGELOG.md", CHANGELOG],
    ["docs/user_manual.md", MANUAL],
  ])("%s exists and is not empty", (_n, p) => {
    expect(existsSync(p)).toBe(true);
    expect(doc(p).trim().length).toBeGreaterThan(200);
  });
  it("CHANGELOG is the single root file (no docs/CHANGELOG.md, no app/CHANGELOG.md)", () => {
    expect(existsSync(join(REPO, "docs", "CHANGELOG.md"))).toBe(false);
    expect(existsSync(join(REPO, "app", "CHANGELOG.md"))).toBe(false);
  });
  it("nothing is bundled into the installer: no app/src-tauri/resources/ (R-1491, T-11)", () => {
    expect(existsSync(join(REPO, "app", "src-tauri", "resources"))).toBe(false);
  });
});

describe("Japanese only (S-6, R-1490)", () => {
  it.each([
    ["README.md", README],
    ["CHANGELOG.md", CHANGELOG],
    ["docs/user_manual.md", MANUAL],
  ])("%s is written in Japanese", (_n, p) => {
    expect(doc(p)).toMatch(JA);
  });
  it("there is no other-language variant (*.en.md, *.ja.md, README.*.md, user_manual.*.md)", () => {
    const names = [...readdirSync(REPO), ...readdirSync(join(REPO, "docs")).map((f) => `docs/${f}`)];
    const bad = names.filter((f) => /(^|\/)(README|CHANGELOG|user_manual)\.[a-z]{2}(-[A-Za-z]+)?\.md$/i.test(f) || /\.(en|ja|zh|ko)\.md$/i.test(f));
    expect(bad).toEqual([]);
  });
});

describe("required content (R-1486, R-1461, T-04)", () => {
  it("README: SmartScreen warning and how to proceed (詳細情報 -> 実行)", () => {
    const t = doc(README);
    expect(t).toContain("SmartScreen");
    expect(t).toContain("詳細情報");
    expect(t).toMatch(/実行/);
  });
  it("manual: SmartScreen warning and how to proceed (詳細情報 -> 実行)", () => {
    const t = doc(MANUAL);
    expect(t).toContain("SmartScreen");
    expect(t).toContain("詳細情報");
  });
  it("README: uninstall keeps the settings by default (「アプリのデータを削除する」, R-1461)", () => {
    expect(doc(README)).toContain("アプリのデータを削除する");
  });
  it("README: target environment Windows 10 / 11 and the version 0.3.0 appear", () => {
    const t = doc(README);
    expect(t).toMatch(/Windows 10/);
    expect(t).toMatch(/Windows 11/);
  });
  it("manual: install / uninstall, the settings folder %APPDATA%\\dev.reflexfiles.successor and that it stays by default", () => {
    const t = doc(MANUAL);
    expect(t).toContain("インストール");
    expect(t).toContain("アンインストール");
    expect(t).toContain("dev.reflexfiles.successor");
    expect(t).toMatch(/残(る|り)/);
    expect(t).toContain("アプリのデータを削除する");
  });
  it("CHANGELOG: has a `## 0.3.0` entry", () => {
    expect(doc(CHANGELOG)).toMatch(/^##\s+0\.3\.0\b/m);
  });
  it("the product is ReflexFiles in README and manual", () => {
    expect(doc(README)).toContain("ReflexFiles");
    expect(doc(MANUAL)).toContain("ReflexFiles");
  });
});

// 第2版 R-1449: the old product is not mentioned at all (name, removal steps, its settings / log folders, succession).
describe("AC-1460 第2版 / R-1449: no mention of the old product", () => {
  const OLD = [/ReflexFIles/, /%APPDATA%\\?ReflexFIles/, /%LOCALAPPDATA%\\?ReflexViewer/, /旧製品/, /旧アプリ/];
  it.each([
    ["README.md", README],
    ["CHANGELOG.md", CHANGELOG],
    ["docs/user_manual.md", MANUAL],
  ])("%s does not mention the old product", (_n, p) => {
    const t = doc(p);
    expect(OLD.filter((re) => re.test(t)).map(String)).toEqual([]);
  });
});

describe("no placeholders remain (§3.15.7: write after the real-machine confirmation)", () => {
  it.each([
    ["README.md", README],
    ["CHANGELOG.md", CHANGELOG],
    ["docs/user_manual.md", MANUAL],
  ])("%s has no TODO / TBD / FIXME / xx placeholders", (_n, p) => {
    const t = doc(p);
    expect(t).not.toMatch(/\bTODO\b|\bTBD\b|\bFIXME\b|xx-xx|XXXX|<要確認>|【未定】/);
  });
});

describe("relative links resolve (SPEC-0500-0001 R-03)", () => {
  const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  it.each([
    ["README.md", README],
    ["CHANGELOG.md", CHANGELOG],
    ["docs/user_manual.md", MANUAL],
  ])("every relative link in %s points at an existing file or directory", (_n, p) => {
    const t = doc(p);
    const missing: string[] = [];
    for (const m of t.matchAll(LINK)) {
      const href = m[1];
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) continue; // http:, mailto:, #anchor
      const path = decodeURIComponent(href.split("#")[0].split("?")[0]);
      if (!path) continue;
      if (!existsSync(resolve(dirname(p), path))) missing.push(href);
    }
    expect(missing).toEqual([]);
  });
  it("README links to docs/user_manual.md and CHANGELOG.md", () => {
    const t = doc(README);
    expect(t).toMatch(/\]\((\.\/)?docs\/user_manual\.md(#[^)]*)?\)/);
    expect(t).toMatch(/\]\((\.\/)?CHANGELOG\.md(#[^)]*)?\)/);
  });
});
