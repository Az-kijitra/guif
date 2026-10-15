/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0600-0001 R-1441, R-1442 (T-07), R-1443, R-1444-1..4, R-1446; AC-1420..1424 (structure only).
// Design: SPEC-0200-0001 §3.15.2 as OVERRIDDEN by §3.15.13 1 (detect function + custom page + hidden first section), §28 (MUST-139, SHOULD-211, MINOR-26..28).
//
// Contract assumed (reported to the implementer) for app/src-tauri/installer-hooks.nsh:
//   - UTF-8 with BOM.  !define REFLEX_OLD_PRODUCT_NAME "ReflexFIles", REFLEX_BUNDLE_ID "dev.reflexfiles.successor" (== conf identifier),
//     REFLEX_MARK_VALUE "BundleIdentifier".  `Var ReflexOldFound`.
//   - ONE function `ReflexDetectOldProduct ... FunctionEnd`: read-only, no Abort, scans HKCU / HKLM(SetRegView 64) / HKLM(SetRegView 32) with
//     EnumRegKey + ReadRegStr, names compared with StrCmp (case-insensitive), the mark with StrCmpS against ${REFLEX_BUNDLE_ID},
//     and the LAST SetRegView in the body is `SetRegView 64`.  Any $R0..$R9 it uses is Push-ed and Pop-ped.
//   - `Page custom ReflexOldProductPage` (the only Page line); its function Abort-s when nothing old is found; otherwise
//     MessageBox MB_OK|MB_ICONSTOP "...ReflexFiles ..." /SD IDOK (unless /P or /UPDATE), then `SetErrorLevel 2` + `Quit`
//     (SetErrorLevel and Quit on consecutive lines).
//   - exactly one `Section "-ReflexOldProductCheck"` (name starts with "-"), body calls the detect function, SetErrorLevel 2 + Quit, no Abort, no MessageBox.
//   - `!macro NSIS_HOOK_PREINSTALL` writes the mark on one line:
//       WriteRegStr SHCTX "${UNINSTKEY}" "${REFLEX_MARK_VALUE}" "${BUNDLEID}"   (or the literal "BundleIdentifier")
//   - the file never mentions the old settings folder `com.toshi.reflexfiles`.
// Status at TDD time: RED (installer-hooks.nsh does not exist yet).

const APP = resolve(__dirname, "..");
const TAURI = join(APP, "src-tauri");
const HOOKS = join(TAURI, "installer-hooks.nsh");
const GENERATED = join(TAURI, "target", "release", "nsis", "x64", "installer.nsi");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conf: any = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf-8"));

const raw: Buffer | null = existsSync(HOOKS) ? readFileSync(HOOKS) : null;
const text = raw ? raw.toString("utf-8").replace(/^﻿/, "") : "";
const need = () => {
  if (!raw) throw new Error("app/src-tauri/installer-hooks.nsh does not exist yet (RED)");
};

