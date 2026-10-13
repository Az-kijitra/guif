/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-466-2 (the extension -> language table; extension only, case-insensitive, no content
//   sniffing; `h` is C; Markdown only in the Markdown TEXT mode), R-410-1 (how the extension is taken), R-474 (HTML mode: no
//   highlight), AC-524.
// Architecture: SPEC-0200-0001 §3.14.7 (`features/viewer/highlight/language-map.ts`, pure `languageForPath(path, { mode })`),
//   §3.14.12-11 (the invariant is REVERSED: every entry of Rust `TEXT_EXTENSIONS` except `txt` / `log` is in the language table;
//   `mjs` / `cjs` / `tsx` / `md` / `markdown` being absent from the Rust list is intended, R-411-1 第8版 note -- do NOT add them).
//
//
// Contract assumed (reported to the implementer):
//   type LanguageId = "c" | "cpp" | "rust" | "javascript" | "typescript" | "python" | "json" | "markdown"
//   languageForPath(path: string, opts?: { mode?: "html" | "text" }): LanguageId | null
//     - `mode` only matters for Markdown: { mode: "html" } -> null; { mode: "text" } or omitted -> "markdown".
//
// Module under test (not yet implemented): ./language-map.ts

import { languageForPath } from "./language-map";

describe("AC-524: the examples of the spec", () => {
  it.each([
    ["a.c", "c"],
    ["a.H", "c"], // case-insensitive; `h` is C even for C++ headers
    ["a.cpp", "cpp"],
    ["a.hxx", "cpp"],
    ["a.rs", "rust"],
    ["a.MJS", "javascript"],
    ["a.cjs", "javascript"],
    ["a.tsx", "typescript"],
    ["a.py", "python"],
    ["a.json", "json"],
    ["a.md", "markdown"],
    ["a.txt", null],
    ["a.log", null],
    ["Makefile", null],
    [".gitignore", null],
    ["a.tar.gz", null],
    ["a.html", null],
  ] as const)("%s -> %s", (path, expected) => {
    expect(languageForPath(path)).toBe(expected);
  });
});

describe("R-466-2: the whole table", () => {
  it.each([
    ["c", "c"], ["h", "c"],
    ["cpp", "cpp"], ["cc", "cpp"], ["cxx", "cpp"], ["hpp", "cpp"], ["hh", "cpp"], ["hxx", "cpp"],
    ["rs", "rust"],
    ["js", "javascript"], ["mjs", "javascript"], ["cjs", "javascript"],
    ["ts", "typescript"], ["tsx", "typescript"],
    ["py", "python"],
    ["json", "json"],
    ["md", "markdown"], ["markdown", "markdown"],
  ] as const)("extension .%s -> %s (lower and upper case)", (ext, lang) => {
    expect(languageForPath(`C:\\dir\\file.${ext}`)).toBe(lang);
    expect(languageForPath(`C:\\dir\\file.${ext.toUpperCase()}`)).toBe(lang);
  });

  it("extensions NOT in the table are not highlighted: txt log html css toml yaml xml sh bat java go (R-466-2)", () => {
    for (const ext of ["txt", "log", "html", "htm", "css", "toml", "yaml", "yml", "xml", "sh", "bat", "java", "go", "rb", "php", "svg"]) {
      expect(languageForPath(`C:\\dir\\file.${ext}`), ext).toBeNull();
    }
  });
});

describe("R-410-1: how the extension is taken", () => {
  it("only the last dot of the FILE NAME counts: a dot in a folder name does not give an extension", () => {
    expect(languageForPath("C:\\proj.rs\\Makefile")).toBeNull();
    expect(languageForPath("C:\\a.c\\README")).toBeNull();
  });

  it("a file name that only starts with a dot has no extension (.gitignore, .rs is a name, not an extension)", () => {
    expect(languageForPath("C:\\x\\.gitignore")).toBeNull();
    expect(languageForPath("C:\\x\\.rs")).toBeNull();
  });

  it("a trailing dot or an empty extension gives no language", () => {
    expect(languageForPath("C:\\x\\a.")).toBeNull();
  });

  it("multi-dot names use the last extension: a.test.ts is TypeScript, a.min.js is JavaScript, a.rs.txt is none", () => {
    expect(languageForPath("C:\\x\\a.test.ts")).toBe("typescript");
    expect(languageForPath("C:\\x\\a.min.js")).toBe("javascript");
    expect(languageForPath("C:\\x\\a.rs.txt")).toBeNull();
  });

  it("forward-slash and bare names work as well", () => {
    expect(languageForPath("/home/u/a.py")).toBe("python");
    expect(languageForPath("a.cc")).toBe("cpp");
    expect(languageForPath("")).toBeNull();
  });
});

describe("R-466-2 / R-474: Markdown is highlighted in the Text mode only", () => {
  it("{ mode: 'text' } -> markdown; omitted mode -> markdown (AC-524 `a.md`)", () => {
    expect(languageForPath("a.md", { mode: "text" })).toBe("markdown");
    expect(languageForPath("a.markdown", { mode: "text" })).toBe("markdown");
    expect(languageForPath("a.md")).toBe("markdown");
  });

  it("{ mode: 'html' } -> null for md / markdown", () => {
    expect(languageForPath("a.md", { mode: "html" })).toBeNull();
    expect(languageForPath("a.MARKDOWN", { mode: "html" })).toBeNull();
  });

  it("the mode does not affect the other languages", () => {
    expect(languageForPath("a.rs", { mode: "html" })).toBe("rust");
    expect(languageForPath("a.py", { mode: "text" })).toBe("python");
  });
});

describe("SPEC-0200-0001 §3.14.12-11: the Rust TEXT_EXTENSIONS invariant (reverse direction)", () => {
  function rustTextExtensions(): string[] {
    const src = readFileSync(resolve(__dirname, "..", "..", "..", "..", "..", "src-tauri", "src", "viewer", "classify.rs"), "utf-8");
    const m = /pub const TEXT_EXTENSIONS: &\[&str\] = &\[([\s\S]*?)\];/.exec(src);
    expect(m, "TEXT_EXTENSIONS must be found in classify.rs").not.toBeNull();
    return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }

  it("the scan finds the 15-entry list (guards against an empty parse)", () => {
    expect(rustTextExtensions().length).toBe(15);
  });

  it("every Rust text extension except txt / log has a language", () => {
    const missing = rustTextExtensions()
      .filter((e) => e !== "txt" && e !== "log")
      .filter((e) => languageForPath(`x.${e}`) === null);
    expect(missing).toEqual([]);
  });
});
