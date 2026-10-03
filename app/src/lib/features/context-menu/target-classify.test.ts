import { describe, expect, it } from "vitest";
import { classifyContextTarget } from "./target-classify";

// Spec: SPEC-0300-0018 R-1000 (menu only on list rows / list blank), R-1001
//   (tree: never), §1 (blank = anything inside the list frame without a row,
//   incl. empty lists, P-1021), R-1010 (the menu itself is not a target).
// Architecture: SPEC-0200-0001 §3.9.4 (data-attribute string contract:
//   `data-entry-path` on a row, `data-context-area="list"` on the frame).
// Module under test (stub): ./target-classify.ts

type Attrs = Record<string, string>;

// A fake element whose ancestor chain (including itself) carries attributes.
function fakeEl(chain: Attrs[]) {
  return {
    closest(selector: string) {
      for (const attrs of chain) {
        const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
        if (m === null) throw new Error(`unsupported selector ${selector}`);
        const [, name, value] = m;
        if (name in attrs && (value === undefined || attrs[name] === value)) {
          return { getAttribute: (n: string) => attrs[n] ?? null };
        }
      }
      return null;
    },
  };
}

describe("classifyContextTarget", () => {
  it("an element inside a row -> row with its path", () => {
    const el = fakeEl([{}, { "data-entry-path": "C:\\w\\a.txt" }, { "data-context-area": "list" }]);
    expect(classifyContextTarget(el)).toEqual({ kind: "row", path: "C:\\w\\a.txt" });
  });

  it("the row element itself (path with unusual characters) -> row, path unchanged", () => {
    const p = "\\\\?\\C:\\w\\日本語 #1.txt";
    expect(classifyContextTarget(fakeEl([{ "data-entry-path": p }, { "data-context-area": "list" }]))).toEqual({
      kind: "row",
      path: p,
    });
  });

  it("inside the list frame but not in a row -> blank", () => {
    expect(classifyContextTarget(fakeEl([{}, { "data-context-area": "list" }]))).toEqual({ kind: "blank" });
  });

  it("the list frame element itself -> blank", () => {
    expect(classifyContextTarget(fakeEl([{ "data-context-area": "list" }]))).toEqual({ kind: "blank" });
  });

  it("the row wins over the frame even when the frame is nearer in the chain", () => {
    const el = fakeEl([{ "data-context-area": "list" }, { "data-entry-path": "p" }]);
    expect(classifyContextTarget(el)).toEqual({ kind: "row", path: "p" });
  });

  it("tree panel / path bar / status bar / the menu itself (no marked ancestor) -> none", () => {
    expect(classifyContextTarget(fakeEl([{}, { "data-focus-area": "tree" }, {}]))).toEqual({ kind: "none" });
    expect(classifyContextTarget(fakeEl([{ role: "menu" }]))).toEqual({ kind: "none" });
  });

  it("a different data-context-area value is not the list -> none", () => {
    expect(classifyContextTarget(fakeEl([{ "data-context-area": "tree" }]))).toEqual({ kind: "none" });
  });

  it("null target -> none", () => {
    expect(classifyContextTarget(null)).toEqual({ kind: "none" });
  });
});