/** Drop NSIS comments: whole-line `;`/`#` and trailing `;` outside double quotes. */
function stripComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((line) => {
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQ = !inQ;
        else if (!inQ && (c === ";" || (c === "#" && /^\s*$/.test(line.slice(0, i))))) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}
const code = stripComments(text);

function body(re: RegExp): string {
  const m = re.exec(code);
  if (!m) throw new Error(`block not found: ${re}`);
  return m[1];
}
const detectBody = () => body(/^\s*Function\s+ReflexDetectOldProduct\b([\s\S]*?)^\s*FunctionEnd/im);
const pageBody = () => body(/^\s*Function\s+ReflexOldProductPage\b([\s\S]*?)^\s*FunctionEnd/im);
const sectionBody = () => body(/^\s*Section\b[^\n]*\n([\s\S]*?)^\s*SectionEnd/im);
const define = (name: string): string | null => {
  const m = new RegExp(`^\\s*!define\\s+${name}\\s+"([^"]*)"`, "m").exec(code);
  return m ? m[1] : null;
};

const FORBIDDEN_WRITES =
  /^\s*(WriteReg\w*|DeleteReg\w*|Delete|RMDir|File|ExecWait|Exec|ExecShell\w*|CreateShortcut|CopyFiles|Rename|SetOutPath|CreateDirectory|WriteUninstaller|nsExec::\w+)\b/im;

describe("file basics (R-1441)", () => {
  it("exists and starts with a UTF-8 BOM (the generated installer is Unicode true)", () => {
    need();
    expect([...raw!.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
  it("defines the three constants; names and ids agree with tauri.conf.json (H-5)", () => {
    need();
    expect(define("REFLEX_OLD_PRODUCT_NAME")).toBe("ReflexFIles");
    expect(define("REFLEX_BUNDLE_ID")).toBe(conf.identifier);
    expect(define("REFLEX_MARK_VALUE")).toBe("BundleIdentifier");
    // the old spelling differs from productName by case only (that is why the key collides, §3.15.1 (b))
    expect(define("REFLEX_OLD_PRODUCT_NAME")).not.toBe(conf.productName);
    expect(define("REFLEX_OLD_PRODUCT_NAME")!.toLowerCase()).toBe(conf.productName.toLowerCase());
  });
  it("declares the result variable `Var ReflexOldFound`", () => {
    need();
    expect(code).toMatch(/^\s*Var\s+ReflexOldFound\b/m);
  });
  it("never mentions the old product's settings folder (R-1446)", () => {
    need();
    expect(text).not.toContain("com.toshi.reflexfiles");
    expect(text.toLowerCase()).not.toContain("com.toshi");
  });
});

describe("ReflexDetectOldProduct: read-only, three views, exit view (R-1441, R-1444, MINOR-28, SHOULD-211)", () => {
  it("is defined exactly once", () => {
    need();
    expect(code.match(/^\s*Function\s+ReflexDetectOldProduct\b/gim)?.length).toBe(1);
  });
  it("contains no write / delete / execute / file instruction", () => {
    need();
    expect(detectBody()).not.toMatch(FORBIDDEN_WRITES);
  });
  it("contains no Abort (an Abort inside a Section fails the install)", () => {
    need();
    expect(detectBody()).not.toMatch(/\bAbort\b/i);
  });
  it("scans HKCU and HKLM 64 and HKLM 32 of ...\\Uninstall with EnumRegKey / ReadRegStr", () => {
    need();
    const b = detectBody();
    expect(b).toMatch(/HKCU/);
    expect(b).toMatch(/HKLM/);
    expect(b).toMatch(/SetRegView\s+64/i);
    expect(b).toMatch(/SetRegView\s+32/i);
    expect(b).toMatch(/Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall/i);
    expect(b).toMatch(/\bEnumRegKey\b/i);
    expect(b).toMatch(/\bReadRegStr\b/i);
    expect(b).toMatch(/DisplayName/);
  });
  it("the LAST SetRegView in the body is `SetRegView 64` and no registry read comes after it", () => {
    need();
    const b = detectBody();
    const views = [...b.matchAll(/\bSetRegView\s+(\d+)/gi)];
    expect(views.length).toBeGreaterThanOrEqual(3);
    expect(views[views.length - 1][1]).toBe("64");
    const lastReg = Math.max(b.lastIndexOf("EnumRegKey"), b.lastIndexOf("ReadRegStr"));
    expect(views[views.length - 1].index!).toBeGreaterThan(lastReg);
  });
  it("compares the product name with StrCmp (case-insensitive), never StrCmpS; StrCmpS only for the mark (R-1444-2/3)", () => {
    need();
    const lines = detectBody().split("\n");
    const nameLines = lines.filter((l) => /REFLEX_OLD_PRODUCT_NAME/.test(l));
    expect(nameLines.length).toBeGreaterThan(0);
    for (const l of nameLines) expect(l).not.toMatch(/StrCmpS/i);
    expect(nameLines.some((l) => /\bStrCmp\b/i.test(l))).toBe(true);
    const strict = lines.filter((l) => /\bStrCmpS\b/i.test(l));
    expect(strict.length).toBeGreaterThan(0);
    for (const l of strict) expect(l).toMatch(/REFLEX_BUNDLE_ID/);
  });
  it("reads the mark value BundleIdentifier (via REFLEX_MARK_VALUE or the literal)", () => {
    need();
    expect(detectBody()).toMatch(/REFLEX_MARK_VALUE|BundleIdentifier/);
  });
  it("any $R0..$R9 it touches is Push-ed and Pop-ped (does not corrupt PageReinstall / EarlyChecks)", () => {
    need();
    const b = detectBody();
    for (const n of new Set([...b.matchAll(/\$R([0-9])\b/g)].map((m) => m[1]))) {
      expect(b, `Push $R${n}`).toMatch(new RegExp(`\\bPush\\s+\\$R${n}\\b`, "i"));
      expect(b, `Pop $R${n}`).toMatch(new RegExp(`\\bPop\\s+\\$R${n}\\b`, "i"));
    }
  });
  it("reports through ReflexOldFound", () => {
    need();
    expect(detectBody()).toMatch(/\bReflexOldFound\b/);
  });
});

describe("Page custom ReflexOldProductPage (interactive, /P, /UPDATE) (R-1442, R-1443, MINOR-26)", () => {
  it("there is exactly one Page line and it is `Page custom ReflexOldProductPage`", () => {
    need();
    const pages = code.match(/^\s*Page\s+.*$/gim) ?? [];
    expect(pages.length).toBe(1);
    expect(pages[0]).toMatch(/^\s*Page\s+custom\s+ReflexOldProductPage\b/i);
  });
  it("calls the detect function and Abort-s (skips the page) when nothing old is found", () => {
    need();
    const b = pageBody();
    expect(b).toMatch(/\bCall\s+ReflexDetectOldProduct\b/i);
    expect(b).toMatch(/\bAbort\b/i);
  });
  it("shows MessageBox MB_OK|MB_ICONSTOP with /SD IDOK, then SetErrorLevel 2 -> Quit", () => {
    need();
    const b = pageBody();
    const mb = b.split("\n").filter((l) => /\bMessageBox\b/i.test(l));
    expect(mb.length).toBeGreaterThan(0);
    expect(mb.join("\n")).toMatch(/MB_OK\s*\|\s*MB_ICONSTOP/);
    expect(mb.join("\n")).toMatch(/\/SD\s+IDOK/);
    expect(b).toMatch(/SetErrorLevel\s+2\s*\r?\n\s*Quit\b/i);
  });
  it("T-07 text: names the new product by the productName literal and the old one as ReflexFIles", () => {
    need();
    const mb = pageBody().split("\n").filter((l) => /\bMessageBox\b/i.test(l)).join("\n");
    expect(mb).toContain(conf.productName); // case-sensitive: ReflexFiles
    expect(mb).toMatch(/ReflexFIles|REFLEX_OLD_PRODUCT_NAME/);
    expect(mb).toContain("アンインストール");
    expect(mb).toContain("設定は引き継がれません");
  });
  it("decides quiet (no dialog) with /P and /UPDATE via GetOptions on $CMDLINE", () => {
    need();
    const b = pageBody();
    expect(b).toMatch(/GetOptions\}?\s+\$CMDLINE\s+"\/P"/);
    expect(b).toMatch(/GetOptions\}?\s+\$CMDLINE\s+"\/UPDATE"/);
  });
  it("contains no write / delete / execute instruction", () => {
    need();
    expect(pageBody()).not.toMatch(FORBIDDEN_WRITES);
  });
});

describe("hidden first Section for /S (R-1443, MUST-139)", () => {
  it("there is exactly one Section in the file and its name starts with `-`", () => {
    need();
    const sections = [...code.matchAll(/^\s*Section\s+("[^"]*"|\S+)/gim)];
    expect(sections.length).toBe(1);
    expect(sections[0][1].replace(/^"|"$/g, "").startsWith("-")).toBe(true);
  });
  it("its body calls the detect function, SetErrorLevel 2 -> Quit, with no Abort and no dialog", () => {
    need();
    const b = sectionBody();
    expect(b).toMatch(/\bCall\s+ReflexDetectOldProduct\b/i);
    expect(b).toMatch(/SetErrorLevel\s+2\s*\r?\n\s*Quit\b/i);
    expect(b).not.toMatch(/\bAbort\b/i);
    expect(b).not.toMatch(/\bMessageBox\b/i);
    expect(b).not.toMatch(FORBIDDEN_WRITES);
  });
  it("any $R0..$R9 in the section body is Push-ed and Pop-ped", () => {
    need();
    const b = sectionBody();
    for (const n of new Set([...b.matchAll(/\$R([0-9])\b/g)].map((m) => m[1]))) {
      expect(b).toMatch(new RegExp(`\\bPush\\s+\\$R${n}\\b`, "i"));
      expect(b).toMatch(new RegExp(`\\bPop\\s+\\$R${n}\\b`, "i"));
    }
  });
});

describe("hook macros (R-1444-3, R-1446)", () => {
  const macro = (name: string): string | null => {
    const m = new RegExp(`^\\s*!macro\\s+${name}\\b([\\s\\S]*?)^\\s*!macroend`, "im").exec(code);
    return m ? m[1] : null;
  };
  it("NSIS_HOOK_PREINSTALL writes the mark BundleIdentifier = ${BUNDLEID} under ${UNINSTKEY}", () => {
    need();
    const b = macro("NSIS_HOOK_PREINSTALL");
    expect(b).not.toBeNull();
    expect(b).toMatch(/WriteRegStr\s+SHCTX\s+"\$\{UNINSTKEY\}"\s+("\$\{REFLEX_MARK_VALUE\}"|"BundleIdentifier")\s+"\$\{BUNDLEID\}"/);
  });
  it("PREUNINSTALL / POSTUNINSTALL / POSTINSTALL (when present) do not refer to the old product", () => {
    need();
    for (const n of ["NSIS_HOOK_PREUNINSTALL", "NSIS_HOOK_POSTUNINSTALL", "NSIS_HOOK_POSTINSTALL"]) {
      const b = macro(n);
      if (b) expect(b).not.toMatch(/com\.toshi|ReflexFIles|REFLEX_OLD_PRODUCT_NAME/);
    }
  });
});

describe("generated installer.nsi order (conditional: runs only when target/release/nsis/x64/installer.nsi exists; otherwise SKIPPED, no build output on this machine)", () => {
  const present = existsSync(GENERATED);
  const gen = present ? readFileSync(GENERATED, "utf-8") : "";
  const it2 = it.skipIf(!present);
  it2("the installer-hooks.nsh include line exists", () => {
    expect(gen).toMatch(/^\s*!include\s+"[^"\n]*installer-hooks\.nsh"/m);
  });
  it2("the include comes before the first Section, MUI_PAGE_WELCOME and `Page custom PageReinstall`", () => {
    const inc = gen.search(/^\s*!include\s+"[^"\n]*installer-hooks\.nsh"/m);
    expect(inc).toBeGreaterThanOrEqual(0);
    for (const re of [/^\s*Section\b/m, /MUI_PAGE_WELCOME/, /^\s*Page\s+custom\s+PageReinstall\b/m]) {
      const at = gen.search(re);
      expect(at, String(re)).toBeGreaterThan(-1);
      expect(inc, String(re)).toBeLessThan(at);
    }
  });
});
