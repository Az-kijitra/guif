import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0014 R-307 (create targets: selection, else the focused one;
//   none => status only), R-307-1 / MUST-61 (displayed entries only; the
//   injected context already restricts them), R-308 / R-308-1 / R-308-2
//   (extract only when the decided target is exactly ONE .zip file; otherwise
//   a reason, never silence; validity and target come from the SAME decision),
//   R-309 (a .zip is recognised by the extension only, case-insensitive),
//   R-321 (default output name), R-342 / R-342-1 (default extraction folder =
//   ZIP name without .zip next to the ZIP; degenerate names => `archive`),
//   AC-300, AC-301, AC-302, AC-302-1, AC-303, AC-304 (3 cases + hidden),
//   AC-305, AC-307, AC-322.
//   SPEC-0200-0001 §3.4.13-3 MUST-67 (guardian): an entry whose `entryType` is
//   "dir" is NEVER a ZIP, even when it is named `x.zip` => `not_zip`.
// Architecture: SPEC-0200-0001 §3.4.6 (target-rules.ts: pure functions on an
//   `ArchiveContext` { currentPath, entries: { name, path, entryType }[],
//   selected: string[], focusedPath: string | null }, the same shape
//   `createFileOpsContext` returns once entryType is added).
// Module under test (not yet implemented): ./target-rules.ts
//
// Contract assumed (documented in the handback report):
//   resolveZipCreateTargets(ctx) -> { kind: "none" } | { kind: "ok", paths: string[] }
//   resolveZipExtractTarget(ctx) -> { kind: "none" } | { kind: "multiple" }
//        | { kind: "not_zip" } | { kind: "ok", path: string }
//   isZipFileName(name): boolean
//   defaultCreateOutputPath(currentPath, targetNames: string[]): string
//   defaultExtractDestination(zipPath): string

import {
  defaultCreateOutputPath,
  defaultExtractDestination,
  isZipFileName,
  resolveZipCreateTargets,
  resolveZipExtractTarget,
} from "./target-rules";

const DIR = "C:\\work";
const p = (n: string) => `${DIR}\\${n}`;

type Ent = { name: string; path: string; entryType: "file" | "dir" };
const file = (name: string): Ent => ({ name, path: p(name), entryType: "file" });
const dir = (name: string): Ent => ({ name, path: p(name), entryType: "dir" });

function ctx(over: Partial<{ entries: Ent[]; selected: string[]; focusedPath: string | null }> = {}) {
  return {
    currentPath: DIR,
    entries: [file("a.txt"), file("b.txt"), dir("docs"), file("a.zip"), file("B.ZIP"), dir("x.zip"), file("notes.zip.txt")],
    selected: [] as string[],
    focusedPath: null as string | null,
    ...over,
  };
}

describe("resolveZipCreateTargets (R-307, R-307-1)", () => {
  it("AC-300: a selection of several entries => all of them, in selection order", () => {
    const r = resolveZipCreateTargets(ctx({ selected: [p("a.txt"), p("docs")] }));
    expect(r).toMatchObject({ kind: "ok", paths: [p("a.txt"), p("docs")] });
  });

  it("AC-301: no selection + a focused entry => that single entry", () => {
    expect(resolveZipCreateTargets(ctx({ focusedPath: p("b.txt") }))).toMatchObject({ kind: "ok", paths: [p("b.txt")] });
  });

  it("the selection wins over the focus (focus elsewhere is ignored)", () => {
    expect(resolveZipCreateTargets(ctx({ selected: [p("a.txt")], focusedPath: p("b.txt") }))).toMatchObject({
      kind: "ok",
      paths: [p("a.txt")],
    });
  });

  it("AC-302: no selection and no focus => none (the controller shows the status, opens no dialog)", () => {
    expect(resolveZipCreateTargets(ctx())).toEqual({ kind: "none" });
  });

  it("an empty-string focus is not a target", () => {
    expect(resolveZipCreateTargets(ctx({ focusedPath: "" }))).toEqual({ kind: "none" });
  });

  it("a directory is a valid create target (folders are archived recursively)", () => {
    expect(resolveZipCreateTargets(ctx({ focusedPath: p("docs") }))).toMatchObject({ kind: "ok", paths: [p("docs")] });
  });

  it("R-307-1 / AC-302-1: paths that are not among the displayed entries are dropped (the context lists displayed entries only)", () => {
    const shown = [file("b.txt")];
    const r = resolveZipCreateTargets(ctx({ entries: shown, selected: [p("a.txt"), p("b.txt")] }));
    expect(r).toMatchObject({ kind: "ok", paths: [p("b.txt")] });
  });

  it("R-307-1: selection all hidden + focus hidden => none", () => {
    const r = resolveZipCreateTargets(ctx({ entries: [file("c.txt")], selected: [p("a.txt"), p("b.txt")], focusedPath: p("a.txt") }));
    expect(r).toEqual({ kind: "none" });
  });

  it("R-307-1: a hidden focus is treated as 'no focus'", () => {
    expect(resolveZipCreateTargets(ctx({ entries: [file("c.txt")], focusedPath: p("a.txt") }))).toEqual({ kind: "none" });
  });
});

describe("isZipFileName (R-309)", () => {
  it.each(["a.zip", "A.ZIP", "b.Zip", "x.tar.zip", ".zip", "日本語.zip"])("%s is a ZIP name", (n) => {
    expect(isZipFileName(n)).toBe(true);
  });

  it.each(["a.txt", "zip", "a.zip.txt", "a.zipx", "azip", "notes.zip ", "", "a.7z"])("%j is not a ZIP name", (n) => {
    expect(isZipFileName(n)).toBe(false);
  });
});

describe("resolveZipExtractTarget (R-308, R-308-1, R-308-2, R-309, MUST-67)", () => {
  it("AC-303: no selection + a focused .zip file => ok with that path", () => {
    expect(resolveZipExtractTarget(ctx({ focusedPath: p("a.zip") }))).toEqual({ kind: "ok", path: p("a.zip") });
  });

  it("AC-303: an upper-case extension (.ZIP) works too", () => {
    expect(resolveZipExtractTarget(ctx({ focusedPath: p("B.ZIP") }))).toEqual({ kind: "ok", path: p("B.ZIP") });
  });

  it("a single selected .zip file is the target", () => {
    expect(resolveZipExtractTarget(ctx({ selected: [p("a.zip")] }))).toEqual({ kind: "ok", path: p("a.zip") });
  });

  it("AC-304 (a): no target => none", () => {
    expect(resolveZipExtractTarget(ctx())).toEqual({ kind: "none" });
  });

  it("AC-304 (b): two or more targets => multiple (even when both are ZIPs)", () => {
    expect(resolveZipExtractTarget(ctx({ selected: [p("a.zip"), p("B.ZIP")] }))).toEqual({ kind: "multiple" });
    expect(resolveZipExtractTarget(ctx({ selected: [p("a.txt"), p("b.txt")] }))).toEqual({ kind: "multiple" });
  });

  it("AC-304 (c): one target that is a non-.zip file => not_zip", () => {
    expect(resolveZipExtractTarget(ctx({ focusedPath: p("a.txt") }))).toEqual({ kind: "not_zip" });
    expect(resolveZipExtractTarget(ctx({ focusedPath: p("notes.zip.txt") }))).toEqual({ kind: "not_zip" });
  });

  it("AC-304 (c): one target that is a plain directory => not_zip", () => {
    expect(resolveZipExtractTarget(ctx({ focusedPath: p("docs") }))).toEqual({ kind: "not_zip" });
  });

  it("MUST-67: a DIRECTORY named x.zip is not a ZIP file => not_zip (the entry type decides, not the extension alone)", () => {
    expect(resolveZipExtractTarget(ctx({ focusedPath: p("x.zip") }))).toEqual({ kind: "not_zip" });
    expect(resolveZipExtractTarget(ctx({ selected: [p("x.zip")] }))).toEqual({ kind: "not_zip" });
  });

  it("AC-305 / R-308-2: a focused ZIP with a DIFFERENT single selected non-ZIP => the selection is the target => not_zip (the focused ZIP is NOT extracted)", () => {
    expect(resolveZipExtractTarget(ctx({ selected: [p("a.txt")], focusedPath: p("a.zip") }))).toEqual({ kind: "not_zip" });
  });

  it("R-308-2: a selected ZIP with the focus on a non-ZIP => the selected ZIP is the target", () => {
    expect(resolveZipExtractTarget(ctx({ selected: [p("a.zip")], focusedPath: p("a.txt") }))).toEqual({ kind: "ok", path: p("a.zip") });
  });

  it("AC-304 (d) / R-307-1: the selected ZIP is not displayed and nothing else is => none (a hidden ZIP is never extracted)", () => {
    const r = resolveZipExtractTarget(ctx({ entries: [file("c.txt")], selected: [p("a.zip")] }));
    expect(r).toEqual({ kind: "none" });
  });

  it("R-307-1: a hidden focused ZIP is 'no focus' => none", () => {
    expect(resolveZipExtractTarget(ctx({ entries: [file("c.txt")], focusedPath: p("a.zip") }))).toEqual({ kind: "none" });
  });

  it("a selection of 2 where one is hidden reduces to the 1 displayed target", () => {
    const r = resolveZipExtractTarget(ctx({ entries: [file("a.zip")], selected: [p("a.zip"), p("B.ZIP")] }));
    expect(r).toEqual({ kind: "ok", path: p("a.zip") });
  });
});

describe("defaultCreateOutputPath (R-321, AC-307)", () => {
  it("one target: <name>.zip in the current directory, the existing extension is NOT replaced", () => {
    expect(defaultCreateOutputPath(DIR, ["a.txt"])).toBe("C:\\work\\a.txt.zip");
  });

  it("one folder target: <folder>.zip", () => {
    expect(defaultCreateOutputPath(DIR, ["docs"])).toBe("C:\\work\\docs.zip");
  });

  it("two or more targets: archive.zip", () => {
    expect(defaultCreateOutputPath(DIR, ["a.txt", "docs"])).toBe("C:\\work\\archive.zip");
    expect(defaultCreateOutputPath(DIR, ["a", "b", "c"])).toBe("C:\\work\\archive.zip");
  });

  it("a drive-root current directory does not double the separator", () => {
    expect(defaultCreateOutputPath("C:\\", ["a.txt"])).toBe("C:\\a.txt.zip");
  });

  it("POSIX current directory", () => {
    expect(defaultCreateOutputPath("/home/u", ["a.txt"])).toBe("/home/u/a.txt.zip");
  });
});

describe("defaultExtractDestination (R-342, R-342-1, AC-322)", () => {
  it("AC-322: C:\\work\\a.zip => C:\\work\\a (a sub-folder named after the ZIP)", () => {
    expect(defaultExtractDestination("C:\\work\\a.zip")).toBe("C:\\work\\a");
  });

  it("the extension is removed case-insensitively", () => {
    expect(defaultExtractDestination("C:\\work\\A.ZIP")).toBe("C:\\work\\A");
  });

  it("only the last .zip is removed (a.tar.zip => a.tar)", () => {
    expect(defaultExtractDestination("C:\\work\\a.tar.zip")).toBe("C:\\work\\a.tar");
  });

  it("POSIX path", () => {
    expect(defaultExtractDestination("/home/u/a.zip")).toBe("/home/u/a");
  });

  it("a ZIP in the drive root", () => {
    expect(defaultExtractDestination("C:\\a.zip")).toBe("C:\\a");
  });

  it("R-342-1: a file named just `.zip` (empty stem) => the folder name `archive`", () => {
    expect(defaultExtractDestination("C:\\work\\.zip")).toBe("C:\\work\\archive");
  });

  it("R-342-1: a stem ending with a dot or a space (not a valid Windows folder name) => `archive`", () => {
    expect(defaultExtractDestination("C:\\work\\a..zip")).toBe("C:\\work\\archive");
    expect(defaultExtractDestination("C:\\work\\a .zip")).toBe("C:\\work\\archive");
  });

  it("R-342-1 (§3.4.6): a stem with a character that is forbidden in Windows names => `archive`", () => {
    expect(defaultExtractDestination("/home/u/a?b.zip")).toBe("/home/u/archive");
  });

  it("non-ASCII names are kept", () => {
    expect(defaultExtractDestination("C:\\作業\\資料.zip")).toBe("C:\\作業\\資料");
  });
});
